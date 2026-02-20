// app.js

// -----------------------------
// Sound (toggle-controlled)
// -----------------------------
let audioCtx = null;
let soundEnabled = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function updateSoundUI() {
  const btn = document.getElementById("soundToggle");
  const icon = document.getElementById("soundIcon");
  if (!btn || !icon) return;

  if (soundEnabled) {
    icon.className = "fa-solid fa-volume-high";
    btn.setAttribute("aria-label", "Sound on");
  } else {
    icon.className = "fa-solid fa-volume-xmark";
    btn.setAttribute("aria-label", "Sound off");
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("soundEnabled", String(soundEnabled));

  if (soundEnabled) initAudio();
  updateSoundUI();
}

function loadSoundPref() {
  soundEnabled = localStorage.getItem("soundEnabled") === "true";
  if (soundEnabled) initAudio(); // only init if previously enabled
  updateSoundUI();
}

function playShootingStarSound() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  const duration = 0.35;
  const now = audioCtx.currentTime;

  // Create white noise buffer
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  // Filter to make it airy
  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.8;

  // Gain envelope (subtle by default)
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(audioCtx.destination);

  noise.start(now);
  noise.stop(now + duration);
}

// Hook up toggle (no “first click to init audio” needed)
document.addEventListener("DOMContentLoaded", () => {
  loadSoundPref();

  const btn = document.getElementById("soundToggle");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSound();
    });
  }
});

// -----------------------------
// Canvas + Starfield
// -----------------------------
const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d", { alpha: true });

let stars = [];
let rafId = null;

// Tune these
const STAR_COUNT = 180;
const SPEED = 0.02; // gentle drift
const TWINKLE_MIN = 0.002;
const TWINKLE_MAX = 0.008;

// Rocket tuning
const ROCKET_MIN_SPEED = 420; // px/sec
const ROCKET_MAX_SPEED = 780; // px/sec
const ROCKET_MIN_VANISH = 350; // ms
const ROCKET_MAX_VANISH = 1100; // ms

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function initStars() {
  stars = Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: rand(0.4, 1.4),
    a: rand(0.25, 0.9),
    tw: rand(TWINKLE_MIN, TWINKLE_MAX) * (Math.random() < 0.5 ? -1 : 1),
    vy: rand(0.0, SPEED),
  }));
}

// -----------------------------
// Rocket
// -----------------------------
const rocket = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  scale: 1,
  alpha: 1,
  trailLen: 200,
  drift: 0,
  visible: true,
  respawnAt: 0,
};

function resetRocket(exitSide) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const margin = 90;

  const spawnSide = exitSide === "left" ? "right" : "left";

  rocket.x = spawnSide === "left" ? -margin : w + margin;
  rocket.y = rand(h * 0.12, h * 0.88);

  const speed = rand(ROCKET_MIN_SPEED, ROCKET_MAX_SPEED);

  const angle =
    spawnSide === "left"
      ? rand(-0.35, 0.35)
      : rand(Math.PI - 0.35, Math.PI + 0.35);

  rocket.vx = Math.cos(angle) * speed;
  rocket.vy = Math.sin(angle) * speed;

  rocket.scale = rand(0.65, 1.2);
  rocket.alpha = rand(0.6, 1.0);
  rocket.trailLen = rand(140, 260);
  rocket.drift = rand(-25, 25);

  rocket.visible = true;
}

function updateRocket(dt, now) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (!rocket.visible) {
    if (now >= rocket.respawnAt) {
      const nextExit = Math.random() < 0.5 ? "left" : "right";
      resetRocket(nextExit);
    }
    return;
  }

  rocket.vy += rocket.drift * dt * 0.15;
  rocket.x += rocket.vx * dt;
  rocket.y += rocket.vy * dt;

  if (rocket.y < -120) rocket.y = h + 120;
  if (rocket.y > h + 120) rocket.y = -120;

  const margin = 130;
  if (rocket.x < -margin || rocket.x > w + margin) {
    rocket.visible = false;
    rocket.respawnAt = now + rand(ROCKET_MIN_VANISH, ROCKET_MAX_VANISH);
  }
}

