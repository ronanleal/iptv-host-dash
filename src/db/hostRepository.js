const { runAsync, getAsync, allAsync } = require('./database');
const { DEFAULT_HOSTS } = require('../config/hosts');

async function seedHostsIfEmpty() {
  const countRow = await getAsync('SELECT COUNT(*) as total FROM hosts');
  if (countRow && countRow.total === 0) {
    console.log(`[Repository] Inicializando ${DEFAULT_HOSTS.length} hosts no banco de dados...`);
    for (const host of DEFAULT_HOSTS) {
      await runAsync(
        `INSERT OR IGNORE INTO hosts (host, status, reputation_score, consecutive_successes, consecutive_failures, total_runs, successful_runs, uptime_24h)
         VALUES (?, 'unknown', 50.0, 0, 0, 0, 0, 100.0)`,
        [host]
      );
    }
  }
}

async function getBestHost() {
  const row = await getAsync('SELECT * FROM current_best_host WHERE id = 1');
  return row || null;
}

async function updateBestHost(best) {
  if (!best) {
    await runAsync('DELETE FROM current_best_host WHERE id = 1');
    return;
  }
  await runAsync(
    `INSERT INTO current_best_host (id, host, status, composite_score, ttfb_ms, jitter_ms, latency_ms, speed_kbps, reputation_score, uptime_24h, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       host = excluded.host,
       status = excluded.status,
       composite_score = excluded.composite_score,
       ttfb_ms = excluded.ttfb_ms,
       jitter_ms = excluded.jitter_ms,
       latency_ms = excluded.latency_ms,
       speed_kbps = excluded.speed_kbps,
       reputation_score = excluded.reputation_score,
       uptime_24h = excluded.uptime_24h,
       updated_at = datetime('now')`,
    [
      best.host,
      best.status,
      best.composite_score,
      best.ttfb_ms,
      best.jitter_ms,
      best.latency_ms,
      best.speed_kbps,
      best.reputation_score,
      best.uptime_24h
    ]
  );
}

async function getAllHosts() {
  return await allAsync(`
    SELECT
      h.host,
      h.status,
      h.reputation_score,
      h.consecutive_successes,
      h.consecutive_failures,
      h.total_runs,
      h.successful_runs,
      h.uptime_24h,
      h.last_ttfb_ms,
      h.last_jitter_ms,
      h.last_latency_ms,
      h.last_speed_kbps,
      h.last_score,
      h.last_tested_at
    FROM hosts h
    ORDER BY
      CASE WHEN h.status = 'online' THEN 1 ELSE 0 END DESC,
      h.last_score DESC,
      h.reputation_score DESC,
      h.last_ttfb_ms ASC
  `);
}

async function saveTestRun({ started_at, finished_at, duration_ms, total_hosts, online_hosts, avg_ttfb_ms, best_host, best_host_score, trigger_type }) {
  const result = await runAsync(
    `INSERT INTO test_runs (started_at, finished_at, duration_ms, total_hosts, online_hosts, avg_ttfb_ms, best_host, best_host_score, trigger_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      started_at,
      finished_at,
      duration_ms,
      total_hosts,
      online_hosts,
      avg_ttfb_ms,
      best_host,
      best_host_score,
      trigger_type || 'cron'
    ]
  );
  return result.lastID;
}

async function saveHostMetric(runId, metric) {
  await runAsync(
    `INSERT INTO host_metrics (run_id, host, status, http_status, is_auth, ttfb_ms, jitter_ms, latency_ms, speed_kbps, instant_score, reputation_score, composite_score, error_message, tested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      runId,
      metric.host,
      metric.status,
      metric.http_status || null,
      metric.is_auth ? 1 : 0,
      metric.ttfb_ms || null,
      metric.jitter_ms || null,
      metric.latency_ms || null,
      metric.speed_kbps || null,
      metric.instant_score || 0,
      metric.reputation_score || 0,
      metric.composite_score || 0,
      metric.error_message || null
    ]
  );

  // Atualizar estado mestre do host
  await runAsync(
    `UPDATE hosts SET
       status = ?,
       reputation_score = ?,
       consecutive_successes = ?,
       consecutive_failures = ?,
       total_runs = total_runs + 1,
       successful_runs = successful_runs + (CASE WHEN ? = 'online' THEN 1 ELSE 0 END),
       uptime_24h = ?,
       last_ttfb_ms = ?,
       last_jitter_ms = ?,
       last_latency_ms = ?,
       last_speed_kbps = ?,
       last_score = ?,
       last_tested_at = datetime('now')
     WHERE host = ?`,
    [
      metric.status,
      metric.reputation_score,
      metric.consecutive_successes,
      metric.consecutive_failures,
      metric.status,
      metric.uptime_24h,
      metric.ttfb_ms || null,
      metric.jitter_ms || null,
      metric.latency_ms || null,
      metric.speed_kbps || null,
      metric.composite_score || 0,
      metric.host
    ]
  );
}

