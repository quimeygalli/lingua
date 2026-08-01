// Chat page for Lingua — AI language tutor
export const CHAT_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lingua — Tu profesora de idiomas</title>
<style>
  :root {
    --bg: #f5f3ff;
    --panel: #ede9fe;
    --accent: #6d28d9;
    --accent2: #7c3aed;
    --text: #1e1b4b;
    --dim: #7c6fa0;
    --bubble: #ffffff;
    --border: #ddd6fe;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  header {
    padding: 12px 20px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  header h1 { font-size: 17px; font-weight: 700; flex: 1; }
  header .sub { font-size: 11px; opacity: .75; display: block; }
  #controls { display: flex; align-items: center; gap: 8px; }
  #voiceSelect {
    background: rgba(255,255,255,.18);
    border: 1px solid rgba(255,255,255,.3);
    border-radius: 8px;
    color: #fff;
    padding: 4px 8px;
    font-size: 12px;
    max-width: 140px;
    cursor: pointer;
  }
  #voiceSelect option { background: #4c1d95; color: #fff; }
  #mute {
    background: transparent;
    border: 1px solid rgba(255,255,255,.35);
    border-radius: 8px;
    color: #fff;
    padding: 4px 10px;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  }
  #log {
    flex: 1;
    overflow-y: auto;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .msg {
    max-width: 78%;
    padding: 11px 15px;
    border-radius: 16px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .user  { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .agent { align-self: flex-start; background: var(--bubble); color: var(--text); border-bottom-left-radius: 4px; border: 1px solid var(--border); box-shadow: 0 1px 4px #0001; }
  .audio { align-self: flex-end; background: #5b21b6; color: #fff; border-bottom-right-radius: 4px; font-style: italic; }
  .tool  { align-self: flex-start; font-size: 12px; color: var(--dim); background: #f0ebff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 3px 10px; }
  .error { align-self: flex-start; background: #fff0f0; border: 1px solid #fca5a5; color: #7f1d1d; border-radius: 12px; padding: 10px 14px; }
  .sys   { align-self: center; font-size: 12px; color: var(--dim); }
  form {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--panel);
    border-top: 1px solid var(--border);
  }
  input {
    flex: 1;
    padding: 11px 14px;
    border-radius: 10px;
    border: 1.5px solid #c4b5fd;
    background: #fff;
    color: var(--text);
    font-size: 15px;
    font-family: inherit;
    outline: none;
  }
  input:focus { border-color: var(--accent); }
  #mic {
    padding: 11px 14px;
    border: none;
    border-radius: 10px;
    background: #7c3aed;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
  }
  #mic.on { background: #dc2626; animation: pulse 1s infinite; }
  #mic:disabled { opacity: .4; cursor: default; }
  #send {
    padding: 11px 20px;
    border: none;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  #send:disabled { opacity: .4; cursor: default; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); }
    50%      { box-shadow: 0 0 0 7px rgba(220,38,38,0); }
  }
</style>
</head>
<body>
<header>
  <span style="font-size:24px">🌐</span>
  <div style="flex:1">
    <h1>Lingua <span class="sub">Tu profesora virtual de idiomas</span></h1>
  </div>
  <div id="controls">
    <select id="voiceSelect" title="Voz de Sofia"></select>
    <button id="mute" title="Silenciar voz">&#128266;</button>
  </div>
</header>
<div id="log"><div class="sys">Conectando con Sofia...</div></div>
<form id="f">
  <input id="box" placeholder="Escribe en ingles o espanol..." autocomplete="off" autofocus>
  <button type="button" id="mic" title="Grabar voz">&#127908;</button>
  <button id="send" type="submit">Enviar</button>
</form>

<script>
"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
const log  = document.getElementById("log");
const box  = document.getElementById("box");
const send = document.getElementById("send");
const mic  = document.getElementById("mic");
const muteBtn     = document.getElementById("mute");
const voiceSelect = document.getElementById("voiceSelect");

// Stable userId across sessions; fresh sessionId each tab
if (!localStorage.getItem("lingua_uid")) {
  localStorage.setItem("lingua_uid", "u-" + Math.random().toString(36).slice(2, 10));
}
const userId    = localStorage.getItem("lingua_uid");
const sessionId = Math.random().toString(36).slice(2);

// Chat URL: strip trailing slash(es) from current page URL, append /chat
const CHAT_URL = window.location.href.split("?")[0].replace(/[/]+$/, "") + "/chat";

// ── UI helpers ────────────────────────────────────────────────────────────────
function addMsg(cls, text) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

function setInputsDisabled(val) {
  send.disabled = val;
  mic.disabled  = val;
}

// ── Speech synthesis ──────────────────────────────────────────────────────────
const synth  = window.speechSynthesis;
let voices   = [];
let muted    = false;
let spkBuf   = "";
let spkQueue = Promise.resolve();

// Supported languages with display label and recognition lang code
var LANGS = [
  { label: "Ingles",   prefix: "en", recog: "en-US" },
  { label: "Espanol",  prefix: "es", recog: "es-ES" },
  { label: "Frances",  prefix: "fr", recog: "fr-FR" },
  { label: "Italiano", prefix: "it", recog: "it-IT" },
];
var currentLangIdx = 0;  // default: Ingles

// voiceMap[langIdx] = array of up to 3 voice objects
var voiceMap = {};

function loadVoices() {
  voices = synth.getVoices();
  voiceMap = {};
  LANGS.forEach(function(lang, li) {
    var matches = voices.filter(function(v) { return v.lang.startsWith(lang.prefix); });
    voiceMap[li] = matches.slice(0, 3);
  });
  rebuildSelect();
}

function rebuildSelect() {
  voiceSelect.innerHTML = "";
  // Language group options header + voices
  LANGS.forEach(function(lang, li) {
    var grp = document.createElement("optgroup");
    grp.label = lang.label;
    var list = voiceMap[li] || [];
    if (list.length === 0) {
      var o = document.createElement("option");
      o.value = li + "_0";
      o.textContent = lang.label + " (sistema)";
      grp.appendChild(o);
    } else {
      list.forEach(function(v, vi) {
        var o = document.createElement("option");
        o.value = li + "_" + vi;
        o.textContent = v.name.replace("Google ", "").substring(0, 24);
        if (li === 0 && vi === 0) o.selected = true;
        grp.appendChild(o);
      });
    }
    voiceSelect.appendChild(grp);
  });
}

loadVoices();
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

// When user changes language, update mic recognition lang too
voiceSelect.addEventListener("change", function() {
  var parts = (voiceSelect.value || "0_0").split("_");
  currentLangIdx = parseInt(parts[0], 10) || 0;
  if (typeof rec !== "undefined") rec.lang = LANGS[currentLangIdx].recog;
});

muteBtn.addEventListener("click", function() {
  muted = !muted;
  muteBtn.innerHTML = muted ? "&#128263;" : "&#128266;";
  if (muted) synth.cancel();
});

function getVoice() {
  var parts = (voiceSelect.value || "0_0").split("_");
  var li = parseInt(parts[0], 10) || 0;
  var vi = parseInt(parts[1], 10) || 0;
  var list = voiceMap[li];
  if (list && list[vi]) return list[vi];
  if (list && list[0]) return list[0];
  // Fallback: any voice for that language prefix
  var fb = voices.filter(function(v) { return v.lang.startsWith(LANGS[li].prefix); });
  return fb[0] || voices[0] || null;
}

function cleanText(t) {
  // Remove markdown symbols — avoid backtick in character class by using alternation
  return t.replace(/[*_#~>]+/g, "").replace(/[ \\t\\r\\n]+/g, " ").trim();
}

function speakChunk(sentence) {
  const clean = cleanText(sentence);
  if (!clean) return;
  spkQueue = spkQueue.then(function() {
    return new Promise(function(resolve) {
      if (muted || !synth) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(clean);
      u.voice = getVoice();
      u.rate  = 0.96;
      u.pitch = 1.05;
      u.onend   = resolve;
      u.onerror = resolve;
      synth.speak(u);
    });
  });
}

function feedSpeech(token) {
  if (muted) return;
  spkBuf += token;
  const m = spkBuf.match(/^(.*[.!?:])(\s[\s\S]*|$)/);
  if (m) {
    speakChunk(m[1]);
    spkBuf = spkBuf.slice(m[1].length).replace(/^\s+/, "");
  }
}

function flushSpeech() {
  if (spkBuf.trim()) { speakChunk(spkBuf); spkBuf = ""; }
}

// ── Agent communication ───────────────────────────────────────────────────────
async function ask(message) {
  setInputsDisabled(true);
  synth.cancel();
  spkBuf   = "";
  spkQueue = Promise.resolve();
  let current = null;

  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, sessionId: sessionId, userId: userId }),
    });

    if (!res.ok) {
      addMsg("error", "Error HTTP " + res.status + ": " + (await res.text()).slice(0, 120));
      setInputsDisabled(false);
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const lines = buf.split("\\n");
      buf = lines.pop();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch(e) { continue; }
        if (m.type === "token") {
          if (!current) current = addMsg("agent", "");
          current.textContent += m.text;
          log.scrollTop = log.scrollHeight;
          feedSpeech(m.text);
        } else if (m.type === "tool") {
          current = null;
          addMsg("tool", "... " + m.name.replace(/_/g, " "));
        } else if (m.type === "done") {
          flushSpeech();
        } else if (m.type === "error") {
          current = null;
          addMsg("error", "Sofia: " + m.text);
        }
      }
    }
    flushSpeech();

  } catch (err) {
    addMsg("error", "Error de red: " + err.message + " (URL: " + CHAT_URL + ")");
  }

  setInputsDisabled(false);
  box.focus();
}

