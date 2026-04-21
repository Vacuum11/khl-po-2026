// ============================================================
// LEADERBOARD — fetch all predictions, calculate scores, render
// ============================================================

async function loadLeaderboard(mode = 'full') {
  const container = document.getElementById('leaderboard-body');
  if (!container) return;

  container.innerHTML = `<div class="loading-overlay"><div class="spinner"></div> Загрузка…</div>`;

  try {
    // Load results
    const settingsSnap = await db.collection('settings').doc('results').get();
    const resultsData  = settingsSnap.exists ? (settingsSnap.data().series || {}) : {};
    const currentRound = settingsSnap.exists ? (settingsSnap.data().currentRound || 1) : 1;

    // Load all predictions
    const predsSnap = await db.collection('predictions').get();
    if (predsSnap.empty) {
      container.innerHTML = '<div class="lb-empty">Прогнозов ещё нет. Будь первым! 🏒</div>';
      return;
    }

    // Calculate scores — each mode is a separate competition
    const rows = [];
    predsSnap.forEach(doc => {
      const data = doc.data();
      let predMap = null;
      if (mode === 'full' && data.fullBracket) {
        predMap = data.fullBracket;
      } else if (mode === 'round' && data.roundPredictions) {
        predMap = {};
        for (const rPicks of Object.values(data.roundPredictions)) {
          Object.assign(predMap, rPicks);
        }
      }
      // Skip users who haven't submitted predictions for this competition mode
      if (!predMap) return;

      const { total, breakdown } = mode === 'round'
        ? calculateRoundScore(predMap, resultsData)
        : calculateScore(predMap, resultsData);
      rows.push({
        uid:      doc.id,
        username: data.username || 'Аноним',
        total,
        breakdown
      });
    });

    // Sort descending
    rows.sort((a, b) => b.total - a.total);

    // Render
    container.innerHTML = rows.length === 0
      ? '<div class="lb-empty">Нет данных для отображения.</div>'
      : rows.map((row, i) => buildLbRow(row, i)).join('');

  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
  }
}

function buildLbRow(row, index) {
  const rank = index + 1;
  let rankCls = '';
  let rankStr = rank;
  if (rank === 1) { rankCls = 'gold';   rankStr = '🥇'; }
  if (rank === 2) { rankCls = 'silver'; rankStr = '🥈'; }
  if (rank === 3) { rankCls = 'bronze'; rankStr = '🥉'; }

  const bd = row.breakdown?.byRound || [0,0,0,0];
  const meCls = (window._myUid && window._myUid === row.uid) ? ' me' : '';
  const topCls = rank === 1 ? ' top-1' : '';

  return `
    <div class="lb-row${meCls}${topCls}" style="cursor:pointer" onclick="viewUserPicks('${row.uid}','${escapeHtml(row.username)}')">
      <div class="lb-rank ${rankCls}">${rankStr}</div>
      <div class="lb-name">${escapeHtml(row.username)}${meCls ? ' <span style="color:var(--text-3);font-size:.75rem">(вы)</span>' : ''}</div>
      <div class="lb-total">${row.total} <span style="font-size:.75rem;color:var(--text-2)">очков</span></div>
      <div class="lb-round">${bd[0]}</div>
      <div class="lb-round">${bd[1]}</div>
      <div class="lb-round">${bd[2]}</div>
      <div class="lb-round">${bd[3]}</div>
    </div>
  `;
}