async function getRecentRuns(limit = 20) {
  return await allAsync(`
    SELECT * FROM test_runs
    ORDER BY id DESC
    LIMIT ?
  `, [limit]);
}

async function getHostHistory(host, limit = 30) {
  return await allAsync(`
    SELECT ttfb_ms, jitter_ms, latency_ms, speed_kbps, composite_score, status, tested_at
    FROM host_metrics
    WHERE host = ?
    ORDER BY id DESC
    LIMIT ?
  `, [host, limit]);
}

async function calculate24hUptime(host) {
  const row = await getAsync(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count
    FROM host_metrics
    WHERE host = ? AND tested_at >= datetime('now', '-24 hours')
  `, [host]);

  if (!row || row.total === 0) return 100.0;
  return parseFloat(((row.online_count / row.total) * 100).toFixed(1));
}

async function pruneOldRecords(retentionDays = 14) {
  try {
    await runAsync(`
      DELETE FROM host_metrics
      WHERE tested_at < datetime('now', '-' || ? || ' days')
    `, [retentionDays]);

    await runAsync(`
      DELETE FROM test_runs
      WHERE started_at < datetime('now', '-' || ? || ' days')
    `, [retentionDays]);
  } catch (err) {
    console.error('[Repository] Erro ao limpar histórico antigo:', err.message);
  }
}


async function getTop10History(limitRuns = 15) {
  const runs = await allAsync(`
    SELECT id, started_at
    FROM test_runs
    ORDER BY id DESC
    LIMIT ?
  `, [limitRuns]);

  if (!runs || runs.length === 0) {
    return { labels: [], datasets: [] };
  }

  const chronologicalRuns = [...runs].reverse();
  const runIds = chronologicalRuns.map(r => r.id);

  // Selecionar top 10 hosts ordenados pelo score mais recente
  const topHostsRows = await allAsync(`
    SELECT host, last_score, status
    FROM hosts
    ORDER BY
      CASE WHEN status = 'online' THEN 1 ELSE 0 END DESC,
      last_score DESC,
      reputation_score DESC
    LIMIT 10
  `);

  if (!topHostsRows || topHostsRows.length === 0) {
    return { labels: [], datasets: [] };
  }

  const hostsList = topHostsRows.map(h => h.host);
  const runPlaceholders = runIds.map(() => '?').join(',');
  const hostPlaceholders = hostsList.map(() => '?').join(',');

  const metrics = await allAsync(`
    SELECT run_id, host, composite_score, status
    FROM host_metrics
    WHERE run_id IN (${runPlaceholders}) AND host IN (${hostPlaceholders})
    ORDER BY run_id ASC
  `, [...runIds, ...hostsList]);

  const metricsMap = {};
  for (const m of metrics) {
    if (!metricsMap[m.host]) metricsMap[m.host] = {};
    metricsMap[m.host][m.run_id] = m.status === 'online' ? (m.composite_score || 0) : 0;
  }

  const labels = chronologicalRuns.map(r => {
    const d = new Date(r.started_at);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const colors = [
    '#6366f1', // Indigo (#1)
    '#06b6d4', // Cyan (#2)
    '#10b981', // Emerald (#3)
    '#f59e0b', // Amber (#4)
    '#ec4899', // Pink (#5)
    '#8b5cf6', // Violet (#6)
    '#3b82f6', // Blue (#7)
    '#14b8a6', // Teal (#8)
    '#f97316', // Orange (#9)
    '#e11d48'  // Rose (#10)
  ];

  const datasets = hostsList.map((host, idx) => {
    const color = colors[idx % colors.length];
    const data = runIds.map(runId => {
      const val = metricsMap[host] && metricsMap[host][runId] !== undefined ? metricsMap[host][runId] : null;
      return val;
    });

    return {
      label: host.replace(/^https?:\/\//, ''),
      host: host,
      data: data,
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 6,
      fill: false
    };
  });

  return {
    labels,
    datasets
  };
}

module.exports = {
  getTop10History,
  seedHostsIfEmpty,
  getBestHost,
  updateBestHost,
  getAllHosts,
  saveTestRun,
  saveHostMetric,
  getRecentRuns,
  getHostHistory,
  calculate24hUptime,
  pruneOldRecords
};
