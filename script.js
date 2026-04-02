// ── Sound definitions ──────────────────────────────────────────────
// To add a sound:
//   1. Drop the .mp3 file into the /sounds/ folder
//   2. Add an entry here with the filename, label, emoji, and optional key binding
//
// key: single character for keyboard shortcut (optional)

const SOUNDS = [
  { file: "fah.mp3",          label: "Fah",         emoji: "😤", key: "1" },
  { file: "joojoojoojoo.mp3", label: "Joo Joo Joo", emoji: "🎵", key: "2" },
  { file: "bruh.mp3",         label: "Bruh",        emoji: "😐", key: "3" },
  { file: "tuco-get-out.mp3", label: "Get out",     emoji: "🚪", key: "4" },
];

// ── DOM ────────────────────────────────────────────────────────────
const volumeEl = document.getElementById("volume");
const bassEl = document.getElementById("fxBass");
const trebleEl = document.getElementById("fxTreble");
const midEl = document.getElementById("fxMid");
const speedEl = document.getElementById("fxSpeed");
const bassVal = document.getElementById("fxBassVal");
const trebleVal = document.getElementById("fxTrebleVal");
const midVal = document.getElementById("fxMidVal");
const speedVal = document.getElementById("fxSpeedVal");
const fxSubEl = document.querySelector(".fx-sub");

// ── State ──────────────────────────────────────────────────────────
/** @type {Map<string, HTMLAudioElement>} */
const activeSounds = new Map();

let audioContext = null;
/** After a failed graph build, use classic audio.volume for all clips */
let webAudioGloballyDisabled = false;

function getAudioContext() {
  if (!audioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioContext = new AC();
  }
  return audioContext;
}

async function ensureAudioRunning() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
}

/**
 * Opening index.html as file:// makes many browsers output silence through
 * MediaElementAudioSourceNode. Use normal element playback there.
 */
function shouldAttemptWebAudioGraph() {
  if (webAudioGloballyDisabled) return false;
  if (window.location.protocol === "file:") return false;
  return true;
}

function updateFxModeHint() {
  if (!fxSubEl) return;
  const base = "Biquad chain · live on every pad";
  if (webAudioGloballyDisabled) {
    fxSubEl.textContent = `${base} · EQ off (normal playback)`;
  } else if (window.location.protocol === "file:") {
    fxSubEl.textContent = `${base} · EQ when served over http — open via local server for bass/treble`;
  } else {
    fxSubEl.textContent = base;
  }
}
updateFxModeHint();

/** Wait until the element can play (needed before createMediaElementSource on some browsers). */
function waitUntilCanPlay(audio) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOk = () => {
      audio.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      audio.removeEventListener("canplay", onOk);
      reject(new Error("audio load error"));
    };
    audio.addEventListener("canplay", onOk, { once: true });
    audio.addEventListener("error", onErr, { once: true });
  });
}

/**
 * Wire MediaElementSource once per element; bass → treble → mid → gain → out.
 * Returns null when using native-only playback (volume on the element).
 */
async function attachAudioOutput(audio) {
  if (audio.__outputMode === "graph") return audio.__fx;
  if (audio.__outputMode === "native") {
    audio.volume = parseFloat(volumeEl.value);
    return null;
  }

  if (!shouldAttemptWebAudioGraph()) {
    audio.volume = parseFloat(volumeEl.value);
    audio.__outputMode = "native";
    return null;
  }

  try {
    await waitUntilCanPlay(audio);
    await ensureAudioRunning();

    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(audio);

    const bass = ctx.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 180;
    bass.Q.value = 0.85;

    const treble = ctx.createBiquadFilter();
    treble.type = "highshelf";
    treble.frequency.value = 3200;
    treble.Q.value = 0.7;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 900;
    mid.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.value = parseFloat(volumeEl.value);

    source.connect(bass);
    bass.connect(treble);
    treble.connect(mid);
    mid.connect(gain);
    gain.connect(ctx.destination);

    audio.volume = 1;
    audio.__fx = { bass, treble, mid, gain };
    audio.__outputMode = "graph";
    applyFxToNodes(audio.__fx);
    return audio.__fx;
  } catch (e) {
    console.warn("Soundboard: Web Audio graph failed, using normal playback.", e);
    webAudioGloballyDisabled = true;
    updateFxModeHint();
    audio.volume = parseFloat(volumeEl.value);
    audio.__outputMode = "native";
    audio.__fx = undefined;
    return null;
  }
}

function applyFxToNodes(fx) {
  if (!fx) return;
  fx.bass.gain.value = parseFloat(bassEl.value);
  fx.treble.gain.value = parseFloat(trebleEl.value);
  fx.mid.gain.value = parseFloat(midEl.value);
}

function applyVolumeToAll() {
  const v = parseFloat(volumeEl.value);
  activeSounds.forEach((audio) => {
    if (audio.__outputMode === "graph" && audio.__fx?.gain) {
      audio.__fx.gain.gain.value = v;
    } else {
      audio.volume = v;
    }
  });
}

