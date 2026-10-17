const http = require('http');
const https = require('https');
const env = require('../config/env');
const { calculateInstantScore, updateHostReputation, calculateCompositeScore } = require('./scoring');
const { calculate24hUptime } = require('../db/hostRepository');

let SocksProxyAgent = null;
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
} catch (e) {
  // socks-proxy-agent opcional em ambiente local
}

const socksAgent = (env.SOCKS_PROXY_URL && SocksProxyAgent)
  ? new SocksProxyAgent(env.SOCKS_PROXY_URL)
  : null;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive'
};

function formatHostUrl(url) {
  if (!url) return '';
  let trimmed = url.trim();
  if (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function probeSingleUrl(url, timeoutMs) {
  if (socksAgent) {
    return probeViaAgent(url, timeoutMs);
  }
  return probeDirectFetch(url, timeoutMs);
}

async function probeDirectFetch(url, timeoutMs) {
  const start = performance.now();
  let ttfb = 0;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs)
    });
    ttfb = performance.now() - start;

    const bodyStart = performance.now();
    const text = await res.text();
    const bodyDuration = performance.now() - bodyStart;
    const totalLatency = ttfb + bodyDuration;
    const bytes = Buffer.byteLength(text, 'utf8');

    return {
      ok: res.ok,
      status: res.status,
      ttfb,
      latency: totalLatency,
      bytes,
      durationMs: totalLatency,
      body: text
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.message || 'Falha de conexão',
      ttfb: performance.now() - start,
      latency: performance.now() - start,
      bytes: 0,
      durationMs: performance.now() - start,
      body: ''
    };
  }
}

function probeViaAgent(url, timeoutMs) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const start = performance.now();
    let ttfb = 0;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        req.destroy();
        const duration = performance.now() - start;
        resolve({
          ok: false,
          status: 0,
          error: 'Timeout',
          ttfb: duration,
          latency: duration,
          bytes: 0,
          durationMs: duration,
          body: ''
        });
      }
    }, timeoutMs);

    const req = client.get(url, {
      agent: socksAgent,
      headers: BROWSER_HEADERS
    }, (res) => {
      ttfb = performance.now() - start;
      const chunks = [];
      let totalBytes = 0;

      res.on('data', chunk => {
        chunks.push(chunk);
        totalBytes += chunk.length;
      });

      res.on('end', () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const totalLatency = performance.now() - start;
        const body = Buffer.concat(chunks).toString('utf8');

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          ttfb,
          latency: totalLatency,
          bytes: totalBytes,
          durationMs: totalLatency,
          body
        });
      });
    });

    req.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const totalLatency = performance.now() - start;
      resolve({
        ok: false,
        status: 0,
        error: err.message || 'Falha de conexão',
        ttfb: totalLatency,
        latency: totalLatency,
        bytes: 0,
        durationMs: totalLatency,
        body: ''
      });
    });
  });
}

