# Mecha Strike Typer

A 3D mecha English typing game. Students type the words on enemy mechs to fire and shoot them down. Every stage ends with a boss (a battleship or a giant mobile armor).
Play solo, or team up with 2–4 classmates online and race each other for points.

- **Play:** https://claudepro-fyhs.github.io/typing-game/
- **Leaderboard:** the **LEADERBOARD** tab at the top of the game
- **Teacher dashboard:** the **TEACHER** tab at the top of the game (the password is set in the Google Sheet)

> 中文说明请看 [README_cn.md](README_cn.md)。

---

## Files

| File | What it is | Does the teacher need to edit it? |
|---|---|---|
| `index.html` | The game page (screens, leaderboard, teacher dashboard) | No |
| `config.js` | Where the Apps Script URL goes | **Once, during first-time setup** |
| `words.js` | Word banks (10 banks, about 2,600 words) | Only to add words (see below) |
| `meanings.js` | Chinese meanings shown when a word is destroyed | Only to add meanings for new words |
| `apps-script/Code.gs` | The backend that you paste into Google Apps Script | No (just copy and paste it, following the steps) |
| `models.js` | 3D models and animations: 15 mechs, 13 enemy types, 15 bosses + 17 festival bosses | No |
| `js/` | Game code (solo, multiplayer, levels and badges, leaderboard, teacher dashboard) | No |
| `lib/` | Three.js (3D engine) and PeerJS (multiplayer), both MIT-licensed | No |
| `tests/` | Automatic tests (backend and browser) | No |
| `CLAUDE.md` | Developer guide: how the code works, how to run the tests, how to make a new game from this one | No |

---

## First-time setup (do these in order, about 30 minutes)

### Step A: Google Cloud Client ID (lets students sign in with their school accounts)

> Sign in with your **school account** to do this.

1. Open https://console.cloud.google.com/, click the project picker at the top left, then click **NEW PROJECT**.
   - Name it `mecha-typer`, click **CREATE**, and then **SELECT PROJECT** when it's ready.
2. Search for **Google Auth Platform** in the top search bar and click **Get started**:
   - App name: `Mecha Strike Typer`
   - Support email: choose your email
   - Audience: choose **Internal**
   - Contact email: your email
   - Tick the agreement box, then click **Create**
3. In the left menu choose **Clients**, then click **+ Create client**:
   - Application type: **Web application**
   - Under **Authorized JavaScript origins**, click **+ Add URI** and enter `https://claudepro-fyhs.github.io`
   - Click **Create**
4. Copy the **Client ID** shown on screen (it looks like `xxxx.apps.googleusercontent.com`). You'll need it in Step B.

### Step B: Create the Google Sheet and Apps Script (where scores are collected)

1. In Google Drive, click **New → Google Sheets** and name the file `Mecha Strike Typer Scores`.
2. In the spreadsheet menu, click **Extensions → Apps Script**.
3. In the Apps Script page that opens:
   1. **Delete everything** in `Code.gs`.
   2. Open https://github.com/claudepro-FYHS/typing-game/blob/main/apps-script/Code.gs and click the **Copy raw file** icon (two squares) at the top right. This copies the whole file.
   3. Go back to Apps Script and paste.
   4. Click 💾 (Save).
4. In the function menu on the toolbar (next to "Debug"), choose **setup**, then click **▶ Run**.
5. The first run asks for permission:
   1. Click **Review permissions** and choose your school account.
   2. If you see "Google hasn't verified this app", click **Advanced**, then **Go to … (unsafe)**. This is your own script, so it is safe.
   3. Click **Allow**.
   4. When the execution log shows `Setup done. 设置完成！`, it worked.
6. Back in the spreadsheet you'll see seven new tabs: **Scores, Players, Settings, BannedWords, Admins, CoinGifts, Events**. In the **Settings** tab, edit column B:
   - **Classes**: your classes, separated by commas, e.g. `1A, 1B, 1C, 2A, 2B`
   - **TeacherPassword**: the teacher dashboard password. **Be sure to change** the default `change-me-2026`.
   - **GoogleClientId**: paste the Client ID from Step A
7. Publish it as a web app: back in Apps Script, click **Deploy → New deployment** at the top right.
   1. Click the ⚙ gear next to "Select type" and choose **Web app**.
   2. Description: `v1`
   3. Execute as: **Me**
   4. Who has access: **Anyone**
   5. Click **Deploy** and copy the **Web app URL** (it ends with `/exec`).

