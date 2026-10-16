/**
 * IPTV Host Dash — Frontend Controller
 */

let allHostsData = [];
let currentFilter = 'all';
let currentSearch = '';
let chartTopHosts = null;
let chartStability = null;
let chartHistory = null;
let chartTop10History = null;
let countdownInterval = null;
let nextRunSeconds = 600;

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  loadAllData();
  startCountdownTimer();

  // Polling automático dos dados a cada 30 segundos
  setInterval(loadAllData, 30000);
});

async function loadAllData() {
  try {
    const [hostsRes, statusRes, runsRes, top10Res] = await Promise.all([
      fetch('/api/hosts').then(r => r.json()),
      fetch('/api/status').then(r => r.json()),
      fetch('/api/runs?limit=10').then(r => r.json()),
      fetch('/api/history/top10?limit=15').then(r => r.json())
    ]);

    allHostsData = hostsRes.hosts || [];
    updateStatusUI(statusRes);
    updateBestHostUI(allHostsData[0] || null);
    updateKPIs(allHostsData, statusRes);
    renderTable();
    updateCharts(allHostsData, runsRes.runs || [], top10Res || null);
  } catch (err) {
    console.error('Erro ao carregar dados do dashboard:', err);
  }
}

function updateStatusUI(status) {
  const serviceStatus = document.getElementById('service-status');
  const btn = document.getElementById('btn-manual-test');
  const btnText = document.getElementById('btn-manual-text');

  if (status.is_running) {
    serviceStatus.textContent = 'Executando benchmark agora...';
    btn.disabled = true;
    btn.classList.add('spinning');
    btnText.textContent = 'Avaliando hosts...';
  } else {
    serviceStatus.textContent = 'Monitor Ativo';
    btn.disabled = false;
    btn.classList.remove('spinning');
    btnText.textContent = 'Iniciar Teste Manual';
  }

  // Recalcular contador baseado no last_run_at se disponível
  if (status.last_run_at) {
    const lastRunTime = new Date(status.last_run_at).getTime();
    const now = Date.now();
    const elapsedSec = Math.floor((now - lastRunTime) / 1000);
    const intervalSec = 600; // 10 minutos
    const remaining = intervalSec - (elapsedSec % intervalSec);
    nextRunSeconds = remaining > 0 ? remaining : 600;
  }
}

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    if (nextRunSeconds > 0) {
      nextRunSeconds--;
    } else {
      nextRunSeconds = 600;
      loadAllData();
    }

    const min = Math.floor(nextRunSeconds / 60);
    const sec = nextRunSeconds % 60;
    const str = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    const el = document.getElementById('countdown-timer');
    if (el) el.textContent = str;
  }, 1000);
}

function updateBestHostUI(best) {
  const urlEl = document.getElementById('best-host-url');
  const scoreEl = document.getElementById('best-host-score');
  const ttfbEl = document.getElementById('best-host-ttfb');
  const jitterEl = document.getElementById('best-host-jitter');
  const speedEl = document.getElementById('best-host-speed');
  const uptimeEl = document.getElementById('best-host-uptime');
  const repEl = document.getElementById('best-host-reputation');

  if (!best || best.status !== 'online') {
    urlEl.textContent = 'Aguardando rodada de testes...';
    scoreEl.textContent = '--';
    ttfbEl.textContent = '-- ms';
    jitterEl.textContent = '-- ms';
    speedEl.textContent = '-- KB/s';
    uptimeEl.textContent = '--%';
    repEl.textContent = '--';
    return;
  }

  urlEl.textContent = best.host;
  scoreEl.textContent = Math.round(best.last_score || 0);
  ttfbEl.textContent = `${best.last_ttfb_ms || 0} ms`;
  jitterEl.textContent = `${best.last_jitter_ms || 0} ms`;
  speedEl.textContent = `${best.last_speed_kbps || 0} KB/s`;
  uptimeEl.textContent = `${best.uptime_24h || 100}%`;
  repEl.textContent = `${best.reputation_score || 0} pts`;
}

