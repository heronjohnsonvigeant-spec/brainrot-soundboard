// ── Sound definitions ──────────────────────────────────────────────
// To add a sound:
//   1. Drop the .mp3 file into the /sounds/ folder
//   2. Add an entry here with the filename, label, emoji, and optional key binding
//
// key: single character for keyboard shortcut (optional)

const SOUNDS = [
  { file: "fah.mp3",          label: "Fah",         emoji: "😤", key: "1" },
  { file: "joojoojoojoo.mp3", label: "Joo Joo Joo", emoji: "🎵", key: "2" },
];

// ── State ──────────────────────────────────────────────────────────
const activeSounds = new Map(); // file → HTMLAudioElement
const volumeEl = document.getElementById("volume");

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

  // Check if audio file exists by attempting to load it
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

function playSound(btn) {
  if (btn.classList.contains("missing")) return;

  const file = btn.dataset.file;

  // If currently playing: restart from beginning
  if (activeSounds.has(file)) {
    resetAudio(activeSounds.get(file));
    activeSounds.get(file).play().catch(() => {});
    return;
  }

  const audio = new Audio(`sounds/${file}`);
  audio.volume = parseFloat(volumeEl.value);
  activeSounds.set(file, audio);
  btn.classList.add("playing");
  btn.classList.remove("played");

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
  // Don't fire if user is typing in an input
  if (e.target.tagName === "INPUT") return;

  const file = keyMap[e.key.toLowerCase()];
  if (!file) return;

  const btn = document.querySelector(`.sound-btn[data-file="${file}"]`);
  if (btn) playSound(btn);
});

// ── Volume sync ────────────────────────────────────────────────────
volumeEl.addEventListener("input", () => {
  const vol = parseFloat(volumeEl.value);
  activeSounds.forEach((audio) => (audio.volume = vol));
});
