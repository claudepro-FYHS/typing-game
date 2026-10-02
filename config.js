/* =====================================================================
 *  钢弹击字 Mecha Strike Typer — 设定文件 (Settings)
 *
 *  老师只需要改这里的 APPS_SCRIPT_URL（第一次设置时贴一次就好）。
 *  班级列表、老师密码、Google Client ID 都在 Google Sheet 的
 *  「Settings」分页里改，不用改这个文件。
 * ===================================================================== */
window.GAME_CONFIG = {
  // 把 Apps Script「部署 → 网页应用」给你的网址贴在两个引号中间
  // 例如 "https://script.google.com/macros/s/AKfycb.../exec"
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyrmiNn0cHn5ptd_1pJL7eranTE30OHOa6iF7bCRiyMFpup-Xe49yH4E7ohVA8g2qiaOQ/exec",

  // 连不上 Google Sheet 时用的备用班级列表（平时以 Sheet 里的为准）
  FALLBACK_CLASSES: ["1A", "1B", "1C", "2A", "2B", "2C", "3A", "3B", "3C"],

  // 学校邮箱域名
  SCHOOL_DOMAIN: "foonyew.edu.my",

  // 多人连线用的配对服务器。留空（null）= 使用免费的 PeerJS 公共服务，不用改。
  PEER_SERVER: null,
};