function updateKPIs(hosts, status) {
  const totalHosts = hosts.length;
  const onlineCount = hosts.filter(h => h.status === 'online').length;
  const offlineCount = totalHosts - onlineCount;

  document.getElementById('kpi-total-hosts').textContent = totalHosts;
  document.getElementById('kpi-online-hosts').textContent = onlineCount;
  document.getElementById('kpi-offline-hosts').textContent = `${offlineCount} offline`;
  document.getElementById('pill-online-count').textContent = onlineCount;
  document.getElementById('pill-offline-count').textContent = offlineCount;

  const onlineTtfb = hosts.filter(h => h.status === 'online' && h.last_ttfb_ms).map(h => h.last_ttfb_ms);
  const avgTtfb = onlineTtfb.length > 0 ? (onlineTtfb.reduce((a, b) => a + b, 0) / onlineTtfb.length).toFixed(0) : '--';
  document.getElementById('kpi-avg-ttfb').textContent = `${avgTtfb} ms`;

  if (status.last_run_at) {
    const date = new Date(status.last_run_at);
    document.getElementById('kpi-last-run').textContent = date.toLocaleTimeString();
  } else {
    document.getElementById('kpi-last-run').textContent = 'Pendente';
  }

  if (status.last_duration_ms) {
    document.getElementById('kpi-last-duration').textContent = `Duração: ${(status.last_duration_ms / 1000).toFixed(1)}s`;
  }
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`pill-${filter}`).classList.add('active');
  renderTable();
}

function filterTable() {
  currentSearch = (document.getElementById('filter-search').value || '').toLowerCase().trim();
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  if (!allHostsData || allHostsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="td-loading">Nenhum host encontrado.</td></tr>';
    return;
  }

  const filtered = allHostsData.filter(h => {
    if (currentFilter === 'online' && h.status !== 'online') return false;
    if (currentFilter === 'offline' && h.status === 'online') return false;
    if (currentSearch && !h.host.toLowerCase().includes(currentSearch)) return false;
    return true;
  });

  document.getElementById('table-total-count').textContent = `${filtered.length} hosts`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="td-loading">Nenhum host corresponde ao filtro selecionado.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach((h, idx) => {
    const isOnline = h.status === 'online';
    const rankClass = idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : '';
    const rankIcon = idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`;

    const score = h.last_score || 0;
    const scoreColorClass = score >= 75 ? 'high' : score >= 45 ? 'mid' : 'low';

    let streakTag = '';
    if (isOnline && h.consecutive_successes >= 3) {
      streakTag = `<span class="streak-tag fire" title="${h.consecutive_successes} testes consecutivos online">🔥 ${h.consecutive_successes}x streak</span>`;
    } else if (!isOnline && h.consecutive_failures > 0) {
      streakTag = `<span class="streak-tag penalized" title="Penalizado por queda">⚠️ -${h.consecutive_failures * 15}pts</span>`;
    } else {
      streakTag = `<span class="streak-tag">${h.reputation_score || 50} pts</span>`;
    }

    html += `
      <tr>
        <td class="rank-badge ${rankClass}">${rankIcon}</td>
        <td class="host-cell">${h.host}</td>
        <td>
          <span class="status-badge ${isOnline ? 'online' : 'offline'}">
            <span class="status-dot ${isOnline ? '' : 'red'}"></span>
            ${isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </td>
        <td>
          <div class="score-bar-wrapper">
            <span style="font-family: var(--font-mono); font-weight: 700; width: 38px;">${Math.round(score)}</span>
            <div class="score-bar-bg">
              <div class="score-bar-fill ${scoreColorClass}" style="width: ${Math.min(100, Math.max(5, score))}%;"></div>
            </div>
          </div>
        </td>
        <td>${streakTag}</td>
        <td style="font-family: var(--font-mono);">${h.last_ttfb_ms ? `${h.last_ttfb_ms} ms` : '--'}</td>
        <td style="font-family: var(--font-mono);">${h.last_jitter_ms ? `${h.last_jitter_ms} ms` : '--'}</td>
        <td style="font-family: var(--font-mono);">${h.last_latency_ms ? `${h.last_latency_ms} ms` : '--'}</td>
        <td style="font-family: var(--font-mono);">${h.last_speed_kbps ? `${h.last_speed_kbps} KB/s` : '--'}</td>
        <td style="font-family: var(--font-mono); color: ${h.uptime_24h >= 90 ? 'var(--color-green)' : 'var(--text-muted)'};">${h.uptime_24h || 100}%</td>
        <td>
          <button class="btn-mini-copy" onclick="copyToClipboard('${h.host}')" title="Copiar URL">Copiar</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function initCharts() {
  const ctxTop = document.getElementById('chart-top-hosts').getContext('2d');
  chartTopHosts = new Chart(ctxTop, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Nota Composta (0-100)',
        data: [],
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f8fafc', font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });

  const ctxStab = document.getElementById('chart-stability').getContext('2d');
  chartStability = new Chart(ctxStab, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'TTFB (ms)',
          data: [],
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 6
        },
        {
          label: 'Jitter (ms)',
          data: [],
          backgroundColor: 'rgba(236, 72, 153, 0.7)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#f8fafc', font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });

  const ctxHist = document.getElementById('chart-history').getContext('2d');
  chartHistory = new Chart(ctxHist, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Hosts Online por Rodada',
        data: [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          min: 0,
          max: 35,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', stepSize: 5 }
        }
      }
    }
  });
}


  const ctxTop10Hist = document.getElementById('chart-top10-history').getContext('2d');
  chartTop10History = new Chart(ctxTop10Hist, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Plus Jakarta Sans', size: 11 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(16, 22, 35, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', stepSize: 20 },
          title: {
            display: true,
            text: 'Nota Composta (0-100)',
            color: '#64748b',
            font: { family: 'Plus Jakarta Sans', size: 11 }
          }
        }
      }
    }
  });

