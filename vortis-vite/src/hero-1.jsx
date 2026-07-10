import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageSquare, Code2, Eye, Globe, Brain, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Zap,
  Shield, Cpu, Layers, ArrowRight, Sparkles, Lock,
  BarChart3, Wifi, ChevronDown, Star, Award, Crown,
  Gem, Diamond, Medal, Trophy, Target, Rocket, Users,
  TrendingUp, Clock, Database, Search, Palette, Mic, Phone,
  Play, Menu, X, Quote, Activity, Server, GitBranch,
  Workflow, Boxes, Hexagon, Triangle, Circle, Square,
  ChevronRight, Heart, Bookmark, Command, Gauge, Network
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════
//  MEGA STYLES — animation library + design tokens
// ══════════════════════════════════════════════════════════════════
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Instrument+Serif:ital@0;1&display=swap');
*,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
html{scroll-behavior:smooth;overflow-x:clip}
body{margin:0;padding:0;overflow-x:hidden;background:#04030c;color:#fff;font-family:'Inter',system-ui,sans-serif}
::selection{background:rgba(139,92,246,.4);color:#fff}

/* Scrollbar */
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:#04030c}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#7c3aed,#ec4899);border-radius:10px}
::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#8b5cf6,#f472b6)}

/* ═══ ORB / AURORA ═══ */
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(120px,-90px) scale(1.25)}66%{transform:translate(-50px,100px) scale(.88)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(-100px,70px) scale(1.35)}70%{transform:translate(60px,-60px) scale(.82)}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,-110px) scale(1.18)}}
@keyframes orb4{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(80px,50px) scale(1.12)}70%{transform:translate(-30px,-40px) scale(.9)}}
@keyframes auroraDrift{0%{transform:translate(-10%,-5%) rotate(0deg)}50%{transform:translate(10%,5%) rotate(180deg)}100%{transform:translate(-10%,-5%) rotate(360deg)}}
@keyframes auroraShift{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(60deg)}}
@keyframes nebulaPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.8;transform:scale(1.15)}}

/* ═══ MARQUEE ═══ */
@keyframes marquee-l{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@keyframes marquee-v{from{transform:translateY(0)}to{transform:translateY(-50%)}}

/* ═══ REVEAL / FADE ═══ */
@keyframes fadeUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes wordReveal{from{opacity:0;transform:translateY(40px) rotateX(-90deg)}to{opacity:1;transform:translateY(0) rotateX(0)}}

/* ═══ FLOAT / PULSE ═══ */
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes floatReverse{0%,100%{transform:translateY(0)}50%{transform:translateY(14px)}}
@keyframes float3d{0%,100%{transform:translateY(0) translateX(0) rotate(0deg)}33%{transform:translateY(-10px) translateX(5px) rotate(2deg)}66%{transform:translateY(5px) translateX(-5px) rotate(-2deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes pulseScale{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes spinRev{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}
@keyframes spinSlow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* ═══ SHIMMER / GLOW ═══ */
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes shimmerText{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes borderFlow{0%,100%{border-color:rgba(124,58,237,.3)}50%{border-color:rgba(236,72,153,.7)}}
@keyframes goldGlow{0%,100%{box-shadow:0 0 20px rgba(139,92,246,.15),0 0 50px rgba(236,72,153,.08)}50%{box-shadow:0 0 50px rgba(139,92,246,.35),0 0 100px rgba(236,72,153,.2)}}
@keyframes neonPulse{0%,100%{text-shadow:0 0 7px rgba(139,92,246,.5),0 0 20px rgba(139,92,246,.3)}50%{text-shadow:0 0 14px rgba(139,92,246,.9),0 0 40px rgba(139,92,246,.6),0 0 60px rgba(236,72,153,.3)}}
@keyframes glowChase{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes conicSpin{from{--a:0deg}to{--a:360deg}}

/* ═══ GRID / SCAN ═══ */
@keyframes gridFade{0%{opacity:.015}50%{opacity:.035}100%{opacity:.015}}
@keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
@keyframes radarSweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes radarPing{0%{transform:scale(1);opacity:1}100%{transform:scale(2.5);opacity:0}}

/* ═══ PARTICLE ═══ */
@keyframes particleDrift{0%{transform:translate(0,0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}

/* ═══ MORPH / GLITCH ═══ */
@keyframes morphBlob{0%,100%{border-radius:60% 40% 30% 70% / 60% 30% 70% 40%}50%{border-radius:30% 60% 70% 40% / 50% 60% 30% 60%}}
@keyframes glitchX{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}
@keyframes jitter{0%,100%{transform:translate(0,0)}25%{transform:translate(1px,-1px)}50%{transform:translate(-1px,1px)}75%{transform:translate(1px,1px)}}

/* ═══ TYPEWRITER / BLINK ═══ */
@keyframes typewriter{from{width:0}to{width:100%}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}

/* ═══ RIPPLE / WAVE ═══ */
@keyframes ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(3);opacity:0}}
@keyframes waveBar{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
@keyframes waveBar2{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(.8)}}

/* ═══ COUNTER / TICKER ═══ */
@keyframes countUp{from{opacity:0;transform:translateY(16px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes tickerSlide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}

/* ═══ GRADIENT TEXT ═══ */
.gradient-text{background:linear-gradient(110deg,#a78bfa 0%,#ec4899 25%,#f59e0b 50%,#ec4899 75%,#a78bfa 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shimmerText 6s linear infinite}
.gradient-text-cv{background:linear-gradient(110deg,#818cf8,#c084fc,#f472b6,#818cf8);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shimmerText 5s linear infinite}
.gradient-text-aurora{background:linear-gradient(110deg,#22d3ee,#a78bfa,#f472b6,#22d3ee);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shimmerText 4s linear infinite}

/* ═══ GLASS ═══ */
.glass{background:rgba(15,12,30,.55);backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);border:1px solid rgba(255,255,255,.08)}
.glass-strong{background:rgba(8,6,20,.75);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);border:1px solid rgba(255,255,255,.1)}

/* ═══ CONIC BORDER CARD ═══ */
.conic-card{position:relative;background:#0a0820;border-radius:24px;overflow:hidden}
.conic-card::before{content:'';position:absolute;inset:-2px;background:conic-gradient(from var(--a,0deg),transparent 0deg,rgba(139,92,246,.8) 60deg,transparent 120deg,transparent 240deg,rgba(236,72,153,.8) 300deg,transparent 360deg);border-radius:24px;z-index:-1;animation:spin 6s linear infinite}

/* ═══ MAGNETIC / TILT ═══ */
.tilt-card{transform-style:preserve-3d;transition:transform .15s ease-out,box-shadow .3s ease}
.magnetic{transition:transform .25s cubic-bezier(.2,.9,.3,1.4)}

/* ═══ BTN ═══ */
.btn-glow{position:relative;overflow:hidden;background:linear-gradient(110deg,#7c3aed,#ec4899);color:#fff;border:none;border-radius:999px;padding:14px 30px;font-weight:700;font-size:15px;cursor:pointer;letter-spacing:-.01em;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 10px 40px -10px rgba(139,92,246,.6),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .2s ease,box-shadow .3s ease}
.btn-glow:hover{transform:translateY(-2px);box-shadow:0 0 0 1px rgba(255,255,255,.2),0 18px 60px -10px rgba(236,72,153,.7),inset 0 1px 0 rgba(255,255,255,.35)}
.btn-glow::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);transition:left .6s ease}
.btn-glow:hover::after{left:150%}
.btn-ghost{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:13px 28px;font-weight:600;font-size:15px;cursor:pointer;backdrop-filter:blur(10px);transition:all .25s ease}
.btn-ghost:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);transform:translateY(-1px)}

/* ═══ DIVIDERS ═══ */
.section{position:relative;padding:140px 24px;max-width:1280px;margin:0 auto}
@media(max-width:768px){.section{padding:90px 16px}}

/* ═══ SCROLL REVEAL ═══ */
.reveal{opacity:0;transform:translateY(40px);transition:opacity .9s cubic-bezier(.2,.7,.3,1),transform .9s cubic-bezier(.2,.7,.3,1)}
.reveal.in{opacity:1;transform:translateY(0)}
.reveal-stagger>*{opacity:0;transform:translateY(40px);transition:opacity .7s cubic-bezier(.2,.7,.3,1),transform .7s cubic-bezier(.2,.7,.3,1)}
.reveal-stagger.in>*{opacity:1;transform:translateY(0)}

/* ═══ HOVER LIFT ═══ */
.lift{transition:transform .35s cubic-bezier(.2,.7,.3,1),box-shadow .35s ease,border-color .35s ease}
.lift:hover{transform:translateY(-6px)}

/* ═══ ANIM HELPER ═══ */
.anim-float{animation:float 6s ease-in-out infinite}
.anim-float-rev{animation:floatReverse 7s ease-in-out infinite}
.anim-spin-slow{animation:spin 24s linear infinite}
.anim-pulse{animation:pulse 3s ease-in-out infinite}

/* ═══ DOT GRID ═══ */
.dot-grid{background-image:radial-gradient(circle,rgba(139,92,246,.15) 1px,transparent 1px);background-size:32px 32px}

/* ═══ NOISE ═══ */
.noise{position:absolute;inset:0;opacity:.04;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* ═══ SECTION TITLE ═══ */
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);color:#c4b5fd;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 12px #a78bfa;animation:pulse 2s ease-in-out infinite}

.h-section{font-family:'Space Grotesk','Inter',sans-serif;font-weight:700;letter-spacing:-.035em;line-height:1.05;font-size:clamp(34px,5.5vw,68px)}
.h-sub{color:rgba(255,255,255,.6);font-size:18px;line-height:1.55;max-width:640px;margin-top:18px}

/* ═══ SCROLL PROGRESS ═══ */
.scroll-progress{position:fixed;top:0;left:0;height:3px;width:0;background:linear-gradient(90deg,#7c3aed,#ec4899,#f59e0b);z-index:1000;box-shadow:0 0 12px rgba(139,92,246,.7);transition:width .1s linear}

/* ═══ CURSOR GLOW ═══ */
.cursor-glow{position:fixed;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.18),transparent 60%);pointer-events:none;z-index:1;mix-blend-mode:screen;transition:transform .15s cubic-bezier(.2,.9,.3,1);transform:translate(-50%,-50%)}

/* ═══ STAT NUM ═══ */
.stat-num{font-family:'Space Grotesk',sans-serif;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#fff 30%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

/* ═══ MARQUEE PAUSE ON HOVER ═══ */
.marquee-track{display:flex;width:max-content;animation:marquee-l 32s linear infinite}
.marquee-track:hover{animation-play-state:paused}
.marquee-track.rev{animation:marquee-r 36s linear infinite}

/* ═══ FAQ ═══ */
.faq-item{overflow:hidden;transition:all .35s ease}

/* ═══ KBD ═══ */
.kbd{font-family:'JetBrains Mono',monospace;font-size:11px;padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);box-shadow:0 2px 0 rgba(0,0,0,.3)}

/* ═══ LIVE DOT ═══ */
.live-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.7);animation:livePulse 2s infinite}
@keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}70%{box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}

/* ═══ GRADIENT BORDER ANIM ═══ */
.grad-border{position:relative;background:#0a0820;border-radius:20px}
.grad-border::before{content:'';position:absolute;inset:0;padding:1px;background:linear-gradient(135deg,rgba(139,92,246,.6),rgba(236,72,153,.4),rgba(245,158,11,.3));border-radius:20px;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}

/* ═══ HIDE SCROLLBAR ON HORIZONTAL ═══ */
.no-scrollbar::-webkit-scrollbar{display:none}
.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

// ══════════════════════════════════════════════════════════════════
//  HOOKS
// ══════════════════════════════════════════════════════════════════
function useInView(threshold = 0.15, once = true) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setInView(true);
        if (once) obs.disconnect();
      } else if (!once) setInView(false);
    }, { threshold });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold, once]);
  return [ref, inView];
}

function useCountUp(target, duration = 2200, start = false, decimals = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();
}

function useMousePos() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const h = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', h, { passive: true });
    return () => window.removeEventListener('mousemove', h);
  }, []);
  return pos;
}

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const h = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? window.scrollY / max : 0);
    };
    h();
    window.addEventListener('scroll', h, { passive: true });
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('scroll', h); window.removeEventListener('resize', h); };
  }, []);
  return p;
}

