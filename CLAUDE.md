# КХЛ ПО 2026 — контекст для Claude

## Что это

Веб-приложение для прогнозирования плей-офф КХЛ 2026.  
Стек: статичные HTML/CSS/JS файлы + Firebase (Auth + Firestore). Деплой через GitHub Pages.

Работающая ветка: `claude/khl-prediction-site-YIWbG`  
Пушить только в неё: `git push -u origin claude/khl-prediction-site-YIWbG`

---

## Файловая структура

```
/
├── index.html          — страница входа/регистрации
├── app.html            — страница прогнозов пользователя (полная сетка + по раундам)
├── leaderboard.html    — таблица лидеров
├── admin.html          — панель администратора
├── firestore.rules     — правила безопасности Firestore
├── css/
│   └── style.css       — единая таблица стилей для всех страниц
└── js/
    ├── config.js       — FIREBASE_CONFIG, BRACKET, TEAM_LOGOS, SCORING, ROUND_NAMES
    ├── common.js       — init Firebase, db, showToast, hamburger menu, loadBracketOverride
    ├── auth.js         — registerUser, loginUser, logoutUser, requireAuth, renderUserChip
    ├── scoring.js      — calculateScore (полная сетка), calculateRoundScore (по раундам)
    ├── bracket.js      — логика и рендер полной сетки (picks + reality view)
    ├── rounds.js       — логика и рендер прогнозов по раундам
    ├── leaderboard.js  — таблица лидеров, buildPicksView, viewUserPicks
    └── admin.js        — панель результатов, участники, редактор прогнозов
```

Порядок загрузки скриптов на каждой странице: `config.js → common.js → auth.js → [scoring.js] → [page-specific].js`

---

## Firestore — структура данных

### `settings/results`
```js
{
  series: {
    w1: { winner: "Локомотив", score: "4:1", complete: true, liveScore: "2–1" },
    // ...все 15 серий: w1-w4, e1-e4, c1-c4, s1-s2, final
  },
  currentRound: 1,           // 1–4, какой раунд активен для режима "по раундам"
  fullBracketLocked: false,  // блокирует редактирование полной сетки
  roundPredictionsLocked: false, // блокирует прогнозы текущего раунда
  updatedAt: Timestamp
}
```

### `settings/bracket`
```js
{
  west: { r1: [ { id, home, away }, ... ] },
  east: { r1: [ { id, home, away }, ... ] }
}
```
Создаётся когда админ редактирует команды. `loadBracketOverride()` в common.js патчит глобальный `BRACKET` из этого документа при каждой загрузке страницы.

### `predictions/{uid}`
```js
{
  username: "Игрок",
  fullBracket: {
    w1: { winner: "Локомотив", score: "4:1" },
    // ...все 15 серий
  },
  roundPredictions: {
    "0": { w1: { winner: "Локомотив", score: "4:1" }, ... },  // R1
    "1": { c1: { winner: "...", score: "..." }, ... },          // R2
    "2": { ... },                                               // R3
    "3": { final: { ... } }                                     // Финал
  },
  updatedAt: Timestamp
}
```

### `users/{uid}`
```js
{
  username: "...",
  isAdmin: false,
  email: "...",     // только у некоторых, не обязательно
  createdAt: Timestamp
}
```

Auth: Firebase email/password, но email генерируется из имени пользователя через транслитерацию (`usernameToEmail` в auth.js). Пользователь видит только имя, email скрыт.

---

## Структура сетки КХЛ (критически важно!)

### Идентификаторы серий и соответствие посевам

| ID  | Описание              | home (высший посев) | away (низший посев) |
|-----|-----------------------|---------------------|---------------------|
| w1  | Запад 1 vs 8          | 1-й Запад           | 8-й Запад           |
| w2  | Запад 2 vs 7          | 2-й Запад           | 7-й Запад           |
| w3  | Запад 3 vs 6          | 3-й Запад           | 6-й Запад           |
| w4  | Запад 4 vs 5          | 4-й Запад           | 5-й Запад           |
| e1  | Восток 1 vs 8         | 1-й Восток          | 8-й Восток          |
| e2  | Восток 2 vs 7         | 2-й Восток          | 7-й Восток          |
| e3  | Восток 3 vs 6         | 3-й Восток          | 6-й Восток          |
| e4  | Восток 4 vs 5         | 4-й Восток          | 5-й Восток          |

**КРИТИЧНО**: `wN.home` = посев N, `wN.away` = посев (9 − N). Код вычисляет `teamSeed` как `parseInt(s.id.slice(1))` для home и `9 - n` для away. Порядок записей в `BRACKET.west.r1` / `BRACKET.east.r1` в `config.js` **обязан** соответствовать этому: w1 = 1vs8, w2 = 2vs7, w3 = 3vs6, w4 = 4vs5. Нарушение → неправильные кросс-конференционные пары.