// ── View another user's picks ─────────────────────────────
async function viewUserPicks(uid, username) {
  const modal = document.getElementById('picks-modal');
  const body  = document.getElementById('picks-modal-body');
  const title = document.getElementById('picks-modal-title');
  if (!modal) return;

  title.textContent = `Прогноз: ${username}`;
  body.innerHTML = '<div class="loading-overlay" style="position:static;padding:2rem"><div class="spinner"></div></div>';
  modal.classList.remove('hidden');

  try {
    const [predSnap, settingsSnap] = await Promise.all([
      db.collection('predictions').doc(uid).get(),
      db.collection('settings').doc('results').get()
    ]);

    const pred    = predSnap.exists ? predSnap.data() : {};
    const results = settingsSnap.exists ? (settingsSnap.data().series || {}) : {};
    const fullPicks  = pred.fullBracket || null;
    const roundPicks = pred.roundPredictions || null;

    let html = '';

    if (fullPicks) {
      html += `<div class="picks-mode-label">Полная сетка</div>${buildPicksView(fullPicks, results, 'full')}`;
    }
    if (roundPicks) {
      html += `<div class="picks-mode-label" style="margin-top:2rem">По раундам</div>${buildPicksView(
        Object.values(roundPicks).reduce((acc, rnd) => Object.assign(acc, rnd), {}),
        results,
        'round'
      )}`;
    }
    if (!fullPicks && !roundPicks) {
      html = '<div class="lb-empty">Пользователь ещё не заполнил прогноз.</div>';
    }

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
  }
}

function closePicksModal() {
  document.getElementById('picks-modal')?.classList.add('hidden');
}

