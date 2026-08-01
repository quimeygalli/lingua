// The chat page your agent serves at GET / — you don't need to edit this file.
// It talks to your agent by POSTing to /chat and reading the streamed response.

export const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lingua — Tu tutor de idiomas</title>
<style>
  :root { --bg:#f5f3ff; --panel:#ede9fe; --accent:#6d28d9; --accent2:#7c3aed; --text:#1e1b4b; --dim:#7c6fa0; --bubble:#fff; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
         font-size: 15px; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 14px 20px; background: linear-gradient(135deg, var(--accent), var(--accent2));
           color: #fff; display: flex; align-items: center; gap: 10px; }
  header h1 { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
  header span.sub { font-size: 12px; opacity: .8; margin-left: 4px; }
  #log { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 78%; padding: 12px 16px; border-radius: 16px; line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }
  .user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .agent { align-self: flex-start; background: var(--bubble); color: var(--text);
           border-bottom-left-radius: 4px; border: 1px solid #ddd6fe; box-shadow: 0 1px 4px #0001; }
  .tool { align-self: flex-start; font-size: 12px; color: var(--dim); background: #f0ebff;
          border: 1px solid #c4b5fd; border-radius: 8px; padding: 4px 10px; }
  .error { align-self: flex-start; background: #fff0f0; border: 1px solid #fca5a5; color: #7f1d1d;
           border-radius: 12px; font-size: 13px; padding: 10px 14px; }
  .sys { align-self: center; font-size: 12px; color: var(--dim); }
  form { display: flex; gap: 10px; padding: 14px 20px; background: var(--panel); border-top: 1px solid #ddd6fe; }
  input { flex: 1; padding: 11px 14px; border-radius: 10px; border: 1.5px solid #c4b5fd;
          background: #fff; color: var(--text); font-size: 15px; outline: none; font-family: inherit; }
  input:focus { border-color: var(--accent); }
  button { padding: 11px 22px; border: none; border-radius: 10px; background: var(--accent);
           color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
  button:disabled { opacity: .4; cursor: default; }
  #mic { background: #7c3aed; padding: 11px 16px; font-size: 18px; line-height: 1; }
  #mic.recording { background: #dc2626; animation: pulse 1s infinite; }
  #mic:disabled { opacity: .4; cursor: default; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 #dc262660 } 50% { box-shadow: 0 0 0 8px #dc262600 } }
  .audio-bubble { background: #ede9fe; border: 1px solid #a78bfa; }
  #controls { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  #mute { background: transparent; border: 1px solid rgba(255,255,255,.4); border-radius: 8px;
          color: #fff; padding: 5px 10px; font-size: 15px; cursor: pointer; }
  #mute:hover { background: rgba(255,255,255,.15); }
  select#voiceSelect { background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3);
    border-radius: 8px; color: #fff; padding: 5px 8px; font-size: 12px; cursor: pointer; max-width: 160px; }
  select#voiceSelect option { background: #4c1d95; color: #fff; }
</style>
</head>
<body>
<header>
  <span style="font-size:26px">🌐</span>
  <div><h1>Lingua<span class="sub">Tu tutor de idiomas</span></h1></div>
  <div id="controls">
    <select id="voiceSelect" title="Voz del profesor"></select>
    <button id="mute" title="Silenciar / activar voz">🔊</button>
  </div>
</header>
<div id="log"><div class="sys">Conectando con Lingua…</div></div>
<form id="f">
  <input id="box" placeholder="Escribe en inglés o español…" autocomplete="off" autofocus>
  <button type="button" id="mic" title="Grabar audio">🎤</button>
  <button id="send">Enviar</button>
</form>
<script>
"use strict";
const log = document.getElementById("log"), box = document.getElementById("box"),
      send = document.getElementById("send"), mic = document.getElementById("mic"),
      muteBtn = document.getElementById("mute"), voiceSelect = document.getElementById("voiceSelect");

const sessionId = crypto.randomUUID();
// userId persists across sessions in localStorage so the agent remembers the student
if (!localStorage.getItem("lingua_userId")) {
  localStorage.setItem("lingua_userId", "u-" + crypto.randomUUID().slice(0, 8));
}
const userId = localStorage.getItem("lingua_userId");

// ── Text-to-Speech engine ─────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let voices = [];
let muted = false;
// Sentence buffer: accumulate tokens until a sentence boundary, then speak
let speakBuffer = "";
// Queue of utterances so sentences play in order even while streaming
let speakQueue = Promise.resolve();

function loadVoices() {
  voices = synth.getVoices();
  const en = voices.filter(v => v.lang.startsWith("en"));
  voiceSelect.innerHTML = "";
  // Show only English voices; prefer en-US
  en.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = v.name.replace("Google ", "").replace(" English", "");
    if (v.lang === "en-US" && v.name.includes("Female")) opt.selected = true;
    voiceSelect.appendChild(opt);
  });
  if (!voiceSelect.value && en.length) voiceSelect.options[0].selected = true;
}
loadVoices();
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.title = muted ? "Activar voz" : "Silenciar";
  if (muted) synth.cancel();
});

function selectedVoice() {
  const en = voices.filter(v => v.lang.startsWith("en"));
  return en[voiceSelect.value] ?? en[0] ?? voices[0] ?? null;
}

// Strip markdown-like symbols before speaking
function cleanForSpeech(text) {
  return text.replace(/[*_#~>]+/g, "").replace(/[ \t\r\n]+/g, " ").trim();
}

function speakSentence(sentence) {
  const clean = cleanForSpeech(sentence);
  if (!clean) return;
  speakQueue = speakQueue.then(() => new Promise(resolve => {
    if (muted || !synth) { resolve(); return; }
    const utt = new SpeechSynthesisUtterance(clean);
    utt.voice = selectedVoice();
    utt.rate = 0.95;
    utt.pitch = 1.05;
    utt.onend = resolve;
    utt.onerror = resolve;
    synth.speak(utt);
  }));
}

// Called with each streamed token; buffers until sentence boundary
function feedSpeech(token) {
  if (muted) return;
  speakBuffer += token;
  // Speak on sentence-ending punctuation followed by space or end
  const match = speakBuffer.match(/^(.*[.!?:])(\s+[\s\S]*|$)/);
  if (match) {
    speakSentence(match[1]);
    speakBuffer = speakBuffer.slice(match[1].length).trimStart();
  }
}

// Flush any remaining buffer when stream ends
function flushSpeech() {
  if (speakBuffer.trim()) {
    speakSentence(speakBuffer);
    speakBuffer = "";
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function add(cls, text) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

// ── Agent communication ───────────────────────────────────────────────────────
async function ask(message) {
  send.disabled = true;
  mic.disabled = true;
  synth.cancel();          // stop any ongoing speech before new response
  speakBuffer = "";
  speakQueue = Promise.resolve();
  let current = null;
  try {
    const res = await fetch("chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId, userId }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.type === "token") {
          if (!current) current = add("agent", "");
          current.textContent += m.text;
          log.scrollTop = log.scrollHeight;
          feedSpeech(m.text);
        } else if (m.type === "tool") {
          current = null;
          add("tool", "🔧 " + m.name.replace(/_/g, " "));
        } else if (m.type === "done") {
          flushSpeech();
        } else if (m.type === "error") {
          current = null;
          add("error", "⚠ " + m.text);
        }
      }
    }
    flushSpeech();
  } catch (err) {
    add("error", "⚠ Request failed: " + err.message);
  }
  send.disabled = false;
  mic.disabled = false;
  box.focus();
}

document.getElementById("f").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = box.value.trim();
  if (!text || send.disabled) return;
  add("user", text);
  box.value = "";
  ask(text);
});

// ── Microphone / Speech Recognition ──────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SR) {
  mic.title = "Tu navegador no soporta grabación de voz";
  mic.disabled = true;
  mic.style.opacity = ".3";
} else {
  const recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let isRecording = false;
  let interimDiv = null;

  mic.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
    } else {
      synth.cancel();   // stop professor while user speaks
      try { recognition.start(); } catch (e) { /* already started */ }
    }
  });

  recognition.onstart = () => {
    isRecording = true;
    mic.classList.add("recording");
    mic.textContent = "⏹";
    mic.title = "Detener grabación";
    interimDiv = add("user audio-bubble", "🎤 …");
  };

  recognition.onresult = (e) => {
    let interim = "", final = "";
    for (const r of e.results) {
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interimDiv) interimDiv.textContent = "🎤 " + (final || interim);
  };

  recognition.onend = () => {
    isRecording = false;
    mic.classList.remove("recording");
    mic.textContent = "🎤";
    mic.title = "Grabar audio";
    const transcript = interimDiv ? interimDiv.textContent.replace(/^🎤 /, "").trim() : "";
    interimDiv = null;
    if (!transcript || transcript === "…") return;
    ask('[🎤 audio: "' + transcript + '"]');
  };

  recognition.onerror = (e) => {
    isRecording = false;
    mic.classList.remove("recording");
    mic.textContent = "🎤";
    if (interimDiv) { interimDiv.remove(); interimDiv = null; }
    if (e.error !== "aborted" && e.error !== "no-speech")
      add("error", "⚠ Micrófono: " + e.error);
  };
}

window.addEventListener("load", async () => {
  const sysMsg = document.querySelector(".sys");
  if (sysMsg) sysMsg.remove();
  await ask("__greet__");
  box.focus();
});
</script>
</body>
</html>`;