### R2: перекрёстный плей-офф (c1–c4)

После R1 выжившие **пересортируются по исходному регулярному посеву**, затем образуют пары:

```
c1 = [З1 vs В4]   (лучший Запад vs худший Восток)
c2 = [В2 vs З3]   (2-й Восток vs 3-й Запад)
c3 = [В1 vs З4]   (лучший Восток vs худший Запад)
c4 = [З2 vs В3]   (2-й Запад vs 3-й Восток)
```

Реализовано в `getSurvivors(conf)` / `buildSurvivors(conf)` — сортировка по `teamSeed`, потом `r2Map`.

### R3 / Финал

```
s1 = победитель c1 vs победитель c2  (сетка А)
s2 = победитель c3 vs победитель c4  (сетка Б)
final = победитель s1 vs победитель s2
```

---

## Система очков

### Полная сетка (`calculateScore` в scoring.js)
| Раунд | Очки за победителя |
|-------|-------------------|
| 1/8   | 1                 |
| 1/4   | 2                 |
| 1/2   | 4                 |
| Финал | 8                 |

+1 бонус за точный счёт серии (4:0 / 4:1 / 4:2 / 4:3).

### По раундам (`calculateRoundScore` в scoring.js)
1 очко за угаданного победителя в любом раунде + 1 бонус за точный счёт.  
**Одинаково во всех раундах** — не эскалирует.

---

## Ключевые инварианты кода

1. **`teamSeed` из серийного номера**: `id.slice(1)` даёт цифру (1-4). home получает посев = эта цифра, away = 9 минус цифра.

2. **Re-seeding обязателен везде**: `getTeamOptions` (admin.js), `getSurvivors` (bracket.js), `buildSurvivors` (rounds.js), `_resolveTeamsForEdit` (admin.js) — все используют одну и ту же логику re-seeding. Не заменять на хардкод `"winner of w3 → c2"`.

3. **`lbMode` — глобальная переменная в leaderboard.html**: `setInterval` в `subscribeLeaderboard` читает `lbMode`, а не замкнутый `mode`. Иначе интервал всегда обновляет полную сетку независимо от активного таба.

4. **Opacity и дочерние элементы**: `.series-team.eliminated` имеет `opacity: 0.45` — применяется ко всем потомкам. Элементы типа "fact-matchup banner" должны быть **вне** `.series-team`, иначе они тоже будут затемнены.

5. **`roundPredictions` — вложенная структура**: `{ "0": {...}, "1": {...}, ... }`. При плоском чтении используется `Object.values(data.roundPredictions).reduce((acc, rnd) => Object.assign(acc, rnd), {})`.

6. **Счёт серии хранится с перспективы home-команды**: `4:0` значит home выиграл 4-0. При отображении — если победитель = away, счёт инвертируется через `REV_SCORE`.

---

## Функции и где они живут

### config.js
- `BRACKET` — глобальный объект сетки (может быть переопределён из Firestore)
- `TEAM_LOGOS` — map имя → URL логотипа
- `SCORING` — `{ winnerPoints: [1,2,4,8], seriesScoreBonus: 1 }`
- `teamLogoHtml(team, size)` — возвращает `<img>` + `<span>` fallback
- `ROUND_NAMES` — `["1/8 финала", "1/4 финала", "1/2 финала", "Финал Кубка Гагарина"]`

### common.js
- `db` — Firestore instance
- `showToast(message, type)` — тост-уведомление
- `loadBracketOverride()` — патчит `BRACKET` из `settings/bracket`
- Hamburger menu: `navbar-toggle` → toggle `.nav-open` на `#main-navbar`

### auth.js
- `requireAuth()` → Promise `{ user, userData }`, редиректит на index.html если не авторизован
- `registerUser(username, password)`, `loginUser(username, password)`, `logoutUser()`
- `renderUserChip(userData)`, `applyAdminUI(userData)` — элементы навбара

### bracket.js
- `picks` — текущие пики пользователя (полная сетка)
- `resultsData` — реальные результаты
- `bracketViewMode` — `'picks'` | `'reality'`
- `renderBracket()` + `renderBracketList()` — перерисовывают всю сетку
- `renderSeriesCard(sid)` — карточка в режиме прогноза (с fact-matchup, liveScore)
- `renderSeriesCardReality(sid)` — карточка в режиме реальности
- `teamsForSeriesPicks(sid)` / `teamsForSeriesResults(sid)` — команды для прогноза / реальности
- `teamConfBadge(teamName)` — значок "З1", "В3" и т.п.
- `isTeamEliminated(teamName)` — проверяет выбытие в реальности
- `invalidateDownstream(sid, oldWinner)` — каскадная очистка пиков при смене выбора

