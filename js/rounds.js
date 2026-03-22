// ============================================================
// ROUNDS — round-by-round prediction logic
// ============================================================

let roundPicks              = {};   // { round: { sid: { winner, games } } }
let roundResults            = {};   // actual results from admin
let currentRound            = 1;    // which round is currently active (1–4)
let roundPredictionsLocked  = false; // locked by admin without advancing round
let roundUser               = null;
let roundUserData           = null;
let roundsViewMode          = 'picks'; // 'picks' | 'reality'

const ROUND_SERIES = [
  ['w1','w2','w3','w4','e1','e2','e3','e4'],  // round 1
  ['c1','c2','c3','c4'],                       // round 2 (cross-conference)
  ['s1','s2'],                                 // round 3
  ['final']                                    // round 4
];

// ── Load data ─────────────────────────────────────────────
async function loadRoundPredictions(uid) {
  const snap = await db.collection('predictions').doc(uid).get();
  if (snap.exists && snap.data().roundPredictions) {
    roundPicks = snap.data().roundPredictions;
  }
}

async function loadRoundSettings() {
  const snap = await db.collection('settings').doc('results').get();
  if (snap.exists) {
    roundResults             = snap.data().series   || {};
    currentRound             = snap.data().currentRound || 1;
    roundPredictionsLocked   = snap.data().roundPredictionsLocked || false;
  }
}

// ── Get teams for a series in round view ──────────────────
function teamsForRoundSeries(sid, roundIdx) {
  // R1: from bracket config
  const r1W = BRACKET.west.r1.find(s => s.id === sid);
  if (r1W) return [r1W.home, r1W.away];
  const r1E = BRACKET.east.r1.find(s => s.id === sid);
  if (r1E) return [r1E.home, r1E.away];

  // Later rounds: from real results if available, otherwise from prev round picks
  const tree = {
    'c1': ['w1','e4'], 'c2': ['e2','w3'],
    'c3': ['e1','w4'], 'c4': ['w2','e3'],
    's1': ['c1','c2'], 's2': ['c3','c4'],
    'final': ['s1','s2']
  };
  const children = tree[sid];
  if (!children) return ['?','?'];

  const getWinner = (csid) =>
    roundResults[csid]?.winner || roundPicks[roundIdx - 1]?.[csid]?.winner || '?';

  return [getWinner(children[0]), getWinner(children[1])];
}

function isRoundLocked(roundIdx) {
  return roundIdx < currentRound - 1;
}

function isRoundOpen(roundIdx) {
  if (roundIdx !== currentRound - 1) return false;
  return !roundPredictionsLocked;
}

// ── Pick ──────────────────────────────────────────────────
function roundPickWinner(roundIdx, sid, team) {
  if (!isRoundOpen(roundIdx)) return;
  const result = roundResults[sid];
  if (result?.complete) return;
  if (!roundPicks[roundIdx]) roundPicks[roundIdx] = {};
  roundPicks[roundIdx][sid] = { ...roundPicks[roundIdx][sid], winner: team };
  renderRoundSection(roundIdx);
  updateRoundProgress(roundIdx);
}

function roundPickScore(roundIdx, sid, score) {
  if (!isRoundOpen(roundIdx)) return;
  const result = roundResults[sid];
  if (result?.complete) return;
  if (!roundPicks[roundIdx]) roundPicks[roundIdx] = {};
  roundPicks[roundIdx][sid] = { ...roundPicks[roundIdx][sid], score };
  renderRoundSection(roundIdx);
}