// Tilt hook — adds 3D rotation following mouse
function useTilt(max = 12) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (py - .5) * -2 * max;
      const ry = (px - .5) * 2 * max;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
        el.style.setProperty('--mx', `${px*100}%`);
        el.style.setProperty('--my', `${py*100}%`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = `perspective(900px) rotateX(0) rotateY(0)`;
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [max]);
  return ref;
}

// Magnetic hook — button follows cursor slightly
function useMagnetic(strength = 0.4) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onLeave = () => { el.style.transform = 'translate(0,0)'; };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [strength]);
  return ref;
}

// ══════════════════════════════════════════════════════════════════
//  VORTIS LOGO
// ══════════════════════════════════════════════════════════════════
export function VortisLogo({ size = 36, color = "#a78bfa", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={{ filter: `drop-shadow(0 0 12px ${color}88)` }}>
      <defs>
        <linearGradient id="vlg" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M24 4 L42 14 V34 L24 44 L6 34 V14 Z" stroke="url(#vlg)" strokeWidth="2" fill="rgba(139,92,246,.08)" />
      <path d="M24 12 L34 18 V30 L24 36 L14 30 V18 Z" stroke="url(#vlg)" strokeWidth="1.5" fill="none" opacity=".7" />
      <circle cx="24" cy="24" r="4" fill="url(#vlg)" />
      <circle cx="24" cy="24" r="8" stroke="url(#vlg)" strokeWidth="1" fill="none" opacity=".5" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════
//  AMBIENT SPOTLIGHT (mouse-following glow on page)
// ══════════════════════════════════════════════════════════════════
function CursorGlow() {
  const pos = useMousePos();
  return <div className="cursor-glow" style={{ left: pos.x, top: pos.y }} />;
}

// ══════════════════════════════════════════════════════════════════
//  SCROLL PROGRESS BAR
// ══════════════════════════════════════════════════════════════════
function ScrollProgress() {
  const p = useScrollProgress();
  return <div className="scroll-progress" style={{ width: `${p * 100}%` }} />;
}

// ══════════════════════════════════════════════════════════════════
//  COSMIC BG — aurora mesh + orbs + grid + noise
// ══════════════════════════════════════════════════════════════════
function CosmicBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Base radial */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 0%, rgba(76,29,149,.25), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(190,24,93,.18), transparent 50%), #04030c' }} />

      {/* Aurora mesh blobs */}
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(139,92,246,.5), transparent 60%)', filter: 'blur(80px)', animation: 'orb1 22s ease-in-out infinite, auroraShift 14s linear infinite' }} />
      <div style={{ position: 'absolute', top: '20%', right: '-15%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(236,72,153,.4), transparent 60%)', filter: 'blur(90px)', animation: 'orb2 26s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '20%', width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(34,211,238,.25), transparent 60%)', filter: 'blur(100px)', animation: 'orb3 30s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '40%', left: '40%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(245,158,11,.18), transparent 60%)', filter: 'blur(90px)', animation: 'orb4 24s ease-in-out infinite' }} />

      {/* Grid floor */}
      <div style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: 'linear-gradient(rgba(139,92,246,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,.06) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)', WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)', animation: 'gridFade 8s ease-in-out infinite' }} />

      {/* Noise */}
      <div className="noise" />

      {/* Top vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center top, transparent 30%, rgba(4,3,12,.6) 100%)' }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FLOW FIELD — canvas particle network (huge upgrade)
// ══════════════════════════════════════════════════════════════════
export function NeuralField({ density = 90 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf, w, h, particles = [], mouse = { x: -9999, y: -9999, active: false };
    const COLORS = ['#a78bfa', '#ec4899', '#22d3ee', '#f59e0b'];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: density }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - .5) * .4,
        vy: (Math.random() - .5) * .4,
        r: Math.random() * 1.6 + .6,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        pulse: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      // Update + draw points
      for (const p of particles) {
        // Flow field — angular drift based on position
        const ang = Math.sin(p.x * .003) + Math.cos(p.y * .003);
        p.vx += Math.cos(ang) * 0.005;
        p.vy += Math.sin(ang) * 0.005;
        // Mouse repulsion / attraction
        if (mouse.active) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 22500) {
            const f = (1 - d2 / 22500) * .8;
            p.vx += (dx / Math.sqrt(d2 + 1)) * f * .3;
            p.vy += (dy / Math.sqrt(d2 + 1)) * f * .3;
          }
        }
        // Damping
        p.vx *= .985; p.vy *= .985;
        p.x += p.vx; p.y += p.vy;
        p.pulse += .04;
        // Wrap
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        // Draw
        const pr = p.r + Math.sin(p.pulse) * .4;
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 12;
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      // Connections
      ctx.shadowBlur = 0;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 130) {
            const op = (1 - d / 130) * .35;
            ctx.strokeStyle = `rgba(167,139,250,${op})`;
            ctx.lineWidth = .6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // Mouse line
        if (mouse.active) {
          const dx = particles[i].x - mouse.x, dy = particles[i].y - mouse.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 180) {
            const op = (1 - d / 180) * .6;
            ctx.strokeStyle = `rgba(236,72,153,${op})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [density]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

// ══════════════════════════════════════════════════════════════════
//  NAV — glassmorphism + magnetic logo
// ══════════════════════════════════════════════════════════════════
function Nav({ onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const logoRef = useMagnetic(0.3);
  const ctaRef = useMagnetic(0.25);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    h();
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const links = ['Product', 'Solutions', 'Showcase', 'Pricing', 'Docs'];

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: scrolled ? '14px 24px' : '22px 24px',
        transition: 'all .35s ease',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: scrolled ? '10px 18px' : '12px 22px',
          borderRadius: 999, transition: 'all .35s ease',
          background: scrolled ? 'rgba(10,8,24,.7)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
          border: scrolled ? '1px solid rgba(255,255,255,.08)' : '1px solid transparent',
          boxShadow: scrolled ? '0 10px 40px -10px rgba(0,0,0,.6)' : 'none',
        }}>
          {/* Logo */}
          <div ref={logoRef} className="magnetic" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ position: 'relative' }}>
              <VortisLogo size={32} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(167,139,250,.4), transparent 70%)', filter: 'blur(8px)', zIndex: -1 }} />
            </div>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: '-.02em' }}>
              Vortis
            </span>
          </div>

          {/* Center links */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} className="hide-mobile">
            {links.map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} style={{
                padding: '8px 14px', borderRadius: 999, color: 'rgba(255,255,255,.7)',
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                transition: 'all .2s ease', position: 'relative',
              }}
                onMouseEnter={(e) => { e.target.style.color = '#fff'; e.target.style.background = 'rgba(255,255,255,.06)'; }}
                onMouseLeave={(e) => { e.target.style.color = 'rgba(255,255,255,.7)'; e.target.style.background = 'transparent'; }}>
                {l}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onLogin} className="btn-ghost hide-mobile" style={{ fontSize: 14, padding: '10px 20px' }}>
              Sign in
            </button>
            <button ref={ctaRef} onClick={onLogin} className="btn-glow magnetic" style={{ fontSize: 14, padding: '11px 22px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Get Started
              <ArrowRight size={15} />
            </button>
            <button className="show-mobile" onClick={() => setMobileOpen(v => !v)} style={{ background: 'transparent', border: 'none', color: '#fff', padding: 8, cursor: 'pointer' }}>
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 80, left: 16, right: 16, zIndex: 99,
          background: 'rgba(10,8,24,.95)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: 16,
          animation: 'scaleIn .25s ease',
        }}>
          {links.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={() => setMobileOpen(false)} style={{
              display: 'block', padding: '14px 16px', color: '#fff', textDecoration: 'none',
              fontSize: 16, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,.06)',
            }}>{l}</a>
          ))}
        </div>
      )}

      <style>{`
        @media(max-width:880px){.hide-mobile{display:none!important}.show-mobile{display:flex!important}}
        @media(min-width:881px){.show-mobile{display:none!important}}
      `}</style>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
