// ============================================================
// FIREBASE CONFIG — заполни своими данными из консоли Firebase
// console.firebase.google.com → Project Settings → Your apps
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAo1Dk9QOKd6gnxi0FktCTkiS_79C_L3K0",
  authDomain: "khl-po-2026.firebaseapp.com",
  projectId: "khl-po-2026",
  storageBucket: "khl-po-2026.firebasestorage.app",
  messagingSenderId: "243676632030",
  appId: "1:243676632030:web:d0d2508f54d6d73f20034f",
  measurementId: "G-CFFMYNVBWB"
};

// ============================================================
// СЕТКА КХЛ 2026 — РЕДАКТИРУЙ ЗДЕСЬ КОГДА СТАНУТ ИЗВЕСТНЫ ПАРЫ
// home = команда с преимуществом своего льда (посев выше)
// ============================================================
const BRACKET = {
  rounds: 4,
  west: {
    name: "Запад",
    r1: [
      { id: "w1", home: "Локомотив",      away: "Спартак Москва"  },  // 1 vs 8
      { id: "w2", home: "Динамо Минск",   away: "Динамо Москва"   },  // 2 vs 7
      { id: "w3", home: "Северсталь",     away: "Торпедо"         },  // 3 vs 6
      { id: "w4", home: "ЦСКА",           away: "СКА"             }   // 4 vs 5
    ]
  },
  east: {
    name: "Восток",
    r1: [
      { id: "e1", home: "Металлург Мг",  away: "Сибирь"           },  // 1 vs 8
      { id: "e2", home: "Авангард",      away: "Нефтехимик"       },  // 2 vs 7
      { id: "e3", home: "Ак Барс",       away: "Трактор"          },  // 3 vs 6
      { id: "e4", home: "Автомобилист",  away: "Салават Юлаев"    }   // 4 vs 5
    ]
  }
};

// ============================================================
// ЛОГОТИПЫ КОМАНД — Wikimedia Commons (Special:FilePath redirect)
// Фолбэк: инициалы из CSS при ошибке загрузки
// ============================================================
const TEAM_LOGOS = {
  // Западная конференция
  "Локомотив":      "https://upload.wikimedia.org/wikipedia/ru/f/f4/HC_Lokomotiv_Logo.svg",
  "Спартак Москва": "https://upload.wikimedia.org/wikipedia/commons/3/3e/HC_Spartak_Moscow_Logo.svg",
  "ЦСКА":           "https://upload.wikimedia.org/wikipedia/commons/3/3d/CSKA_Moscow_logo.svg",
  "СКА":            "https://upload.wikimedia.org/wikipedia/ru/0/05/HC_SKA_Logo.svg",
  "Динамо Минск":   "https://upload.wikimedia.org/wikipedia/ru/c/cc/HC_Dynamo_Minsk_Logo.svg",
  "Динамо Москва":  "https://upload.wikimedia.org/wikipedia/commons/9/99/HC_Dynamo_Moscow_Logo_2019.svg",
  "Северсталь":     "https://upload.wikimedia.org/wikipedia/ru/a/a1/HC_Severstal_Logo.svg",
  "Торпедо":        "https://upload.wikimedia.org/wikipedia/ru/b/bd/Torpedo-Logo25.svg",
  // Восточная конференция
  "Металлург Мг":   "https://upload.wikimedia.org/wikipedia/ru/0/0e/HC_Metallurg_Magnitogorsk_Logo.svg",
  "Сибирь":         "https://upload.wikimedia.org/wikipedia/ru/6/65/HC_Sibir_Logo.svg",
  "Автомобилист":   "https://upload.wikimedia.org/wikipedia/ru/a/ae/HC_Avtomobilist_Logo.svg",
  "Салават Юлаев":  "https://upload.wikimedia.org/wikipedia/ru/a/a0/HC_Salavat_Yulaev_Logo.svg",
  "Авангард":       "https://upload.wikimedia.org/wikipedia/ru/6/64/HC_Avangard_Logo.svg",
  "Нефтехимик":     "https://upload.wikimedia.org/wikipedia/ru/5/5d/HC_Neftekhimik.svg",
  "Ак Барс":        "https://upload.wikimedia.org/wikipedia/ru/7/75/HC_Ak_Bars_Logo.svg",
  "Трактор":        "https://upload.wikimedia.org/wikipedia/ru/c/c8/Traktor_Chelyabinsk.svg",
};

// Helper: возвращает HTML тега <img> с логотипом команды + фолбэк на инициалы
function teamLogoHtml(team, size = 26) {
  const url = TEAM_LOGOS[team];
  if (!url) return '';
  const initials = team.replace(/[^А-ЯA-Z]/g, '').slice(0, 2) || team.slice(0, 2).toUpperCase();
  return `<img class="team-logo" src="${url}" width="${size}" height="${size}" alt="${team}"
    referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy">
  <span class="team-logo-fallback" style="display:none;width:${size}px;height:${size}px">${initials}</span>`;
}

// Названия раундов
const ROUND_NAMES = [
  "1/8 финала",
  "1/4 финала",
  "1/2 финала",
  "Финал Кубка Гагарина"
];

// ============================================================
// ОЧКИ ЗА ПРАВИЛЬНЫЕ ПРОГНОЗЫ
// ============================================================
const SCORING = {
  winnerPoints: [1, 2, 4, 8],  // очки за победителя серии по раундам
  seriesScoreBonus: 1           // бонус за угаданный счёт серии (4:0 / 4:1 / 4:2 / 4:3)
};
