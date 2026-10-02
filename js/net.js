"use strict";
/* =====================================================================
 *  MULTIPLAYER NETWORKING (PeerJS / WebRTC, peer-to-peer)
 *  The host's browser runs the match; up to 3 guests connect with a room code.
 * ===================================================================== */
const PEER_PREFIX = "mstyper-fy-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let NET = { role: null };

function peerOptions() {
  const o = { debug: 0, config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] } };
  if (CFG.PEER_SERVER) Object.assign(o, CFG.PEER_SERVER);
  return o;
}
function genCode() { let c = ""; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function myInfo() {
  const p = S.session.player;
  return { nick: p.nickname, cls: p.cls, mech: wallet().selected, skin: profile().skin, level: myLevel() };
}
function mpMsg(text, ok) { const el = $("#mp-msg"); el.className = ok ? "muted" : "err"; el.textContent = text || ""; }

function netLeave() {
  const n = NET;
  NET = { role: null };
  try { if (n.hostConn) n.hostConn.close(); } catch (e) {}
  try { for (const c of Object.values(n.conns || {})) c.close(); } catch (e) {}
  try { if (n.peer) n.peer.destroy(); } catch (e) {}
  if (n.timer) clearTimeout(n.timer);
}
function netBroadcast(ev) {
  if (NET.role !== "host") return;
  for (const c of Object.values(NET.conns)) if (c.open) { try { c.send(ev); } catch (e) {} }
}
function netSend(msg) { if (NET.role === "client" && NET.hostConn && NET.hostConn.open) { try { NET.hostConn.send(msg); } catch (e) {} } }

/* ---------- lobby screen ---------- */
function showMulti() {
  showScreen("scr-multi");
  renderUserChip();
  mpMsg("");
  const signedIn = isSchool() && S.session.player;
  $("#mp-need-login").style.display = signedIn ? "none" : "";
  $("#mp-choose").style.display = signedIn && !NET.role ? "" : "none";
  $("#mp-room").style.display = NET.role ? "" : "none";
  $("#mp-host-settings").textContent = `Uses your hangar settings: ${S.prefs.diff} · ${WORD_BANKS[S.prefs.bank].name}`;
  if (typeof Peer === "undefined") mpMsg("Multiplayer could not load on this network.");
  renderLobby();
}
function renderLobby() {
  if (!NET.role) { $("#mp-room").style.display = "none"; if (isSchool() && S.session.player) $("#mp-choose").style.display = ""; return; }
  $("#mp-choose").style.display = "none";
  $("#mp-room").style.display = "";
  $("#mp-room-code").textContent = NET.code || "-----";
  const st = NET.settings || {};
  $("#mp-room-settings").textContent = st.diff ? `${st.diff} · ${(WORD_BANKS[st.bank] || {}).name || ""} · ${st.stages ? st.stages + " stages" : "Endless"} · ${(NET.lobby || []).length}/4 pilots` : "Connecting…";
  $("#mp-players").innerHTML = (NET.lobby || []).map((p, i) => `<div class="prow"><span class="dot" style="background:${PCOLORS[i % 4]}"></span>
    <span class="who"><b>${esc(p.nick)}</b> <span class="lv small">LV${p.level || 1}</span> <span class="muted small">${esc(p.cls || "")}</span>${p.pid === "p0" ? ' <span class="small" style="color:var(--gold)">HOST</span>' : ""}${p.pid === NET.myPid ? ' <span class="small">(you)</span>' : ""}</span>
    <span class="small muted">${esc((MECH_BY_ID[p.mech] || MECHS[0]).name)}</span></div>`).join("") || '<p class="muted">Waiting…</p>';
  const host = NET.role === "host";
  $("#btn-mp-start").style.display = host ? "" : "none";
  $("#btn-mp-start").disabled = !host || (NET.lobby || []).length < 2;
  if (!host && NET.lobby && NET.lobby.length) mpMsg("Waiting for the host to start the match…", true);
  else if (host && (NET.lobby || []).length < 2 && NET.code) mpMsg("Tell your classmates the room code, or send them the invite link.", true);
  else if (host) mpMsg("");
}

/* ---------- host ---------- */
function netHost(retry) {
  if (typeof Peer === "undefined") return mpMsg("Multiplayer could not load on this network.");
  netLeave();
  const code = genCode();
  NET = { role: "host", code: null, myPid: "p0", conns: {}, nextPid: 1, started: false,
    settings: { diff: S.prefs.diff, bank: S.prefs.bank, stages: Number($("#mp-stages").value), level: myLevel(), event: activeEvent() ? activeEvent().id : "" },
    lobby: [Object.assign({ pid: "p0" }, myInfo())] };
  mpMsg("Creating room…", true);
  renderLobby();
  const peer = NET.peer = new Peer(PEER_PREFIX + code, peerOptions());
  peer.on("open", () => { NET.code = code; renderLobby(); });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id" && (retry || 0) < 3) return netHost((retry || 0) + 1);
    if (NET.peer === peer) { mpMsg("Could not create a room (" + err.type + "). Check the internet connection and try again."); if (!NET.code) { netLeave(); renderLobby(); } }
  });
  peer.on("connection", (conn) => {
    conn.on("data", (d) => hostOnData(conn, d));
    conn.on("close", () => hostOnClose(conn));
    conn.on("error", () => hostOnClose(conn));
  });
}
function lobbyBroadcast() {
  netBroadcast({ e: "lobby", players: NET.lobby, settings: NET.settings, code: NET.code });
  renderLobby();
}
function hostOnData(conn, d) {
  if (NET.role !== "host" || !d) return;
  if (d.r === "hello") {
    if (NET.started) { conn.send({ e: "reject", reason: "The match has already started." }); setTimeout(() => conn.close(), 500); return; }
    if (NET.lobby.length >= 4) { conn.send({ e: "reject", reason: "This room is full (4 pilots)." }); setTimeout(() => conn.close(), 500); return; }
    const pid = "p" + (NET.nextPid++);
    conn.pid = pid; NET.conns[pid] = conn;
    NET.lobby.push({ pid, nick: String(d.nick || "Pilot").slice(0, 12), cls: String(d.cls || "").slice(0, 8), mech: MECH_BY_ID[d.mech] ? d.mech : "starter",
      skin: SKIN_BY_ID[d.skin] ? d.skin : "default", level: Math.max(1, Math.min(50, Number(d.level) || 1)) });
    conn.send({ e: "welcome", pid });
    lobbyBroadcast();
    return;
  }
  if (!conn.pid || !G.running || G.role !== "host") return;
  const pid = conn.pid;
  switch (d.r) {
    case "claim": { const t = G.byId[d.id]; if (t && t.kind === "boss") resolveBossHit(pid, d.combo, d.word, 1); else resolveKill(d.id, pid, d.combo, "type"); break; }
    case "prog": emit({ e: "prog", pid, id: d.id, n: Math.max(0, Number(d.n) || 0) }); break;
    case "item": doItem(pid, d.k); break;
    case "special": doSpecial(pid); break;
    case "stats": { const p = player(pid); if (p) { p.wpm = Number(d.wpm) || 0; p.acc = Number(d.acc) || 0; } break; }
  }
}
function hostOnClose(conn) {
  if (NET.role !== "host" || !conn.pid || !NET.conns[conn.pid]) return;
  delete NET.conns[conn.pid];
  if (!NET.started) { NET.lobby = NET.lobby.filter(p => p.pid !== conn.pid); lobbyBroadcast(); return; }
  if (G.running && !G.over) {
    const p = player(conn.pid);
    if (p) {
      p.left = true; p.alive = false; emitPState(p);
      floater(window.innerWidth / 2, 130, `${p.nick} left the match`, p.color);
      if (!G.players.some(q => q.alive)) gameOver("destroyed");
    }
  }
}
function netStartMatch() {
  if (NET.role !== "host" || NET.lobby.length < 2) return;
  NET.started = true;
  const msg = { e: "start", players: NET.lobby, settings: NET.settings };
  netBroadcast(msg);
  typer.focus();
  startGame(Object.assign({ mode: "multi", role: "host", myPid: "p0", players: NET.lobby }, NET.settings));
}