### rounds.js
- `roundPicks` — `{ roundIdx: { sid: {winner, score} } }`
- `roundResults`, `currentRound`, `roundPredictionsLocked`
- `teamsForRoundSeries(sid, roundIdx)` — с полным re-seeding для c1-c4
- `buildRoundSeriesCard(...)` / `buildRoundSeriesCardReality(...)` — карточки
- Плоская система очков (1+1) внутри `buildRoundSeriesCard`

### scoring.js
- `calculateScore(userPrediction, results)` → `{ total, breakdown: { byRound, series } }`
- `calculateRoundScore(userPrediction, results)` → то же, но 1pt за победителя везде

### leaderboard.js
- `loadLeaderboard(mode)` — грузит все прогнозы, считает очки, рендерит строки
- `subscribeLeaderboard(mode)` — первый вызов + `setInterval(() => loadLeaderboard(lbMode), 60_000)`
- `buildLbRow(row, index)` — строка таблицы (ранг, имя, очки, разбивка по раундам)
- `viewUserPicks(uid, username)` — открывает модал с чужими прогнозами
- `buildPicksView(userPicks, results, mode)` — HTML-рендер серий с очками

### admin.js
- `adminResults`, `adminCurrentRound`, `adminFullBracketLocked`, `adminRoundPredictionsLocked`
- `ADMIN_ALL_SERIES` — массив всех 15 серий с именами
- `getTeamOptions(sid)` — команды для селектов в форме результатов (только adminResults)
- `renderParticipants()` — список участников с кнопками "✏ Имя" и "🗂 Прогноз"
- `openEditPicksModal(uid, username)` — модал редактирования прогноза пользователя
- `buildEditForm(mode, picksData)` — форма с селектами winner+score для каждой серии
- `saveEditedPicks()` — сохраняет изменения в `predictions/{uid}` (merge)
- `_resolveTeamsForEdit(sid, flatPicks)` — resolves teams используя adminResults + flatPicks

---

## CSS: важные классы

| Класс | Описание |
|-------|----------|
| `.series-card` | Карточка серии |
| `.series-team` | Строка с командой (кликабельна для выбора) |
| `.series-team.selected` | Выбранная команда (до завершения серии) |
| `.series-team.winner` | Победитель (после завершения) |
| `.series-team.user-pick` | Прогноз пользователя (после завершения — без выделения) |
| `.series-team.eliminated` | Команда выбыла в реальности (opacity: 0.45) |
| `.fact-matchup` | Синяя плашка "В реальности: А — Б" (вне `.series-team`!) |
| `.conf-badge.west-badge` | Значок "З1", "З4" и т.п. |
| `.conf-badge.east-badge` | Значок "В1", "В4" и т.п. |
| `.series-live-score` | Строка с текущим счётом серии (🟢 2–1) |
| `.series-pts.pts-pos` | Чип с очками (зелёный) |
| `.series-pts.pts-zero` | Чип с очками (серый) |
| `.mode-tab.active` | Активный таб |
| `.modal-overlay` | Подложка модального окна |
| `.modal-card` | Тело модального окна |
| `.navbar.nav-open .navbar-nav` | Открытое мобильное меню (position: absolute) |
| `.admin-series-item` | Строка в списке серий/участников в админке |
| `.complete-badge` | Зелёный значок "✓ Завершена" / "Полная сетка" |

---

## Известные решённые баги (не повторять!)

1. **Неправильные пары в R2 после расстройства**: Использование хардкода `"winner of w3 → c2"` ломается при апсетах. Решение: re-seeding через `teamSeed`.

2. **Порядок записей в BRACKET влияет на посев**: `w2` обязан быть 2vs7, не 4vs5. Если поменять порядок — все кросс-пары поедут.

3. **`setInterval` в `subscribeLeaderboard` захватывал `mode` из closure**: Теперь читает глобальный `lbMode`.

4. **Fact-matchup banner затемнялся вместе с командой**: Был внутри `.series-team.eliminated`. Вынесен наружу как отдельный `.fact-matchup` div.

5. **Мобильное меню "странное"**: Первая попытка использовала `flex-wrap` — навигация оборачивалась рядом с кнопками юзера. Правильное решение: `position: absolute` dropdown с `.nav-open` классом.

---

## Что делать при начале новой сессии

1. `git fetch origin && git checkout claude/khl-prediction-site-YIWbG`
2. Прочитать этот файл
3. Если нужно разобраться с конкретным файлом — читать его, не угадывать структуру

## Чего не делать

- Не пушить в `main` или другие ветки
- Не менять порядок `w1/w2/w3/w4` в `config.js` — порядок = посев
- Не заменять re-seeding логику на хардкод пар
- Не помещать элементы внутрь `.series-team.eliminated` если они не должны затемняться