// ── Save ──────────────────────────────────────────────────
async function saveRoundPrediction(roundIdx) {
  if (!roundUser) return;
  const btn = document.getElementById(`save-round-${roundIdx}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
  try {
    await db.collection('predictions').doc(roundUser.uid).set({
      roundPredictions: roundPicks,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      username: roundUserData?.username || ''
    }, { merge: true });
    showToast('Прогноз на раунд сохранён! Можно редактировать до старта раунда.', 'success');
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить прогноз на раунд'; }
    updateRoundProgress(roundIdx);
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить прогноз на раунд'; }
  }
}

// ── Progress ──────────────────────────────────────────────
function updateRoundProgress(roundIdx) {
  const series = ROUND_SERIES[roundIdx];
  const done   = series.filter(sid => roundPicks[roundIdx]?.[sid]?.winner).length;
  const fill   = document.getElementById(`progress-${roundIdx}`);
  const info   = document.getElementById(`progress-info-${roundIdx}`);
  if (fill) fill.style.width = Math.round((done / series.length) * 100) + '%';
  if (info) info.textContent = `${done}/${series.length}`;

  const btn = document.getElementById(`save-round-${roundIdx}`);
  if (btn) btn.disabled = done < series.length || !isRoundOpen(roundIdx);
}

// ─────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────

function renderAllRounds() {
  const container = document.getElementById('rounds-container');
  if (!container) return;
  container.innerHTML = '';
  for (let r = 0; r < 4; r++) {
    container.appendChild(buildRoundSection(r));
  }
}

function renderRoundSection(roundIdx) {
  const old = document.getElementById(`round-section-${roundIdx}`);
  if (!old) return;
  const fresh = buildRoundSection(roundIdx);
  old.replaceWith(fresh);
}

function buildRoundSection(roundIdx) {
  const series  = ROUND_SERIES[roundIdx];
  const name    = ROUND_NAMES[roundIdx];
  const open    = isRoundOpen(roundIdx);
  const locked  = isRoundLocked(roundIdx);
  const future  = roundIdx > currentRound - 1;
  const done    = series.filter(sid => roundPicks[roundIdx]?.[sid]?.winner).length;

  let badgeCls  = 'round-badge';
  let badgeTxt  = '';
  if (open)   { badgeTxt = 'АКТИВЕН'; }
  if (!open && roundIdx === currentRound - 1 && roundPredictionsLocked) {
    badgeCls += ' locked-badge'; badgeTxt = 'ПРИЁМ ЗАКРЫТ';
  }
  if (locked) { badgeCls += ' locked-badge'; badgeTxt = 'ЗАВЕРШЁН'; }
  if (future) { badgeCls += ' locked-badge'; badgeTxt = 'СКОРО'; }
  if (roundIdx === 3 && open) badgeCls += ' gold';

  // Extra note for R2 cross-conference
  const crossNote = roundIdx === 1
    ? '<div style="font-size:.78rem;color:var(--text-3);margin-bottom:.75rem">Перекрёстный формат: команды Запада встречаются с командами Востока</div>'
    : '';

  const isReality = roundsViewMode === 'reality';
  const seriesCards = series.map(sid =>
    isReality
      ? buildRoundSeriesCardReality(sid, roundIdx)
      : buildRoundSeriesCard(sid, roundIdx, open, locked)
  ).join('');

  // Banner when round is finished but user made zero picks
  const hasResults = series.some(sid => roundResults[sid]?.complete);
  const noPicksBanner = !isReality && locked && done === 0 && hasResults
    ? `<div class="alert alert-info" style="margin-bottom:.75rem">
        Вы не сделали ни одного прогноза на этот раунд — очки не начислены.
       </div>`
    : '';

  const section = document.createElement('div');
  section.className = 'round-section';
  section.id = `round-section-${roundIdx}`;

  section.innerHTML = `
    <div class="round-section-title">
      ${name}
      <span class="${badgeCls}">${badgeTxt}</span>
      ${open && !isReality ? `<span style="margin-left:auto;font-size:.8rem;color:var(--text-2)" id="progress-info-${roundIdx}">${done}/${series.length}</span>` : ''}
    </div>
    ${crossNote}
    ${noPicksBanner}
    ${future && !isReality ? `<div class="alert alert-info">Этот раунд пока не открыт для прогнозов.</div>` : ''}
    ${open && !isReality ? `
      <div class="progress-bar" style="width:200px;margin-bottom:1rem">
        <div class="progress-fill" id="progress-${roundIdx}" style="width:${Math.round(done/series.length*100)}%"></div>
      </div>` : ''}
    <div class="series-grid">
      ${seriesCards}
    </div>
    ${open && !isReality ? `
      <div style="margin-top:1rem;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" id="save-round-${roundIdx}"
          ${done < series.length ? 'disabled' : ''}>
          Сохранить прогноз на раунд
        </button>
      </div>` : ''}
  `;

  if (!future && !isReality) {
    section.querySelectorAll('.series-team[data-sid]').forEach(el => {
      el.addEventListener('click', () => roundPickWinner(roundIdx, el.dataset.sid, el.dataset.team));
    });
    section.querySelectorAll('.games-btn').forEach(el => {
      el.addEventListener('click', () => roundPickScore(roundIdx, el.dataset.sid, el.dataset.score));
    });
    const saveBtn = section.querySelector(`#save-round-${roundIdx}`);
    saveBtn?.addEventListener('click', () => saveRoundPrediction(roundIdx));
  }

  return section;
}

