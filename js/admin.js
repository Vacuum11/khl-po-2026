// ============================================================
// ADMIN — enter results, manage rounds, lock predictions
// ============================================================

let adminResults = {};
let adminCurrentRound = 1;
let adminFullBracketLocked = false;
let adminRoundPredictionsLocked = false;

const ADMIN_ALL_SERIES = [
  { id:'w1',   name:'Запад 1 vs 8',  round:1 },
  { id:'w2',   name:'Запад 2 vs 7',  round:1 },
  { id:'w3',   name:'Запад 3 vs 6',  round:1 },
  { id:'w4',   name:'Запад 4 vs 5',  round:1 },
  { id:'e1',   name:'Восток 1 vs 8', round:1 },
  { id:'e2',   name:'Восток 2 vs 7', round:1 },
  { id:'e3',   name:'Восток 3 vs 6', round:1 },
  { id:'e4',   name:'Восток 4 vs 5', round:1 },
  { id:'c1',   name:'Сетка А — пара 1 (лучш.З vs худш.В)',  round:2 },
  { id:'c2',   name:'Сетка А — пара 2 (2-й В vs 3-й З)',   round:2 },
  { id:'c3',   name:'Сетка Б — пара 1 (лучш.В vs худш.З)', round:2 },
  { id:'c4',   name:'Сетка Б — пара 2 (2-й З vs 3-й В)',   round:2 },
  { id:'s1',   name:'Полуфинал 1',   round:3 },
  { id:'s2',   name:'Полуфинал 2',   round:3 },
  { id:'final',name:'Финал КГ',      round:4 }
];

// R2 (c1-c4) parents are resolved dynamically via getTeamOptions; only R3/Final here
const ADMIN_TREE = {
  's1':['c1','c2'], 's2':['c3','c4'],
  'final':['s1','s2']
};

function getTeamOptions(sid) {
  // R2: dynamic re-seeding based on actual R1 results
  if (['c1','c2','c3','c4'].includes(sid)) {
    const surv = (conf) => {
      const r1s = conf === 'west' ? BRACKET.west.r1 : BRACKET.east.r1;
      return r1s
        .map(s => {
          const winner = adminResults[s.id]?.winner;
          if (!winner) return null;
          if (winner !== s.home && winner !== s.away) return null;
          const seriesNum = parseInt(s.id.slice(1));
          const teamSeed = winner === s.home ? seriesNum : (9 - seriesNum);
          return { teamSeed, winner };
        })
        .filter(s => s !== null)
        .sort((a, b) => a.teamSeed - b.teamSeed);
    };
    const w = surv('west');
    const e = surv('east');
    if (w.length < 4 || e.length < 4) return [];
    const map = {
      'c1': [w[0].winner, e[3].winner],
      'c2': [e[1].winner, w[2].winner],
      'c3': [e[0].winner, w[3].winner],
      'c4': [w[1].winner, e[2].winner],
    };
    return map[sid] || [];
  }
  // R3/Final
  if (ADMIN_TREE[sid]) {
    const kids = ADMIN_TREE[sid];
    return kids.map(id => adminResults[id]?.winner || '?').filter(t => t !== '?');
  }
  // R1
  const r1W = BRACKET.west.r1.find(s => s.id === sid);
  if (r1W) return [r1W.home, r1W.away];
  const r1E = BRACKET.east.r1.find(s => s.id === sid);
  if (r1E) return [r1E.home, r1E.away];
  return [];
}

// ── Load ─────────────────────────────────────────────────
async function loadAdminData() {
  const snap = await db.collection('settings').doc('results').get();
  if (snap.exists) {
    adminResults                = snap.data().series || {};
    adminCurrentRound           = snap.data().currentRound || 1;
    adminFullBracketLocked      = snap.data().fullBracketLocked || false;
    adminRoundPredictionsLocked = snap.data().roundPredictionsLocked || false;
  }
}

