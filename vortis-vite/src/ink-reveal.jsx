"use client";
import { useEffect, useRef, useCallback } from "react";

export default function InkReveal({
  maskColor = [3, 3, 10],
  brushSize = 200,
  lifetime = 700,
  rStart = 16,
  rVary = 0.3,
  stampStep = 5,
  maxStamps = 300,
  segments = 36,
  wobble = [0.08, 0.05, 0.03],
  gradientInnerRadius = 0.22,
  gradientStops = [1.0, 0.9, 0],
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const stampsRef = useRef([]);
  const runningRef = useRef(false);
  const lastPosRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });

  const mc = maskColor;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    dimsRef.current = { w, h };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${mc[0]},${mc[1]},${mc[2]})`;
    ctx.fillRect(0, 0, w, h);
  }, [mc]);

  // stretches the blob along `angle` by `stretch` (1 = round, >1 = elongated streak)
  const carveInk = useCallback(
    (ctx, x, y, r, seed, alpha, angle = 0, stretch = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const g = ctx.createRadialGradient(0, 0, r * gradientInnerRadius, 0, 0, r);
      g.addColorStop(0, `rgba(0,0,0,${gradientStops[0] * alpha})`);
      g.addColorStop(0.5, `rgba(0,0,0,${gradientStops[1] * alpha})`);
      g.addColorStop(1, `rgba(0,0,0,${gradientStops[2] * alpha})`);
      ctx.fillStyle = g;

      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const wob =
          0.78 +
          wobble[0] * Math.sin(a * 3 + seed) +
          wobble[1] * Math.sin(a * 5 + seed * 2.1) +
          wobble[2] * Math.sin(a * 7 + seed * 0.7);
        // elongate along local x-axis (the direction of travel), keep y round
        const px = Math.cos(a) * r * wob * stretch;
        const py = Math.sin(a) * r * wob;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    [segments, wobble, gradientInnerRadius, gradientStops]
  );

  const addStamp = useCallback(
    (x, y, angle, stretch) => {
      const stamps = stampsRef.current;
      if (stamps.length >= maxStamps) stamps.shift();
      stamps.push({
        x, y,
        born: performance.now(),
        seed: Math.random() * Math.PI * 2,
        rmax: brushSize * (1 - rVary + Math.random() * rVary),
        angle, stretch,
        life: lifetime * (0.85 + Math.random() * 0.3), // slight variance = organic bleed timing
      });

      // occasional small droplet spatter off to the side of the stroke — mimics ink flicking
      if (Math.random() < 0.22) {
        const spread = (Math.random() - 0.5) * Math.PI * 0.9;
        const dist = brushSize * (0.3 + Math.random() * 0.5);
        const dx = Math.cos(angle + Math.PI / 2 + spread) * dist * 0.4;
        const dy = Math.sin(angle + Math.PI / 2 + spread) * dist * 0.4;
        stamps.push({
          x: x + dx, y: y + dy,
          born: performance.now(),
          seed: Math.random() * Math.PI * 2,
          rmax: brushSize * (0.12 + Math.random() * 0.18),
          angle: Math.random() * Math.PI * 2, stretch: 1,
          life: lifetime * (0.5 + Math.random() * 0.4),
        });
      }
    },
    [brushSize, rVary, maxStamps, lifetime]
  );

  const stampAlong = useCallback(
    (x, y) => {
      const last = lastPosRef.current;
      const now = performance.now();
      const dt = Math.max(16, now - lastTimeRef.current);
      lastTimeRef.current = now;

      if (!last) {
        addStamp(x, y, 0, 1);
      } else {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.hypot(dx, dy);
        const speed = dist / dt; // px per ms
        const angle = Math.atan2(dy, dx);
        // faster movement -> more elongated streak, capped so it doesn't look like a line
        const stretch = Math.min(2.2, 1 + speed * 3.5);

        const steps = Math.max(1, Math.ceil(dist / stampStep));
        for (let i = 1; i <= steps; i++) {
          addStamp(
            last.x + (dx * i) / steps,
            last.y + (dy * i) / steps,
            angle,
            stretch
          );
        }
      }
      lastPosRef.current = { x, y };
    },
    [addStamp, stampStep]
  );

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = dimsRef.current;
    const now = performance.now();
    const stamps = stampsRef.current;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${mc[0]},${mc[1]},${mc[2]})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";

    for (let i = stamps.length - 1; i >= 0; i--) {
      const s = stamps[i];
      const t = (now - s.born) / s.life;
      if (t >= 1) {
        stamps.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      const r = rStart + (s.rmax - rStart) * ease;
      const alpha = 1 - t * t;
      carveInk(ctx, s.x, s.y, r, s.seed, alpha, s.angle, s.stretch);
    }

    if (stamps.length) {
      requestAnimationFrame(loop);
    } else {
      runningRef.current = false;
    }
  }, [carveInk, mc, rStart]);

  const startLoop = useCallback(() => {
    if (!runningRef.current) {
      runningRef.current = true;
      requestAnimationFrame(loop);
    }
  }, [loop]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const getRelativePos = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: "absolute", inset: 0, zIndex: 1, cursor: "none", ...style }}
      onMouseEnter={(e) => {
        const pos = getRelativePos(e);
        lastPosRef.current = pos;
        lastTimeRef.current = performance.now();
        stampAlong(pos.x, pos.y);
        startLoop();
      }}
      onMouseMove={(e) => {
        const pos = getRelativePos(e);
        stampAlong(pos.x, pos.y);
        startLoop();
      }}
      onMouseLeave={() => {
        lastPosRef.current = null;
      }}
    />
  );
}