async function benchmarkHost(hostUrl, hostCurrentState = {}) {
  const cleanUrl = formatHostUrl(hostUrl);
  const authUrl = `${cleanUrl}/player_api.php?username=${env.XTREAM_USERNAME}&password=${env.XTREAM_PASSWORD}`;

  // 1. Gatekeeper: Validação da autenticação Xtream
  const authProbe = await probeSingleUrl(authUrl, env.PROBE_TIMEOUT_MS);

  let isAuth = false;
  let status = 'offline';
  let errorMessage = null;

  if (!authProbe.ok) {
    status = 'offline';
    errorMessage = authProbe.error || `HTTP ${authProbe.status}`;
  } else {
    const cleanBody = (authProbe.body || '').trim();
    if (cleanBody.startsWith('<!DOCTYPE') || cleanBody.startsWith('<html') || cleanBody.includes('Welcome to nginx')) {
      status = 'offline';
      errorMessage = 'HTML fallback / bloqueio de proxy';
    } else {
      try {
        const json = JSON.parse(cleanBody);
        if (json?.user_info?.auth === 1) {
          isAuth = true;
          status = 'online';
        } else {
          status = 'offline';
          errorMessage = 'Autenticação Xtream inválida ou rejeitada';
        }
      } catch (e) {
        status = 'offline';
        errorMessage = 'Resposta não é JSON Xtream';
      }
    }
  }

  // 2. Coleta de amostras adicionais (se online)
  const ttfbSamples = [authProbe.ttfb];
  const latencySamples = [authProbe.latency];
  let totalBytes = authProbe.bytes;
  let totalTimeMs = authProbe.durationMs;
  let successfulProbes = isAuth ? 1 : 0;
  const totalProbesAttempted = 3;

  if (isAuth) {
    const categoriesUrl = `${cleanUrl}/player_api.php?username=${env.XTREAM_USERNAME}&password=${env.XTREAM_PASSWORD}&action=get_live_categories`;

    for (let i = 0; i < 2; i++) {
      const probe = await probeSingleUrl(categoriesUrl, env.PROBE_TIMEOUT_MS);
      if (probe.ok && probe.bytes > 10) {
        successfulProbes += 1;
        ttfbSamples.push(probe.ttfb);
        latencySamples.push(probe.latency);
        totalBytes += probe.bytes;
        totalTimeMs += probe.durationMs;
      }
    }
  }

  // 3. Cálculos de Médias, Jitter e Vazão
  const avgTtfb = ttfbSamples.reduce((a, b) => a + b, 0) / ttfbSamples.length;
  const avgLatency = latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length;

  const variance = ttfbSamples.reduce((sum, val) => sum + Math.pow(val - avgTtfb, 2), 0) / ttfbSamples.length;
  const jitter = Math.sqrt(variance);

  const speedKbps = totalTimeMs > 0 ? (totalBytes / 1024) / (totalTimeMs / 1000) : 0;
  const probeSuccessRate = successfulProbes / totalProbesAttempted;

  // 4. Métrica de Reputação e Remuneração
  const repUpdate = updateHostReputation(
    hostCurrentState.reputation_score,
    status === 'online',
    hostCurrentState.consecutive_successes,
    hostCurrentState.consecutive_failures
  );

  const uptime24h = await calculate24hUptime(cleanUrl);

  const instantScore = calculateInstantScore({
    status,
    is_auth: isAuth,
    ttfb_ms: avgTtfb,
    jitter_ms: jitter,
    latency_ms: avgLatency,
    speed_kbps: speedKbps,
    probe_success_rate: probeSuccessRate
  });

  const compositeScore = calculateCompositeScore(
    instantScore,
    repUpdate.reputation_score,
    uptime24h,
    status === 'online'
  );

  return {
    host: cleanUrl,
    status,
    http_status: authProbe.status,
    is_auth: isAuth,
    ttfb_ms: parseFloat(avgTtfb.toFixed(2)),
    jitter_ms: parseFloat(jitter.toFixed(2)),
    latency_ms: parseFloat(avgLatency.toFixed(2)),
    speed_kbps: parseFloat(speedKbps.toFixed(2)),
    instant_score: instantScore,
    reputation_score: repUpdate.reputation_score,
    consecutive_successes: repUpdate.consecutive_successes,
    consecutive_failures: repUpdate.consecutive_failures,
    uptime_24h: uptime24h,
    composite_score: compositeScore,
    error_message: errorMessage
  };
}

async function evaluateAllHosts(hostsList, currentHostsMap = {}, concurrency = 5) {
  const startTime = Date.now();
  console.log(`[Evaluator] Iniciando benchmark de ${hostsList.length} hosts com concorrência = ${concurrency}...`);

  const results = [];
  const queue = [...hostsList];

  async function worker() {
    while (queue.length > 0) {
      const host = queue.shift();
      if (!host) break;
      const currentState = currentHostsMap[host] || {};
      try {
        const metric = await benchmarkHost(host, currentState);
        results.push(metric);
      } catch (err) {
        results.push({
          host,
          status: 'offline',
          http_status: 0,
          is_auth: false,
          ttfb_ms: null,
          jitter_ms: null,
          latency_ms: null,
          speed_kbps: 0,
          instant_score: 0,
          reputation_score: Math.max(0, (currentState.reputation_score || 50) * 0.5),
          consecutive_successes: 0,
          consecutive_failures: (currentState.consecutive_failures || 0) + 1,
          uptime_24h: 0,
          composite_score: 0,
          error_message: err.message
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  console.log(`[Evaluator] Benchmark concluído em ${(durationMs / 1000).toFixed(2)}s.`);

  // Ordenar resultados pelo composite_score decrescente
  results.sort((a, b) => {
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (a.status !== 'online' && b.status === 'online') return 1;
    return b.composite_score - a.composite_score;
  });

  const onlineResults = results.filter(r => r.status === 'online');
  const bestHost = onlineResults.length > 0 ? onlineResults[0] : null;

  return {
    results,
    bestHost,
    durationMs,
    totalHosts: results.length,
    onlineHosts: onlineResults.length
  };
}

module.exports = {
  probeSingleUrl,
  benchmarkHost,
  evaluateAllHosts
};