// ── Save all ──────────────────────────────────────────────
async function saveAdminData() {
  const btn = document.getElementById('save-admin-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Сохранение…';
  try {
    await db.collection('settings').doc('results').set({
      series:                   adminResults,
      currentRound:             adminCurrentRound,
      fullBracketLocked:        adminFullBracketLocked,
      roundPredictionsLocked:   adminRoundPredictionsLocked,
      updatedAt:                firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Результаты сохранены!', 'success');
    renderAdminPanel();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить всё';
  }
}

// ── Render ────────────────────────────────────────────────
function renderAdminPanel() {
  renderRoundControl();
  renderLockControl();
  renderTeamsEditor();
  renderSeriesList();
  renderParticipants();
}

// ── Teams editor ─────────────────────────────────────────
function renderTeamsEditor() {
  const container = document.getElementById('admin-teams-editor');
  if (!container) return;

  const allSeries = [
    ...BRACKET.west.r1.map((s, i) => ({ ...s, conf: 'Запад', seed: i + 1 })),
    ...BRACKET.east.r1.map((s, i) => ({ ...s, conf: 'Восток', seed: i + 1 }))
  ];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem">
      ${allSeries.map(s => `
        <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem">
          <div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem">
            ${s.conf} ${s.seed} vs ${9 - s.seed}
          </div>
          <div style="display:flex;flex-direction:column;gap:.4rem">
            <input class="admin-select teams-home-input" data-sid="${s.id}"
              placeholder="Команда с преимуществом льда (${s.seed}-е место)"
              value="${escapeHtmlAdmin(s.home)}"
              style="width:100%;box-sizing:border-box;font-size:.85rem">
            <input class="admin-select teams-away-input" data-sid="${s.id}"
              placeholder="Соперник (${9 - s.seed}-е место)"
              value="${escapeHtmlAdmin(s.away)}"
              style="width:100%;box-sizing:border-box;font-size:.85rem">
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:1rem;display:flex;gap:.75rem;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="resetTeamsEditor()">↺ Сбросить</button>
      <button class="btn btn-gold btn-sm" onclick="saveTeams()">Сохранить команды</button>
    </div>
  `;
}

function resetTeamsEditor() {
  renderTeamsEditor();
}

async function saveTeams() {
  const homeInputs = document.querySelectorAll('.teams-home-input');
  const awayInputs = document.querySelectorAll('.teams-away-input');

  const westR1 = [];
  const eastR1 = [];

  homeInputs.forEach(inp => {
    const sid = inp.dataset.sid;
    const away = document.querySelector(`.teams-away-input[data-sid="${sid}"]`)?.value.trim() || '';
    const home = inp.value.trim();
    const entry = { id: sid, home, away };
    if (sid.startsWith('w')) westR1.push(entry);
    else eastR1.push(entry);
  });

  // Sort by id to preserve w1,w2,w3,w4 / e1,e2,e3,e4 order
  westR1.sort((a, b) => a.id.localeCompare(b.id));
  eastR1.sort((a, b) => a.id.localeCompare(b.id));

  try {
    await db.collection('settings').doc('bracket').set({
      west: { r1: westR1 },
      east: { r1: eastR1 },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Patch global BRACKET so the rest of the admin page is consistent
    BRACKET.west.r1 = westR1;
    BRACKET.east.r1 = eastR1;
    showToast('Команды сохранены!', 'success');
    renderSeriesList(); // refresh series list with new team names
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function renderRoundControl() {
  const sel = document.getElementById('current-round-sel');
  if (!sel) return;
  sel.value = adminCurrentRound;
}

function renderLockControl() {
  const cb = document.getElementById('lock-full-bracket');
  if (cb) cb.checked = adminFullBracketLocked;
  const cb2 = document.getElementById('lock-round-predictions');
  if (cb2) cb2.checked = adminRoundPredictionsLocked;
}

function renderSeriesList() {
  const container = document.getElementById('admin-series-list');
  if (!container) return;

  const byRound = [[], [], [], []];
  ADMIN_ALL_SERIES.forEach(s => byRound[s.round - 1].push(s));

  container.innerHTML = byRound.map((group, ri) => `
    <div style="margin-bottom:2rem">
      <h3 style="font-family:'Oswald',sans-serif;font-size:1rem;color:var(--text-2);
                 text-transform:uppercase;letter-spacing:.06em;
                 border-bottom:1px solid var(--border);padding-bottom:.5rem;margin-bottom:.75rem">
        ${ROUND_NAMES[ri]}
        ${ri === 1 ? ' <span style="font-size:.75rem;color:var(--text-3);font-weight:400">(перекрёстный)</span>' : ''}
      </h3>
      ${group.map(s => buildAdminSeriesRow(s)).join('')}
    </div>
  `).join('');

  // Wire events
  container.querySelectorAll('.admin-winner-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const sid = sel.dataset.sid;
      if (!adminResults[sid]) adminResults[sid] = {};
      adminResults[sid].winner = sel.value || null;
    });
  });
  container.querySelectorAll('.admin-score-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const sid = sel.dataset.sid;
      if (!adminResults[sid]) adminResults[sid] = {};
      adminResults[sid].score = sel.value || null;
    });
  });
  container.querySelectorAll('.admin-complete-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const sid = cb.dataset.sid;
      if (!adminResults[sid]) adminResults[sid] = {};
      adminResults[sid].complete = cb.checked;
    });
  });
  container.querySelectorAll('.admin-live-score').forEach(inp => {
    inp.addEventListener('input', () => {
      const sid = inp.dataset.sid;
      if (!adminResults[sid]) adminResults[sid] = {};
      adminResults[sid].liveScore = inp.value.trim() || null;
    });
  });
}