> ❗ If "Who has access" has no **Anyone** option, only "Anyone within foonyew.edu.my", the school administrator has locked it.
> With "Anyone within foonyew.edu.my" the game page cannot connect. Ask the school IT team to allow it, or contact the maintainer for an alternative.

### Step C: Paste the URL into `config.js`

1. Open https://github.com/claudepro-FYHS/typing-game/blob/main/config.js
2. Click ✏️ (Edit this file) at the top right.
3. Paste the URL from Step B-7 **between the two quotes** of `APPS_SCRIPT_URL: ""`, for example:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
   ```
4. Click the green **Commit changes…** button at the top right, then **Commit changes** again.

### Step D: Turn on GitHub Pages (makes the game URL work)

1. Open https://github.com/claudepro-FYHS/typing-game/settings/pages
2. Under **Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose **main** and the **/ (root)** folder, then click **Save**.
4. Wait 1–3 minutes, then open https://claudepro-fyhs.github.io/typing-game/ to play.
   - Every later change (for example to `config.js`) also takes 1–3 minutes to appear.

### Step E: Test it

1. Open the game, click **Sign in with Google**, and sign in with a school account.
2. Fill in class, seat number, name and nickname.
3. Play one game for at least 20 seconds.
4. When the results screen shows **✔ Saved to your class record**, a new row appears in the **Scores** tab of the Google Sheet.
5. Click **TEACHER** at the top, enter the password, and check that the dashboard shows the data.

---

## Changing settings later

Everything is changed in the Google Sheet. **You don't need to touch GitHub.** Changes take effect when students refresh the page.

| What to change | Where |
|---|---|
| Class list | **Settings** tab → `Classes`, comma-separated |
| Teacher dashboard password | **Settings** tab → `TeacherPassword` |
| Minimum accuracy for the leaderboard | **Settings** tab → `LeaderboardMinAccuracy` (default 80) |
| A student's inappropriate nickname | **Players** tab → edit the `Nickname` cell directly |
| Add a banned word | **BannedWords** tab → one word per row in column A |
| A student entered the wrong class or name | Edit the **Players** tab directly. New scores use the new details; fix old scores yourself in the **Scores** tab |
| Delete test scores | Delete the whole row in the **Scores** tab |
| Set up admins | **Admins** tab → email in column A, `YES` in column B (see below) |
| Give coins to students | **CoinGifts** tab (see below) |
| Change one student's coins directly | **Players** tab → edit the `Coins` cell |
| Turn a festival off | **Settings** tab → `DisabledEvents` (see below) |
| School anniversary dates | **Events** tab (see below) |

### Admins (Admins tab)

- Put an email in column A (for example your own `xxx@foonyew.edu.my`) and `YES` in column B.
- Admins see their coins as **∞** and can use all 15 mechs right away.
- Admin games are recorded in the Scores tab but **never appear on the leaderboard or the teacher dashboard**, so they don't affect student data.
- When an admin fills in their profile, they can choose **STAFF** as their class.
- To remove an admin, change column B to `NO` or delete the row.

### Giving coins (CoinGifts tab)

Each row is one gift:

| Column A: who | Column B: coins | Column C: note (anything) | Column D: filled in automatically, don't edit |
|---|---|---|---|
| `amy@foonyew.edu.my` | 200 | Contest winner | |
| `2B` | 50 | Reward for class 2B | |
| `ALL` | 100 | School holiday gift | |

- Column A can be one student's email, a class (e.g. `2B`), or `ALL` (every student).
- Each student receives each gift only once. Next time they open the game they'll see "🎁 Your teacher sent you … coins!".
- A negative number in column B takes coins away (never below 0).

### Festival events (automatic)

The game has **18 festival events** and switches them on by itself — you don't need to type any dates.

| Festival | ID | When (Malaysia time) | Festival boss |
|---|---|---|---|
| 🧧 Chinese New Year | `cny` | **all of January and February** | Golden Dragon |
| 🏮 Lantern Festival (元宵) | `lantern` | 15th day of the 1st lunar month, ±7 days | Lantern Titan |
| 🌿 Qingming (清明) | `qingming` | about 4–5 April, ±7 days | *(no special boss — normal bosses)* |
| 🐉 Dragon Boat (端午) | `dragonboat` | 5th day of the 5th lunar month, ±7 days | Dragon Boat Dreadnought |
| 🌌 Qixi (七夕) | `qixi` | 7th day of the 7th lunar month, ±7 days | Magpie Bridge |
| 🥮 Mid-Autumn (中秋) | `midautumn` | 15th day of the 8th lunar month, ±7 days | Jade Rabbit Moon |
| ⛰️ Double Ninth (重阳) | `doubleninth` | 9th day of the 9th lunar month, ±7 days | Mountain Fortress |
| 🍡 Winter Solstice (冬至) | `solstice` | about 21–22 December, ±7 days | Tangyuan Titan |
| 🎆 New Year's Day | `newyear` | 1 January, ±7 days | Countdown Tower |
| 💝 Valentine's Day | `valentine` | 14 February, ±7 days | Heart Seraph |
| 🤡 April Fools' Day | `aprilfools` | 1 April, ±7 days | Prank Jester |
| 🥚 Easter | `easter` | Easter Sunday, ±7 days | Egg Mothership |
| 💐 Mother's Day | `mothersday` | 2nd Sunday of May, ±7 days | Guardian Goddess |
| 👔 Father's Day | `fathersday` | 3rd Sunday of June, ±7 days | Iron Guardian |
| 🎃 Halloween | `halloween` | 31 October, ±7 days | Pumpkin Phantom |
| 🎄 Christmas | `christmas` | 25 December, ±7 days | Tannenbaum Titan |
| 🌺 Merdeka Day | `merdeka` | 31 August, ±7 days | Hornbill Guardian |
| 🎓 School anniversary | `anniversary` | **you type the dates** in the Events tab | Centennial Titan |

- Every festival lasts from **one week before to one week after** its day (Chinese New Year: the whole of January and February).
- **When two festivals overlap**: the festival whose day is *today* wins; otherwise the **shorter** event wins (so Valentine's Day and the Lantern Festival show up even inside the Chinese New Year months).
- Western festivals and Merdeka repeat every year by themselves. Lunar festival dates are built in for **2026–2030**. From 2031, add rows to the **Events** tab (see below), or ask someone to extend the table in `js/calendar.js`.
- During an event: a banner appears, a **festival word bank** is added to the word bank list, stages 1, 3, 5 … bring the festival boss, the sky gets festival decorations (lanterns, fireworks, snow, pumpkins …), and **coins are ×1.5**.
- The festival word bank contains **only festival words** (about 60 per festival, all with Chinese meanings). Students who choose another word bank still get the boss, decorations and ×1.5 coins.
- April Fools' special: sometimes a destroyed enemy "comes back to life" with an 🤡 APRIL FOOL! message (you still keep the points).
- Playing during an event earns the **🏮 Festival Hero** badge.

**Turning a festival off:** in the **Settings** tab, put the IDs in `DisabledEvents`, separated by commas — for example `halloween, aprilfools`. Leave it blank to keep all festivals on.

**Events tab** (only for extra dates):

| Column A: event ID | Column B: start | Column C: end | Column D: note |
|---|---|---|---|
| `anniversary` | 2026-11-01 | 2026-11-07 | School anniversary |
| `midautumn` | 2031-09-24 | 2031-10-08 | (example: a lunar festival after 2030) |

- Dates are in Malaysia time, written as `YYYY-MM-DD`.
- The school anniversary only runs when you fill in its dates here. Update them every year.

### Adding words (words.js)

1. Open `words.js` on GitHub and click ✏️ to edit.
2. Add new words inside the quotes of the right word bank, separated by spaces. Use only the letters a–z; duplicates are removed automatically.
3. Click **Commit changes** to save. The change appears after 1–3 minutes.
4. Optional: add the word's Chinese meaning to `meanings.js` (one line: `word 中文`) so it shows up when the word is destroyed.

> You only need to redeploy when `Code.gs` itself is updated:
> 1. Paste the new code and save. Choose **setup** in the function menu and click **▶ Run** once (it adds any new tabs and columns without deleting data).
> 2. Click **Deploy → Manage deployments**, then click ✏️.
> 3. Set "Version" to **New version** and click **Deploy**.
>
> The URL stays the same, so `config.js` doesn't need to change.

---

## How to play (for students)

- Type the word on an enemy to lock on and fire. Finish the word to destroy it.
- An enemy that reaches you costs 1 ♥. Lose all your ♥ and the game ends. Every boss you defeat gives back 1 ♥.
- Keys:
  - `Backspace`: release your current target
  - `Esc`: pause
  - `1`: 💣 clear the screen
  - `2`: ❄️ freeze enemies for 5 seconds
  - `3`: 🛡️ shield (blocks one hit)
- Many mechs have a **special move**: type several words in a row without a mistake, then press `Space` (the ⚡ at the bottom shows your progress).
- Mechs just play differently. A more expensive mech is **not** simply stronger:
  - Every mech has 4–6 ♥
  - Mechs with more ♥ earn fewer coins
  - Coins only buy mechs, never items
- All 15 mechs are original designs inspired by the hero and first-rival mechs of classic anime series:

| Mech | Style | Price | ♥ | Features |
|---|---|---|---|---|
| VANGUARD | UC hero | Free | 5 | Balanced; starts every stage with a shield |
| RED COMET | UC first rival (red mono-eye) | 300 | 4 | Coins +20% |
| AILE STRIKER | SEED hero | 300 | 5 | Items drop ×1.6; coins −10% |
| CRIMSON AEGIS | SEED first rival | 400 | 5 | Special: 3 words in a row → destroys the closest target |
| OVER FLAG | 00 first rival | 400 | 4 | Boss missiles 25% slower; coins +10% |
| ZENITH | UC (Z series) | 600 | 5 | Special: 5 in a row → freezes enemies for 4 s |
| SOVEREIGN | UC rival (heavy) | 600 | 6 | Special: 6 in a row → destroys 2 targets; coins −20% |
| BLADE ANGEL | 00 hero | 800 | 4 | Special: 5 in a row → enemies at half speed for 6 s |
| LIBERTY | SEED hero (blue wings) | 900 | 5 | Special: 8 in a row → full burst destroys 5 targets |
| FATE | SEED hero (wings of light) | 900 | 5 | Special: 5 in a row → gives you a shield |
| SCARLET BARON | UC rival (red and gold) | 1000 | 5 | Coins +10%; special: 3 in a row → destroys the closest target |
| MONOCEROS | UC (unicorn) | 1000 | 5 | Special: 6 in a row → the horn opens and enemies slow down for 8 s |
| HALO NU | UC hero (fin funnels) | 1100 | 5 | Special: 7 in a row → destroys 4 targets |
| TWIN DRIVE | 00 hero (twin drives) | 1100 | 5 | Special: 6 in a row → freezes enemies for 6 s; items ×1.2 |
| SERAPH ZERO | Winged angel style | 1200 | 4 | Angel wings; special: 5 in a row → destroys 3 targets |

### Levels, badges, paint jobs and battlefields

- **Pilot level:** every mission earns XP (kills, bosses, stages and typing speed). Levels go up to 50.
  - Each level unlocks one more **boss** (5 bosses at LV 1, all 15 by LV 11).
  - New **battlefields** unlock along the way: Earth Orbit (LV 3), Lunar Surface (LV 6), Asteroid Belt (LV 10), Space Colony (LV 15) and Crimson Nebula (LV 20).
- **Badges:** 19 badges, such as *Combo Master* (50 words in a row), *Dedicated* (play on 5 days in one week), *Newtype* (80 WPM) and *Avenger* (destroy 20 revenge enemies). Click **🏅 BADGES** in the hangar to see them all.
- **Titles:** choose an earned badge as your title. It appears next to your nickname on the leaderboard.
- **Paint jobs:** the 🎨 **PAINT** tab in the hangar sells 7 paint jobs (Desert Camo, Arctic, Sakura, Black Ops, Neon Cyber, Royal Gold and Optical Camo). They work on every mech you own.

### Fun extras

- **Combo effects:** at 10, 25, 50 and 100 words in a row a big **COMBO** banner appears, your mech starts to glow, the screen edges light up and the music speeds up.
- **Final blow:** when a boss goes down, the game switches to slow motion and the camera rushes in before the big explosion.
- **Revenge enemies:** words you mistyped come back in your next solo game as golden ⭐ enemies worth **double points and coins**. Destroy one and that word leaves your revenge list.
- **Chinese meanings:** when a word is destroyed, its Chinese meaning pops up (switch it off with the **中文** button in the hangar). Mistyped words on the results screen show their meanings too.
- **Share card:** the results screen has **📸 SHARE CARD**, which makes a picture with your mech, WPM, accuracy, combo, level and title that students can save and share.
- **Background music:** a small built-in soundtrack (switch it off with the **MUSIC** button).

### Multiplayer (2–4 players)

1. Everyone must **sign in with their school account**.
2. One player clicks **👥 MULTIPLAYER → CREATE ROOM** in the hangar. A 5-character **room code** appears.
   - The match uses this player's difficulty and word bank from the hangar.
   - Choose 3 stages, 5 stages, or endless.
3. Everyone else clicks **👥 MULTIPLAYER**, enters the room code, and clicks **JOIN**.
   - Or the host clicks **COPY INVITE LINK** and pastes the link into the class chat. Classmates who open the link and sign in join the room automatically.
4. When everyone is in, the host clicks **START MATCH**.

**How it works**
- Everyone shares one battlefield and can shoot any enemy. **Whoever finishes the word first gets the points** (you can steal kills).
- Enemies **attack every player equally**. The color on the left of a word label shows who that enemy is flying at, and a red frame means it's coming for you. So choose your strategy: protect yourself first, or steal points from others?
- The small colored bars under a word show how far other players have typed it.
- Items and special moves only affect enemies flying at you.
- Players who get shot down watch the rest of the match while the others keep going. Players are ranked by score at the end.
- Multiplayer games are recorded for the teacher (the Mode column in the Scores tab says `Multi`) but **don't count for the leaderboard**. Having kills stolen lowers your WPM, so leaving them out keeps the solo leaderboard fair.

---

## How scores work

- **WPM**: correctly typed letters ÷ 5 ÷ minutes of actual combat. Stage intros and stage-clear screens don't count toward the time.
- **Accuracy**: correct keystrokes ÷ all keystrokes.
- **Time survived**: seconds from start to finish, not counting time spent paused.
- Games shorter than 20 seconds or with fewer than 20 keystrokes are not recorded.
- Words are drawn like cards from a deck: no word repeats until the whole word bank has been used.

**Leaderboard**
- **⚔️ Class Battle:** every enemy destroyed this week (solo and multiplayer) counts for the player's class. Classes are ranked by total kills, and last week's champion class is shown.
- Separate boards for each difficulty, each with "This week" and "All time".
- Ranked by WPM; accuracy must be at least 80% to appear.
- Solo games only; admins are not included.
- Each student appears once, with their best game. Only their nickname, level and chosen title are shown.
- "This week" uses Malaysia time and starts on Monday at 00:00.

**Teacher dashboard**
- Average speed for each class
- Each student's best score and improvement (average of the latest 3 games − average of the first 3 games)
- The 20 words each class mistypes most often

---

## Privacy and security

- The teacher password is stored only in your Google Sheet and is checked by Apps Script. **It is not in the public web page code.**
- The leaderboard sends out only nicknames, WPM, accuracy and dates. **Real names and emails are never sent.**
- When a student signs in, Apps Script checks the sign-in token with Google and accepts scores only from `@foonyew.edu.my` accounts. Even someone who knows the backend URL can't submit scores pretending to be a student.
- A student's sign-in is kept only in the current browser tab and ends when the browser is closed. School computers are shared, so please still remind students to click **Sign out** when they finish.
- If a score can't be uploaded (for example, the network is down), the game still shows the result and keeps it on that computer. It is sent automatically the next time the game is opened, within 12 hours.

---

## FAQ

**Students see "Can't reach the school server"**
- Check that "Who has access" in Step B-7 is set to **Anyone**.
- Check that the URL in `config.js` is complete and ends with `/exec`.

**The sign-in button doesn't appear**
- Check that `GoogleClientId` is filled in on the Settings tab.
- Check that the Authorized JavaScript origin in Step A is `https://claudepro-fyhs.github.io`.

**The game runs slowly on school computers**
- Click **GRAPHICS: LOW** in the hangar.
- If the game detects that it's running slowly in the first few seconds, it also switches to low graphics automatically.

**Multiplayer won't connect**
- Multiplayer uses peer-to-peer WebRTC. Room codes are matched through the free public PeerJS service, so no extra setup is needed.
- It usually works within the same school network. If the school firewall blocks it, players see a "Could not connect" message:
  - ask the school IT team to allow `0.peerjs.com` and WebRTC, or
  - contact the maintainer to switch to Google Firebase for connections (this needs one extra free setup step).
- If the host closes the page or loses connection, the match ends and everyone sees their own results.

**Will scores get jammed if the whole class submits at once?**
- Apps Script writes scores one at a time in a queue.
- If a submission occasionally fails because it's too busy, the game keeps it on the computer and sends it again automatically later.