function buildRoundSeriesCard(sid, roundIdx, open, locked) {
  const [t1, t2] = teamsForRoundSeries(sid, roundIdx);
  const pick     = roundPicks[roundIdx]?.[sid] || {};
  const result   = roundResults[sid];
  const complete = result?.complete;
  const editable = open && !complete;

  // Did user save a pick for a team that didn't actually reach this series?
  const teamsKnown = t1 && t1 !== '?' && t2 && t2 !== '?';
  const pickedEliminated = teamsKnown && !!pick.winner && pick.winner !== t1 && pick.winner !== t2;

  const teamRow = (team) => {
    if (!team || team === '?') {
      return `<div class="series-team disabled"><span class="team-name" style="color:var(--text-3)">TBD</span></div>`;
    }
    const isSelected = !complete && pick.winner === team;
    const isWinner   = complete && !!pick.winner && !pickedEliminated && result.winner === team;
    const isPicked   = complete && !pickedEliminated && pick.winner === team;
    const isWrong    = isPicked && !isWinner;
    const dis = !editable ? ' disabled' : '';
    const hint = isWrong ? '<span class="pick-hint">ваш выбор</span>' : '';
    return `<div class="series-team${dis}${isSelected?' selected':''}${isWinner?' winner':''}${isPicked?' user-pick':''}" data-sid="${sid}" data-team="${team}">
      <div class="team-pick-indicator"></div>
      ${teamConfBadge(team)}
      ${teamLogoHtml(team)}
      <span class="team-name">${team}</span>
      ${hint}
    </div>`;
  };

  const useReversed = pick.winner && t2 && pick.winner === t2;
  const scores = ['4:0','4:1','4:2','4:3'];
  const scoresRev = ['0:4','1:4','2:4','3:4'];
  // When complete: always show from the real winner's perspective regardless of user pick.
  // When in progress: show from the user's chosen team's perspective.
  const showReversed = complete ? (result?.winner === t2) : useReversed;
  const displayScores = showReversed ? scoresRev : scores;
  const RREV = Object.fromEntries(scores.map((s, i) => [s, scoresRev[i]]));
  // Result score from t1's display perspective (reversed if actual winner is t2)
  const resultDisplayed = complete && result?.score
    ? (result.winner === t2 ? (RREV[result.score] || result.score) : result.score)
    : null;

  const gamesRow = scores.map((s, i) => {
    let cls = 'games-btn';
    // isResult: direct match on stored score (admin always stores '4:x' from winner's side)
    const isResult   = complete && result?.score === s;
    const isUserPick = complete && pick.score === s;
    if (isResult) cls += ' result';
    if (isUserPick && !isResult) cls += ' user-pick';
    else if (!complete && pick.score === s) cls += ' selected';
    const dis = !editable ? ' disabled' : '';
    return `<button class="${cls}" data-sid="${sid}" data-score="${s}"${dis}>${displayScores[i]}</button>`;
  }).join('');

  let ptsChip = '';
  if (pickedEliminated) {
    // User's saved pick was for a team that didn't reach this series
    ptsChip = `<div class="series-pts pts-zero">Вы выбирали: ${pick.winner} (не дошёл)</div>`;
  } else if (complete) {
    if (pick.winner) {
      let pts = 0;
      const rIdx = ['w1','w2','w3','w4','e1','e2','e3','e4'].includes(sid) ? 0
        : ['c1','c2','c3','c4'].includes(sid) ? 1
        : ['s1','s2'].includes(sid) ? 2 : 3;
      if (pick.winner === result.winner) {
        pts += SCORING.winnerPoints[rIdx];
        if (pick.score && pick.score === result.score) pts += SCORING.seriesScoreBonus;
      }
      ptsChip = `<div class="series-pts ${pts > 0 ? 'pts-pos' : 'pts-zero'}">${pts > 0 ? '+' + pts : '0'} очк.</div>`;
    } else {
      ptsChip = `<div class="series-pts pts-zero">Прогноз не сделан</div>`;
    }
  }

  // Live score row for in-progress series (not complete, but has liveScore set by admin)
  const liveRow = !complete && result?.liveScore
    ? `<div class="series-live-score">🟢 ${result.liveScore}</div>`
    : '';

  return `
    <div class="series-card${complete?' complete':''}${!open?' locked':''}">
      ${teamRow(t1)}
      ${teamRow(t2)}
      <div class="series-games-row">${gamesRow}</div>
      ${liveRow}
      ${ptsChip}
    </div>
  `;
}

