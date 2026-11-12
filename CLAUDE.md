# Mecha Strike Typer — developer guide

Notes for developers and Claude Code sessions working on this repo. Teacher-facing setup is in README.md / README_cn.md.

A 3D English typing game for Foon Yew High School (Malaysia). Students sign in with Google (@foonyew.edu.my) or play as guests. Scores, coins and progress are stored in a Google Sheet through an Apps Script web app. It is a **static GitHub Pages site**: no build step, no bundler and no npm at runtime.

## Hard rules (from the teacher)

- The repo is **public**. Never put the teacher password, secrets or student data in web code. The password is checked only in Apps Script (`Settings` sheet).
- UI text is **English** (students are Chinese/Malay speakers learning English). Word meanings are shown in **Chinese only** (no Malay).
- Must work on school PCs and phones. Test at phone width (390px) too.
- If the backend is down or a score upload fails, the game must still run and show the result.
- Leaderboards show **nicknames only**. Nicknames are filtered for rude words in any language.
- Ask the teacher before doing anything uncertain. The teacher merges PRs themself and sometimes edits `config.js` / `index.html` on `main`. Always rebase onto or restart from the latest `main`.

## Files

| File | What it is |
|---|---|
| `index.html` | All screens (login, hangar, game HUD, results, leaderboard, teacher dashboard, multiplayer lobby) and all CSS. Script load order is at the bottom and matters. |
| `config.js` | `window.GAME_CONFIG`: Apps Script URL, fallback classes, school domain, optional PeerJS server. The teacher edits this. |
| `words.js` | `window.WORD_BANKS` (about 10 banks, about 2,600 words). |
| `meanings.js` | `window.MEANINGS`: word → Chinese, built from one big `"word 中文"` string. Every word in every bank (festival banks included) should have an entry. |
| `lib/three.min.js`, `lib/peerjs.min.js` | Vendored three.js r147 and PeerJS 1.5.5. The school network or CDNs can block downloads, so keep them vendored. |
| `models.js` | All 3D models, built from primitives: 15 playable mechs (rigged skeleton + `animateMech`/`aimMech`/`fireMech`), 13 enemy types, 15 normal bosses plus 17 festival bosses (`event:` field), skins. Exposed as `window.MODELS`. |
| `js/core.js` | Global state `S`, storage, API calls (`api()`), Google sign-in, profile, hangar (mech shop, paint shop, mission setup), `loadRemoteConfig`. |
| `js/calendar.js` | Festival dates and `pickEvent(today, extraWindows, disabledIds)`. Also loadable in Node (`module.exports`). |
| `js/progress.js` | Client copy of the levels/XP/badges/titles rules (for guests), SKINS, BACKGROUNDS, EVENTS (18 festivals: words, boss, decor), `activeEvent()`, `addEventBank()`. |
| `js/scene.js` | Renderer, camera, starfield, battlefields (`setEnvironment(id, eventId)`), festival decorations, particles, music synth (`Music` plays the original march in `SONG`: one token per eighth note), hangar preview. Sound effects are `sfx()` in core.js. Music must stay original: never copy a copyrighted melody. |
| `js/game.js` | The game engine (see below), HUD, items, specials, combo tiers, boss slow-mo, revenge words, results screen, share card, score upload. |
| `js/net.js` | Multiplayer lobby and PeerJS (WebRTC) host/guest. |
| `js/pages.js` | Leaderboard, teacher dashboard, main frame loop, boot. Exposes `window.__MST` for tests. |
| `apps-script/Code.gs` | The whole backend. The teacher pastes it into Apps Script. |
| `tests/` | Unit tests (backend in Node) and browser tests (Playwright). See **Testing**. |

**Cache busting:** GitHub Pages lets browsers cache files for 10 minutes, so `index.html` loads every script as `file.js?v=APP_VERSION`. When you change the game, put a new date in `window.APP_VERSION` **and** in every `?v=` in index.html (they must match; a unit test checks). The version is shown under *How to play*.

Script order: `config.js, words.js, meanings.js, lib/three.min.js, models.js, lib/peerjs.min.js, js/core.js, js/calendar.js, js/progress.js, js/scene.js, js/game.js, js/net.js, js/exam.js, js/pages.js`. Everything is plain global scripts (no modules), so functions are shared through globals.

## Game engine (js/game.js)

Event-sourced, so solo and multiplayer share one code path:

