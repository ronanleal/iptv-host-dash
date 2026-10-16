const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

let db = null;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new sqlite3.Database(env.DB_PATH, (err) => {
      if (err) {
        console.error('[DB] Erro ao conectar ao banco de dados SQLite:', err.message);
      } else {
        console.log(`[DB] Conectado ao banco SQLite em: ${env.DB_PATH}`);
      }
    });

    initSchema(db);
  }
  return db;
}

function initSchema(databaseInstance) {
  databaseInstance.serialize(() => {
    databaseInstance.run('PRAGMA journal_mode = WAL;');
    databaseInstance.run('PRAGMA synchronous = NORMAL;');

    // 1. Tabela de estado e reputação contínua de cada host
    databaseInstance.run(`
      CREATE TABLE IF NOT EXISTS hosts (
        host TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'unknown',
        reputation_score REAL NOT NULL DEFAULT 50.0,
        consecutive_successes INTEGER NOT NULL DEFAULT 0,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        total_runs INTEGER NOT NULL DEFAULT 0,
        successful_runs INTEGER NOT NULL DEFAULT 0,
        uptime_24h REAL NOT NULL DEFAULT 100.0,
        last_ttfb_ms REAL,
        last_jitter_ms REAL,
        last_latency_ms REAL,
        last_speed_kbps REAL,
        last_score REAL,
        last_tested_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Histórico de rodadas de teste globais
    databaseInstance.run(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME NOT NULL,
        finished_at DATETIME NOT NULL,
        duration_ms INTEGER NOT NULL,
        total_hosts INTEGER NOT NULL,
        online_hosts INTEGER NOT NULL,
        avg_ttfb_ms REAL,
        best_host TEXT,
        best_host_score REAL,
        trigger_type TEXT NOT NULL DEFAULT 'cron'
      );
    `);

    // 3. Histórico granular de métricas por host em cada rodada
    databaseInstance.run(`
      CREATE TABLE IF NOT EXISTS host_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER,
        host TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        is_auth INTEGER NOT NULL DEFAULT 0,
        ttfb_ms REAL,
        jitter_ms REAL,
        latency_ms REAL,
        speed_kbps REAL,
        instant_score REAL,
        reputation_score REAL,
        composite_score REAL,
        error_message TEXT,
        tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE
      );
    `);

    // 4. Tabela singleton com o melhor host atual (leitura ultrarrápida para /iptv/host)
    databaseInstance.run(`
      CREATE TABLE IF NOT EXISTS current_best_host (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        host TEXT NOT NULL,
        status TEXT NOT NULL,
        composite_score REAL NOT NULL,
        ttfb_ms REAL,
        jitter_ms REAL,
        latency_ms REAL,
        speed_kbps REAL,
        reputation_score REAL,
        uptime_24h REAL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Índices para otimização de leitura
    databaseInstance.run('CREATE INDEX IF NOT EXISTS idx_host_metrics_tested_at ON host_metrics(tested_at);');
    databaseInstance.run('CREATE INDEX IF NOT EXISTS idx_host_metrics_host ON host_metrics(host);');
    databaseInstance.run('CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON test_runs(started_at);');
  });
}

function runAsync(sql, params = []) {
  const instance = getDb();
  return new Promise((resolve, reject) => {
    instance.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  const instance = getDb();
  return new Promise((resolve, reject) => {
    instance.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  const instance = getDb();
  return new Promise((resolve, reject) => {
    instance.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = {
  getDb,
  initSchema,
  runAsync,
  getAsync,
  allAsync
};