// ── Reality card: read-only, shows only actual results ──────
function buildRoundSeriesCardReality(sid, roundIdx) {
  const [t1, t2] = teamsForRoundSeries(sid, roundIdx);
  const result   = roundResults[sid];
  const complete = result?.complete;
  const REV      = {'4:0':'0:4','4:1':'1:4','4:2':'2:4','4:3':'3:4'};

  const teamRow = (team) => {
    if (!team || team === '?') {
      return `<div class="series-team disabled"><span class="team-name" style="color:var(--text-3)">TBD</span></div>`;
    }
    const isWinner = complete && result.winner === team;
    return `<div class="series-team disabled${isWinner ? ' winner' : ''}">
      <div class="team-pick-indicator"></div>
      ${teamConfBadge(team)}
      ${teamLogoHtml(team)}
      <span class="team-name">${team}</span>
    </div>`;
  };

  let scoreRow;
  if (complete && result.score) {
    const useReversed = result.winner === t2;
    const score = useReversed ? (REV[result.score] || result.score) : result.score;
    scoreRow = `<div class="series-games-row" style="justify-content:center;gap:.4rem">
      <span style="font-size:.75rem;color:var(--text-2)">Счёт:</span>
      <span style="font-weight:700;margin-left:.3rem;color:var(--gold)">${score}</span>
    </div>`;
  } else {
    const hasTeams = t1 && t1 !== '?' && t2 && t2 !== '?';
    scoreRow = `<div class="series-games-row" style="justify-content:center;color:var(--text-3);font-size:.75rem;font-style:italic">
      ${hasTeams ? 'Серия не сыграна' : 'Пары не определены'}
    </div>`;
  }

  return `<div class="series-card${complete ? ' complete' : ''}">
    ${teamRow(t1)}
    ${teamRow(t2)}
    ${scoreRow}
  </div>`;
}

// ── View toggle ─────────────────────────────────────────────
function switchRoundsView(mode) {
  roundsViewMode = mode;
  document.getElementById('rvt-picks')?.classList.toggle('active', mode === 'picks');
  document.getElementById('rvt-reality')?.classList.toggle('active', mode === 'reality');
  renderAllRounds();
}

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
async function initRounds(user, userData) {
  roundUser     = user;
  roundUserData = userData;
  await Promise.all([loadRoundPredictions(user.uid), loadRoundSettings()]);
  renderAllRounds();
}