function drawRocket() {
  if (!rocket.visible) return;

  ctx.save();
  ctx.globalAlpha = rocket.alpha;

  const angle = Math.atan2(rocket.vy, rocket.vx);

  const tx = rocket.x - Math.cos(angle) * rocket.trailLen * rocket.scale;
  const ty = rocket.y - Math.sin(angle) * rocket.trailLen * rocket.scale;

  const grad = ctx.createLinearGradient(tx, ty, rocket.x, rocket.y);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(255,255,255,0.85)");

  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.2 * rocket.scale;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(rocket.x, rocket.y);
  ctx.stroke();

  ctx.translate(rocket.x, rocket.y);
  ctx.rotate(angle);

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(14 * rocket.scale, 0);
  ctx.lineTo(-10 * rocket.scale, -6 * rocket.scale);
  ctx.lineTo(-10 * rocket.scale, 6 * rocket.scale);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,200,80,0.9)";
  ctx.beginPath();
  ctx.moveTo(-10 * rocket.scale, 0);
  ctx.lineTo(-18 * rocket.scale, -3.2 * rocket.scale);
  ctx.lineTo(-18 * rocket.scale, 3.2 * rocket.scale);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// -----------------------------
// UFO
// -----------------------------
const ufo = {
  x: 0,
  y: 0,
  vx: 0,
  baseY: 0,
  amp: 0,
  freq: 0,
  phase: 0,
  scale: 1,
  alpha: 1,
  visible: true,
  respawnAt: 0,
  beamUntil: 0,
};

function resetUFO(spawnSide) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const margin = 120;

  ufo.x = spawnSide === "left" ? -margin : w + margin;

  ufo.baseY = rand(h * 0.10, h * 0.28);
  ufo.amp = rand(10, 26);
  ufo.freq = rand(0.9, 1.6);
  ufo.phase = rand(0, Math.PI * 2);

  const speed = rand(140, 260);
  ufo.vx = spawnSide === "left" ? speed : -speed;

  ufo.scale = rand(0.7, 1.1);
  ufo.alpha = rand(0.55, 0.9);

  ufo.visible = true;
  ufo.beamUntil = 0;
}

function updateUFO(dt, now) {
  const w = window.innerWidth;

  if (!ufo.visible) {
    if (now >= ufo.respawnAt) {
      resetUFO(Math.random() < 0.5 ? "left" : "right");
    }
    return;
  }

  ufo.x += ufo.vx * dt;
  ufo.phase += ufo.freq * dt * 2.0;
  ufo.y = ufo.baseY + Math.sin(ufo.phase) * ufo.amp;

  if (ufo.beamUntil < now && Math.random() < 0.002) {
    ufo.beamUntil = now + rand(180, 420);
  }

  const margin = 140;
  if (ufo.x < -margin || ufo.x > w + margin) {
    ufo.visible = false;
    ufo.respawnAt = now + rand(600, 1500);
  }

  // Random mid-flight warp (kept, as you liked it)
  if (Math.random() < 0.0009) {
    ufo.visible = false;
    ufo.respawnAt = now + rand(400, 1200);
  }
}

