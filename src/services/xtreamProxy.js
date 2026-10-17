const http = require('http');
const https = require('https');
const env = require('../config/env');
const { getBestHost } = require('../db/hostRepository');

let SocksProxyAgent = null;
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
} catch (e) {
  // Opcional em dev local
}

const socksAgent = (env.SOCKS_PROXY_URL && SocksProxyAgent)
  ? new SocksProxyAgent(env.SOCKS_PROXY_URL)
  : null;

/**
 * Resolve o host IPTV de destino
 */
async function resolveTargetHost(request, explicitHost) {
  if (explicitHost) {
    if (!explicitHost.startsWith('http://') && !explicitHost.startsWith('https://')) {
      return `http://${explicitHost}`;
    }
    return explicitHost;
  }

  // 1. Query parameter ?proxy_host=...
  if (request.query && request.query.proxy_host) {
    let qHost = request.query.proxy_host.trim();
    if (!qHost.startsWith('http://') && !qHost.startsWith('https://')) {
      qHost = `http://${qHost}`;
    }
    return qHost;
  }

  // 2. Variável de ambiente PROXY_TARGET_HOST
  if (process.env.PROXY_TARGET_HOST) {
    return process.env.PROXY_TARGET_HOST.trim();
  }

  // 3. Melhor host online avaliado no banco de dados
  try {
    const best = await getBestHost();
    if (best && best.host && best.status === 'online') {
      return best.host;
    }
  } catch (err) {
    request.log?.warn?.('Erro ao buscar melhor host para proxy, usando fallback:', err.message);
  }

  // 4. Fallback padrão
  return 'http://interblack.pro';
}

/**
 * Executa o proxy da requisição HTTP para o host de destino
 */
function handleProxy(request, reply, targetBaseUrl, targetPath) {
  // Avisa o Fastify para não enviar resposta automática
  reply.hijack();

  let targetUrlObj;
  try {
    targetUrlObj = new URL(targetPath, targetBaseUrl);
  } catch (err) {
    reply.raw.writeHead(400, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify({ error: 'URL de destino inválida', details: err.message }));
    return;
  }

  executeProxyHop(request, reply, targetUrlObj, 5);
}

function executeProxyHop(request, reply, currentUrl, remainingRedirects) {
  if (remainingRedirects <= 0) {
    reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
    reply.raw.end(JSON.stringify({ error: 'Muitos redirecionamentos upstream' }));
    return;
  }

  const client = currentUrl.protocol === 'https:' ? https : http;
  const isAuthRequest = (
    currentUrl.pathname === '/player_api.php' &&
    (!request.query || !request.query.action)
  );

  const forwardHeaders = { ...request.headers };
  // Ajusta o cabeçalho Host para o host de destino
  forwardHeaders.host = currentUrl.host;
  forwardHeaders.connection = 'keep-alive';

  // Se for auth request, evita compressão para podermos inspecionar e reescrever o JSON
  if (isAuthRequest) {
    delete forwardHeaders['accept-encoding'];
  }

  const options = {
    protocol: currentUrl.protocol,
    hostname: currentUrl.hostname,
    port: currentUrl.port || (currentUrl.protocol === 'https:' ? 443 : 80),
    path: currentUrl.pathname + currentUrl.search,
    method: request.method,
    headers: forwardHeaders,
    agent: socksAgent
  };

  let clientClosed = false;
  request.raw.on('close', () => {
    clientClosed = true;
  });

  const upstreamReq = client.request(options, (upstreamRes) => {
    if (clientClosed) {
      upstreamRes.destroy();
      return;
    }

    // Seguir redirecionamentos HTTP 301/302/307/308 internamente
    if (
      upstreamRes.statusCode >= 300 &&
      upstreamRes.statusCode < 400 &&
      upstreamRes.headers.location
    ) {
      upstreamRes.resume(); // Descarta o corpo
      let nextUrl;
      try {
        nextUrl = new URL(upstreamRes.headers.location, currentUrl);
      } catch (err) {
        reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'URL de redirecionamento inválida', location: upstreamRes.headers.location }));
        return;
      }
      executeProxyHop(request, reply, nextUrl, remainingRedirects - 1);
      return;
    }

    // Se for chamada de autenticação do Xtream Codes (/player_api.php sem action)
    if (isAuthRequest && upstreamRes.statusCode === 200) {
      handleAuthResponse(request, reply, upstreamRes);
      return;
    }

    // Para streams de vídeo, categorias, canais, EPG, etc.: repassar diretamente via PIPE
    const respHeaders = { ...upstreamRes.headers };
    // Garante que o CORS fique liberado para players web
    respHeaders['access-control-allow-origin'] = '*';
    respHeaders['access-control-allow-methods'] = 'GET, POST, OPTIONS, HEAD';
    respHeaders['access-control-allow-headers'] = '*';

    reply.raw.writeHead(upstreamRes.statusCode, respHeaders);
    upstreamRes.pipe(reply.raw);

    request.raw.on('close', () => {
      if (!upstreamRes.complete) {
        upstreamRes.destroy();
      }
    });
  });

  upstreamReq.on('error', (err) => {
    if (clientClosed) return;
    request.log?.error?.('[XtreamProxy] Erro de conexão upstream:', err.message);
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
      reply.raw.end(JSON.stringify({ error: 'Falha ao conectar no host upstream', message: err.message }));
    }
  });

  // Repassar corpo se for requisição POST
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    request.raw.pipe(upstreamReq);
  } else {
    upstreamReq.end();
  }
}

/**
 * Reescreve a resposta do /player_api.php para apontar server_info.url e port de volta para a Oracle Cloud
 */
function handleAuthResponse(request, reply, upstreamRes) {
  const chunks = [];
  upstreamRes.on('data', chunk => chunks.push(chunk));
  upstreamRes.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let json;
    try {
      json = JSON.parse(rawBody);
    } catch (e) {
      // Se não for JSON válido, repassa como está
      reply.raw.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      reply.raw.end(rawBody);
      return;
    }

    // Reescreve server_info se presente
    if (json && json.server_info) {
      const incomingHostHeader = request.headers['x-forwarded-host'] || request.headers.host || '146.235.26.138:3000';
      const [proxyHost, proxyPort] = incomingHostHeader.split(':');
      json.server_info.url = proxyHost;
      json.server_info.port = proxyPort || '3000';
      json.server_info.server_protocol = 'http';
    }

    const modifiedBody = Buffer.from(JSON.stringify(json));
    const headers = { ...upstreamRes.headers };
    headers['content-type'] = 'application/json; charset=utf-8';
    headers['content-length'] = modifiedBody.length;
    headers['access-control-allow-origin'] = '*';
    delete headers['content-encoding'];

    reply.raw.writeHead(upstreamRes.statusCode, headers);
    reply.raw.end(modifiedBody);
  });
}

module.exports = {
  resolveTargetHost,
  handleProxy
};