function applySpeedToAll() {
  const s = parseFloat(speedEl.value);
  activeSounds.forEach((audio) => {
    audio.playbackRate = s;
  });
}

function syncFxReadouts() {
  const fmtDb = (n) => (n >= 0 ? `+${n}` : `${n}`) + " dB";
  bassVal.textContent = fmtDb(parseFloat(bassEl.value));
  trebleVal.textContent = fmtDb(parseFloat(trebleEl.value));
  midVal.textContent = fmtDb(parseFloat(midEl.value));
  speedVal.textContent = `${parseFloat(speedEl.value).toFixed(2)}×`;
}

function refreshAllFxNodes() {
  activeSounds.forEach((audio) => {
    if (audio.__fx) applyFxToNodes(audio.__fx);
  });
  syncFxReadouts();
}

// ── Presets (dB values + speed) ────────────────────────────────────
const PRESETS = {
  flat: { bass: 0, treble: 0, mid: 0, speed: 1 },
  bass: { bass: 10, treble: -2, mid: 2, speed: 1 },
  bright: { bass: -3, treble: 8, mid: 1, speed: 1 },
  radio: { bass: 4, treble: 5, mid: -4, speed: 1.02 },
  night: { bass: 12, treble: 3, mid: 4, speed: 0.95 },
};

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-preset");
    const p = PRESETS[id];
    if (!p) return;
    bassEl.value = String(p.bass);
    trebleEl.value = String(p.treble);
    midEl.value = String(p.mid);
    speedEl.value = String(p.speed);
    refreshAllFxNodes();
    applySpeedToAll();
    document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ── Build the board ────────────────────────────────────────────────
const board = document.getElementById("soundboard");

SOUNDS.forEach(({ file, label, emoji, key }) => {
  const btn = document.createElement("button");
  btn.className = "sound-btn";
  btn.dataset.file = file;

  btn.innerHTML = `
    ${key ? `<span class="key-hint">${key.toUpperCase()}</span>` : ""}
    <span class="emoji">${emoji}</span>
    <span class="label">${label}</span>
  `;

  const probe = new Audio(`sounds/${file}`);
  probe.preload = "metadata";
  probe.addEventListener("error", () => {
    btn.classList.add("missing");
    btn.insertAdjacentHTML("beforeend", `<span class="missing-badge">NO FILE</span>`);
  });

  btn.addEventListener("click", () => playSound(btn));
  board.appendChild(btn);
});

// ── Playback ───────────────────────────────────────────────────────
function resetAudio(audio) {
  audio.pause();
  audio.currentTime = 0;
}

async function playSound(btn) {
  if (btn.classList.contains("missing")) return;

  await ensureAudioRunning();

  const file = btn.dataset.file;

  if (activeSounds.has(file)) {
    const audio = activeSounds.get(file);
    resetAudio(audio);
    await attachAudioOutput(audio);
    audio.playbackRate = parseFloat(speedEl.value);
    audio.play().catch(() => {});
    return;
  }

  const audio = new Audio(`sounds/${file}`);
  activeSounds.set(file, audio);
  btn.classList.add("playing");
  btn.classList.remove("played");

  try {
    await attachAudioOutput(audio);
  } catch {
    activeSounds.delete(file);
    btn.classList.remove("playing");
    btn.classList.add("missing");
    return;
  }

  audio.playbackRate = parseFloat(speedEl.value);

  function stopAudio() {
    activeSounds.delete(file);
    btn.classList.remove("playing");
    btn.classList.add("played");
  }

  audio.addEventListener("ended", stopAudio, { once: true });

  audio.play().catch(() => {
    btn.classList.add("missing");
    activeSounds.delete(file);
    btn.classList.remove("playing");
  });
}

// ── Stop All ───────────────────────────────────────────────────────
document.getElementById("stopAll").addEventListener("click", () => {
  activeSounds.forEach(resetAudio);
  activeSounds.clear();
  document.querySelectorAll(".sound-btn.playing, .sound-btn.played").forEach((b) =>
    b.classList.remove("playing", "played")
  );
});

// ── Keyboard shortcuts ─────────────────────────────────────────────
const keyMap = {};
SOUNDS.forEach(({ file, key }) => {
  if (key) keyMap[key.toLowerCase()] = file;
});

document.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  const file = keyMap[e.key.toLowerCase()];
  if (!file) return;

  const btn = document.querySelector(`.sound-btn[data-file="${file}"]`);
  if (btn) playSound(btn);
});

// ── Volume & FX sliders ───────────────────────────────────────────
volumeEl.addEventListener("input", applyVolumeToAll);

function clearPresetActive() {
  document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
}

[bassEl, trebleEl, midEl].forEach((el) => {
  el.addEventListener("input", () => {
    clearPresetActive();
    refreshAllFxNodes();
  });
});

speedEl.addEventListener("input", () => {
  clearPresetActive();
  syncFxReadouts();
  applySpeedToAll();
});

syncFxReadouts();