/* ---------- guest ---------- */
function netJoin(codeRaw) {
  const code = String(codeRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 5) return mpMsg("Room codes have 5 letters/numbers.");
  if (typeof Peer === "undefined") return mpMsg("Multiplayer could not load on this network.");
  netLeave();
  NET = { role: "client", code, myPid: null, lobby: [], settings: {} };
  mpMsg("Connecting to room " + code + "…", true);
  renderLobby();
  const peer = NET.peer = new Peer(peerOptions());
  NET.timer = setTimeout(() => { if (NET.peer === peer && !NET.myPid) { netLeave(); renderLobby(); mpMsg("Could not connect to room " + code + ". Check the code, or ask the host to create a new room."); } }, 15000);
  peer.on("error", (err) => {
    if (NET.peer !== peer) return;
    if (G.running && !G.over) return; // handled by close
    netLeave(); renderLobby();
    mpMsg(err.type === "peer-unavailable" ? `Room ${code} was not found. Check the code.` : "Connection problem (" + err.type + "). Please try again.");
  });
  peer.on("open", () => {
    const conn = NET.hostConn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: "json" });
    conn.on("open", () => conn.send(Object.assign({ r: "hello" }, myInfo())));
    conn.on("data", clientOnData);
    conn.on("close", () => clientOnClose(peer));
    conn.on("error", () => clientOnClose(peer));
  });
}
function clientOnData(d) {
  if (NET.role !== "client" || !d) return;
  switch (d.e) {
    case "welcome": NET.myPid = d.pid; if (NET.timer) clearTimeout(NET.timer); return;
    case "reject": netLeave(); renderLobby(); mpMsg(d.reason || "Could not join."); return;
    case "lobby": NET.lobby = d.players; NET.settings = d.settings; NET.code = d.code; if (!G.running) renderLobby(); return;
    case "start":
      NET.started = true;
      typer.focus();
      startGame(Object.assign({ mode: "multi", role: "client", myPid: NET.myPid, players: d.players }, d.settings));
      return;
  }
  if (G.running && G.role === "client") applyEvent(d);
}
function clientOnClose(peer) {
  if (NET.role !== "client" || NET.peer !== peer) return;
  if (G.running && !G.over && G.mode === "multi") { netLeave(); finishGame(localRanking(), "hostLeft"); return; }
  netLeave(); renderLobby();
  if (S.currentScreen === "scr-multi") mpMsg("The host closed the room.");
}

/* ---------- buttons ---------- */
$("#btn-mp-create").onclick = () => netHost();
$("#btn-mp-join").onclick = () => netJoin($("#mp-code").value);
$("#mp-code").addEventListener("keydown", (e) => { if (e.key === "Enter") netJoin($("#mp-code").value); });
$("#btn-mp-leave").onclick = () => { netLeave(); mpMsg(""); renderLobby(); };
$("#btn-mp-start").onclick = () => netStartMatch();
$("#btn-mp-back").onclick = () => showHangar();
$("#btn-mp-signin").onclick = () => { S.guestMode = false; showLogin(); };
$("#btn-mp-copy").onclick = async () => {
  const link = location.origin + location.pathname + "#join=" + NET.code;
  try { await navigator.clipboard.writeText(link); toast("Invite link copied! Paste it in your class chat."); }
  catch (e) { prompt("Copy this invite link:", link); }
};
// invite links: ...#join=ABCDE
(function () {
  const m = location.hash.match(/join=([A-Za-z0-9]{5})/);
  if (m) { S.pendingJoin = m[1].toUpperCase(); history.replaceState(null, "", location.pathname + location.search); }
})();
