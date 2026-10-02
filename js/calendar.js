"use strict";
/* =====================================================================
 *  FESTIVAL CALENDAR
 *  - Every festival runs from 7 days before to 7 days after its day.
 *  - Chinese New Year runs for the whole of January and February.
 *  - Fixed-date festivals repeat every year automatically.
 *  - Lunar festivals use the table below (2026–2030). For later years the
 *    teacher can add rows in the Events sheet.
 *  - When festivals overlap: the festival whose day is today wins; otherwise
 *    the shorter event wins; otherwise the one whose day is closest.
 * ===================================================================== */
const LUNAR_DAYS = {
  // computed with a Chinese calendar library (lunar-javascript)
  2026: { cny: "2026-02-17", lantern: "2026-03-03", qingming: "2026-04-05", dragonboat: "2026-06-19", qixi: "2026-08-19", midautumn: "2026-09-25", doubleninth: "2026-10-18", solstice: "2026-12-22" },
  2027: { cny: "2027-02-06", lantern: "2027-02-20", qingming: "2027-04-05", dragonboat: "2027-06-09", qixi: "2027-08-08", midautumn: "2027-09-15", doubleninth: "2027-10-08", solstice: "2027-12-22" },
  2028: { cny: "2028-01-26", lantern: "2028-02-09", qingming: "2028-04-04", dragonboat: "2028-05-28", qixi: "2028-08-26", midautumn: "2028-10-03", doubleninth: "2028-10-26", solstice: "2028-12-21" },
  2029: { cny: "2029-02-13", lantern: "2029-02-27", qingming: "2029-04-04", dragonboat: "2029-06-16", qixi: "2029-08-16", midautumn: "2029-09-22", doubleninth: "2029-10-16", solstice: "2029-12-21" },
  2030: { cny: "2030-02-03", lantern: "2030-02-17", qingming: "2030-04-05", dragonboat: "2030-06-05", qixi: "2030-08-05", midautumn: "2030-09-12", doubleninth: "2030-10-05", solstice: "2030-12-22" },
};
const FIXED_DAYS = { newyear: "01-01", valentine: "02-14", aprilfools: "04-01", merdeka: "08-31", halloween: "10-31", christmas: "12-25" };
const CAL_DAY = 86400000;
const calMs = (ymd) => Date.parse(ymd + "T00:00:00Z");
const calYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
function easterDay(y) { // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function nthSunday(y, month, n) { // e.g. 2nd Sunday of May
  const first = new Date(Date.UTC(y, month - 1, 1)), offset = (7 - first.getUTCDay()) % 7;
  return calYmd(Date.UTC(y, month - 1, 1 + offset + (n - 1) * 7));
}
function festivalDay(id, y) {
  if (FIXED_DAYS[id]) return `${y}-${FIXED_DAYS[id]}`;
  if (id === "easter") return easterDay(y);
  if (id === "mothersday") return nthSunday(y, 5, 2);
  if (id === "fathersday") return nthSunday(y, 6, 3);
  return (LUNAR_DAYS[y] || {})[id] || null;
}
function festivalWindows(id, y) {
  if (id === "cny") {
    const feb = new Date(Date.UTC(y, 2, 0)).getUTCDate(); // 28 or 29
    return [{ id, start: `${y}-01-01`, end: `${y}-02-${feb}`, day: festivalDay("cny", y) }];
  }
  const day = festivalDay(id, y);
  if (!day) return [];
  return [{ id, start: calYmd(calMs(day) - 7 * CAL_DAY), end: calYmd(calMs(day) + 7 * CAL_DAY), day }];
}
const CALENDAR_IDS = ["cny", "lantern", "qingming", "dragonboat", "qixi", "midautumn", "doubleninth", "solstice",
  "newyear", "valentine", "aprilfools", "easter", "mothersday", "fathersday", "halloween", "christmas", "merdeka"];

// today: "YYYY-MM-DD" (Malaysia time). extra: [{id,start,end}] from the Events sheet. disabled: [ids]
function pickEvent(today, extra, disabled) {
  const y = Number(today.slice(0, 4)), off = new Set((disabled || []).map(s => String(s).trim().toLowerCase()));
  let list = [];
  for (const id of CALENDAR_IDS) for (const yy of [y - 1, y, y + 1]) list = list.concat(festivalWindows(id, yy));
  for (const w of extra || []) if (w && w.id && w.start && w.end) list.push({ id: String(w.id).toLowerCase(), start: w.start, end: w.end, day: w.day || null });
  const t = calMs(today);
  const live = list.filter(w => !off.has(w.id) && calMs(w.start) <= t && t <= calMs(w.end));
  if (!live.length) return null;
  live.sort((a, b) => ((b.day === today) - (a.day === today)) ||
    ((calMs(a.end) - calMs(a.start)) - (calMs(b.end) - calMs(b.start))) ||
    (Math.abs(t - calMs(a.day || a.start)) - Math.abs(t - calMs(b.day || b.start))));
  return live[0];
}
if (typeof module !== "undefined") module.exports = { pickEvent, festivalDay, festivalWindows, easterDay, nthSunday, CALENDAR_IDS };