- `G` holds the match state. `G.role` is `"solo"`, `"host"` or `"client"`.
- The authority (solo or host) decides things and calls `emit(ev)`. `emit` runs `applyEvent(ev)` locally and, on a host, broadcasts it. Event kinds: `spawn, prog, kill, hit, bossHit, bossDown, phase, pstate, fx, over, snap`.
- Clients never decide. They send claims (`claim`, `prog`, `item`, `special`, `stats`) and the host resolves them (`resolveKill`, `resolveBossHit`, `doItem`, `doSpecial`). The host sends position snapshots about 10 times a second.
- Words are dealt from shuffle-bag decks by length (`drawWord`). Words on screen never share a first letter, so the first key picks the target.
- Enemies pick a victim with `pickVictim()` so every player is attacked evenly.
- Stages: kill `killsGoal()` enemies, then a boss. Festival bosses appear on odd stages during a festival. Normal bosses unlock by pilot level (`bossPoolSize`).
- The boss can be typed as soon as it appears (no mistakes while it flies in).
- **Awakening** (`AWAKEN` + `buildAwaken`/`animateAwaken` in models.js): 20 words in a row sets `G.awakened` (local player only, looks only) until 3 mistakes (`AWAKE_MISSES`); `p.anim.awake` drives it. Each of the 15 mechs has its own effect taken from its series (afterimages, Trans-Am tint, wings of light, funnels…). Effects are built once per mech, hidden, and faded in; material swaps (`swapper`) only touch that mech's meshes, because `MS()` materials are shared between mechs. The hangar preview shows it 6 s out of every 14 s. Afterimages are `buildMech(def, null, true)` (plain: no effects of their own).
- **Combo reward:** every mech has a `comboItem`; combo 25/50/100 gives one (max 3) — `requestComboItem` → host `grantComboItem`, net message `combo`.
- Games under 20 seconds are not uploaded. A failed upload is kept in `mst_pending` and retried later; the result screen always shows.

## Typing test (js/exam.js + "Typing test" in Code.gs)

The graded typing test is **shared with the other typing game** (Mecha Strike Typer / Digi Monster Typer): `js/exam.js`, the "Typing test" block at the end of `apps-script/Code.gs`, `tests/unit-test-mode.js` and `tests/e2e-exam.js` must stay identical in both repos (only `GAME_TITLE` in Code.gs differs). Change both repos together.