function drawUFO() {
  if (!ufo.visible) return;

  const now = performance.now();
  ctx.save();
  ctx.globalAlpha = ufo.alpha;

  // light blue glow
  ctx.shadowBlur = 26 * ufo.scale;
  ctx.shadowColor = "rgba(80,170,255,0.65)";

  const x = ufo.x;
  const y = ufo.y;

  // Beam
  if (ufo.beamUntil > now) {
    const beamW = 90 * ufo.scale;
    const beamH = 260 * ufo.scale;

    const g = ctx.createLinearGradient(x, y + 18 * ufo.scale, x, y + beamH);
    g.addColorStop(0, "rgba(120,190,255,0.0)");
    g.addColorStop(0.35, "rgba(120,190,255,0.22)");
    g.addColorStop(1, "rgba(120,190,255,0.0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - beamW * 0.25, y + 18 * ufo.scale);
    ctx.lineTo(x + beamW * 0.25, y + 18 * ufo.scale);
    ctx.lineTo(x + beamW * 0.52, y + beamH);
    ctx.lineTo(x - beamW * 0.52, y + beamH);
    ctx.closePath();
    ctx.fill();
  }

  // Saucer body
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ellipse(ctx, x, y, 42 * ufo.scale, 14 * ufo.scale);
  ctx.fill();

  // Dome
  ctx.fillStyle = "rgba(200,235,255,0.55)";
  ctx.beginPath();
  ellipse(ctx, x, y - 10 * ufo.scale, 18 * ufo.scale, 10 * ufo.scale);
  ctx.fill();

  // Rim
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5 * ufo.scale;
  ctx.beginPath();
  ellipse(ctx, x, y + 1 * ufo.scale, 48 * ufo.scale, 16 * ufo.scale);
  ctx.stroke();

  // lights
  const lights = 5;
  for (let i = 0; i < lights; i++) {
    const t = (i / (lights - 1)) * 2 - 1;
    const lx = x + t * 30 * ufo.scale;
    const ly = y + 6 * ufo.scale;

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(lx, ly, 2.2 * ufo.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function ellipse(ctx2, cx, cy, rx, ry) {
  ctx2.save();
  ctx2.translate(cx, cy);
  ctx2.scale(rx, ry);
  ctx2.beginPath();
  ctx2.arc(0, 0, 1, 0, Math.PI * 2);
  ctx2.restore();
}

// -----------------------------
// Shooting star (occasional)
// -----------------------------
const shootingStar = {
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  length: 0,
  alpha: 1,
};

function spawnShootingStar() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  shootingStar.x = rand(w * 0.2, w * 0.8);
  shootingStar.y = rand(0, h * 0.25);

  const angle = rand(Math.PI * 0.2, Math.PI * 0.35);
  const speed = rand(900, 1400);

  shootingStar.vx = Math.cos(angle) * speed;
  shootingStar.vy = Math.sin(angle) * speed;

  shootingStar.length = rand(120, 220);
  shootingStar.alpha = 1;
  shootingStar.active = true;

  playShootingStarSound(); // gated by toggle
}

function updateShootingStar(dt) {
  if (!shootingStar.active) {
    // rare spawn chance per frame
    if (Math.random() < 0.0008) spawnShootingStar();
    return;
  }

  shootingStar.x += shootingStar.vx * dt;
  shootingStar.y += shootingStar.vy * dt;

  shootingStar.alpha -= dt * 1.4;

  if (
    shootingStar.alpha <= 0 ||
    shootingStar.x > window.innerWidth + 200 ||
    shootingStar.y > window.innerHeight + 200
  ) {
    shootingStar.active = false;
  }
}

function drawShootingStar() {
  if (!shootingStar.active) return;

  ctx.save();
  ctx.globalAlpha = shootingStar.alpha;

  const angle = Math.atan2(shootingStar.vy, shootingStar.vx);
  const tailX = shootingStar.x - Math.cos(angle) * shootingStar.length;
  const tailY = shootingStar.y - Math.sin(angle) * shootingStar.length;

  const gradient = ctx.createLinearGradient(
    tailX,
    tailY,
    shootingStar.x,
    shootingStar.y
  );
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(1, "rgba(255,255,255,0.95)");

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(shootingStar.x, shootingStar.y);
  ctx.stroke();

  ctx.restore();
}

// -----------------------------
// Main loop
// -----------------------------
let lastTs = performance.now();

function draw(now = performance.now()) {
  const dt = Math.min(0.033, (now - lastTs) / 1000);
  lastTs = now;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // stars
  for (const s of stars) {
    s.a += s.tw;
    if (s.a <= 0.15 || s.a >= 0.95) s.tw *= -1;

    s.y += s.vy;
    if (s.y > window.innerHeight + 2) {
      s.y = -2;
      s.x = Math.random() * window.innerWidth;
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.fill();
  }

  // shooting star
  updateShootingStar(dt);
  drawShootingStar();

  // rocket
  updateRocket(dt, now);
  drawRocket();

  // ufo
  updateUFO(dt, now);
  drawUFO();

  rafId = requestAnimationFrame(draw);
}

function start() {
  cancelAnimationFrame(rafId);
  resize();
  initStars();

  resetRocket(Math.random() < 0.5 ? "left" : "right");
  resetUFO(Math.random() < 0.5 ? "left" : "right");

  lastTs = performance.now();
  draw();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else {
    lastTs = performance.now();
    draw();
  }
});

window.addEventListener("resize", start);

// -----------------------------
// Accordion - auto close others
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  const accordions = document.querySelectorAll(".acc");

  accordions.forEach((acc) => {
    acc.addEventListener("toggle", () => {
      if (acc.open) {
        accordions.forEach((other) => {
          if (other !== acc) {
            other.open = false;
          }
        });
      }
    });
  });
});

start();
