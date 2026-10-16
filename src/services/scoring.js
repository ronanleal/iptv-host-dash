/**
 * Algoritmo de Pontuação, Remuneração e Penalização de Estabilidade
 */

function calculateInstantScore(metrics) {
  if (metrics.status !== 'online' || !metrics.is_auth) {
    return 0;
  }

  const { ttfb_ms, jitter_ms, latency_ms, speed_kbps, probe_success_rate } = metrics;

  // 1. TTFB (35%): Ideal < 150ms -> 100 pts. Decaimento linear até 1000ms -> 0 pts
  let scoreTtfb = 0;
  if (ttfb_ms <= 150) {
    scoreTtfb = 100;
  } else if (ttfb_ms >= 1000) {
    scoreTtfb = 0;
  } else {
    scoreTtfb = 100 - ((ttfb_ms - 150) / 8.5);
  }

  // 2. Jitter (25%): Ideal < 10ms -> 100 pts. Decaimento linear até 150ms -> 0 pts
  let scoreJitter = 0;
  if (jitter_ms <= 10) {
    scoreJitter = 100;
  } else if (jitter_ms >= 150) {
    scoreJitter = 0;
  } else {
    scoreJitter = 100 - ((jitter_ms - 10) / 1.4);
  }

  // 3. Latência / RTT (15%): Ideal < 200ms -> 100 pts. Decaimento até 1200ms -> 0 pts
  let scoreLatency = 0;
  if (latency_ms <= 200) {
    scoreLatency = 100;
  } else if (latency_ms >= 1200) {
    scoreLatency = 0;
  } else {
    scoreLatency = 100 - ((latency_ms - 200) / 10.0);
  }

  // 4. Velocidade (15%): 1500 KB/s ou mais -> 100 pts
  let scoreSpeed = Math.min(100, Math.max(0, (speed_kbps || 0) / 15.0));

  // 5. Consistência dos Probes (10%): Proporção de probes concluídos
  let scoreProbes = Math.min(100, Math.max(0, (probe_success_rate || 1.0) * 100));

  const instant = (scoreTtfb * 0.35) +
                  (scoreJitter * 0.25) +
                  (scoreLatency * 0.15) +
                  (scoreSpeed * 0.15) +
                  (scoreProbes * 0.10);

  return parseFloat(Math.min(100, Math.max(0, instant)).toFixed(2));
}

function updateHostReputation(currentReputation, isOnline, currentStreak, currentFailures) {
  let rep = typeof currentReputation === 'number' ? currentReputation : 50.0;

  if (isOnline) {
    const consecutiveSuccesses = (currentStreak || 0) + 1;
    const consecutiveFailures = 0;

    // Bônus de Fidelidade (Remuneração): +2 pts por rodada consecutiva (máx 20 pts)
    const streakBonus = Math.min(20, consecutiveSuccesses * 2.0);

    // Convergência suave para 100 + Bônus
    const newReputation = Math.min(100, (rep * 0.85) + 15.0 + (streakBonus * 0.25));

    return {
      reputation_score: parseFloat(newReputation.toFixed(2)),
      consecutive_successes: consecutiveSuccesses,
      consecutive_failures: consecutiveFailures
    };
  } else {
    const consecutiveFailures = (currentFailures || 0) + 1;
    const consecutiveSuccesses = 0;

    // Penalização Severa: Queda de 50% na primeira falha + perda cumulativa
    const penaltyDrop = (rep * 0.50) - (15.0 * consecutiveFailures);
    const newReputation = Math.max(0, penaltyDrop);

    return {
      reputation_score: parseFloat(newReputation.toFixed(2)),
      consecutive_successes: consecutiveSuccesses,
      consecutive_failures: consecutiveFailures
    };
  }
}

function calculateCompositeScore(instantScore, reputationScore, uptime24h, isOnline) {
  if (!isOnline) {
    return 0.0;
  }

  const score = (instantScore * 0.50) +
                (reputationScore * 0.35) +
                (uptime24h * 0.15);

  return parseFloat(Math.min(100, Math.max(0, score)).toFixed(2));
}

module.exports = {
  calculateInstantScore,
  updateHostReputation,
  calculateCompositeScore
};
