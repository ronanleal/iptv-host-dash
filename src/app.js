const path = require('path');
const fastify = require('fastify');
const fastifyCors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');
const iptvRoutes = require('./routes/iptvRoutes');

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
    methods: ['GET', 'POST', 'OPTIONS']
  });

  // Servir arquivos estáticos do Dashboard Web (serve public/index.html na raiz automaticamente)
  app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/'
  });

  // Registrar rotas da API e /iptv/host
  app.register(iptvRoutes);

  return app;
}

module.exports = { buildApp };
