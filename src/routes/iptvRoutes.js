const {
  getBestHost,
  getAllHosts,
  getRecentRuns,
  getHostHistory,
  getTop10History
} = require('../db/hostRepository');
const {
  executeEvaluation,
  getSchedulerStatus
} = require('../services/scheduler');

async function iptvRoutes(fastify, options) {
  /**
   * GET /iptv/host
   * Retorna em TEXTO SIMPLES apenas a URL do melhor host IPTV com performance e estabilidade
   * Exemplo de resposta: http://b5erahn.cc
   */
  fastify.get('/iptv/host', async (request, reply) => {
    try {
      const best = await getBestHost();

      if (!best || !best.host || best.status !== 'online') {
        return reply
          .status(503)
          .type('text/plain; charset=utf-8')
          .send('No host available');
      }

      return reply
        .status(200)
        .type('text/plain; charset=utf-8')
        .send(best.host);
    } catch (err) {
      fastify.log.error(err);
      return reply
        .status(500)
        .type('text/plain; charset=utf-8')
        .send('Internal Server Error');
    }
  });

  /**
   * GET /api/best
   * Detalhes completos do melhor host em formato JSON
   */
  fastify.get('/api/best', async (request, reply) => {
    try {
      const best = await getBestHost();
      if (!best) {
        return reply.status(503).send({ error: 'Nenhum host avaliado ou online no momento' });
      }
      return best;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao consultar melhor host' });
    }
  });

  /**
   * GET /api/hosts
   * Lista todos os 35 hosts com suas métricas, status e ranking
   */
  fastify.get('/api/hosts', async (request, reply) => {
    try {
      const hosts = await getAllHosts();
      return { hosts, total: hosts.length };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao listar hosts' });
    }
  });

  /**
   * GET /api/runs
   * Histórico das últimas rodadas de testes
   */
  fastify.get('/api/runs', async (request, reply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      const runs = await getRecentRuns(limit);
      return { runs };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao buscar histórico de rodadas' });
    }
  });

  /**
   * GET /api/history
   * Histórico temporal de um host específico para gráficos
   */
  fastify.get('/api/history', async (request, reply) => {
    try {
      const host = request.query.host;
      if (!host) {
        return reply.status(400).send({ error: 'Parâmetro host é obrigatório' });
      }
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 30;
      const history = await getHostHistory(host, limit);
      return { host, history };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao buscar histórico do host' });
    }
  });

  /**
   * GET /api/status
   * Estado do agendador e do sistema
   */
  fastify.get('/api/status', async (request, reply) => {
    try {
      const status = getSchedulerStatus();
      const best = await getBestHost();
      return {
        ...status,
        best_host: best ? best.host : null
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao verificar status' });
    }
  });


  /**
   * GET /api/history/top10
   * Histórico de notas dos Top 10 hosts ao longo das últimas rodadas
   */
  fastify.get('/api/history/top10', async (request, reply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 15;
      const history = await getTop10History(limit);
      return history;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao buscar histórico do Top 10' });
    }
  });

  /**
   * POST /api/test/run
   * Disparo manual de um novo ciclo de benchmark
   */
  fastify.post('/api/test/run', async (request, reply) => {
    try {
      const status = getSchedulerStatus();
      if (status.is_running) {
        return reply.status(409).send({
          status: 'already_running',
          message: 'Um teste já está em andamento no momento'
        });
      }

      // Dispara em background para não travar a requisição HTTP
      executeEvaluation('manual').catch(err => {
        fastify.log.error('Erro na execução manual de teste:', err);
      });

      return {
        status: 'started',
        message: 'Teste de benchmark manual iniciado com sucesso'
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro ao iniciar teste manual' });
    }
  });
}

module.exports = iptvRoutes;