// ── Render picks as a round-by-round list ─────────────────
function buildPicksView(userPicks, results, mode = 'full') {
  const ROUNDS = [
    { name: '1/8 финала', ids: ['w1','w2','w3','w4','e1','e2','e3','e4'] },
    { name: '1/4 финала (перекрёстный)', ids: ['c1','c2','c3','c4'] },
    { name: '1/2 финала', ids: ['s1','s2'] },
    { name: 'Финал КГ',   ids: ['final'] }
  ];
  const TREE = {
    'c1':['w1','e4'], 'c2':['e2','w3'],
    'c3':['e1','w4'], 'c4':['w2','e3'],
    's1':['c1','c2'], 's2':['c3','c4'],
    'final':['s1','s2']
  };
  const REV_SCORE = {'4:0':'0:4','4:1':'1:4','4:2':'2:4','4:3':'3:4'};

  // Pre-calculate full score breakdown for this user
  const { total, breakdown } = mode === 'round'
    ? calculateRoundScore(userPicks, results)
    : calculateScore(userPicks, results);

  function getTeams(sid) {
    const r1W = BRACKET.west.r1.find(s => s.id === sid);
    if (r1W) return [r1W.home, r1W.away];
    const r1E = BRACKET.east.r1.find(s => s.id === sid);
    if (r1E) return [r1E.home, r1E.away];
    if (['c1','c2','c3','c4'].includes(sid)) {
      const getSurv = (conf) => {
        const r1s = conf === 'west' ? BRACKET.west.r1 : BRACKET.east.r1;
        return r1s
          .map(s => {
            const winner = results[s.id]?.winner || userPicks[s.id]?.winner;
            if (!winner) return null;
            if (winner !== s.home && winner !== s.away) return null;
            const seriesNum = parseInt(s.id.slice(1));
            const teamSeed = winner === s.home ? seriesNum : (9 - seriesNum);
            return { teamSeed, winner };
          })
          .filter(s => s !== null)
          .sort((a, b) => a.teamSeed - b.teamSeed);
      };
      const w = getSurv('west');
      const e = getSurv('east');
      if (w.length < 4 || e.length < 4) return ['?','?'];
      const map = {
        'c1': [w[0].winner, e[3].winner],
        'c2': [e[1].winner, w[2].winner],
        'c3': [e[0].winner, w[3].winner],
        'c4': [w[1].winner, e[2].winner],
      };
      return map[sid] || ['?','?'];
    }
    const ch = TREE[sid];
    if (!ch) return ['?','?'];
    const gw = (csid) => results[csid]?.winner || userPicks[csid]?.winner || '?';
    return [gw(ch[0]), gw(ch[1])];
  }

  let html = `<div class="picks-total-header">Итого: <strong>${total}</strong> очков</div>`;

  ROUNDS.forEach(({ name, ids }, roundIdx) => {
    const roundPts = breakdown.byRound[roundIdx] || 0;

    const cards = ids.map(sid => {
      const [t1, t2] = getTeams(sid);
      const pick     = userPicks[sid] || {};
      const result   = results[sid];
      const complete = result?.complete;

      if (!pick.winner && !complete) {
        return `<div class="series-card locked" style="opacity:.5">
          <div class="series-team disabled"><span class="team-name" style="color:var(--text-3)">${t1 || 'TBD'}</span></div>
          <div class="series-team disabled"><span class="team-name" style="color:var(--text-3)">${t2 || 'TBD'}</span></div>
        </div>`;
      }

      const teamHtml = (team) => {
        const isPicked  = pick.winner === team;
        const isWinner  = complete && result.winner === team;
        const isWrong   = isPicked && complete && !isWinner;
        // Use user-pick class (not selected) when result is known
        const pickedCls = isPicked ? (complete ? ' user-pick' : ' selected') : '';
        const cls = `series-team disabled${pickedCls}${isWinner ? ' winner' : ''}`;
        const hint = isWrong ? '<span class="pick-hint">ваш выбор</span>' : '';
        return `<div class="${cls}"><div class="team-pick-indicator"></div><span class="team-name">${team}</span>${hint}</div>`;
      };

      // scoreDisplay — from the perspective of the picked team (reversed if user picked t2)
      const pickReversed   = pick.winner && pick.winner === t2;
      const scoreDisplay   = pick.score
        ? (pickReversed ? (REV_SCORE[pick.score] || pick.score) : pick.score)
        : '—';

      // resultScore — from t1's perspective (reversed if actual winner is t2)
      const resultReversed = complete && result?.winner === t2;
      const resultScore    = result?.score
        ? (resultReversed ? (REV_SCORE[result.score] || result.score) : result.score)
        : null;

      // Points chip
      const pts = breakdown.series[sid] ?? null;
      let ptsChip = '';
      if (complete && pick.winner) {
        const p = pts ?? 0;
        ptsChip = `<div class="series-pts ${p > 0 ? 'pts-pos' : 'pts-zero'}">${p > 0 ? '+' + p : '0'} очк.</div>`;
      }

      // Score display: show actual result + user's pick if they differ (compare displayed values)
      let scoreHtml;
      if (complete && resultScore && pick.score && scoreDisplay !== resultScore) {
        scoreHtml = `
          <span style="font-size:.8rem;color:var(--text-2)">Факт:</span>
          <span style="font-weight:700;margin-left:.3rem;color:var(--gold)">${resultScore}</span>
          <span style="font-size:.8rem;color:var(--text-3);margin-left:.6rem">прогноз:</span>
          <span style="font-weight:600;margin-left:.3rem;color:var(--red);text-decoration:line-through">${scoreDisplay}</span>`;
      } else if (complete && resultScore) {
        scoreHtml = `
          <span style="font-size:.8rem;color:var(--text-2)">Счёт:</span>
          <span style="font-weight:700;margin-left:.35rem;color:var(--gold)">${resultScore}</span>`;
      } else {
        scoreHtml = `
          <span style="font-size:.8rem;color:var(--text-2)">Счёт:</span>
          <span style="font-weight:600;margin-left:.35rem">${scoreDisplay}</span>`;
      }

      return `<div class="series-card${complete?' complete':''}">
        ${teamHtml(t1 || 'TBD')}
        ${teamHtml(t2 || 'TBD')}
        <div class="series-games-row" style="justify-content:center">${scoreHtml}</div>
        ${ptsChip}
      </div>`;
    }).join('');

    // Round subtotal — only show if at least one series in this round is complete
    const hasCompleted = ids.some(sid => results[sid]?.complete);
    const roundTotal = hasCompleted
      ? `<div class="round-pts-line">Раунд: <strong>${roundPts} очк.</strong></div>`
      : '';

    html += `<div class="picks-round">
      <div class="picks-round-name">${name}${roundTotal}</div>
      <div class="series-grid">${cards}</div>
    </div>`;
  });

  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Real-time refresh ─────────────────────────────────────
function subscribeLeaderboard(mode) {
  const container = document.getElementById('leaderboard-body');
  // Simple polling every 60s (Firestore real-time for all docs can be expensive on free tier)
  loadLeaderboard(mode);
  setInterval(() => loadLeaderboard(lbMode), 60_000);
}
