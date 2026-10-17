const { resolveTargetHost, handleProxy } = require('../services/xtreamProxy');
const { getBestHost } = require('../db/hostRepository');

async function xtreamRoutes(fastify, options) {
  /**
   * GET /api/proxy/info
   * Informações sobre o proxy Xtream para o Dashboard e apps
   */
  fastify.get('/api/proxy/info', async (request, reply) => {
    try {
      const best = await getBestHost();
      const currentTarget = await resolveTargetHost(request);
      const incomingHost = request.headers['x-forwarded-host'] || request.headers.host || '146.235.26.138:3000';
      const proxyBaseUrl = `http://${incomingHost}`;

      return {
        proxy_url: proxyBaseUrl,
        current_target_host: currentTarget,
        best_host: best ? best.host : null,
        instructions: {
          server_url: proxyBaseUrl,
          description: 'Use esta URL como Servidor no aplicativo de IPTV (IPTV Smarters, TiviMate, XCIPTV, etc.)'
        }
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao consultar status do proxy' });
    }
  });

  /**
   * Rota com host explícito na URL: /h/:customHost/*
   * Exemplo: http://146.235.26.138:3000/h/interblack.pro/player_api.php?...
   */
  fastify.all('/h/:customHost/*', async (request, reply) => {
    const customHost = request.params.customHost;
    const targetHost = await resolveTargetHost(request, customHost);
    const targetPath = request.raw.url.replace(/^\/h\/[^/]+/, '') || '/';
    return handleProxy(request, reply, targetHost, targetPath);
  });

  /**
   * Rotas Padrão do Xtream Codes
   */
  const xtreamPatterns = [
    '/player_api.php',
    '/live/*',
    '/movie/*',
    '/series/*',
    '/xmltv.php',
    '/get.php'
  ];

  xtreamPatterns.forEach(pattern => {
    fastify.all(pattern, async (request, reply) => {
      const targetHost = await resolveTargetHost(request);
      return handleProxy(request, reply, targetHost, request.raw.url);
    });
  });
}

module.exports = xtreamRoutes;