// ── Form submit ───────────────────────────────────────────────────────────────
document.getElementById("f").addEventListener("submit", function(e) {
  e.preventDefault();
  const text = box.value.trim();
  if (!text || send.disabled) return;
  addMsg("user", text);
  box.value = "";
  ask(text);
});

// ── Microphone ────────────────────────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SR) {
  mic.disabled = true;
  mic.title = "Tu navegador no soporta grabacion de voz (usa Chrome)";
  mic.style.opacity = "0.35";
} else {
  var rec = new SR();
  rec.lang = LANGS[currentLangIdx].recog;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let recording = false;
  let liveDiv   = null;

  mic.addEventListener("click", function() {
    if (recording) { rec.stop(); return; }
    synth.cancel();
    try { rec.start(); } catch(e) {}
  });

  rec.onstart = function() {
    recording = true;
    mic.classList.add("on");
    mic.innerHTML = "&#9209;";
    liveDiv = addMsg("audio", "...");
  };

  rec.onresult = function(e) {
    let interim = "", final = "";
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (liveDiv) liveDiv.textContent = "🎤 " + (final || interim);
  };

  rec.onend = function() {
    recording = false;
    mic.classList.remove("on");
    mic.innerHTML = "&#127908;";
    const transcript = liveDiv ? liveDiv.textContent.replace("🎤 ", "").trim() : "";
    liveDiv = null;
    if (!transcript) return;
    ask("[audio: " + transcript + "]");
  };

  rec.onerror = function(e) {
    recording = false;
    mic.classList.remove("on");
    mic.innerHTML = "&#127908;";
    if (liveDiv) { liveDiv.remove(); liveDiv = null; }
    if (e.error !== "aborted" && e.error !== "no-speech") {
      addMsg("error", "Microfono: " + e.error);
    }
  };
}

// ── Greet on load ─────────────────────────────────────────────────────────────
window.addEventListener("load", async function() {
  await ask("__greet__");
  const sys = document.querySelector(".sys");
  if (sys) sys.remove();
  box.focus();
});
</script>
</body>
</html>`;
