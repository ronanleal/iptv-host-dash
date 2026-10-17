const path = require('path');
const fastify = require('fastify');
const fastifyCors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');
const iptvRoutes = require('./routes/iptvRoutes');
const xtreamRoutes = require('./routes/xtreamRoutes');

function buildApp(opts = {}) {
  const app = fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    ...opts
  });

  // Habilitar CORS
  app.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD', 'PUT', 'DELETE', 'PATCH']
  });

  // Servir arquivos estáticos do Dashboard Web com desativação de cache para JS/CSS/HTML
  app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    setHeaders: (res, pathName) => {
      if (pathName.endsWith('.html') || pathName.endsWith('.js') || pathName.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  });

  // Registrar rotas da API e /iptv/host
  app.register(iptvRoutes);
  // Registrar rotas de Proxy Reverso do Xtream para TV
  app.register(xtreamRoutes);

  return app;
}

module.exports = { buildApp };