function buildAdminSeriesRow(s) {
  const sid     = s.id;
  const result  = adminResults[sid] || {};
  const teams   = getTeamOptions(sid);
  const teamOpts = teams.map(t =>
    `<option value="${t}"${result.winner === t ? ' selected' : ''}>${t}</option>`
  ).join('');

  const scoreOpts = ['4:0','4:1','4:2','4:3'].map(s =>
    `<option value="${s}"${result.score === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  const hasBothTeams = teams.length === 2;

  return `
    <div class="admin-series-item">
      <div class="admin-series-name">${s.name}</div>
      <div class="admin-series-controls">
        ${hasBothTeams ? `
          <select class="admin-select admin-winner-sel" data-sid="${sid}">
            <option value="">— Победитель —</option>
            ${teamOpts}
          </select>
          <select class="admin-select admin-score-sel" data-sid="${sid}">
            <option value="">— Счёт —</option>
            ${scoreOpts}
          </select>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--text-2);cursor:pointer">
            <input type="checkbox" class="admin-complete-cb" data-sid="${sid}"
              ${result.complete ? 'checked' : ''}>
            Серия завершена
          </label>
          ${result.complete ? '<span class="complete-badge">✓ Завершена</span>' : `
          <input type="text" class="admin-select admin-live-score" data-sid="${sid}"
            placeholder="Текущий счёт (напр. 2–1)"
            value="${result.liveScore || ''}"
            style="width:160px">`}
        ` : `<span style="color:var(--text-3);font-size:.85rem">Ожидание предыдущих результатов…</span>`}
      </div>
    </div>
  `;
}

// ── Participants ────────────────────────────────────────────
async function renderParticipants() {
  const container = document.getElementById('participants-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-overlay" style="padding:1rem"><div class="spinner"></div></div>';

  try {
    const usersSnap = await db.collection('users').get();
    const predsSnap = await db.collection('predictions').get();
    const predMap = {};
    predsSnap.forEach(doc => {
      const d = doc.data();
      predMap[doc.id] = {
        hasFull:  !!d.fullBracket,
        hasRound: !!d.roundPredictions
      };
    });

    if (usersSnap.empty) {
      container.innerHTML = '<div style="color:var(--text-3);padding:1rem;font-size:.85rem">Нет зарегистрированных участников.</div>';
      return;
    }

    let rows = [];
    usersSnap.forEach(doc => {
      const u = doc.data();
      const pred = predMap[doc.id] || {};
      rows.push({
        uid: doc.id,
        username: u.username || 'Аноним',
        email: u.email || '—',
        isAdmin: u.isAdmin || false,
        hasFull: pred.hasFull,
        hasRound: pred.hasRound
      });
    });

    rows.sort((a, b) => a.username.localeCompare(b.username));

    container.innerHTML = `
      <div style="font-size:.78rem;color:var(--text-3);margin-bottom:.5rem">
        Всего участников: ${rows.length}
      </div>
      <div class="participants-grid">
        ${rows.map(r => `
          <div class="admin-series-item" style="padding:.65rem 1rem" id="prow-${r.uid}">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.9rem" id="pname-${r.uid}">${escapeHtmlAdmin(r.username)}${r.isAdmin ? ' <span style="color:var(--gold);font-size:.7rem">ADMIN</span>' : ''}</div>
              <div style="font-size:.75rem;color:var(--text-3)">${escapeHtmlAdmin(r.email)}</div>
            </div>
            <div style="display:flex;gap:.5rem;flex-shrink:0;align-items:center">
              ${r.hasFull  ? '<span class="complete-badge" style="font-size:.65rem">Полная сетка</span>' : ''}
              ${r.hasRound ? '<span class="complete-badge" style="font-size:.65rem">По раундам</span>' : ''}
              ${!r.hasFull && !r.hasRound ? '<span style="font-size:.75rem;color:var(--text-3)">Нет прогноза</span>' : ''}
              <button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:.25rem .6rem"
                onclick="startRenameParticipant('${r.uid}', ${JSON.stringify(escapeHtmlAdmin(r.username))})">
                ✏ Имя
              </button>
              <button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:.25rem .6rem"
                onclick="openEditPicksModal('${r.uid}', ${JSON.stringify(r.username)})">
                🗂 Прогноз
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
  }
}

function escapeHtmlAdmin(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Participant rename ────────────────────────────────────
function startRenameParticipant(uid, currentName) {
  const nameEl = document.getElementById(`pname-${uid}`);
  if (!nameEl || nameEl.querySelector('input')) return; // already editing

  const isAdmin = nameEl.innerHTML.includes('ADMIN');
  const adminBadge = isAdmin ? ' <span style="color:var(--gold);font-size:.7rem">ADMIN</span>' : '';

  nameEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:.4rem">
      <input id="rename-input-${uid}" type="text" class="admin-select"
        value="${currentName}"
        style="width:140px;padding:.2rem .5rem;font-size:.85rem"
        onkeydown="if(event.key==='Enter')saveRenameParticipant('${uid}');if(event.key==='Escape')cancelRenameParticipant('${uid}','${currentName}',${isAdmin})">
      <button class="btn btn-gold btn-sm" style="font-size:.72rem;padding:.25rem .6rem"
        onclick="saveRenameParticipant('${uid}')">✓</button>
      <button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:.25rem .6rem"
        onclick="cancelRenameParticipant('${uid}','${currentName}',${isAdmin})">✕</button>
    </div>
  `;
  document.getElementById(`rename-input-${uid}`)?.focus();
}

function cancelRenameParticipant(uid, name, isAdmin) {
  const nameEl = document.getElementById(`pname-${uid}`);
  if (!nameEl) return;
  const adminBadge = isAdmin ? ' <span style="color:var(--gold);font-size:.7rem">ADMIN</span>' : '';
  nameEl.innerHTML = escapeHtmlAdmin(name) + adminBadge;
}

async function saveRenameParticipant(uid) {
  const input = document.getElementById(`rename-input-${uid}`);
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) { showToast('Имя не может быть пустым', 'error'); return; }

  input.disabled = true;
  try {
    await db.collection('users').doc(uid).update({ username: newName });
    const nameEl = document.getElementById(`pname-${uid}`);
    if (nameEl) {
      const isAdmin = nameEl.dataset.admin === 'true' ||
        document.getElementById(`prow-${uid}`)?.querySelector('.admin-series-item')?.innerHTML?.includes('ADMIN');
      nameEl.innerHTML = escapeHtmlAdmin(newName);
    }
    showToast('Имя изменено', 'success');
    renderParticipants(); // reload list
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
    input.disabled = false;
  }
}

// ── Edit user predictions ─────────────────────────────────
let _editPicksUid = null;

async function openEditPicksModal(uid, username) {
  _editPicksUid = uid;
  const modal = document.getElementById('edit-picks-modal');
  const body  = document.getElementById('edit-picks-modal-body');
  const title = document.getElementById('edit-picks-modal-title');
  if (!modal) return;

  title.textContent = `Прогноз: ${username}`;
  body.innerHTML = '<div class="loading-overlay" style="position:static;padding:2rem"><div class="spinner"></div></div>';
  modal.classList.remove('hidden');

  try {
    const predSnap = await db.collection('predictions').doc(uid).get();
    renderEditPicksContent(predSnap.exists ? predSnap.data() : {});
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
  }
}

function closeEditPicksModal() {
  document.getElementById('edit-picks-modal')?.classList.add('hidden');
  _editPicksUid = null;
}

// Resolves the two teams for a series, checking adminResults first, then user's own picks
function _resolveTeamsForEdit(sid, flatPicks) {
  if (['c1','c2','c3','c4'].includes(sid)) {
    const surv = (conf) => {
      const r1s = conf === 'west' ? BRACKET.west.r1 : BRACKET.east.r1;
      return r1s.map(s => {
        const winner = adminResults[s.id]?.winner || flatPicks?.[s.id]?.winner;
        if (!winner || (winner !== s.home && winner !== s.away)) return null;
        const n = parseInt(s.id.slice(1));
        return { teamSeed: winner === s.home ? n : (9 - n), winner };
      }).filter(Boolean).sort((a, b) => a.teamSeed - b.teamSeed);
    };
    const w = surv('west'), e = surv('east');
    if (w.length < 4 || e.length < 4) return [];
    const map = {
      'c1': [w[0].winner, e[3].winner],
      'c2': [e[1].winner, w[2].winner],
      'c3': [e[0].winner, w[3].winner],
      'c4': [w[1].winner, e[2].winner],
    };
    return map[sid] || [];
  }
  if (ADMIN_TREE[sid]) {
    return ADMIN_TREE[sid]
      .map(id => adminResults[id]?.winner || flatPicks?.[id]?.winner || null)
      .filter(Boolean);
  }
  const r1W = BRACKET.west.r1.find(s => s.id === sid);
  if (r1W) return [r1W.home, r1W.away];
  const r1E = BRACKET.east.r1.find(s => s.id === sid);
  if (r1E) return [r1E.home, r1E.away];
  return [];
}

function renderEditPicksContent(predData) {
  const body = document.getElementById('edit-picks-modal-body');
  body.innerHTML = `
    <div class="mode-tabs" style="margin-bottom:1rem">
      <button class="mode-tab active" id="ep-tab-full" onclick="switchEditPicksMode('full')">
        <span class="tab-label">Полная сетка</span>
      </button>
      <button class="mode-tab" id="ep-tab-round" onclick="switchEditPicksMode('round')">
        <span class="tab-label">По раундам</span>
      </button>
    </div>
    <div id="ep-form-full">${buildEditForm('full', predData.fullBracket || {})}</div>
    <div id="ep-form-round" class="hidden">${buildEditForm('round', predData.roundPredictions || {})}</div>
  `;
}

function switchEditPicksMode(mode) {
  document.getElementById('ep-tab-full')?.classList.toggle('active', mode === 'full');
  document.getElementById('ep-tab-round')?.classList.toggle('active', mode === 'round');
  document.getElementById('ep-form-full')?.classList.toggle('hidden', mode !== 'full');
  document.getElementById('ep-form-round')?.classList.toggle('hidden', mode !== 'round');
}

function buildEditForm(mode, picksData) {
  let flatPicks = {};
  if (mode === 'round') {
    for (const rnd of Object.values(picksData)) Object.assign(flatPicks, rnd);
  } else {
    flatPicks = picksData;
  }

  const SCORES = ['4:0','4:1','4:2','4:3'];
  const ROUNDS_DEF = [
    { name: '1/8 финала',  ids: ['w1','w2','w3','w4','e1','e2','e3','e4'], idx: 0 },
    { name: '1/4 финала',  ids: ['c1','c2','c3','c4'],                    idx: 1 },
    { name: '1/2 финала',  ids: ['s1','s2'],                              idx: 2 },
    { name: 'Финал КГ',    ids: ['final'],                                idx: 3 },
  ];

  return ROUNDS_DEF.map(({ name, ids, idx }) => {
    const rows = ids.map(sid => {
      const pick = mode === 'full'
        ? (flatPicks[sid] || {})
        : ((picksData[String(idx)] || {})[sid] || {});

      const teams = _resolveTeamsForEdit(sid, flatPicks);
      const teamOpts = teams.length
        ? teams.map(t => `<option value="${escapeHtmlAdmin(t)}"${pick.winner === t ? ' selected' : ''}>${escapeHtmlAdmin(t)}</option>`).join('')
        : (pick.winner ? `<option value="${escapeHtmlAdmin(pick.winner)}" selected>${escapeHtmlAdmin(pick.winner)}</option>` : '');

      const scoreOpts = SCORES.map(s =>
        `<option value="${s}"${pick.score === s ? ' selected' : ''}>${s}</option>`
      ).join('');

      const label = ADMIN_ALL_SERIES.find(s => s.id === sid)?.name || sid;

      return `
        <div style="display:grid;grid-template-columns:1fr 150px 90px;gap:.4rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border)">
          <div style="font-size:.8rem;color:var(--text-2)">${label}</div>
          <select class="admin-select ep-winner-sel" data-sid="${sid}" data-round="${idx}" style="font-size:.8rem;padding:.28rem .5rem">
            <option value="">— Победитель —</option>
            ${teamOpts}
          </select>
          <select class="admin-select ep-score-sel" data-sid="${sid}" data-round="${idx}" style="font-size:.8rem;padding:.28rem .5rem">
            <option value="">— Счёт —</option>
            ${scoreOpts}
          </select>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:1.25rem">
        <div style="font-size:.75rem;font-weight:600;text-transform:uppercase;color:var(--text-3);letter-spacing:.06em;padding:.4rem 0;border-bottom:2px solid var(--border);margin-bottom:.1rem">${name}</div>
        ${rows}
      </div>`;
  }).join('');
}

async function saveEditedPicks() {
  if (!_editPicksUid) return;
  const btn = document.getElementById('edit-picks-save-btn');
  btn.disabled = true;
  btn.textContent = 'Сохранение…';

  try {
    const update = {};

    const fullForm = document.getElementById('ep-form-full');
    if (fullForm) {
      const fb = {};
      fullForm.querySelectorAll('.ep-winner-sel').forEach(sel => {
        const winner = sel.value;
        if (!winner) return;
        const sid   = sel.dataset.sid;
        const score = fullForm.querySelector(`.ep-score-sel[data-sid="${sid}"]`)?.value || null;
        fb[sid] = Object.assign({ winner }, score ? { score } : {});
      });
      if (Object.keys(fb).length) update.fullBracket = fb;
    }

    const roundForm = document.getElementById('ep-form-round');
    if (roundForm) {
      const rp = {};
      roundForm.querySelectorAll('.ep-winner-sel').forEach(sel => {
        const winner = sel.value;
        if (!winner) return;
        const sid      = sel.dataset.sid;
        const roundIdx = sel.dataset.round;
        const score    = roundForm.querySelector(`.ep-score-sel[data-sid="${sid}"]`)?.value || null;
        if (!rp[roundIdx]) rp[roundIdx] = {};
        rp[roundIdx][sid] = Object.assign({ winner }, score ? { score } : {});
      });
      if (Object.keys(rp).length) update.roundPredictions = rp;
    }

    if (!Object.keys(update).length) {
      showToast('Выбери хотя бы одного победителя', 'error');
      return;
    }

    await db.collection('predictions').doc(_editPicksUid).set(update, { merge: true });
    showToast('Прогноз сохранён!', 'success');
    closeEditPicksModal();
    renderParticipants();
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
async function initAdmin() {
  await loadBracketOverride();
  await loadAdminData();
  renderAdminPanel();

  document.getElementById('current-round-sel')?.addEventListener('change', e => {
    adminCurrentRound = parseInt(e.target.value);
  });

  document.getElementById('lock-full-bracket')?.addEventListener('change', e => {
    adminFullBracketLocked = e.target.checked;
  });
  document.getElementById('lock-round-predictions')?.addEventListener('change', e => {
    adminRoundPredictionsLocked = e.target.checked;
  });

  document.getElementById('save-admin-btn')?.addEventListener('click', saveAdminData);
}