- `exam.js` adds its own screen, CSS and the 📝 TYPING TEST button (after `#btn-multi`), so index.html only loads the script. The test itself is a battle: `GAME_EXAM.startExamGame()` in game.js (the "TYPING TEST IN THE GAME" block) runs `startGame` with `opts.exam`: words come from the test's seeded queue (`examDraw`, first letters still unique on screen), enemy size follows word length, enemies stop at `t.hold` (0.70–0.84 of the way) and never hit, `tickExam` keeps `EXAM_ACTIVE` (4) enemies, no boss / drops / items / special / combo items / revenge / April Fools / pause; awakening (Mecha) or evolution (DM) still shows. exam.js keeps the clock and ends the battle with `stopExamGame()`, which returns `{correct, keys, words}`: correct = letters of finished words + 1 per word (the "space"), keys = all keystrokes + 1 per word. Students must type the test code: `testInfo` never returns it. Each row of the `Tests` tab is one test with its own code and classes (opened in the teacher console); `testsFor_` lists the open tests for the student's class, `testStart` finds the test by the typed code and refuses another class's test with `not_your_class`; attempts and results are kept per code. `testStart` compares `normCode_` (case / spaces / dashes ignored) and counts wrong codes per student (`TEST_CODE_TRIES` = 5 per 10 minutes, script cache).
- Words: `seededWords(code, bank, n)` — a seeded shuffle bag, so one test code gives everyone the same words in the same order, in both games (the `everyday` bank is identical in both words.js; keep it so).
- Typing goes through the game's `handleChar`; in a test, `processTyper` ignores pasted / multi-character input and non-letter keys. WPM = correct keys / 5 / minutes; Net WPM = WPM × accuracy.
- Server: students `testInfo` (read only; never the code), `testStart` / `testFinish` (lock), `testPing` (every 10 s during a test: live progress into the script cache, no lock; answers `kicked`). Teachers (`TestTeachers` tab or Admins; `isTestTeacher_`, `testTeacher_`): `tTests` / `tMonitor` (read only, monitor merges TestAttempts + TestExtra + cached live progress), `tCreate` / `tUpdate` (status, attempts for everyone, minutes, classes) / `tExtra` (one student ±) / `tEnd` (end an attempt: scored over the time used from the last ping, status `ended by teacher`, sets `kick:<id>` in the cache) under the lock. Tests live in the `Tests` tab (one row per test: code, teacher, classes, minutes, attempts, bank, open/closed); `testConfig_()` (cache key `testcfg2`, 30 s, cleared by every teacher write) holds the defaults, scoring and the open tests. Codes are unique across all rows (`normCode_`). Teachers see their own tests, admins all. The console (exam.js, `openTeach`) polls `tMonitor` every 5 s and builds the Excel report client-side as UTF-8-BOM CSV. A test teacher may choose class STAFF (`saveProfile_`; login / me return `teacher`).
- A started attempt that is never finished counts as used (reloading the page can't buy another try). The teacher gives an attempt back by deleting its `TestAttempts` row.
- UI text stays English.

## Backend (apps-script/Code.gs)

- Sheets: `Scores, Players, Settings, BannedWords, Admins, CoinGifts, Events`. `setup()` creates and migrates them, and is safe to run again.
- Login: Google Identity Services ID token → `login_` checks it with Google's tokeninfo endpoint (audience, domain) → returns an HMAC-signed session token valid for 12 hours (`makeToken_`/`checkToken_`). Non-school Google accounts are accepted while the `AllowOtherAccounts` setting is `YES`. They get class `OTHER` with no seat, show 🌐 on the leaderboard (`ext`), and are left out of the class battle. The client's `isSchool()` means "signed in"; `isOutsider()` means signed in with a non-school account.
- Classes: `ClassCounts` (`J1:12, S2AC:4 …`) produces the class list. Junior classes get a 2-digit number (`J105`), senior classes don't (`S2AC3`): see `classCode_` in Code.gs and `classCode` in core.js. The Players column `Class Year` + the `SchoolYear` setting (blank = current calendar year) drive `needsClass`, which makes students pick a new class each school year; `needsClass` is also set when their class is no longer in the list. CoinGifts accept a form (`J1`, `S2`, `S2AC`) as well as a class, email or `ALL` (school accounts only).
- Requests: POST with `Content-Type: text/plain` (avoids CORS preflight) and a JSON body `{action, token, ...}`. GET is used for `config` and `leaderboard`.
- **A whole class arrives at once.** Apps Script runs about 30 requests at a time, and the script lock is a single queue, so:
  - Only writes take the lock (`withLock_`, which returns `{error:'busy'}` instead of throwing when the queue is too long). Sign-in and `me` only read, and take the lock only when a coin gift must be written (`hasNewGift_`).
  - `getSettings_()` is read once per request (`SETTINGS_MEMO_`, reset in `doGet`/`doPost`).
  - The config is cached for 60 s (`cachedConfig_`; `setup()` clears it), and the leaderboard for 60 s.
  - Google's tokeninfo is retried on 5xx/429 (`google_busy`).
  - The client's `apiRetry()` retries `busy` / `google_busy` / `server` / network errors with a growing, random delay. Unsaved scores wait in `mst_pending` and are resent every 2 minutes.
- The server is the authority for school accounts. Coin rewards are capped (`kills*25 + bosses*400`, max 8000 per game), and mech/skin prices are re-checked (`MECH_PRICES`, `SKIN_PRICES`).
- **Duplicated rules:** levels (`reaching L needs 50·(L−1)·L XP`), XP per game, BADGES, skin prices, festival IDs and the class-code rule exist in both `Code.gs` and `js/progress.js`/`js/calendar.js`. When you change one, change the other.
- After changing Code.gs the teacher must paste it, run `setup`, and deploy a **new version** (Deploy → Manage deployments → ✏️ → New version). Always tell them.

## Festivals

`js/calendar.js` computes 17 festival windows (day ±7, CNY = all of Jan–Feb). Lunar dates are a table for 2026–2030 that was computed with the npm package `lunar-javascript` (use the `DONG_ZHI` key for Winter Solstice). The Events sheet adds windows such as the school anniversary or later lunar years, and the `DisabledEvents` setting turns festivals off. Priority: the festival whose day is today wins, then the shortest window, then the closest day. To add a festival, add it to `CALENDAR_IDS`/date rules, `EVENTS` in progress.js (words, icon, boss, decor), a boss in models.js with `event:`, Chinese meanings, `EVENT_IDS` in Code.gs, and both READMEs.

## Pitfalls that already cost time

- **Don't `clone()` three.js models.** `clone()` copies `userData` through JSON and breaks part references. Build each mech/enemy/boss fresh (geometries and materials are cached in models.js, so it is cheap).
- Labels over enemies can overlap; `game.js` has a de-overlap pass. Keep the camera high enough that the player's mech doesn't hide enemies.
- A player who leaves a multiplayer match must have their mech hidden (`killPlayer` with `v.left`).
- Remote config arrives after the hangar renders. Re-render anything that depends on it (bank list, banners, pilot panel) after `loadRemoteConfig`.
- Malaysia time is UTC+8 with no DST. Dates are compared as `YYYY-MM-DD` strings (`todayMY()`, `ymd_()`).
- The headless test browser is slow. Game time runs slower than wall time, so tests must play longer than you'd expect.

## Testing

```bash
cd tests
npm install        # express + peer (for the local multiplayer server)
npm run unit       # backend (Code.gs in Node with fake Google services) + calendar rules
node run.js        # all browser tests, ~10 minutes; screenshots go to tests/shots/
node run.js e2e-festivals gallery   # just some of them
```

- `mockgas.js` runs `Code.gs` in a Node `vm` with fake SpreadsheetApp, CacheService, LockService, etc. A token `fake:someone@foonyew.edu.my` signs in as that person.
- `server.js` (port 8123) serves the site plus a mock backend at `/api`. It rewrites `config.js` on the fly to point at the mock and at the local PeerJS server, so the real `config.js` is never edited. Helper routes: `/__admin`, `/__gift`, `/__scores`, `/__fail` (make score uploads fail), `/__set?k=Setting&v=value`.
- `pw.js` also exports `pickClass(page, 'J105')` for filling the profile form.
- `peer.js` (port 9000, IPv4 only) is a local PeerJS server for multiplayer tests.
- Browser tests use Playwright Chromium with software WebGL (`pw.js`). In Claude Code cloud sessions Playwright and Chromium are preinstalled. Don't run `playwright install` there.
- `window.__MST` exposes `G`, `S`, `startGame`, `MODELS` and more so tests can read state and type automatically.
- Tests fake the date with an init script that shifts `Date.now()` (see `e2e-festivals.js`).
- Most browser tests print what they saw and end with `ERRORS: none`; a page error makes the exit code 1. **Look at the screenshots** after visual changes.

| Test | Covers |
|---|---|
| `unit.js` | Login, tokens, profiles, nickname filter, scores, coin cap, shop, admins, gifts, XP/badges/streaks, events config, calendar rules, class codes, new school year, outside accounts |
| `unit-test-mode.js` | Typing test backend: score formula, full-marks speed per form, attempts shared by two games through one test sheet, too early / left page / too fast, class limit, broken TestSheetId |
| `e2e-exam.js` | Typing test: guest practice battle, hidden code / wrong code / code typed in small letters, enemies wait (no damage, 4 on screen), school test (1 minute), items and paste ignored, leaving the page, attempt limit, a normal mission afterwards, phone |
| `e2e-awaken.js` | Awakening of all 15 mechs in the hangar (`aw-<mech>.png`), awakening and combo reward in battle, 3 mistakes end it |
| `e2e-classes.js` | Form + class pickers (phone), new school year, outside Google account, class battle groups, `AllowOtherAccounts = NO` |
| `e2e-gameplay.js` | Guest hangar, paint shop, battlefields, badges, combo tiers, revenge words, festival boss, slow-mo, share card, class battle board |
| `e2e-phone-school.js` | Phone layout, school sign-in and profile, full game, titles, leaderboard |
| `e2e-guest-admin-2p.js` | Guest game, admin account, coin gifts, 2-player match |
| `e2e-multiplayer-3p.js` | Invite link, wrong room code, 3 players, one player leaving, fair target split, score rows |
| `e2e-festivals.js` | Banner, festival bank and boss on 8 fake dates; April Fools respawn |
| `gallery.js` | Screenshots of every mech (idle and aiming), enemy and boss |
| `e2e-login-busy.js` | Sign-in while Google is busy, the server returns HTTP 500, or the lock queue is full (mock routes `/__busy?login=&google=&lock=`) |
| `audio-preview.js` | Renders the music and sound effects to `shots/*.wav` (OfflineAudioContext) and fails if anything clips |

## Making a new game from this one

A different-theme typing game can start as a copy of this repo (fork or import). Change at least:

1. **Browser storage keys.** All games on `claudepro-fyhs.github.io` share one origin, so they share `localStorage`. Rename every `mst_*` key (`js/core.js`, `js/game.js`, `js/progress.js`, `js/pages.js`, tests). Check with `grep -rn "mst_" js tests`.
2. **`PEER_PREFIX`** in `js/net.js` (`mstyper-fy-`), so rooms from two games can't connect to each other.
3. The name and title in `index.html`, README files, `Code.gs` messages, share card text and the `<title>`.
4. A **new Google Sheet + Apps Script** deployment, and its URL in `config.js`. The Google Client ID can be reused, because the origin `https://claudepro-fyhs.github.io` is the same.
5. Theme content: `words.js`, `meanings.js`, models, `MECH_PRICES` in Code.gs vs the mech list, badges, festivals.
6. Run the tests and check the screenshots.