//  TYPEWRITER WORD
// ══════════════════════════════════════════════════════════════════
function TypewriterWord({ words = [], interval = 2800 }) {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState('');
  const [phase, setPhase] = useState('typing'); // typing | hold | deleting

  useEffect(() => {
    const word = words[idx];
    let t;
    if (phase === 'typing') {
      if (shown.length < word.length) {
        t = setTimeout(() => setShown(word.slice(0, shown.length + 1)), 75);
      } else {
        t = setTimeout(() => setPhase('hold'), interval);
      }
    } else if (phase === 'hold') {
      t = setTimeout(() => setPhase('deleting'), 400);
    } else {
      if (shown.length > 0) {
        t = setTimeout(() => setShown(word.slice(0, shown.length - 1)), 35);
      } else {
        setPhase('typing');
        setIdx((i) => (i + 1) % words.length);
      }
    }
    return () => clearTimeout(t);
  }, [shown, phase, idx, words, interval]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span className="gradient-text">{shown}</span>
      <span style={{ display: 'inline-block', width: 2, height: '1em', background: '#ec4899', marginLeft: 4, verticalAlign: 'text-bottom', animation: 'blink 1s steps(2) infinite' }} />
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════
//  WORD REVEAL — staggered word-by-word headline reveal
// ══════════════════════════════════════════════════════════════════
function WordReveal({ text, delay = 0, className = '', style = {} }) {
  const words = text.split(' ');
  return (
    <span className={className} style={{ display: 'inline-block', ...style }}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: 'inline-block',
          opacity: 0,
          animation: `wordReveal .8s cubic-bezier(.2,.7,.3,1) forwards`,
          animationDelay: `${delay + i * 0.06}s`,
          transformOrigin: 'bottom',
          whiteSpace: 'pre',
        }}>
          {w}{i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HERO VISUAL — 3D tilt AI core card with holographic effect
// ══════════════════════════════════════════════════════════════════
function HeroVisual() {
  const tiltRef = useTilt(15);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  const logs = [
    { icon: 'brain', text: 'Analyzing intent vector…', c: '#a78bfa' },
    { icon: 'code', text: 'Generating React component', c: '#22d3ee' },
    { icon: 'eye', text: 'Rendering preview @ 60fps', c: '#ec4899' },
    { icon: 'check', text: 'Deployed to edge network', c: '#22c55e' },
    { icon: 'globe', text: 'Live in 14 regions', c: '#f59e0b' },
  ];
  const cur = logs[tick % logs.length];

  return (
    <div ref={tiltRef} className="tilt-card" style={{
      position: 'relative', width: '100%', maxWidth: 520, margin: '0 auto',
      padding: 4, borderRadius: 28, transformStyle: 'preserve-3d',
    }}>
      {/* Conic rotating border */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 28, padding: 1.5, background: 'conic-gradient(from 0deg, rgba(139,92,246,.6), rgba(236,72,153,.6), rgba(245,158,11,.5), rgba(34,211,238,.5), rgba(139,92,246,.6))', animation: 'spin 8s linear infinite', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />

      {/* Inner glass card */}
      <div style={{
        position: 'relative', background: 'linear-gradient(160deg, rgba(15,12,30,.95), rgba(8,6,20,.95))',
        borderRadius: 26, padding: 24, overflow: 'hidden', transform: 'translateZ(40px)',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="live-dot" style={{ width: 6, height: 6 }} /> vortis://session
          </div>
        </div>

        {/* AI Core orb */}
        <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 24px' }}>
          {/* Outer rings */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(139,92,246,.3)', animation: 'spin 12s linear infinite' }}>
            <div style={{ position: 'absolute', top: -4, left: '50%', width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 16px #a78bfa', transform: 'translateX(-50%)' }} />
          </div>
          <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid rgba(236,72,153,.3)', animation: 'spinRev 9s linear infinite' }}>
            <div style={{ position: 'absolute', top: '50%', right: -3, width: 6, height: 6, borderRadius: '50%', background: '#ec4899', boxShadow: '0 0 12px #ec4899', transform: 'translateY(-50%)' }} />
          </div>
          <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', border: '1px dashed rgba(34,211,238,.4)', animation: 'spin 7s linear infinite' }} />

          {/* Core */}
          <div style={{
            position: 'absolute', inset: 55, borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #fff, #a78bfa 30%, #ec4899 70%, #4c1d95)',
            boxShadow: '0 0 60px rgba(167,139,250,.7), inset 0 0 30px rgba(255,255,255,.3)',
            animation: 'pulseScale 3s ease-in-out infinite',
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 70% 70%, transparent 50%, rgba(0,0,0,.4))' }} />
          </div>

          {/* Floating particles around core */}
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 4, height: 4, borderRadius: '50%', background: ['#a78bfa', '#ec4899', '#22d3ee'][i % 3],
              boxShadow: `0 0 10px ${['#a78bfa', '#ec4899', '#22d3ee'][i % 3]}`,
              animation: `float3d ${4 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
              transform: `translate(${Math.cos(i * Math.PI / 3) * 80}px, ${Math.sin(i * Math.PI / 3) * 80}px)`,
            }} />
          ))}
        </div>

        {/* Activity log */}
        <div style={{
          background: 'rgba(0,0,0,.4)', borderRadius: 12, padding: '12px 14px',
          border: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${cur.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cur.c, flexShrink: 0 }}>
            <Sparkles size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>vortis ▸ stream</div>
            <div key={tick} style={{ fontSize: 13, color: '#fff', fontWeight: 500, animation: 'slideInRight .4s ease' }}>{cur.text}</div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{
                width: 3, height: 12, background: cur.c, borderRadius: 2,
                animation: `waveBar ${.6 + i * .15}s ease-in-out infinite`, animationDelay: `${i * .1}s`,
                transformOrigin: 'bottom',
              }} />
            ))}
          </div>
        </div>

        {/* Mini stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { l: 'Latency', v: '12ms' },
            { l: 'Tokens', v: '8.2k' },
            { l: 'Uptime', v: '99.99%' },
          ].map((s) => (
            <div key={s.l} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,.05)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>{s.l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: "'Space Grotesk', sans-serif" }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Mouse-following glow inside card */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 26, pointerEvents: 'none',
          background: 'radial-gradient(circle 200px at var(--mx,50%) var(--my,50%), rgba(167,139,250,.15), transparent 70%)',
        }} />
      </div>

      {/* Floating badges */}
      <div style={{ position: 'absolute', top: -16, right: -20, transform: 'translateZ(80px)', animation: 'float 5s ease-in-out infinite' }}>
        <div className="glass" style={{ padding: '10px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <Zap size={14} style={{ color: '#f59e0b' }} /> 12ms latency
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: -20, left: -20, transform: 'translateZ(60px)', animation: 'floatReverse 6s ease-in-out infinite' }}>
        <div className="glass" style={{ padding: '10px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <Shield size={14} style={{ color: '#22c55e' }} /> SOC 2 Type II
        </div>
      </div>
      <div style={{ position: 'absolute', top: '40%', right: -30, transform: 'translateZ(70px)', animation: 'float 7s ease-in-out infinite', animationDelay: '1s' }}>
        <div className="glass" style={{ padding: '8px 12px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600 }}>
          <Cpu size={12} style={{ color: '#22d3ee' }} /> GPT-5 class
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  AUTH PICKER (modal)
// ══════════════════════════════════════════════════════════════════
function AuthPicker({ onLogin, authLoading, onClose }) {
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', animation: 'fadeIn .25s ease',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(420px, 92vw)', background: 'linear-gradient(160deg, rgba(15,12,30,.98), rgba(8,6,20,.98))',
        border: '1px solid rgba(255,255,255,.1)', borderRadius: 24, padding: 32, position: 'relative',
        animation: 'scaleIn .35s cubic-bezier(.2,.7,.3,1.2)',
        boxShadow: '0 30px 100px -10px rgba(0,0,0,.8), 0 0 0 1px rgba(139,92,246,.2), 0 0 80px rgba(139,92,246,.15)',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 6 }}>
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <VortisLogo size={28} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>Vortis</span>
        </div>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', margin: '12px 0 6px' }}>Welcome back</h3>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 14, margin: '0 0 24px' }}>Sign in to your Vortis workspace</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={{
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
            padding: '14px 16px', color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color .2s',
          }} onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,.5)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,.1)'} />
          <input value={pwd} onChange={(e) => setPwd(e.target.value)} type="password" placeholder="••••••••" style={{
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
            padding: '14px 16px', color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color .2s',
          }} onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,.5)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,.1)'} />

          <button onClick={() => onLogin({ email, pwd })} className="btn-glow" style={{ width: '100%', padding: '15px', fontSize: 15, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {authLoading ? (
              <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} /> Signing in…</>
            ) : (
              <>Sign in <ArrowRight size={16} /></>
            )}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} /> OR <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {['Google', 'GitHub'].map((p) => (
            <button key={p} className="btn-ghost" style={{ padding: '12px', fontSize: 13 }}>{p}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════
export function Hero({ onLogin, authLoading, authError }) {
  const [showAuth, setShowAuth] = useState(false);
  const ctaRef = useMagnetic(0.25);
  const cta2Ref = useMagnetic(0.2);
  const heroRef = useRef(null);
  const [statsIn, setStatsIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStatsIn(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleLogin = (creds) => onLogin?.(creds);
  const users = useCountUp(120000, 2200, statsIn);
  const uptime = useCountUp(9999, 2200, statsIn, 1);
  const countries = useCountUp(140, 2200, statsIn);

  return (
    <section id="product" ref={heroRef} style={{ position: 'relative', minHeight: '100vh', padding: '140px 24px 80px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      {/* Neural field canvas behind */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: .55 }}>
        <NeuralField density={70} />
      </div>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 60, alignItems: 'center' }} className="hero-grid">
        {/* LEFT */}
        <div>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px',
            borderRadius: 999, background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.2)',
            opacity: 0, animation: 'fadeUp .8s ease forwards', animationDelay: '.1s',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(139,92,246,.2)', fontSize: 11, fontWeight: 700, color: '#c4b5fd', letterSpacing: '.05em' }}>
              <Sparkles size={11} /> NEW
            </span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>Vortis 3.0 — multimodal AI workspace</span>
            <ArrowRight size={14} style={{ color: 'rgba(255,255,255,.4)' }} />
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontWeight: 700,
            fontSize: 'clamp(44px, 6.5vw, 88px)', lineHeight: 1.02, letterSpacing: '-.04em',
            margin: '24px 0 18px',
          }}>
            <WordReveal text="Build the future" delay=".3" />
            <br />
            <span style={{ display: 'inline-block' }}>
              <WordReveal text="with" delay=".7" />{' '}
              <span style={{ display: 'inline-block', transform: 'translateY(2px)' }}>
                <TypewriterWord words={['intelligence.', 'speed.', 'clarity.', 'Vortis.', 'magic.']} />
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p style={{
            color: 'rgba(255,255,255,.6)', fontSize: 19, lineHeight: 1.55, maxWidth: 540, margin: '0 0 32px',
            opacity: 0, animation: 'fadeUp .8s ease forwards', animationDelay: '1.2s',
          }}>
            One workspace that thinks with you — chat, code, search, vision, and voice in a single fluid surface. Built for teams shipping at the speed of thought.
          </p>

          {/* CTAs */}
          <div style={{
            display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 40,
            opacity: 0, animation: 'fadeUp .8s ease forwards', animationDelay: '1.4s',
          }}>
            <button ref={ctaRef} onClick={() => setShowAuth(true)} className="btn-glow magnetic" style={{ padding: '16px 28px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
              Start building free <ArrowRight size={17} />
            </button>
            <button ref={cta2Ref} className="btn-ghost magnetic" style={{ padding: '15px 26px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Play size={15} /> Watch demo
            </button>
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', gap: 36, flexWrap: 'wrap',
            opacity: 0, animation: 'fadeUp .8s ease forwards', animationDelay: '1.6s',
          }}>
            {[
              { num: users, suffix: '+', label: 'Active builders' },
              { num: uptime, suffix: '%', label: 'Uptime SLA', decimals: 2 },
              { num: countries, suffix: '+', label: 'Countries' },
            ].map((s) => (
              <div key={s.label}>
                <div className="stat-num" style={{ fontSize: 32, lineHeight: 1 }}>
                  {s.num}{s.suffix}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Visual */}
        <div style={{
          opacity: 0, animation: 'fadeIn 1s ease forwards', animationDelay: '.8s',
        }}>
          <HeroVisual />
        </div>
      </div>

      {/* Live activity ticker — bottom */}
      <div style={{
        position: 'absolute', bottom: 24, left: 0, right: 0, zIndex: 3,
        display: 'flex', justifyContent: 'center',
      }}>
        <div className="glass" style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px',
          borderRadius: 999, fontSize: 12, color: 'rgba(255,255,255,.7)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="live-dot" /> LIVE
          </span>
          <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,.1)' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ color: '#22c55e' }}>+1,247</span> builds today
          </span>
          <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,.1)' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ color: '#a78bfa' }}>2.4M</span> tokens/sec
          </span>
        </div>
      </div>

      {/* Scroll cue */}
      <div style={{
        position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
        zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        color: 'rgba(255,255,255,.3)', fontSize: 11, letterSpacing: '.2em',
      }}>
        SCROLL
        <div style={{ width: 1, height: 30, background: 'linear-gradient(180deg, rgba(255,255,255,.4), transparent)', animation: 'pulse 2s ease-in-out infinite' }} />
      </div>

      {showAuth && <AuthPicker onLogin={handleLogin} authLoading={authLoading} onClose={() => setShowAuth(false)} />}
      {authError && <div style={{ position: 'fixed', top: 90, right: 24, zIndex: 300, padding: '12px 18px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 12, color: '#fca5a5', fontSize: 13, animation: 'slideInRight .3s ease' }}>{authError}</div>}

      <style>{`
        @media(max-width:880px){.hero-grid{grid-template-columns:1fr!important;gap:50px!important}}
      `}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BRAND LOGO SVG RENDERER
// ══════════════════════════════════════════════════════════════════
function BrandIcon({ name }) {
  const brands = {
    openai: { path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 4c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6z', color: '#10a37f' },
    google: { multiPath: [{ d: 'M12 11v2.8h6.5c-.3 1.7-2 5-6.5 5-3.9 0-7-3.2-7-7s3.1-7 7-7c2.2 0 3.7 1 4.5 1.8L18 4.5C16.3 2.9 14 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.5 0 9.5-3.9 9.5-9.5 0-.7 0-1.2-.2-1.5H12z', fill: '#4285f4' }] },
    vercel: { path: 'M12 2L2 22h20L12 2z', color: '#fff' },
    stripe: { path: 'M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12s4.5 10 10 10 10-4.5 10-10zM12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z', color: '#635bff' },
    nvidia: { path: 'M8 8v8h8V8H8zm2 2h4v4h-4v-4z', color: '#76b900' },
    anthropic: { path: 'M12 4L4 20h4l4-10 4 10h4L12 4z', color: '#d97757' },
    figma: { multiPath: [{ d: 'M8 2h4v6H8a3 3 0 010-6z', fill: '#f24e1e' }, { d: 'M12 2h4a3 3 0 010 6h-4V2z', fill: '#ff7262' }, { d: 'M12 8h4a3 3 0 010 6h-4V8z', fill: '#1abcfe' }, { d: 'M8 8h4v6H8a3 3 0 010-6z', fill: '#a259ff' }, { d: 'M8 14h4v3a3 3 0 11-4-3z', fill: '#0acf83' }] },
    linear: { path: 'M2 14L10 22H2V14zM2 2L22 22H10L2 14V2z', color: '#5e6ad2' },
    notion: { path: 'M4 4h16v16H4V4zm4 4v8h8V8H8z', color: '#fff' },
    spotify: { path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.5 14.5c-.2.3-.6.4-.9.2-2.5-1.5-5.5-1.8-9.2-1-.4.1-.7-.2-.8-.5-.1-.4.2-.7.5-.8 4-.9 7.4-.5 10.1 1.2.4.2.5.6.3.9zm1.2-2.7c-.3.4-.7.5-1.1.3-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.8-1.1 8.5-.6 11.7 1.4.3.2.5.7.3 1zm.1-2.8C14.5 8.9 9.3 8.7 6.1 9.7c-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.7-1.1 9.4-.9 13.1 1.4.5.3.6.9.3 1.4-.3.4-.9.6-1.4.3z', color: '#1db954' },
  };
  const b = brands[name]; if (!b) return null;
  const s = { width: 22, height: 22 };
  if (b.multiPath) return <svg viewBox="0 0 24 24" style={s}>{b.multiPath.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</svg>;
  return <svg viewBox="0 0 24 24" style={s}><path d={b.path} fill={b.color} /></svg>;
}

function LogoItem({ name, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderRadius: 14, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.05)', transition: 'all .3s ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <BrandIcon name={name} />
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,.7)' }}>{label}</span>
    </div>
  );
}

function MarqueeRow({ items, reverse = false }) {
  return (
    <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
      <div className={`marquee-track ${reverse ? 'rev' : ''}`} style={{ gap: 14 }}>
        {[...items, ...items].map((it, i) => <LogoItem key={i} {...it} />)}
      </div>
    </div>
  );
}

function Logos() {
  const [ref, inView] = useInView();
  const row1 = [
    { name: 'openai', label: 'OpenAI' }, { name: 'google', label: 'Google' },
    { name: 'vercel', label: 'Vercel' }, { name: 'stripe', label: 'Stripe' },
    { name: 'nvidia', label: 'NVIDIA' }, { name: 'anthropic', label: 'Anthropic' },
  ];
  const row2 = [
    { name: 'figma', label: 'Figma' }, { name: 'linear', label: 'Linear' },
    { name: 'notion', label: 'Notion' }, { name: 'spotify', label: 'Spotify' },
  ];
  return (
    <section ref={ref} className={`section reveal ${inView ? 'in' : ''}`} style={{ paddingTop: 60, paddingBottom: 60 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div className="eyebrow"><span className="dot" />TRUSTED BY 120,000+ TEAMS</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MarqueeRow items={row1} />
        <MarqueeRow items={row2} reverse />
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BENTO GRID — each tile has a unique micro-animation
// ══════════════════════════════════════════════════════════════════
function BentoCard({ children, className = '', style = {}, glowColor = '#a78bfa' }) {
  const ref = useTilt(8);
  return (
    <div ref={ref} className={`tilt-card ${className}`} style={{
      position: 'relative', borderRadius: 24, padding: 28, overflow: 'hidden',
      background: 'linear-gradient(160deg, rgba(15,12,30,.6), rgba(8,6,20,.8))',
      border: '1px solid rgba(255,255,255,.06)', transformStyle: 'preserve-3d',
      transition: 'box-shadow .3s ease', ...style,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 20px 60px -20px ${glowColor}55, 0 0 0 1px ${glowColor}33`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}>
      {/* Mouse-following glow */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none',
        background: `radial-gradient(circle 240px at var(--mx,50%) var(--my,50%), ${glowColor}1a, transparent 70%)`,
      }} />
      {/* Top gradient line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${glowColor}66, transparent)` }} />
      <div style={{ position: 'relative', transform: 'translateZ(30px)', height: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// Tile 1: Code typing visual
function CodeTileVisual() {
  const lines = [
    'import { Vortis } from "@vortis/sdk"',
    '',
    'const ai = new Vortis({',
    '  model: "vortex-3",',
    '  multimodal: true,',
    '})',
    '',
    'await ai.stream({',
    '  prompt: "build a dashboard",',
    '  onToken: render,',
    '})',
  ];
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setVisible(v => v >= lines.length ? 0 : v + 1), 600);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <div style={{ background: 'rgba(0,0,0,.5)', borderRadius: 14, padding: 18, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, lineHeight: 1.7, border: '1px solid rgba(255,255,255,.06)', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>app.tsx</span>
      </div>
      {lines.slice(0, visible).map((l, i) => (
        <div key={i} style={{ animation: 'fadeIn .3s ease', color: l.startsWith('import') ? '#c084fc' : l.includes('"') ? '#fbbf24' : l.includes('{') || l.includes('}') ? '#22d3ee' : '#cbd5e1' }}>
          {l || '\u00A0'}
        </div>
      ))}
      {visible < lines.length && (
        <span style={{ display: 'inline-block', width: 7, height: 14, background: '#a78bfa', animation: 'blink .8s steps(2) infinite', verticalAlign: 'middle' }} />
      )}
    </div>
  );
}

// Tile 2: Search cascade
function SearchTileVisual() {
  const queries = ['design system', 'database schema', 'auth flow', 'api endpoint'];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % queries.length), 2200);
    return () => clearInterval(id);
  }, []);
  const results = [
    { t: 'Component library', s: 'tokens, buttons, inputs' },
    { t: 'Theme generator', s: 'auto dark/light mode' },
    { t: 'Icon set', s: '1200+ SVG icons' },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,.4)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)' }}>
        <Search size={15} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 13, color: '#fff' }}>
          {queries[active]}
          <span style={{ display: 'inline-block', width: 1, height: 12, background: '#a78bfa', marginLeft: 2, animation: 'blink 1s steps(2) infinite', verticalAlign: 'middle' }} />
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((r, i) => (
          <div key={r.t} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.05)',
            animation: `slideInLeft .4s ease`, animationDelay: `${i * .1}s`, animationFillMode: 'both',
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{r.t}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{r.s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tile 3: Voice waveform
function VoiceTileVisual() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: 70, height: 70, borderRadius: '50%', background: 'linear-gradient(135deg, #ec4899, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulseScale 2s ease-in-out infinite' }}>
        <Mic size={28} />
        <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1px solid rgba(236,72,153,.4)', animation: 'radarPing 2s ease-out infinite' }} />
        <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1px solid rgba(236,72,153,.3)', animation: 'radarPing 2s ease-out infinite 1s' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
        {[...Array(28)].map((_, i) => (
          <div key={i} style={{
            width: 3, background: 'linear-gradient(180deg, #ec4899, #f59e0b)', borderRadius: 2,
            height: '100%',
            transformOrigin: 'bottom',
            animation: `waveBar ${.8 + (i % 4) * .15}s ease-in-out infinite`,
            animationDelay: `${i * .04}s`,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontFamily: "'JetBrains Mono', monospace" }}>Listening…</div>
    </div>
  );
}

// Tile 4: Vision tile
function VisionTileVisual() {
  return (
    <div style={{ height: '100%', position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #1e1b4b, #4c1d95)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 40%, rgba(34,211,238,.4), transparent 50%), radial-gradient(circle at 70% 70%, rgba(236,72,153,.4), transparent 50%)' }} />
      {/* Scan line */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #22d3ee, transparent)', boxShadow: '0 0 12px #22d3ee', animation: 'scanLine 3s ease-in-out infinite' }} />
      {/* Detected boxes */}
      <div style={{ position: 'absolute', top: '20%', left: '15%', width: '40%', height: '35%', border: '1.5px solid #22d3ee', borderRadius: 6, animation: 'pulse 2s ease-in-out infinite' }}>
        <span style={{ position: 'absolute', top: -16, left: 0, fontSize: 9, color: '#22d3ee', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(0,0,0,.5)', padding: '2px 5px', borderRadius: 3 }}>object 99%</span>
      </div>
      <div style={{ position: 'absolute', top: '55%', right: '12%', width: '30%', height: '25%', border: '1.5px solid #ec4899', borderRadius: 6, animation: 'pulse 2s ease-in-out infinite 1s' }}>
        <span style={{ position: 'absolute', top: -16, right: 0, fontSize: 9, color: '#ec4899', fontFamily: "'JetBrains Mono', monospace", background: 'rgba(0,0,0,.5)', padding: '2px 5px', borderRadius: 3 }}>text 97%</span>
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, fontSize: 10, color: 'rgba(255,255,255,.7)', fontFamily: "'JetBrains Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
        <span>2 objects</span>
        <span style={{ color: '#22c55e' }}>analyzed in 240ms</span>
      </div>
    </div>
  );
}

// Tile 5: Multi-agent network
function AgentTileVisual() {
  const nodes = [
    { x: 50, y: 50, c: '#a78bfa', label: 'orchestrator' },
    { x: 15, y: 20, c: '#22d3ee', label: 'search' },
    { x: 85, y: 20, c: '#ec4899', label: 'code' },
    { x: 15, y: 80, c: '#f59e0b', label: 'vision' },
    { x: 85, y: 80, c: '#22c55e', label: 'memory' },
  ];
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
        {nodes.slice(1).map((n, i) => (
          <line key={i} x1="50" y1="50" x2={n.x} y2={n.y} stroke="rgba(167,139,250,.4)" strokeWidth=".5" strokeDasharray="2 2">
            <animate attributeName="stroke-dashoffset" from="4" to="0" dur="1s" repeatCount="indefinite" />
          </line>
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r="4" fill={n.c} opacity=".3">
              <animate attributeName="r" from="4" to="8" dur="2s" repeatCount="indefinite" begin={`${i * .3}s`} />
              <animate attributeName="opacity" from=".3" to="0" dur="2s" repeatCount="indefinite" begin={`${i * .3}s`} />
            </circle>
            <circle cx={n.x} cy={n.y} r="3" fill={n.c} />
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, fontSize: 10, color: 'rgba(255,255,255,.5)', fontFamily: "'JetBrains Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
        <span>5 agents online</span>
        <span style={{ color: '#22c55e' }}>● synced</span>
      </div>
    </div>
  );
}

// Tile 6: Realtime collab
function CollabTileVisual() {
  const users = [
    { name: 'AK', c: '#a78bfa', x: 30, y: 30 },
    { name: 'JS', c: '#22d3ee', x: 70, y: 40 },
    { name: 'MR', c: '#ec4899', x: 50, y: 70 },
  ];
  return (
    <div style={{ height: '100%', position: 'relative', background: 'rgba(0,0,0,.3)', borderRadius: 14, border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
      {/* Animated cursor trails */}
      {users.map((u, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${u.x}%`, top: `${u.y}%`,
          animation: `float3d ${5 + i}s ease-in-out infinite`, animationDelay: `${i * .5}s`,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ filter: `drop-shadow(0 0 8px ${u.c})` }}>
            <path d="M2 2L14 8L8 9L7 14L2 2Z" fill={u.c} />
          </svg>
          <span style={{ position: 'absolute', top: 16, left: 12, fontSize: 9, padding: '2px 6px', background: u.c, color: '#000', borderRadius: 4, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{u.name}</span>
        </div>
      ))}
      {/* Document lines */}
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[80, 60, 90, 70, 50].map((w, i) => (
          <div key={i} style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', width: `${w}%` }} />
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace" }}>3 editing now</div>
    </div>
  );
}

function BentoGrid() {
  const [ref, inView] = useInView();
  return (
    <section id="solutions" ref={ref} className="section">
      <div style={{ textAlign: 'center', marginBottom: 60 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />ONE WORKSPACE</div>
        <h2 className="h-section">Everything you need.<br /><span className="gradient-text">Nothing you don't.</span></h2>
        <p className="h-sub" style={{ margin: '18px auto 0' }}>Six superpowers in a single surface. Built for the way modern teams actually ship.</p>
      </div>

      <div className={`reveal-stagger ${inView ? 'in' : ''}`} style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 18, gridAutoRows: 'minmax(180px, auto)',
      }}>
        {/* Tile 1 - Code (large) */}
        <BentoCard glowColor="#a78bfa" style={{ gridColumn: 'span 3', gridRow: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}><Code2 size={18} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Code generation</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Full-stack, type-safe, production-ready</div>
            </div>
          </div>
          <CodeTileVisual />
        </BentoCard>

        {/* Tile 2 - Search */}
        <BentoCard glowColor="#22d3ee" style={{ gridColumn: 'span 3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,211,238,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee' }}><Search size={16} /></div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Semantic search</div>
          </div>
          <SearchTileVisual />
        </BentoCard>

        {/* Tile 3 - Voice */}
        <BentoCard glowColor="#ec4899" style={{ gridColumn: 'span 3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(236,72,153,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ec4899' }}><Mic size={16} /></div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Voice & realtime</div>
          </div>
          <VoiceTileVisual />
        </BentoCard>

        {/* Tile 4 - Vision */}
        <BentoCard glowColor="#22d3ee" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(34,211,238,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee' }}><Eye size={15} /></div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Vision</div>
          </div>
          <VisionTileVisual />
        </BentoCard>

        {/* Tile 5 - Multi-agent */}
        <BentoCard glowColor="#a78bfa" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(139,92,246,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}><Network size={15} /></div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Multi-agent</div>
          </div>
          <AgentTileVisual />
        </BentoCard>

        {/* Tile 6 - Collab */}
        <BentoCard glowColor="#f59e0b" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(245,158,11,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}><Users size={15} /></div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Realtime collab</div>
          </div>
          <CollabTileVisual />
        </BentoCard>
      </div>

      <style>{`
        @media(max-width:880px){.reveal-stagger>div{grid-column:span 6!important}}
      `}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HOW IT WORKS — sticky scroll reveal with animated number rings
// ══════════════════════════════════════════════════════════════════
function HowItWorks() {
  const [ref, inView] = useInView();
  const steps = [
    { n: 1, t: 'Connect your stack', d: 'Plug Vortis into your repos, docs, databases, and APIs. We index everything in minutes — no migration required, no lock-in.', icon: Layers, c: '#a78bfa' },
    { n: 2, t: 'Describe the outcome', d: 'Type, paste, or speak what you want built. Vortis orchestrates the right agents in parallel — code, search, vision, voice.', icon: Brain, c: '#22d3ee' },
    { n: 3, t: 'Watch it ship', d: 'Get production-ready output with tests, types, and docs. Review in a live preview, then deploy to your edge with one click.', icon: Rocket, c: '#ec4899' },
    { n: 4, t: 'Iterate at lightspeed', d: 'Every change is versioned, observable, and reversible. Your team stays in flow — Vortis handles the busywork.', icon: Zap, c: '#f59e0b' },
  ];
  return (
    <section ref={ref} className="section" id="how">
      <div style={{ textAlign: 'center', marginBottom: 70 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />HOW IT WORKS</div>
        <h2 className="h-section">From idea to live<br /><span className="gradient-text-aurora">in four steps.</span></h2>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', position: 'relative' }}>
        {/* Vertical connector line */}
        <div style={{ position: 'absolute', left: 39, top: 40, bottom: 40, width: 2, background: 'linear-gradient(180deg, rgba(139,92,246,.6), rgba(236,72,153,.4), rgba(245,158,11,.3), transparent)', zIndex: 0 }} />

        {steps.map((s, i) => (
          <HowStep key={s.n} step={s} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}

function HowStep({ step, delay }) {
  const [ref, inView] = useInView(0.4);
  const Icon = step.icon;
  return (
    <div ref={ref} className={`reveal ${inView ? 'in' : ''}`} style={{
      display: 'flex', gap: 24, marginBottom: 40, alignItems: 'flex-start', position: 'relative', zIndex: 1,
      transitionDelay: `${delay}s`,
    }}>
      {/* Number ring */}
      <div style={{ flexShrink: 0, position: 'relative', width: 80, height: 80 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          <circle cx="40" cy="40" r="36" fill="none" stroke={step.c} strokeWidth="2" strokeLinecap="round"
            strokeDasharray={inView ? '226' : '0'} strokeDashoffset={inView ? '0' : '226'}
            transform="rotate(-90 40 40)" style={{ transition: 'stroke-dashoffset 1.4s ease, stroke-dasharray 1.4s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 8, borderRadius: '50%',
          background: `radial-gradient(circle, ${step.c}33, transparent 70%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={22} style={{ color: step.c }} />
        </div>
      </div>

      {/* Text */}
      <div style={{ paddingTop: 14, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: step.c, fontWeight: 700, letterSpacing: '.1em' }}>STEP 0{step.n}</span>
        </div>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 12px' }}>{step.t}</h3>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 600 }}>{step.d}</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  SHOWCASE — tabbed demo with live previews
// ══════════════════════════════════════════════════════════════════
function Showcase() {
  const [ref, inView] = useInView();
  const [tab, setTab] = useState(0);
  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare, c: '#a78bfa' },
    { id: 'code', label: 'Code', icon: Code2, c: '#22d3ee' },
    { id: 'voice', label: 'Voice', icon: Mic, c: '#ec4899' },
    { id: 'vision', label: 'Vision', icon: Eye, c: '#f59e0b' },
  ];

  return (
    <section ref={ref} className="section" id="showcase">
      <div style={{ textAlign: 'center', marginBottom: 50 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />LIVE DEMO</div>
        <h2 className="h-section">See Vortis <span className="gradient-text">in action.</span></h2>
        <p className="h-sub" style={{ margin: '18px auto 0' }}>Switch between modes — every surface is fluid, every response is instant.</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 30, flexWrap: 'wrap' }}>
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const active = tab === i;
          return (
            <button key={t.id} onClick={() => setTab(i)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999,
              background: active ? `linear-gradient(135deg, ${t.c}33, ${t.c}11)` : 'rgba(255,255,255,.03)',
              border: `1px solid ${active ? `${t.c}66` : 'rgba(255,255,255,.08)'}`,
              color: active ? '#fff' : 'rgba(255,255,255,.6)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'all .25s ease',
              boxShadow: active ? `0 0 20px ${t.c}33` : 'none',
            }}>
              <Icon size={15} style={{ color: active ? t.c : 'rgba(255,255,255,.5)' }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Demo panel */}
      <div className={`reveal ${inView ? 'in' : ''}`} style={{
        maxWidth: 1100, margin: '0 auto', borderRadius: 28, padding: 4,
        background: 'conic-gradient(from 0deg, rgba(139,92,246,.4), rgba(236,72,153,.4), rgba(34,211,238,.3), rgba(245,158,11,.3), rgba(139,92,246,.4))',
        animation: 'spin 12s linear infinite',
      }}>
        <div style={{ background: 'linear-gradient(160deg, rgba(10,8,24,.98), rgba(4,3,12,.98))', borderRadius: 26, padding: 8, overflow: 'hidden' }}>
          <ShowcasePanel tab={tabs[tab]} key={tab} />
        </div>
      </div>
    </section>
  );
}

function ShowcasePanel({ tab }) {
  return (
    <div style={{ minHeight: 460, padding: 24, animation: 'fadeIn .4s ease' }}>
      {tab.id === 'chat' && <ChatDemo />}
      {tab.id === 'code' && <CodeDemo />}
      {tab.id === 'voice' && <VoiceDemo />}
      {tab.id === 'vision' && <VisionDemo />}
    </div>
  );
}

function ChatDemo() {
  const msgs = [
    { role: 'user', text: 'Build me a SaaS dashboard for tracking MRR' },
    { role: 'ai', text: 'On it. I\'ll spin up a Next.js app with Stripe billing, a churn cohort chart, and realtime MRR counter. Want me to scaffold the schema first?', typing: true },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      {msgs.map((m, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
          maxWidth: '80%', animation: `slideIn${m.role === 'user' ? 'Right' : 'Left'} .5s ease`, animationDelay: `${i * .3}s`, animationFillMode: 'both',
        }}>
          {m.role === 'ai' && (
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={16} />
            </div>
          )}
          <div style={{
            padding: '14px 18px', borderRadius: 16, maxWidth: '100%',
            background: m.role === 'user' ? 'rgba(139,92,246,.15)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${m.role === 'user' ? 'rgba(139,92,246,.3)' : 'rgba(255,255,255,.08)'}`,
            fontSize: 14, lineHeight: 1.55,
          }}>
            {m.text}
            {m.typing && <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6, verticalAlign: 'middle' }}>
              {[...Array(3)].map((_, j) => (
                <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa', animation: 'pulse 1s ease-in-out infinite', animationDelay: `${j * .15}s` }} />
              ))}
            </span>}
          </div>
        </div>
      ))}
      {/* Suggested actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 20 }}>
        {['📊 Yes, scaffold schema', '🎨 Use my brand colors', '⚡ Add realtime updates'].map((s, i) => (
          <button key={i} style={{
            padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.8)', fontSize: 12, cursor: 'pointer',
            transition: 'all .2s ease', animation: `fadeUp .4s ease`, animationDelay: `${1 + i * .1}s`, animationFillMode: 'both',
          }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(139,92,246,.15)'; e.target.style.borderColor = 'rgba(139,92,246,.4)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,.04)'; e.target.style.borderColor = 'rgba(255,255,255,.1)'; }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, height: '100%' }} className="code-demo-grid">
      <div style={{ background: 'rgba(0,0,0,.5)', borderRadius: 14, padding: 18, border: '1px solid rgba(255,255,255,.06)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>dashboard.tsx</span>
        </div>
        {[
          { t: 'export function', c: '#c084fc' }, { t: ' Dashboard({ mrr }) {', c: '#cbd5e1' },
        ].map((l, i) => (
          <div key={i} style={{ color: l.c, animation: `fadeIn .4s ease`, animationDelay: `${i * .1}s`, animationFillMode: 'both' }}>{l.t}{l.c2 && <span style={{ color: l.c2 }}>{l.t2}</span>}</div>
        ))}
        <div style={{ color: '#22d3ee' }}>  return (</div>
        <div style={{ color: '#cbd5e1' }}>    {'<Card>'}</div>
        <div style={{ color: '#cbd5e1' }}>      {'<Stat label="MRR"'}</div>
        <div style={{ color: '#fbbf24' }}>        {'value={`$${mrr.toLocaleString()}`}'}</div>
        <div style={{ color: '#cbd5e1' }}>        {'trend="+12.4%"'}</div>
        <div style={{ color: '#cbd5e1' }}>        {'animated />'}</div>
        <div style={{ color: '#cbd5e1' }}>      {'</Card>'}</div>
        <div style={{ color: '#cbd5e1' }}>    {'</Card>'}</div>
        <div style={{ color: '#22d3ee' }}>  )</div>
        <div style={{ color: '#cbd5e1' }}>{'}'}</div>
        <span style={{ display: 'inline-block', width: 7, height: 14, background: '#a78bfa', animation: 'blink .8s steps(2) infinite', verticalAlign: 'middle' }} />
      </div>

      {/* Preview */}
      <div style={{ background: 'rgba(0,0,0,.4)', borderRadius: 14, padding: 18, border: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace" }}>PREVIEW</div>
        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,.15), rgba(236,72,153,.1))', borderRadius: 12, padding: 18, border: '1px solid rgba(139,92,246,.2)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>Monthly recurring revenue</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", background: 'linear-gradient(180deg, #fff, #a78bfa)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>$48,250</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12 }}>
            <TrendingUp size={13} style={{ color: '#22c55e' }} />
            <span style={{ color: '#22c55e', fontWeight: 600 }}>+12.4%</span>
            <span style={{ color: 'rgba(255,255,255,.4)' }}>vs last month</span>
          </div>
        </div>
        {/* Mini chart */}
        <div style={{ flex: 1, background: 'rgba(255,255,255,.02)', borderRadius: 12, padding: 14, position: 'relative' }}>
          <svg viewBox="0 0 200 80" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="chartG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity=".5" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,60 L25,55 L50,45 L75,50 L100,35 L125,30 L150,25 L175,15 L200,10 L200,80 L0,80 Z" fill="url(#chartG)" />
            <path d="M0,60 L25,55 L50,45 L75,50 L100,35 L125,30 L150,25 L175,15 L200,10" stroke="#a78bfa" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <animate attributeName="stroke-dasharray" from="0,500" to="500,0" dur="2s" fill="freeze" />
            </path>
          </svg>
        </div>
      </div>
      <style>{`@media(max-width:880px){.code-demo-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

function VoiceDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 24 }}>
      <div style={{ position: 'relative' }}>
        {/* Pulse rings */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: -20 - i * 30, borderRadius: '50%',
            border: '1px solid rgba(236,72,153,.3)',
            animation: `radarPing 2.5s ease-out infinite`, animationDelay: `${i * .6}s`,
          }} />
        ))}
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: 'linear-gradient(135deg, #ec4899, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(236,72,153,.5)',
          animation: 'pulseScale 2s ease-in-out infinite',
        }}>
          <Mic size={36} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60 }}>
        {[...Array(40)].map((_, i) => (
          <div key={i} style={{
            width: 3, background: 'linear-gradient(180deg, #ec4899, #f59e0b)', borderRadius: 2,
            height: '100%',
            transformOrigin: 'center',
            animation: `waveBar ${.6 + (i % 5) * .12}s ease-in-out infinite`,
            animationDelay: `${i * .03}s`,
          }} />
        ))}
      </div>

      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: '.1em' }}>TRANSCRIBING</div>
        <div style={{ fontSize: 18, color: '#fff', lineHeight: 1.5 }}>
          "Add a quarterly retention chart to the dashboard and share it with the leadership channel"
          <span style={{ display: 'inline-block', width: 2, height: 18, background: '#ec4899', marginLeft: 3, verticalAlign: 'middle', animation: 'blink 1s steps(2) infinite' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['✓ Action queued', '✓ 3 commands parsed', '✓ Routing to dashboard agent'].map((s, i) => (
          <span key={i} style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', color: '#86efac', fontSize: 11, animation: 'fadeUp .4s ease', animationDelay: `${1 + i * .2}s`, animationFillMode: 'both' }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function VisionDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: '100%' }} className="vision-demo-grid">
      {/* Image with detections */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #1e1b4b, #4c1d95, #831843)', minHeight: 300 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 40%, rgba(34,211,238,.4), transparent 50%), radial-gradient(circle at 70% 60%, rgba(236,72,153,.4), transparent 50%), radial-gradient(circle at 50% 80%, rgba(245,158,11,.3), transparent 50%)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #22d3ee, transparent)', boxShadow: '0 0 16px #22d3ee', animation: 'scanLine 3s ease-in-out infinite' }} />
        {/* Detection boxes */}
        <div style={{ position: 'absolute', top: '15%', left: '10%', width: '45%', height: '40%', border: '2px solid #22d3ee', borderRadius: 8, boxShadow: '0 0 20px rgba(34,211,238,.4)' }}>
          <span style={{ position: 'absolute', top: -22, left: 0, padding: '3px 8px', background: '#22d3ee', color: '#000', fontSize: 10, fontWeight: 700, borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>chart 99%</span>
        </div>
        <div style={{ position: 'absolute', top: '60%', right: '12%', width: '30%', height: '25%', border: '2px solid #ec4899', borderRadius: 8, boxShadow: '0 0 20px rgba(236,72,153,.4)' }}>
          <span style={{ position: 'absolute', top: -22, right: 0, padding: '3px 8px', background: '#ec4899', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>cta 97%</span>
        </div>
      </div>

      {/* Analysis panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.1em' }}>ANALYSIS · 240ms</div>
        {[
          { t: 'Layout type', v: 'Dashboard', c: '#a78bfa' },
          { t: 'Components detected', v: '7 widgets', c: '#22d3ee' },
          { t: 'Color palette', v: '6 colors', c: '#ec4899' },
          { t: 'Design system', v: 'Material-like', c: '#f59e0b' },
          { t: 'Accessibility', v: 'AA compliant', c: '#22c55e' },
        ].map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.06)',
            animation: 'slideInRight .4s ease', animationDelay: `${i * .12}s`, animationFillMode: 'both',
          }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{r.t}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: r.c }}>{r.v}</span>
          </div>
        ))}
        <button className="btn-glow" style={{ marginTop: 8, padding: '12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Sparkles size={14} /> Recreate this layout
        </button>
      </div>
      <style>{`@media(max-width:880px){.vision-demo-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  DASHBOARD PREVIEW — animated SVG charts + live metrics
// ══════════════════════════════════════════════════════════════════
function DashboardPreview() {
  const [ref, inView] = useInView();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => p + 1), 1500);
    return () => clearInterval(id);
  }, []);
  const mrr = useCountUp(4825000, 2200, inView);
  const activeUsers = useCountUp(84213, 2200, inView);
  const queries = useCountUp(2400000, 2200, inView);
  const tokens = useCountUp(847, 2200, inView);

  return (
    <section ref={ref} className="section" id="dashboard">
      <div style={{ textAlign: 'center', marginBottom: 50 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />REAL-TIME OBSERVABILITY</div>
        <h2 className="h-section">Your operations,<br /><span className="gradient-text-aurora">in one glance.</span></h2>
      </div>

      <div className={`reveal ${inView ? 'in' : ''}`} style={{
        maxWidth: 1200, margin: '0 auto', borderRadius: 28, padding: 32,
        background: 'linear-gradient(160deg, rgba(15,12,30,.7), rgba(8,6,20,.85))',
        border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(20px)',
        boxShadow: '0 30px 100px -20px rgba(0,0,0,.6)',
      }}>
        {/* Top metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="metric-grid">
          {[
            { label: 'MRR', val: `$${mrr}`, trend: '+12.4%', up: true, c: '#a78bfa', icon: TrendingUp },
            { label: 'Active users', val: activeUsers, trend: '+8.2%', up: true, c: '#22d3ee', icon: Users },
            { label: 'Queries / day', val: queries, trend: '+24%', up: true, c: '#ec4899', icon: Search },
            { label: 'Tokens / sec', val: `${tokens}M`, trend: '+3.1%', up: true, c: '#f59e0b', icon: Zap },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,.025)', borderRadius: 14, padding: 18,
                border: '1px solid rgba(255,255,255,.06)', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', letterSpacing: '.05em' }}>{m.label}</div>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${m.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.c }}>
                    <Icon size={14} />
                  </div>
                </div>
                <div className="stat-num" style={{ fontSize: 28, marginBottom: 6 }}>{m.val}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#22c55e' }}>{m.trend}</span>
                  <span style={{ color: 'rgba(255,255,255,.4)' }}>vs last week</span>
                </div>
                {/* Sparkline */}
                <svg viewBox="0 0 100 30" style={{ width: '100%', height: 24, marginTop: 8 }}>
                  <path d={`M0,${20 + Math.sin(i) * 5} L20,${15 + Math.cos(i) * 3} L40,${18} L60,${10} L80,${12} L100,${5}`} stroke={m.c} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".6" />
                </svg>
              </div>
            );
          })}
        </div>

        {/* Main chart + side panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }} className="chart-grid">
          {/* Big chart */}
          <div style={{ background: 'rgba(255,255,255,.025)', borderRadius: 14, padding: 22, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Usage over time</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Last 30 days</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['7D', '30D', '90D', '1Y'].map((t, i) => (
                  <button key={t} style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: i === 1 ? 'rgba(139,92,246,.2)' : 'transparent',
                    border: `1px solid ${i === 1 ? 'rgba(139,92,246,.4)' : 'rgba(255,255,255,.08)'}`,
                    color: i === 1 ? '#c4b5fd' : 'rgba(255,255,255,.5)',
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <AnimatedChart inView={inView} pulse={pulse} />
          </div>

          {/* Side panel — live activity */}
          <div style={{ background: 'rgba(255,255,255,.025)', borderRadius: 14, padding: 18, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span className="live-dot" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Live activity</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { t: 'New signup', u: 'alex@startup.io', c: '#22c55e' },
                { t: 'API call', u: '/v1/stream', c: '#a78bfa' },
                { t: 'Build shipped', u: 'team-vercel', c: '#22d3ee' },
                { t: 'Upgrade', u: 'Pro → Team', c: '#f59e0b' },
                { t: 'New signup', u: 'mei@design.co', c: '#22c55e' },
              ].map((a, i) => (
                <div key={i + pulse * 5} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,.02)',
                  animation: 'slideInRight .4s ease', animationDelay: `${i * .08}s`, animationFillMode: 'both',
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.c, boxShadow: `0 0 8px ${a.c}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{a.t}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.u}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media(max-width:880px){.metric-grid{grid-template-columns:repeat(2,1fr)!important}.chart-grid{grid-template-columns:1fr!important}}
      `}</style>
    </section>
  );
}

function AnimatedChart({ inView, pulse }) {
  // Generate smooth curve points
  const points = Array.from({ length: 30 }, (_, i) => ({
    x: i * (200 / 29),
    y: 80 - Math.sin(i * 0.4 + pulse * 0.3) * 18 - (i / 30) * 30 - Math.random() * 5,
  }));
  const pathD = points.reduce((acc, p, i) => i === 0 ? `M${p.x},${p.y}` : `${acc} L${p.x},${p.y}`, '');
  const areaD = `${pathD} L200,100 L0,100 Z`;

  return (
    <div style={{ position: 'relative', height: 200 }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity=".4" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="rgba(255,255,255,.04)" strokeWidth=".3" strokeDasharray="2 2" />
        ))}
        <path d={areaD} fill="url(#areaG)" />
        <path d={pathD} stroke="url(#lineG)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={inView ? '1000' : '0'} strokeDashoffset={inView ? '0' : '1000'}
          style={{ transition: 'stroke-dashoffset 2s ease' }} />
        {/* End point pulse */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill="#f59e0b">
          <animate attributeName="r" from="2" to="5" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="1" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill="#f59e0b" />
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  TESTIMONIALS — 3D tilt cards grid
// ══════════════════════════════════════════════════════════════════
function Testimonials() {
  const [ref, inView] = useInView();
  const items = [
    { q: "Vortis replaced four tools in our stack. Our team ships 3x faster, and the realtime collab is genuinely magical — it feels like the team is in the same room even when we're spread across five time zones.", n: 'Alex Kureishi', r: 'CTO, Lumio', c: '#a78bfa', i: 'AK' },
    { q: "The multimodal agent orchestration is unmatched. We went from idea to production in 11 days for a feature that used to take us six weeks. The voice mode alone saves me an hour every single day.", n: 'Mei Rodriguez', r: 'Eng Lead, Northstar', c: '#22d3ee', i: 'MR' },
    { q: "I've used every AI workspace on the market. Vortis is the first one that feels designed for teams that actually ship. The observability dashboard is a chef's kiss — every metric I care about, live.", n: 'Jordan Smith', r: 'Founder, Tessellate', c: '#ec4899', i: 'JS' },
    { q: "We replaced our entire observability stack with Vortis. Setup took an afternoon. The ROI was visible in week one — our incident response time dropped 70%.", n: 'Priya Chen', r: 'VP Eng, Cadence', c: '#f59e0b', i: 'PC' },
    { q: "The vision mode is uncanny. I drop a screenshot of any UI and Vortis rebuilds it pixel-perfect in our design system. It's the closest thing to teleportation I've felt in software.", n: 'Tom Okafor', r: 'Design Lead, Drift', c: '#22c55e', i: 'TO' },
    { q: "Onboarding was 12 minutes. We were shipping by lunch. Vortis feels like the product Notion wishes it could become.", n: 'Sarah Lin', r: 'CEO, Pebble', c: '#a78bfa', i: 'SL' },
  ];
  return (
    <section ref={ref} className="section" id="testimonials">
      <div style={{ textAlign: 'center', marginBottom: 60 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />LOVED BY BUILDERS</div>
        <h2 className="h-section">Don't take our word.<br /><span className="gradient-text">Take theirs.</span></h2>
      </div>

      <div className={`reveal-stagger ${inView ? 'in' : ''}`} style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
      }}>
        {items.map((t, i) => (
          <TestimonialCard key={i} {...t} />
        ))}
      </div>
      <style>{`@media(max-width:880px){.reveal-stagger>div{grid-column:span 1!important}.reveal-stagger{grid-template-columns:1fr!important}}@media(max-width:1100px) and (min-width:881px){.reveal-stagger{grid-template-columns:repeat(2,1fr)!important}}`}</style>
    </section>
  );
}

function TestimonialCard({ q, n, r, c, i }) {
  const tiltRef = useTilt(8);
  return (
    <div ref={tiltRef} className="tilt-card lift" style={{
      padding: 28, borderRadius: 20, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(160deg, rgba(15,12,30,.6), rgba(8,6,20,.8))',
      border: '1px solid rgba(255,255,255,.06)', transformStyle: 'preserve-3d',
    }}>
      {/* Mouse glow */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none', background: `radial-gradient(circle 220px at var(--mx,50%) var(--my,50%), ${c}1a, transparent 70%)` }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${c}66, transparent)` }} />

      <div style={{ position: 'relative', transform: 'translateZ(30px)' }}>
        <Quote size={32} style={{ color: c, opacity: .4, marginBottom: 14 }} />
        <p style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(255,255,255,.85)', marginBottom: 22 }}>{q}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: `linear-gradient(135deg, ${c}, ${c}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 15, color: '#000', flexShrink: 0,
            boxShadow: `0 0 20px ${c}44`,
          }}>{i}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{n}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{r}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PRICING — tilt cards with popular tier glowing
// ══════════════════════════════════════════════════════════════════
function Pricing() {
  const [ref, inView] = useInView();
  const [annual, setAnnual] = useState(true);
  const tiers = [
    {
      name: 'Starter', price: annual ? 0 : 0, desc: 'For curious builders',
      features: ['5 projects', 'Community support', '1M tokens / month', 'Basic models', '1 user'],
      c: '#a78bfa', icon: Sparkles, popular: false,
    },
    {
      name: 'Pro', price: annual ? 24 : 32, desc: 'For serious builders',
      features: ['Unlimited projects', 'Priority support', '50M tokens / month', 'All models + voice', '5 team members', 'Custom agents', 'SSO'],
      c: '#ec4899', icon: Zap, popular: true,
    },
    {
      name: 'Team', price: annual ? 79 : 99, desc: 'For scaling teams',
      features: ['Everything in Pro', 'Dedicated support', '500M tokens / month', 'Unlimited members', 'Audit logs', 'SOC 2 reports', 'On-prem option'],
      c: '#f59e0b', icon: Crown, popular: false,
    },
  ];
  return (
    <section ref={ref} className="section" id="pricing">
      <div style={{ textAlign: 'center', marginBottom: 50 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />PRICING</div>
        <h2 className="h-section">Simple pricing.<br /><span className="gradient-text">Serious power.</span></h2>

        {/* Annual/Monthly toggle */}
        <div style={{ display: 'inline-flex', padding: 4, borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', marginTop: 28 }}>
          <button onClick={() => setAnnual(false)} style={{
            padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: !annual ? 'linear-gradient(135deg, #7c3aed, #ec4899)' : 'transparent',
            border: 'none', color: !annual ? '#fff' : 'rgba(255,255,255,.6)', transition: 'all .25s ease',
          }}>Monthly</button>
          <button onClick={() => setAnnual(true)} style={{
            padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: annual ? 'linear-gradient(135deg, #7c3aed, #ec4899)' : 'transparent',
            border: 'none', color: annual ? '#fff' : 'rgba(255,255,255,.6)', transition: 'all .25s ease',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>Annual <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,.2)', color: '#86efac' }}>-25%</span></button>
        </div>
      </div>

      <div className={`reveal-stagger ${inView ? 'in' : ''}`} style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, maxWidth: 1100, margin: '0 auto',
        alignItems: 'center',
      }}>
        {tiers.map((t, i) => {
          const Icon = t.icon;
          const tiltRef = useTilt(8);
          return (
            <div key={t.name} ref={tiltRef} className="tilt-card lift" style={{
              position: 'relative', padding: 32, borderRadius: 24,
              background: t.popular
                ? 'linear-gradient(160deg, rgba(139,92,246,.15), rgba(236,72,153,.08), rgba(8,6,20,.9))'
                : 'linear-gradient(160deg, rgba(15,12,30,.6), rgba(8,6,20,.8))',
              border: `1px solid ${t.popular ? t.c + '66' : 'rgba(255,255,255,.06)'}`,
              transformStyle: 'preserve-3d',
              boxShadow: t.popular ? `0 0 60px -10px ${t.c}44, 0 0 0 1px ${t.c}33` : 'none',
              transform: t.popular ? 'scale(1.04)' : 'scale(1)',
            }}>
              {t.popular && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  padding: '5px 14px', borderRadius: 999,
                  background: `linear-gradient(135deg, ${t.c}, ${t.c}cc)`,
                  fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: '#fff',
                  boxShadow: `0 4px 16px ${t.c}66`,
                }}>MOST POPULAR</div>
              )}

              <div style={{ position: 'relative', transform: 'translateZ(30px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${t.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.c }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif" }}>{t.name}</div>
                </div>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginBottom: 18 }}>{t.desc}</div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 24 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-.04em', background: `linear-gradient(180deg, #fff, ${t.c})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${t.price}</span>
                  <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>/ user / mo</span>
                </div>

                <button className={t.popular ? 'btn-glow' : 'btn-ghost'} style={{ width: '100%', padding: '13px', fontSize: 14, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {t.price === 0 ? 'Start free' : `Get ${t.name}`} <ArrowRight size={15} />
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {t.features.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,.75)' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${t.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={11} style={{ color: t.c }} />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@media(max-width:880px){.reveal-stagger>div{transform:scale(1)!important}.reveal-stagger{grid-template-columns:1fr!important}}@media(max-width:1100px) and (min-width:881px){.reveal-stagger{grid-template-columns:1fr!important;max-width:480px}}`}</style>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FAQ — smooth expand/collapse
// ══════════════════════════════════════════════════════════════════
function FaqItem({ faq, index, inView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item" style={{
      background: 'rgba(255,255,255,.025)', borderRadius: 16, marginBottom: 12,
      border: `1px solid ${open ? 'rgba(139,92,246,.3)' : 'rgba(255,255,255,.06)'}`,
      overflow: 'hidden', transition: 'all .3s ease',
      animation: 'fadeUp .5s ease', animationDelay: `${index * .08}s`, animationFillMode: 'both',
    }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', padding: '20px 24px', background: 'transparent', border: 'none', color: '#fff',
        fontSize: 16, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      }}>
        <span>{faq.q}</span>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: open ? 'rgba(139,92,246,.2)' : 'rgba(255,255,255,.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'transform .3s ease, background .3s ease',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }}>
          <ChevronDown size={16} style={{ color: open ? '#a78bfa' : 'rgba(255,255,255,.5)' }} />
        </div>
      </button>
      <div style={{
        maxHeight: open ? '400px' : '0', overflow: 'hidden',
        transition: 'max-height .4s cubic-bezier(.2,.7,.3,1)',
      }}>
        <div style={{ padding: '0 24px 22px', color: 'rgba(255,255,255,.65)', fontSize: 14.5, lineHeight: 1.65 }}>
          {faq.a}
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  const [ref, inView] = useInView();
  const faqs = [
    { q: 'How is Vortis different from other AI workspaces?', a: 'Vortis is the only workspace that natively orchestrates multiple modalities — chat, code, search, vision, voice — through a single agent mesh. Most tools bolt AI onto existing surfaces. We rebuilt the surface around the AI, so every interaction is fluid, contextual, and instant.' },
    { q: 'Can I bring my own models?', a: 'Yes. Pro and Team plans support custom model endpoints (OpenAI, Anthropic, Mistral, Llama, or your own fine-tuned weights hosted anywhere). We abstract the plumbing — you bring the brain, we handle the rest.' },
    { q: 'Is my data secure?', a: 'Vortis is SOC 2 Type II certified, GDPR compliant, and offers end-to-end encryption at rest and in transit. Team plans add SSO, audit logs, and an on-prem deployment option for regulated industries. We never train on your data.' },
    { q: 'How long does setup take?', a: 'Most teams are productive within 12 minutes. Connect your repos and docs, invite your teammates, and start shipping. No migration scripts, no schema changes, no professional services required.' },
    { q: 'What happens if I exceed my token quota?', a: 'We never hard-throttle. You will get a heads-up at 80% and 100% of your quota, and overages are billed at $0.50 per million tokens. Pro and Team plans can also set hard caps to stay within budget.' },
    { q: 'Do you offer a startup discount?', a: 'Yes — eligible startups (under $5M raised, less than 3 years old) get 50% off the Pro plan for the first year. Reach out to startup@vortis.ai with your details.' },
  ];
  return (
    <section ref={ref} className="section" id="docs" style={{ maxWidth: 880 }}>
      <div style={{ textAlign: 'center', marginBottom: 50 }} className={`reveal ${inView ? 'in' : ''}`}>
        <div className="eyebrow" style={{ marginBottom: 18 }}><span className="dot" />FAQ</div>
        <h2 className="h-section">Questions, answered.</h2>
      </div>
      {faqs.map((f, i) => (
        <FaqItem key={i} faq={f} index={i} inView={inView} />
      ))}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  CTA — massive glowing final call-to-action
// ══════════════════════════════════════════════════════════════════
function CTA({ onLogin }) {
  const [ref, inView] = useInView();
  const ctaRef = useMagnetic(0.2);
  return (
    <section ref={ref} className="section" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className={`reveal ${inView ? 'in' : ''}`} style={{
        position: 'relative', maxWidth: 1100, margin: '0 auto', padding: '80px 40px',
        borderRadius: 32, overflow: 'hidden', textAlign: 'center',
      }}>
        {/* Aurora bg */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 30%, rgba(139,92,246,.4), transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(236,72,153,.35), transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(34,211,238,.2), transparent 70%)', filter: 'blur(20px)', animation: 'auroraShift 8s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(15,12,30,.7), rgba(8,6,20,.85))' }} />

        {/* Conic rotating border */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 32, padding: 1.5, background: 'conic-gradient(from 0deg, rgba(139,92,246,.5), rgba(236,72,153,.5), rgba(245,158,11,.4), rgba(34,211,238,.4), rgba(139,92,246,.5))', animation: 'spin 10s linear infinite', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 20 }}><span className="dot" />READY?</div>
          <h2 className="h-section" style={{ fontSize: 'clamp(40px, 6vw, 76px)' }}>
            Build the future.<br /><span className="gradient-text">Today.</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 19, lineHeight: 1.55, maxWidth: 580, margin: '24px auto 40px' }}>
            Join 120,000+ builders shipping at the speed of thought. Free to start, no credit card, no lock-in.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button ref={ctaRef} onClick={onLogin} className="btn-glow magnetic" style={{ padding: '18px 32px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              Start building free <ArrowRight size={18} />
            </button>
            <button className="btn-ghost" style={{ padding: '17px 30px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Phone size={17} /> Talk to sales
            </button>
          </div>

          <div style={{ display: 'flex', gap: 28, justifyContent: 'center', marginTop: 36, flexWrap: 'wrap', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} style={{ color: '#22c55e' }} /> No credit card</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} style={{ color: '#22c55e' }} /> Cancel anytime</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} style={{ color: '#22c55e' }} /> SOC 2 Type II</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FOOTER
// ══════════════════════════════════════════════════════════════════
function Footer() {
  const cols = [
    { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap', 'Status'] },
    { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press', 'Contact'] },
    { title: 'Resources', links: ['Docs', 'API Reference', 'Community', 'Tutorials', 'Showcase'] },
    { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'DPA', 'SOC 2'] },
  ];
  return (
    <footer style={{ position: 'relative', padding: '80px 24px 40px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 60, marginBottom: 60 }} className="footer-grid">
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <VortisLogo size={32} />
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 }}>Vortis</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, lineHeight: 1.6, maxWidth: 320, marginBottom: 20 }}>
              The AI workspace that thinks with you. Build, ship, and iterate at the speed of thought.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {['twitter', 'github', 'discord', 'linkedin'].map(s => (
                <a key={s} href={`#${s}`} style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  transition: 'all .25s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,.15)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,.4)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = 'rgba(255,255,255,.5)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  {s[0]}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 30 }}>
            {cols.map(c => (
              <div key={c.title}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: '.1em', marginBottom: 16, textTransform: 'uppercase' }}>{c.title}</div>
                {c.links.map(l => (
                  <a key={l} href={`#${l.toLowerCase()}`} style={{
                    display: 'block', padding: '5px 0', color: 'rgba(255,255,255,.6)', textDecoration: 'none', fontSize: 14,
                    transition: 'color .2s ease',
                  }}
                    onMouseEnter={(e) => e.target.style.color = '#fff'}
                    onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,.6)'}>{l}</a>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 30, borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            All systems operational
          </div>
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
            © 2026 Vortis, Inc. · Built with intelligence in San Francisco.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,.4)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="kbd">⌘</span><span className="kbd">K</span> to search
          </div>
        </div>
      </div>
      <style>{`@media(max-width:880px){.footer-grid{grid-template-columns:1fr!important}.footer-grid>div:last-child{grid-template-columns:repeat(2,1fr)!important}}`}</style>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LANDING PAGE — default export
// ══════════════════════════════════════════════════════════════════
export default function LandingPage({ onLogin, authLoading = false, authError = "" }) {
  // Smooth scroll reveal observer for any element with .reveal class
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const handleLogin = (creds) => {
    onLogin?.(creds);
  };

  return (
    <>
      <StyleInjector />
      <ScrollProgress />
      <CursorGlow />
      <CosmicBg />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <Nav onLogin={handleLogin} />
        <Hero onLogin={handleLogin} authLoading={authLoading} authError={authError} />
        <Logos />
        <BentoGrid />
        <HowItWorks />
        <Showcase />
        <DashboardPreview />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA onLogin={handleLogin} />
        <Footer />
      </div>
    </>
  );
}

