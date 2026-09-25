/**
 * Wallpaper canvas — visual only. Motion freeze follows mission pause OR user toggle.
 */
export function createWallpaper({ canvas, stage, sakuraBranch, getSceneState, isMotionStopped }) {
  const ctx = canvas.getContext("2d");
  let w = 1000;
  let h = 800;
  let dpr = 1;
  let lastPaint = 0;
  let px = 0;
  let py = 0;
  let targetX = 0;
  let targetY = 0;
  let paper = null;
  let time = 0;
  let tint = 0;
  let effectStart = -20;
  let raf = 0;

  const random = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  function makePaper() {
    paper = document.createElement("canvas");
    paper.width = 320;
    paper.height = 320;
    const pc = paper.getContext("2d");
    for (let i = 0; i < 6500; i++) {
      pc.fillStyle = i % 3 === 0 ? "rgba(255,255,248,.28)" : "rgba(104,99,80,.035)";
      pc.fillRect(random(i) * 320, random(i + 9400) * 320, i % 7 === 0 ? 2 : 1, 1);
    }
  }
  makePaper();

  const ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    w = r.width;
    h = r.height;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  ro.observe(stage);

  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    targetX = (e.clientX - r.left) / w - 0.5;
    targetY = (e.clientY - r.top) / h - 0.5;
  });
  stage.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });

  function stone(x, y, size, angle, variant) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const shadow = ctx.createRadialGradient(
      size * 0.18,
      size * 0.26,
      size * 0.2,
      size * 0.17,
      size * 0.2,
      size * 1.65,
    );
    shadow.addColorStop(0, "rgba(43,45,33,.26)");
    shadow.addColorStop(0.42, "rgba(63,64,44,.12)");
    shadow.addColorStop(1, "rgba(65,65,48,0)");
    ctx.fillStyle = shadow;
    ctx.save();
    ctx.scale(1.14, 0.72);
    ctx.fillRect(-size * 1.9, -size * 1.9, size * 3.8, size * 3.8);
    ctx.restore();
    const shape = new Path2D();
    shape.moveTo(-size * 0.95, -size * 0.1);
    shape.bezierCurveTo(-size * 0.95, -size * 0.72, -size * 0.45, -size * 0.91, size * 0.15, -size * 0.77);
    shape.bezierCurveTo(size * 0.82, -size * 0.76, size * 1.08, -size * 0.35, size * 0.9, size * 0.22);
    shape.bezierCurveTo(size * 0.68, size * 0.79, -size * 0.05, size * 0.82, -size * 0.65, size * 0.48);
    shape.bezierCurveTo(-size * 0.9, size * 0.3, -size * 0.98, size * 0.15, -size * 0.95, -size * 0.1);
    const fill = ctx.createRadialGradient(-size * 0.36, -size * 0.56, 0, size * 0.1, size * 0.15, size * 1.6);
    fill.addColorStop(0, variant === 0 ? "#64766a" : "#5b6e60");
    fill.addColorStop(0.35, "#344b3e");
    fill.addColorStop(0.72, "#1e342b");
    fill.addColorStop(1, "#142a22");
    ctx.fillStyle = fill;
    ctx.fill(shape);
    ctx.save();
    ctx.clip(shape);
    for (let i = 0; i < 300; i++) {
      const xx = (random(i + variant * 700) - 0.5) * size * 2.1;
      const yy = (random(i + 1234) - 0.5) * size * 2;
      ctx.fillStyle = i % 3 === 0 ? "rgba(224,224,202,.065)" : "rgba(13,24,16,.05)";
      ctx.beginPath();
      ctx.arc(xx, yy, random(i + 800) * 1.1 + 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(205,212,189,.085)";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-size, size * (i * 0.18 - 0.45));
      ctx.bezierCurveTo(-size * 0.2, size * (i * 0.12 - 0.25), size * 0.22, size * (i * 0.1 - 0.65), size, size * (i * 0.14 - 0.35));
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  function petal(x, y, size, rotation, opacity, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(0.6 + Math.abs(Math.sin(rotation * 0.8)) * 0.4, 1);
    ctx.globalAlpha = opacity;
    const fill = ctx.createLinearGradient(-size, -size, size, size);
    fill.addColorStop(0, "#f8d6df");
    fill.addColorStop(0.55, "#d58ba3");
    fill.addColorStop(1, "#ac597b");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.8);
    ctx.bezierCurveTo(-size * 1.2, 0, -size * 0.8, -size, 0, -size * 0.7);
    ctx.bezierCurveTo(size * 0.9, -size * 0.95, size * 1.15, 0, 0, size * 0.8);
    ctx.fill();
    ctx.strokeStyle = "#ba769044";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.7);
    ctx.quadraticCurveTo(-size * 0.1, 0, seed * size * 0.2, -size * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (document.hidden) return;
    const state = getSceneState();
    const missionPaused = state === "paused" || state === "pause_requested";
    const frozen = isMotionStopped() || missionPaused;
    if (now - lastPaint < 1000 / (frozen ? 8 : 30)) return;
    const elapsed = (now - lastPaint) / 1000;
    lastPaint = now;
    const running = !frozen;
    if (running) time += Math.min(elapsed, 0.08);
    if (!ctx) return;
    if (running) {
      px += (targetX - px) * 0.025;
      py += (targetY - py) * 0.025;
    }
    sakuraBranch.style.transform = `rotate(${Math.sin(time * 0.18) * 0.7}deg) translateY(${Math.sin(time * 0.12) * 2}px)`;
    tint += ((state === "conflict" || missionPaused ? 1 : 0) - tint) * 0.03;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ctx.createPattern(paper, "repeat");
    ctx.fillRect(0, 0, w, h);
    const mobile = w < 650;
    const unit = Math.min(w * 0.065, h * 0.078);
    const stones = [
      { x: w * 0.69 + px * 6, y: h * (mobile ? 0.265 : 0.3) + py * 4, s: unit * 1.15, angle: -0.34 },
      { x: w * 0.49 + px * 4, y: h * (mobile ? 0.33 : 0.4) + py * 3, s: unit * 0.68, angle: 0.2 },
      { x: w * 0.81 + px * 3, y: h * (mobile ? 0.36 : 0.4) + py * 2, s: unit * 0.43, angle: -0.55 },
    ];
    const ink =
      state === "complete"
        ? [85, 112, 81]
        : [106 + Math.round(tint * 50), 119 - Math.round(tint * 40), 89 - Math.round(tint * 27)];
    for (let base = 36; base < h * 0.69; base += 5.4) {
      ctx.beginPath();
      const edge = Math.sin(Math.min(1, base / (h * 0.7)) * Math.PI);
      for (let x = -10; x <= w + 12; x += 7) {
        let y = base + Math.sin((x / w) * 5.1 + time * 0.065 + base * 0.008) * 9;
        for (const st of stones) {
          const dy = base - st.y;
          y +=
            Math.exp(-Math.pow((x - st.x) / (st.s * 3.8), 2)) *
            Math.exp(-Math.abs(dy) / (st.s * 2.7)) *
            st.s *
            1.25 *
            Math.tanh(dy / (st.s * 0.3));
        }
        y += Math.sin(x * 0.006 + base * 0.017 - time * 0.12) * 2.8;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${ink.join(",")},${0.065 + edge * 0.18})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    stones.forEach((st, index) => {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.angle * 0.3);
      for (let ring = 0; ring < 18; ring++) {
        const radius = st.s * 1.2 + ring * 5.6 + Math.sin(time * 0.11 + index) * 2.2;
        const alpha = 0.29 * (1 - ring / 19);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * Math.PI * 2;
          const r = radius + Math.sin(a * 3 + index + time * 0.04) * 1.2;
          const xx = Math.cos(a) * r * 1.27;
          const yy = Math.sin(a) * r * 0.79;
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.strokeStyle = `rgba(${ink.join(",")},${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();
    });
    stones.forEach((st, i) => stone(st.x, st.y, st.s, st.angle, i));
    for (let i = 0; i < 19; i++) {
      const x = w * (0.36 + random(i + 2001) * 0.58);
      const y = h * (0.22 + random(i + 2121) * 0.31);
      petal(x, y, (mobile ? 2.5 : 3.5) + random(i + 2712) * 2.7, random(i + 2424) * Math.PI * 2, 0.5 + random(i + 1511) * 0.3, random(i + 151));
    }
    for (let i = 0; i < (mobile ? 9 : 16); i++) {
      const duration = 30 + random(i + 181) * 20;
      const progress = (time / duration + random(i + 313)) % 1;
      const x = w * (0.49 + random(i + 503) * 0.57 - progress * 0.23) + Math.sin(time * 0.2 + i * 1.7) * (mobile ? 12 : 28);
      const y = -25 + progress * h * 0.69;
      const fade = Math.min(1, progress * 9) * (1 - Math.max(0, (progress - 0.78) / 0.22));
      petal(x, y, (mobile ? 3 : 4) + random(i + 1641) * 3.8, time * (0.15 + random(i + 229) * 0.15) + i, fade * 0.86, random(i + 1022));
    }
    const age = time - effectStart;
    if (age >= 0 && age < 5) {
      const st = stones[0];
      ctx.beginPath();
      ctx.ellipse(st.x, st.y, st.s * (1.8 + age * 0.42), st.s * (1.2 + age * 0.27), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ink.join(",")},${(1 - age / 5) * 0.3})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  return {
    start() {
      raf = requestAnimationFrame(draw);
    },
    pulse() {
      effectStart = time;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}
