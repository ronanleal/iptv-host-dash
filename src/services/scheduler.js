const cron = require('node-cron');
const env = require('../config/env');
const { DEFAULT_HOSTS } = require('../config/hosts');
const {
  seedHostsIfEmpty,
  getAllHosts,
  saveTestRun,
  saveHostMetric,
  updateBestHost,
  pruneOldRecords,
  getBestHost
} = require('../db/hostRepository');
const { evaluateAllHosts } = require('./evaluator');

let isEvaluationRunning = false;
let lastRunTimestamp = null;
let lastRunDurationMs = 0;
let cronTask = null;

async function executeEvaluation(triggerType = 'cron') {
  if (isEvaluationRunning) {
    console.warn(`[Scheduler] Avaliação já em andamento. Ignorando disparo (${triggerType}).`);
    return { status: 'already_running' };
  }

  isEvaluationRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[Scheduler] Disparando avaliação (${triggerType}) em ${startedAt}...`);

  try {
    await seedHostsIfEmpty();

    const currentHosts = await getAllHosts();
    const currentHostsMap = {};
    for (const h of currentHosts) {
      currentHostsMap[h.host] = h;
    }

    const { results, bestHost, durationMs, totalHosts, onlineHosts } = await evaluateAllHosts(
      DEFAULT_HOSTS,
      currentHostsMap,
      env.PROBE_CONCURRENCY
    );

    const finishedAt = new Date().toISOString();
    const onlineTtfb = results.filter(r => r.status === 'online' && r.ttfb_ms).map(r => r.ttfb_ms);
    const avgTtfb = onlineTtfb.length > 0 ? parseFloat((onlineTtfb.reduce((a, b) => a + b, 0) / onlineTtfb.length).toFixed(2)) : null;

    const runId = await saveTestRun({
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      total_hosts: totalHosts,
      online_hosts: onlineHosts,
      avg_ttfb_ms: avgTtfb,
      best_host: bestHost ? bestHost.host : null,
      best_host_score: bestHost ? bestHost.composite_score : 0,
      trigger_type: triggerType
    });

    for (const metric of results) {
      await saveHostMetric(runId, metric);
    }

    await updateBestHost(bestHost);
    await pruneOldRecords(env.DATA_RETENTION_DAYS);

    lastRunTimestamp = finishedAt;
    lastRunDurationMs = durationMs;

    console.log(`[Scheduler] Rodada #${runId} concluída com sucesso! Melhor host: ${bestHost ? `${bestHost.host} (Nota: ${bestHost.composite_score})` : 'NENHUM DISPONÍVEL'}`);

    return {
      status: 'completed',
      runId,
      bestHost,
      totalHosts,
      onlineHosts,
      durationMs
    };
  } catch (err) {
    console.error('[Scheduler] Erro durante a avaliação de hosts:', err);
    return { status: 'error', error: err.message };
  } finally {
    isEvaluationRunning = false;
  }
}

function initScheduler() {
  console.log(`[Scheduler] Inicializando agendador cron com expressão: "${env.CRON_SCHEDULE}"`);
  cronTask = cron.schedule(env.CRON_SCHEDULE, () => {
    executeEvaluation('cron');
  });

  // Executa uma rodada inicial imediatamente após a inicialização
  setTimeout(() => {
    console.log('[Scheduler] Executando rodada inicial de aquecimento...');
    executeEvaluation('startup');
  }, 2000);
}

function getSchedulerStatus() {
  return {
    is_running: isEvaluationRunning,
    last_run_at: lastRunTimestamp,
    last_duration_ms: lastRunDurationMs,
    cron_schedule: env.CRON_SCHEDULE
  };
}

module.exports = {
  executeEvaluation,
  initScheduler,
  getSchedulerStatus
};
