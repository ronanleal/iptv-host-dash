const env = require('./src/config/env');
const { getDb } = require('./src/db/database');
const { seedHostsIfEmpty } = require('./src/db/hostRepository');
const { initScheduler } = require('./src/services/scheduler');
const { buildApp } = require('./src/app');

async function start() {
  console.log('====================================================');
  console.log('  IPTV Host Dash — Benchmark & Ranking de Hosts IPTV');
  console.log('====================================================');

  try {
    // 1. Inicializar SQLite
    getDb();
    await seedHostsIfEmpty();

    // 2. Construir e inicializar Fastify
    const app = buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST
    });

    console.log(`[Server] Servidor rodando em: http://${env.HOST}:${env.PORT}`);
    console.log(`[Server] Endpoint texto puro: http://${env.HOST}:${env.PORT}/iptv/host`);
    console.log(`[Server] Dashboard Web:       http://${env.HOST}:${env.PORT}/`);

    // 3. Iniciar agendador periódicos
    initScheduler();

    // Tratamento de sinais para desligamento gracioso
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\n[Server] Sinal ${signal} recebido. Encerrando servidor graciosamente...`);
        try {
          await app.close();
          console.log('[Server] Conexões HTTP encerradas.');
          process.exit(0);
        } catch (err) {
          console.error('[Server] Erro durante o encerramento:', err);
          process.exit(1);
        }
      });
    }
  } catch (err) {
    console.error('[Server] Falha fatal na inicialização:', err);
    process.exit(1);
  }
}

start();
