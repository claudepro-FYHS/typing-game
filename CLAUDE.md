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
| `js/scene.js` | Renderer, camera, starfield, battlefields (`setEnvironment(id, eventId)`), festival decorations, particles, music synth (`Music`), hangar preview. |
| `js/game.js` | The game engine (see below), HUD, items, specials, combo tiers, boss slow-mo, revenge words, results screen, share card, score upload. |
| `js/net.js` | Multiplayer lobby and PeerJS (WebRTC) host/guest. |
| `js/pages.js` | Leaderboard, teacher dashboard, main frame loop, boot. Exposes `window.__MST` for tests. |
| `apps-script/Code.gs` | The whole backend. The teacher pastes it into Apps Script. |
| `tests/` | Unit tests (backend in Node) and browser tests (Playwright). See **Testing**. |

Script order: `config.js, words.js, meanings.js, lib/three.min.js, models.js, lib/peerjs.min.js, js/core.js, js/calendar.js, js/progress.js, js/scene.js, js/game.js, js/net.js, js/pages.js`. Everything is plain global scripts (no modules), so functions are shared through globals.

## Game engine (js/game.js)

Event-sourced, so solo and multiplayer share one code path:

- `G` holds the match state. `G.role` is `"solo"`, `"host"` or `"client"`.
- The authority (solo or host) decides things and calls `emit(ev)`. `emit` runs `applyEvent(ev)` locally and, on a host, broadcasts it. Event kinds: `spawn, prog, kill, hit, bossHit, bossDown, phase, pstate, fx, over, snap`.
- Clients never decide. They send claims (`claim`, `prog`, `item`, `special`, `stats`) and the host resolves them (`resolveKill`, `resolveBossHit`, `doItem`, `doSpecial`). The host sends position snapshots about 10 times a second.
- Words are dealt from shuffle-bag decks by length (`drawWord`). Words on screen never share a first letter, so the first key picks the target.
- Enemies pick a victim with `pickVictim()` so every player is attacked evenly.
- Stages: kill `killsGoal()` enemies, then a boss. Festival bosses appear on odd stages during a festival. Normal bosses unlock by pilot level (`bossPoolSize`).
- Games under 20 seconds are not uploaded. A failed upload is kept in `mst_pending` and retried later; the result screen always shows.

## Backend (apps-script/Code.gs)

- Sheets: `Scores, Players, Settings, BannedWords, Admins, CoinGifts, Events`. `setup()` creates and migrates them, and is safe to run again.
- Login: Google Identity Services ID token → `login_` checks it with Google's tokeninfo endpoint (audience, domain) → returns an HMAC-signed session token valid for 12 hours (`makeToken_`/`checkToken_`).
- Requests: POST with `Content-Type: text/plain` (avoids CORS preflight) and a JSON body `{action, token, ...}`. GET is used for `config` and `leaderboard`. Writes use `LockService`; the leaderboard is cached in `CacheService`.
- The server is the authority for school accounts. Coin rewards are capped (`kills*25 + bosses*400`, max 8000 per game), and mech/skin prices are re-checked (`MECH_PRICES`, `SKIN_PRICES`).
- **Duplicated rules:** levels (`reaching L needs 50·(L−1)·L XP`), XP per game, BADGES, skin prices and festival IDs exist in both `Code.gs` and `js/progress.js`/`js/calendar.js`. When you change one, change the other.
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
- `server.js` (port 8123) serves the site plus a mock backend at `/api`. It rewrites `config.js` on the fly to point at the mock and at the local PeerJS server, so the real `config.js` is never edited. Helper routes: `/__admin`, `/__gift`, `/__scores`, `/__fail` (make score uploads fail).
- `peer.js` (port 9000, IPv4 only) is a local PeerJS server for multiplayer tests.
- Browser tests use Playwright Chromium with software WebGL (`pw.js`). In Claude Code cloud sessions Playwright and Chromium are preinstalled. Don't run `playwright install` there.
- `window.__MST` exposes `G`, `S`, `startGame`, `MODELS` and more so tests can read state and type automatically.
- Tests fake the date with an init script that shifts `Date.now()` (see `e2e-festivals.js`).
- Most browser tests print what they saw and end with `ERRORS: none`; a page error makes the exit code 1. **Look at the screenshots** after visual changes.

| Test | Covers |
|---|---|
| `unit.js` | Login, tokens, profiles, nickname filter, scores, coin cap, shop, admins, gifts, XP/badges/streaks, events config, calendar rules |
| `e2e-gameplay.js` | Guest hangar, paint shop, battlefields, badges, combo tiers, revenge words, festival boss, slow-mo, share card, class battle board |
| `e2e-phone-school.js` | Phone layout, school sign-in and profile, full game, titles, leaderboard |
| `e2e-guest-admin-2p.js` | Guest game, admin account, coin gifts, 2-player match |
| `e2e-multiplayer-3p.js` | Invite link, wrong room code, 3 players, one player leaving, fair target split, score rows |
| `e2e-festivals.js` | Banner, festival bank and boss on 8 fake dates; April Fools respawn |
| `gallery.js` | Screenshots of every mech (idle and aiming), enemy and boss |

## Making a new game from this one

A different-theme typing game can start as a copy of this repo (fork or import). Change at least:

1. **Browser storage keys.** All games on `claudepro-fyhs.github.io` share one origin, so they share `localStorage`. Rename every `mst_*` key (`js/core.js`, `js/game.js`, `js/progress.js`, `js/pages.js`, tests).
2. **`PEER_PREFIX`** in `js/net.js` (`mstyper-fy-`), so rooms from two games can't connect to each other.
3. The name and title in `index.html`, README files, `Code.gs` messages, share card text and the `<title>`.
4. A **new Google Sheet + Apps Script** deployment, and its URL in `config.js`. The Google Client ID can be reused, because the origin `https://claudepro-fyhs.github.io` is the same.
5. Theme content: `words.js`, `meanings.js`, models, `MECH_PRICES` in Code.gs vs the mech list, badges, festivals.
6. Run the tests and check the screenshots.
