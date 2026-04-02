// ============================================================
// РАСЧЁТ ОЧКОВ
// ============================================================

/**
 * Рассчитывает очки пользователя на основе его прогнозов и реальных результатов.
 * @param {Object} userPrediction  — прогноз: { seriesId: { winner, score } }
 * @param {Object} results         — результаты: { seriesId: { winner, score, complete } }
 * @returns {{ total, breakdown }}
 */
function calculateScore(userPrediction, results) {
  let total = 0;
  const breakdown = { byRound: [0, 0, 0, 0], series: {} };

  const roundOf = (id) => {
    if (["w1","w2","w3","w4","e1","e2","e3","e4"].includes(id)) return 0;
    if (["c1","c2","c3","c4"].includes(id)) return 1;
    if (["s1","s2"].includes(id)) return 2;
    if (id === "final") return 3;
    return -1;
  };

  for (const [sid, result] of Object.entries(results)) {
    if (!result.complete) continue;
    const pred = userPrediction?.[sid];
    if (!pred) continue;

    const round = roundOf(sid);
    if (round < 0) continue;

    let pts = 0;
    if (pred.winner === result.winner) {
      pts += SCORING.winnerPoints[round];
      if (pred.score && pred.score === result.score) {
        pts += SCORING.seriesScoreBonus;
      }
    }
    breakdown.series[sid] = pts;
    breakdown.byRound[round] += pts;
    total += pts;
  }

  return { total, breakdown };
}

/**
 * Расчёт очков для режима "По раундам".
 * Плоская система: 1 очко за угаданного победителя + 1 бонус за точный счёт — в каждом раунде.
 */
function calculateRoundScore(userPrediction, results) {
  let total = 0;
  const breakdown = { byRound: [0, 0, 0, 0], series: {} };

  const roundOf = (id) => {
    if (["w1","w2","w3","w4","e1","e2","e3","e4"].includes(id)) return 0;
    if (["c1","c2","c3","c4"].includes(id)) return 1;
    if (["s1","s2"].includes(id)) return 2;
    if (id === "final") return 3;
    return -1;
  };

  for (const [sid, result] of Object.entries(results)) {
    if (!result.complete) continue;
    const pred = userPrediction?.[sid];
    if (!pred) continue;

    const round = roundOf(sid);
    if (round < 0) continue;

    let pts = 0;
    if (pred.winner === result.winner) {
      pts += 1;
      if (pred.score && pred.score === result.score) {
        pts += SCORING.seriesScoreBonus;
      }
    }
    breakdown.series[sid] = pts;
    breakdown.byRound[round] += pts;
    total += pts;
  }

  return { total, breakdown };
}