function updateCharts(hosts, runs, top10History) {
  const top10 = hosts.filter(h => h.status === 'online').slice(0, 10);

  // 1. Top 10 Chart
  if (chartTopHosts) {
    chartTopHosts.data.labels = top10.map(h => h.host.replace('http://', ''));
    chartTopHosts.data.datasets[0].data = top10.map(h => h.last_score || 0);
    chartTopHosts.update();
  }

  // 2. Stability Chart (Top 6 Hosts)
  const top6 = top10.slice(0, 6);
  if (chartStability) {
    chartStability.data.labels = top6.map(h => h.host.replace('http://', ''));
    chartStability.data.datasets[0].data = top6.map(h => h.last_ttfb_ms || 0);
    chartStability.data.datasets[1].data = top6.map(h => h.last_jitter_ms || 0);
    chartStability.update();
  }

  // 3. History Chart
  if (chartHistory && runs && runs.length > 0) {
    const reversedRuns = [...runs].reverse();
    chartHistory.data.labels = reversedRuns.map(r => {
      const d = new Date(r.started_at);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    chartHistory.data.datasets[0].data = reversedRuns.map(r => r.online_hosts);
    chartHistory.update();
  }

  // 4. Top 10 History Chart
  if (chartTop10History && top10History && top10History.labels && top10History.labels.length > 0) {
    chartTop10History.data.labels = top10History.labels;
    chartTop10History.data.datasets = top10History.datasets;
    chartTop10History.update();
  }

}

async function triggerManualTest() {
  const btn = document.getElementById('btn-manual-test');
  const btnText = document.getElementById('btn-manual-text');
  btn.disabled = true;
  btn.classList.add('spinning');
  btnText.textContent = 'Iniciando teste...';

  try {
    const res = await fetch('/api/test/run', { method: 'POST' });
    const data = await res.json();

    if (res.status === 409) {
      showToast('⚠️ Já existe um teste em execução no momento.');
    } else {
      showToast('⚡ Teste iniciado com sucesso! Atualizando métricas...');
    }

    // Monitora término a cada 3 segundos
    const pollInterval = setInterval(async () => {
      const st = await fetch('/api/status').then(r => r.json());
      if (!st.is_running) {
        clearInterval(pollInterval);
        loadAllData();
        showToast('✅ Benchmark concluído! Novas notas computadas.');
      }
    }, 3000);
  } catch (err) {
    showToast('❌ Erro ao disparar teste manual.');
    btn.disabled = false;
    btn.classList.remove('spinning');
    btnText.textContent = 'Iniciar Teste Manual';
  }
}

function copyBestHost() {
  const url = document.getElementById('best-host-url').textContent;
  if (url && !url.includes('Carregando') && !url.includes('Aguardando')) {
    copyToClipboard(url);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 URL copiada: ${text}`);
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(`📋 URL copiada: ${text}`);
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  msgEl.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
