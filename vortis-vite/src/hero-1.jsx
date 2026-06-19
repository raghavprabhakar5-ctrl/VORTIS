import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, Code2, Eye, Globe, Brain, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Zap,
  Shield, Cpu, Layers, ArrowRight, Sparkles, Lock,
  BarChart3, Wifi, ChevronDown, Star, Award, Crown,
  Gem, Diamond, Medal, Trophy, Target, Rocket, Users,
  TrendingUp, Clock, Database, Search, Palette
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
*,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
html{scroll-behavior:smooth;overflow-x:hidden}
body{margin:0;padding:0;overflow-x:hidden;background:#03030a;color:#fff}

@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(80px,-60px) scale(1.2)}66%{transform:translate(-30px,70px) scale(.9)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(-70px,50px) scale(1.3)}70%{transform:translate(40px,-40px) scale(.85)}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-40px,-80px) scale(1.15)}}
@keyframes orb4{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(60px,40px) scale(1.1)}70%{transform:translate(-20px,-30px) scale(.92)}}

@keyframes marquee-l{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}

@keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-50px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes floatReverse{0%,100%{transform:translateY(0)}50%{transform:translateY(12px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes borderFlow{0%,100%{border-color:rgba(124,58,237,.3)}50%{border-color:rgba(168,85,247,.8)}}
@keyframes goldGlow{0%,100%{box-shadow:0 0 20px rgba(251,191,36,.12),0 0 50px rgba(124,58,237,.08)}50%{box-shadow:0 0 50px rgba(251,191,36,.3),0 0 100px rgba(124,58,237,.18)}}
@keyframes gridFade{0%{opacity:.012}50%{opacity:.022}100%{opacity:.012}}
@keyframes countUp{from{opacity:0;transform:translateY(16px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
@keyframes particleDrift{0%{transform:translate(0,0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
@keyframes morphBorder{0%,100%{border-radius:60% 40% 30% 70% / 60% 30% 70% 40%}50%{border-radius:30% 60% 70% 40% / 50% 60% 30% 60%}}
@keyframes typewriter{from{width:0}to{width:100%}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(3);opacity:0}}
@keyframes glitchX{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}
@keyframes neonPulse{0%,100%{text-shadow:0 0 7px rgba(139,92,246,.5),0 0 20px rgba(139,92,246,.3)}50%{text-shadow:0 0 14px rgba(139,92,246,.8),0 0 40px rgba(139,92,246,.5),0 0 60px rgba(139,92,246,.3)}}
@keyframes waveFloat{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-8px) rotate(1deg)}75%{transform:translateY(8px) rotate(-1deg)}}
@keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}

::-webkit-scrollbar{width:5px;background:#03030a}
::-webkit-scrollbar-thumb{background:linear-gradient(#7C3AED,#06b6d4);border-radius:3px}

.glow-text{animation:neonPulse 3s ease-in-out infinite}
.shimmer-text{background:linear-gradient(90deg,#fff 0%,#a855f7 25%,#fff 50%,#06b6d4 75%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 4s linear infinite}
.gradient-border{position:relative}
.gradient-border::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(124,58,237,.6),rgba(168,85,247,.4),rgba(6,182,212,.6));-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

// ══════════════════════════════════════════════════════════════════
//  HOOKS
// ══════════════════════════════════════════════════════════════════
function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function useCountUp(target, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return count;
}

// ══════════════════════════════════════════════════════════════════
//  VORTIS LOGO
// ══════════════════════════════════════════════════════════════════
export function VortisLogo({ size = 36, color = "#8b5cf6", className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1254 1254" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M0 0 C2.97551795 1.77603298 5.42755188 3.85510377 7 7 C7.11791887 8.38616367 7.17694276 9.77757631 7.20532227 11.16845703 C7.22524231 12.04519577 7.24516235 12.92193451 7.26568604 13.82524109 C7.29079254 15.27686394 7.29079254 15.27686394 7.31640625 16.7578125 C7.34791779 18.29215691 7.34791779 18.29215691 7.38006592 19.85749817 C7.44748254 23.27991239 7.50609512 26.70238724 7.5625 30.125 C7.58234955 31.29773468 7.6021991 32.47046936 7.62265015 33.67874146 C7.7612943 42.0831845 7.87456786 50.48784107 7.97470093 58.89281464 C8.00042824 61.03566883 8.02715217 63.17850912 8.05395508 65.3213501 C8.16186031 74.10092842 8.24010655 82.88021788 8.28610229 91.66033936 C8.30164142 94.50574734 8.32645681 97.35084467 8.35916138 100.19610596 C8.42578125 112.21484375 8.45890861 123.44413203 2.46484375 133.75 C-1.84867608 137.28024641 -6.42325204 140.20200539 -11.15625 143.140625 C-15.698455 146.11052827 -19.82950596 149.53686891 -24 153 C-24.84691406 153.66128906 -24.84691406 153.66128906 -25.7109375 154.3359375 C-29.24570442 157.1226056 -32.14616039 160.25335105 -35.03515625 163.6796875 C-36.40505539 165.29742128 -37.81209097 166.88411991 -39.24609375 168.4453125 C-53.53623377 184.49599777 -66.44022935 207.44301314 -68.55078125 229.13671875 C-72.41478281 249.33698163 -72.33618164 256.08447266 -67.625 298.625 C-58.52154173 331.10569329 -31 364 -28.92578125 366.26953125 C-16.1208883 379.7844922 1.32613078 390.31286386 19 396 C36.37825416 402.4427861 49.1200395 402.36489181 85 402 C93.23396028 398.83231815 104.0546875 395.25 133.18530273 381.82714844 C172.75 358.875 199.33251953 343.51904297 232.46142578 324.52783203 C264.95166016 306.0612793 326.8125 271.125 385.60009766 237.87939453 C441 207 483.00805664 183.56396484 538.78125 163.6875 C546.77364224 167.41055268 586.171875 190.484375 608.58203125 233.25390625 C595.60068824 243.68340854 530.03710938 280.26220703 441.1875 331.375 C360.3515625 378.98828125 261.3125 438.3125 167.59521484 492.74267578 C104.25 513.1875 58.0633922 520.80335318 -29 499 C-83.06880952 469.12871672 -126 425 -149.07179934 396.0168839 C-174 334 -182 223 -166 162 C-153.60931815 128.82666809 -114 77 -91 54 C-69.83101453 35.8451406 -28.12597656 11.17919922 0 0 Z" fill={color} transform="translate(320,528)"/>
      <path d="M0 0 C13 4 36.18525958 13.45452025 73 40 C91.14585658 54.71651706 117 85 131.88933834 106.34788041 C150.9296875 149.60546875 164 205 165.203125 233.921875 C165.32357025 276.8890152 160.578125 305.8515625 152.546875 307.3984375 C137.08167471 300.74266427 85.74069214 271.04716492 56 246 C54.71875 235.578125 48.625 189.8125 42 175 C32.06899977 147.16478584 -15 115 -51 103 C-84.3442227 97.12795437 -140 118 -165 136 C-191.16877943 160.3749499 -205.32041707 226.35818649 -206.28979492 457.17358398 C-206.98529428 636.55840379 -207.37494373 687.69657536 -216.19628906 710.24951172 C-228 718 -268.5637207 740.42895508 -288.26977539 751.37426758 C-302.3125 755.5 -315.74946022 738.79073524 -315.75502992 701.98534536 C-315.62042307 465.9027603 -315.55757141 253.59127617 -315.53031926 235.72050564 C-315.63001513 202.21749298 -301.125 147.125 -261 77 C-254 69 -192.8930966 -1.14877909 -95.91099103 -27.66080594 Z" fill={color} transform="translate(701,106)"/>
      <path d="M0 0 C48.625 29.25 145.82397461 86.61987305 206.0078125 121.9375 C283.78308792 167.70554595 365.9375 215.9375 444.9375 268.9375 C465.75963126 288.5969832 502.10135822 335.75667549 526.76171875 429.16796875 C528.1875 455.75 514.9375 541.9375 466.9375 627.9375 C401.9375 682.9375 288.44677734 714.32861328 229.5625 708.25 C135.9375 664.9375 113.35253906 644.75219727 157.6875 608.5 C215.375 581.203125 247.5234375 595.04296875 310.9375 599.9375 C375.54150391 564.31445312 415.49951172 495.02197266 420.12280273 458.72802734 C409.9375 402.9375 337.41015625 327.01171875 251.5 276.6875 C144.65869141 213.56640625 43.11157227 152.74481201 -23.73803711 112.7980957 C-45.0625 92.9375 -48.22363281 80.31396484 -38.58203125 0.11328125 Z" fill={color} transform="translate(587.0625,330.0625)"/>
    </svg>
  );
}
// ══════════════════════════════════════════════════════════════════
//  CURSOR ORB
// ══════════════════════════════════════════════════════════════════
function CursorOrb() {
  const [pos, setPos] = useState({ x: -300, y: -300 });
  const [visible, setVisible] = useState(false);
  const [clicking, setClicking] = useState(false);
  useEffect(() => {
    const move = (e) => { setPos({ x: e.clientX, y: e.clientY }); setVisible(true); };
    const leave = () => setVisible(false);
    const down = () => setClicking(true);
    const up = () => setClicking(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseleave", leave);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseleave", leave);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);
  return (
    <>
      <div style={{
        position: "fixed", pointerEvents: "none", zIndex: 9998,
        left: pos.x - 250, top: pos.y - 250, width: 500, height: 500,
        borderRadius: "50%", opacity: visible ? 1 : 0,
        background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, rgba(168,85,247,0.04) 40%, transparent 70%)",
        transition: "left 0.12s ease, top 0.12s ease, opacity 0.4s ease",
        willChange: "left, top",
      }} />
      <div style={{
        position: "fixed", pointerEvents: "none", zIndex: 9999,
        left: pos.x - 8, top: pos.y - 8,
        width: clicking ? 22 : 16, height: clicking ? 22 : 16,
        borderRadius: "50%",
        background: "rgba(139,92,246,0.6)",
        border: "1px solid rgba(139,92,246,0.9)",
        opacity: visible ? 1 : 0,
        transition: "left 0.04s ease, top 0.04s ease, width 0.15s ease, height 0.15s ease, opacity 0.3s ease",
        boxShadow: "0 0 12px rgba(139,92,246,0.5)",
        willChange: "left, top",
      }} />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FLOATING PARTICLES
// ══════════════════════════════════════════════════════════════════
function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
      color: ["rgba(124,58,237,", "rgba(168,85,247,", "rgba(6,182,212,", "rgba(99,102,241,"][Math.floor(Math.random() * 4)],
      dx: (Math.random() - 0.5) * 200,
      dy: (Math.random() - 0.5) * 200,
    }))
  ).current;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          borderRadius: "50%",
          background: `${p.color}0.7)`,
          boxShadow: `0 0 ${p.size * 3}px ${p.color}0.4)`,
          animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  COSMIC BACKGROUND
// ══════════════════════════════════════════════════════════════════
function CosmicBg() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {[
        { a: "orb1 28s ease-in-out infinite", t: "5%", l: "10%", w: 700, c: "rgba(124,58,237,0.06)", b: 120 },
        { a: "orb2 35s ease-in-out infinite 5s", t: "40%", r: "5%", w: 600, c: "rgba(168,85,247,0.05)", b: 140 },
        { a: "orb3 40s ease-in-out infinite 12s", bt: "10%", l: "30%", w: 520, c: "rgba(6,182,212,0.035)", b: 110 },
        { a: "orb4 32s ease-in-out infinite 8s", t: "60%", l: "5%", w: 450, c: "rgba(99,102,241,0.04)", b: 130 },
        { a: "orb1 45s ease-in-out infinite 20s", t: "20%", r: "20%", w: 380, c: "rgba(6,182,212,0.03)", b: 100 },
      ].map((o, i) => (
        <div key={i} style={{
          position: "absolute", borderRadius: "50%", width: o.w, height: o.w,
          top: o.t, left: o.l, right: o.r, bottom: o.bt,
          background: o.c, filter: `blur(${o.b}px)`,
          animation: o.a, willChange: "transform",
        }} />
      ))}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.018,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
        backgroundSize: "55px 55px", animation: "gridFade 8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, transparent 0%, rgba(3,3,10,0.3) 100%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NAV
// ══════════════════════════════════════════════════════════════════
const NAV_LINKS = [
  { label: "Capabilities", href: "#capabilities" },
  { label: "How it works", href: "#howitworks" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

function Nav({ onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 32px", height: 60,
      background: scrolled ? "rgba(3,3,10,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(24px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      transition: "all 0.4s ease",
    }}>
      <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", animation: "slideInLeft 0.7s ease both" }}>
        <VortisLogo size={30} color="#8b5cf6" />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.1em", color: "#fff" }}>VORTIS</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a855f7", letterSpacing: "0.08em" }}>AI</span>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: 32, animation: "fadeIn 0.9s 0.2s ease both" }}>
        {NAV_LINKS.map(l => (
          <a key={l.label} href={l.href} style={{
            fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.5)",
            textDecoration: "none", transition: "color 0.2s", position: "relative",
          }}
          onMouseEnter={e => e.target.style.color = "#fff"}
          onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.5)"}
          >{l.label}</a>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "slideInRight 0.7s ease both" }}>
        <button onClick={() => onLogin('google')} style={{
          padding: "8px 22px", borderRadius: 99, fontSize: 13, fontWeight: 700,
          background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", color: "#fff",
          border: "none", cursor: "pointer",
          boxShadow: "0 0 20px rgba(124,58,237,0.4), 0 0 40px rgba(124,58,237,0.15)",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05) translateY(-1px)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(124,58,237,0.6), 0 0 60px rgba(124,58,237,0.25)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(124,58,237,0.4), 0 0 40px rgba(124,58,237,0.15)"; }}
        >Start Free →</button>
      </div>
    </nav>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════
const CYCLE_WORDS = [
  "INTELLIGENCE",
  "REASONING",
  "CREATIVITY",
  "RESEARCH",
  "UNDERSTANDING",
  "AUTOMATION",
  "VISION",
  "FUTURE",
  "INNOVATION"
];

// Custom typewriter component for the headline string parsing
function TypewriterWord({ word }) {
  const [displayed, setDisplayed] = useState("");
  const [phase, setPhase] = useState("typing");

  useEffect(() => {
    setDisplayed("");
    setPhase("typing");
    let i = 0;
    const type = setInterval(() => {
      if (i <= word.length) {
        setDisplayed(word.slice(0, i));
        i++;
      } else {
        clearInterval(type);
        setPhase("done");
      }
    }, 60);
    return () => clearInterval(type);
  }, [word]);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{
        background: "linear-gradient(90deg,#7C3AED 0%,#a855f7 40%,#06B6D4 100%)",
        backgroundSize: "200% auto",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        animation: "gradientShift 4s ease-in-out infinite",
      }}>
        {displayed}
      </span>
      <span style={{
        display: "inline-block", width: 4, height: "0.85em",
        background: "#a855f7", marginLeft: 3, verticalAlign: "middle",
        animation: phase === "done" ? "blink 0.8s step-end infinite" : "none",
        opacity: 1,
      }} />
    </span>
  );
}
// Interactive chat module mock up for the right side visual container
function HeroVisual() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const messages = [
    { role: "user", text: "Analyze competitor pricing" },
    { role: "ai", text: "Found 12 sources. Stripe charges 2.9% + 30¢…" },
    { role: "user", text: "Generate a comparison chart" },
    { role: "ai", text: "Creating visualization…", typing: true },
  ];

  return (
    <div className="hero-visual" style={{
      width: "100%", maxWidth: 480, borderRadius: 20,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      overflow: "hidden", animation: "waveFloat 6s ease-in-out infinite",
      boxShadow: "0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.1)",
    }}>
      {/* Window chrome */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)" }}>
        {["#ef4444","#f59e0b","#10b981"].map(c => (
          <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />
        ))}
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", margin: "0 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 2s ease-in-out infinite" }} />
          LIVE
        </div>
      </div>
      
      {/* Messages */}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            opacity: tick > i * 0.5 ? 1 : 0,
            transform: tick > i * 0.5 ? "translateY(0)" : "translateY(8px)",
            transition: "all 0.4s ease",
          }}>
            {m.role === "ai" && (
              <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {/* Ensure component is present or switch to a fallback icon/text */}
                <VortisLogo size={14} color="#fff" />
              </div>
            )}
            <div style={{
              padding: "8px 12px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
              background: m.role === "user" ? "linear-gradient(135deg,#7C3AED,#6366f1)" : "rgba(255,255,255,0.05)",
              border: m.role === "ai" ? "1px solid rgba(255,255,255,0.08)" : "none",
              fontSize: 12.5, color: m.role === "user" ? "#e0d9ff" : "rgba(255,255,255,0.8)",
              maxWidth: "80%", lineHeight: 1.5,
            }}>
              {m.typing ? (
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[0,1,2].map(d => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite` }} />
                  ))}
                </span>
              ) : m.text}
            </div>
          </div>
        ))}
      </div>
      
      {/* Input bar */}
      <div style={{ padding: "10px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", padding: "0 12px" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono',monospace" }}>Ask anything…</span>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(124,58,237,0.4)" }}>
          <ArrowRight size={14} color="#fff" />
        </div>
      </div>
    </div>
  );
}

export function Hero({ onLogin, authLoading, authError }) {
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setWordIdx(i => (i + 1) % CYCLE_WORDS.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero-grid" style={{
      minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr",
      alignItems: "center", gap: 60,
      padding: "100px 80px 80px", position: "relative", zIndex: 1,
      maxWidth: 1300, margin: "0 auto",
    }}>
      <style>{`@media(max-width:900px){.hero-grid{grid-template-columns:1fr!important;padding:100px 24px 60px!important}.hero-visual{display:none!important}}`}</style>

      <div className="hero-left">
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.08)", marginBottom: 28, animation: "fadeUp 0.6s ease both" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a855f7", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.9)", fontFamily: "'JetBrains Mono',monospace" }}>New · AI Platform 2026</span>
        </div>

       {/* Headline */}
<h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.04em", margin: "0 0 24px", fontSize: "clamp(3rem,5.5vw,5.5rem)" }}>
  <span style={{ display: "block", color: "#fff", animation: "slideInLeft 0.7s 0.1s ease both" }}>THE</span>

  <span style={{ display: "block" }}>
    <TypewriterWord word={CYCLE_WORDS[wordIdx]} />
  </span>

  <span style={{ display: "block", color: "rgba(255,255,255,0.25)", animation: "slideInRight 0.7s 0.4s ease both" }}>YOU DESERVE.</span>
</h1>
        {/* Description Sub-headline */}
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", maxWidth: 480, lineHeight: 1.75, marginBottom: 40, animation: "fadeUp 0.7s 0.5s ease both" }}>
          Chat, Vision, Code, Research — unified in one surface. Built for the way you actually think.
        </p>
        

        {/* CTA */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 52, animation: "fadeUp 0.7s 0.65s ease both" }}>
          <button onClick={() => onLogin('google')} disabled={authLoading} style={{
            padding: "14px 32px", borderRadius: 99, fontSize: 15, fontWeight: 700,
            background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", color: "#fff",
            border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 0 40px rgba(124,58,237,0.5), 0 8px 32px rgba(124,58,237,0.3)",
            transition: "all 0.25s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(124,58,237,0.7), 0 16px 48px rgba(124,58,237,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(124,58,237,0.5), 0 8px 32px rgba(124,58,237,0.3)"; }}
          >
            <Zap size={16} /> {authLoading ? "Signing in…" : "Start Free"}
          </button>
          <a href="#capabilities" style={{
            padding: "14px 26px", borderRadius: 99, fontSize: 15, fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.04)", textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
          >Watch Demo</a>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 32, animation: "fadeUp 0.7s 0.8s ease both" }}>
          {[["50K+", "Users"], ["99.9%", "Uptime"], ["4.9★", "Rating"]].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: 24, background: "linear-gradient(135deg,#a855f7,#7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{n}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{l}</div>
            </div>
          ))}
          <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>All systems operational</span>
          </div>
        </div>

        {authError && (
          <div style={{ marginTop: 16, color: "#f87171", fontSize: 13, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 16px", display: "inline-block" }}>
            {authError}
          </div>
        )}
      </div>

      {/* Right: visual */}
      <div className="hero-visual" style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.15), transparent 70%)", filter: "blur(40px)" }} />
        <HeroVisual />
        {/* Floating badges */}
        {[
          { text: "Web Search", icon: "🌐", top: "5%", right: "-5%", delay: "0s" },
          { text: "Image Gen", icon: "🎨", bottom: "15%", left: "-8%", delay: "1.2s" },
          { text: "Vision AI", icon: "👁️", top: "40%", right: "-12%", delay: "0.6s" },
        ].map(b => (
          <div key={b.text} style={{
            position: "absolute", top: b.top, right: b.right, bottom: b.bottom, left: b.left,
            display: "flex", alignItems: "center", gap: 7, padding: "8px 14px",
            borderRadius: 99, background: "rgba(10,10,20,0.85)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)",
            animation: `float 4s ease-in-out ${b.delay} infinite`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            whiteSpace: "nowrap",
          }}>
            <span>{b.icon}</span>{b.text}
          </div>
        ))}
      </div>

      {/* Scroll indicator */}
      <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.2)", animation: "float 2.5s ease-in-out infinite" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'JetBrains Mono',monospace" }}>Scroll</span>
        <ChevronDown size={16} />
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BRAND LOGOS
// ══════════════════════════════════════════════════════════════════
const BRAND_DATA = {
  Google: {
    color: "#4285F4",
    multiPath: [
      { d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z", fill: "#4285F4" },
      { d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z", fill: "#34A853" },
      { d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z", fill: "#FBBC05" },
      { d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z", fill: "#EA4335" },
    ],
  },
  Microsoft: {
    color: "#F25022",
    multiPath: [
      { d: "M1 1h10.5v10.5H1z", fill: "#F25022" },
      { d: "M12.5 1H23v10.5H12.5z", fill: "#7FBA00" },
      { d: "M1 12.5h10.5V23H1z", fill: "#00A4EF" },
      { d: "M12.5 12.5H23V23H12.5z", fill: "#FFB900" },
    ],
  },
  Apple: {
    path: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.029-3.91 1.183-4.961 3.004-2.117 3.669-.54 9.115 1.512 12.067 1.004 1.442 2.184 3.055 3.754 2.997 1.516-.067 2.085-.98 3.924-.98 1.829 0 2.356.98 3.948.943 1.629-.029 2.665-1.462 3.654-2.907 1.149-1.678 1.619-3.302 1.644-3.389-.038-.019-3.174-1.21-3.208-4.793-.029-3.004 2.462-4.443 2.573-4.51-1.411-2.062-3.593-2.293-4.364-2.351-2.11-.173-3.611 1.04-4.522 1.04zm2.946-4.377c.806-.97 1.344-2.323 1.19-3.673-1.152.048-2.55.77-3.379 1.737-.73.845-1.363 2.217-1.181 3.539 1.286.096 2.592-.643 3.37-1.603z",
    color: "#FFFFFF" 
  },
  Meta: { path: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z", color: "#0467DF" },
  Amazon: { path: "M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z", color: "#FF9900" },
  Netflix: { path: "m5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z", color: "#E50914" },
  Spotify: { path: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z", color: "#1ED760" },
  Adobe: { path: "M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm15.116 0h-8.884L24 22.624Z", color: "#FF0000" },
  Stripe: { path: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z", color: "#635BFF" },
  Vercel: { path: "m12 1.608 12 20.784H0Z", color: "#ffffff" },
  GitHub: { path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", color: "#ffffff" },
  Notion: { 
    path: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z", 
    color: "#FFFFFF" 
  },
  Figma: { 
    color: "#F24E1E",
    multiPath: [
      { d: "M12 0H8a4 4 0 0 0-4 4a4 4 0 0 0 4 4h4V0z", fill: "#F24E1E" },
      { d: "M12 0h4a4 4 0 0 1 4 4a4 4 0 0 1-4 4h-4V0z", fill: "#FF7262" },
      { d: "M12 8H8a4 4 0 0 0-4 4a4 4 0 0 0 4 4h4V8z", fill: "#A259FF" },
      { d: "M20 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0z", fill: "#1ABCFE" },
      { d: "M12 16v4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4h4z", fill: "#0ACF83" }
    ]
  },
  LinkedIn: {
    color: "#0A66C2",
    multiPath: [
      /* The 'i' dot and stem */
      { d: "M6.5 8.36h2.88V18H6.5V8.36zM7.94 4.5A1.67 1.67 0 1 1 7.93 7.8a1.67 1.67 0 0 1 .01-3.3z", fill: "#0A66C2" },
      /* The 'n' structure */
      { d: "M11 8.36h2.76v1.32h.04c.38-.73 1.33-1.5 2.73-1.5 2.92 0 3.47 1.92 3.47 4.42V18h-2.88v-4.51c0-1.08-.02-2.46-1.5-2.46-1.5 0-1.73 1.17-1.73 2.38V18H11V8.36z", fill: "#0A66C2" }
    ]
  },
  Discord: { path: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z", color: "#5865F2" },
  Linear: { path: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z", color: "#5E6AD2" },
  Salesforce: { path: "M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22s-2.31 5.22-5.176 5.22c-.345 0-.69-.044-1.02-.104a3.75 3.75 0 01-3.3 1.95c-.6 0-1.155-.15-1.65-.375A4.314 4.314 0 018.88 20.4a4.302 4.302 0 01-4.05-2.82c-.27.062-.54.076-.825.076-2.204 0-4.005-1.8-4.005-4.05 0-1.5.811-2.805 2.01-3.51-.255-.57-.39-1.2-.39-1.846 0-2.58 2.1-4.65 4.65-4.65 1.53 0 2.85.705 3.72 1.8", color: "#00A1E0" },
  Airbnb: { path: "M12.001 18.275c-1.353-1.697-2.148-3.184-2.413-4.457-.263-1.027-.16-1.848.291-2.465.477-.71 1.188-1.056 2.121-1.056s1.643.345 2.12 1.063c.446.61.558 1.432.286 2.465-.291 1.298-1.085 2.785-2.412 4.458zm9.601 1.14c-.185 1.246-1.034 2.28-2.2 2.783-2.253.98-4.483-.583-6.392-2.704 3.157-3.951 3.74-7.028 2.385-9.018-.795-1.14-1.933-1.695-3.394-1.695-2.944 0-4.563 2.49-3.927 5.382.37 1.565 1.352 3.343 2.917 5.332-.98 1.085-1.91 1.856-2.732 2.333-.636.344-1.245.558-1.828.609-2.679.399-4.778-2.2-3.825-4.88.132-.345.395-.98.845-1.961l.025-.053c1.464-3.178 3.242-6.79 5.285-10.795l.053-.132.58-1.116c.45-.822.635-1.19 1.351-1.643.346-.21.77-.315 1.246-.315.954 0 1.698.558 2.016 1.007.158.239.345.557.582.953l.558 1.089.08.159c2.041 4.004 3.821 7.608 5.279 10.794l.026.025.533 1.22.318.764c.243.613.294 1.222.213 1.858zm1.22-2.39c-.186-.583-.505-1.271-.9-2.094v-.03c-1.889-4.006-3.642-7.608-5.307-10.844l-.111-.163C15.317 1.461 14.468 0 12.001 0c-2.44 0-3.476 1.695-4.535 3.898l-.081.16c-1.669 3.236-3.421 6.843-5.303 10.847v.053l-.559 1.22c-.21.504-.317.768-.345.847C-.172 20.74 2.611 24 5.98 24c.027 0 .132 0 .265-.027h.372c1.75-.213 3.554-1.325 5.384-3.317 1.829 1.989 3.635 3.104 5.382 3.317h.372c.133.027.239.027.265.027 3.37.003 6.152-3.261 4.802-6.975z", color: "#FF5A5F" },
  Uber: { path: "M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z", color: "#ffffff" },
  X: { path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", color: "#ffffff" },
  OpenAI: { path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z", color: "#ffffff" },
  Anthropic: { path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z", color: "#D97706" },
  Shopify: { path: "M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z", color: "#7AB55C" },
  Dropbox: { path: "M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z", color: "#0061FF" },
  Atlassian: { path: "M7.12 11.084a.683.683 0 00-1.16.126L.075 22.974a.703.703 0 00.63 1.018h8.19a.678.678 0 00.63-.39c1.767-3.65.696-9.203-2.406-12.52zM11.434.386a15.515 15.515 0 00-.906 15.317l3.95 7.9a.703.703 0 00.628.388h8.19a.703.703 0 00.63-1.017L12.63.38a.664.664 0 00-1.196.006z", color: "#0052CC" },
  PayPal: { path: "M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z", color: "#003087" },
  Zoom: { path: "M5.033 14.649H.743a.74.74 0 0 1-.686-.458.74.74 0 0 1 .16-.808L3.19 10.41H1.06A1.06 1.06 0 0 1 0 9.35h3.957c.301 0 .57.18.686.458a.74.74 0 0 1-.161.808L1.51 13.59h2.464c.585 0 1.06.475 1.06 1.06zM24 11.338c0-1.14-.927-2.066-2.066-2.066-.61 0-1.158.265-1.537.686a2.061 2.061 0 0 0-1.536-.686c-1.14 0-2.066.926-2.066 2.066v3.311a1.06 1.06 0 0 0 1.06-1.06v-2.251a1.004 1.004 0 0 1 2.013 0v2.251c0 .586.474 1.06 1.06 1.06v-3.311a1.004 1.004 0 0 1 2.012 0v2.251c0 .586.475 1.06 1.06 1.06zM16.265 12a2.728 2.728 0 1 1-5.457 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0zm-4.82 0a2.728 2.728 0 1 1-5.458 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0z", color: "#0B5CFF" },
  Pinterest: { path: "M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z", color: "#BD081C" },
  Reddit: { path: "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z", color: "#FF4500" },
  };
function BrandIcon({ name }) {
  const brand = BRAND_DATA[name];
  if (!brand) return null;
  const s = { width: 18, height: 18, display: "block", flexShrink: 0 };
  if (brand.multiPath) return <svg viewBox="0 0 24 24" style={s}>{brand.multiPath.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</svg>;
  return <svg viewBox="0 0 24 24" style={s}><path d={brand.path} fill={brand.color} /></svg>;
}

const ROW1 = [
  "Google", "Microsoft", "Apple", "Meta", "Amazon", "Netflix", "Spotify", "Adobe", "Stripe", "Vercel", "GitHub", "Notion", "Figma", "LinkedIn", "Discord",
];
const ROW2 = [
  "Linear", "Salesforce", "Airbnb", "Uber", "X", "OpenAI", "Anthropic", "Shopify", "Dropbox", "Atlassian", "PayPal", "Zoom", "Pinterest", "Reddit", 
];

function LogoItem({ name }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      borderRadius: 99, border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.025)", height: 48, padding: "0 22px",
      cursor: "default", transition: "all 0.25s",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.45)"; e.currentTarget.style.background = "rgba(139,92,246,0.06)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ opacity: 0.7 }}><BrandIcon name={name} /></div>
      <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{name}</span>
    </div>
  );
}

function MarqueeRow({ items, reverse }) {
  const all = [...items, ...items, ...items];
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{
        display: "flex", gap: 10, width: "max-content",
        animation: `${reverse ? "marquee-r" : "marquee-l"} 45s linear infinite`,
        willChange: "transform",
      }}>
        {all.map((name, i) => <LogoItem key={i} name={name} />)}
      </div>
    </div>
  );
}

function Logos() {
  const [ref, inView] = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "72px 0", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 140, zIndex: 2, background: "linear-gradient(to right,#03030a,transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 140, zIndex: 2, background: "linear-gradient(to left,#03030a,transparent)", pointerEvents: "none" }} />
      <p style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.28)", marginBottom: 28, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono',monospace", opacity: inView ? 1 : 0, transition: "opacity 0.8s ease" }}>
        <span style={{ fontSize: "18px", marginRight: "8px" }}>
           ♥
           </span>
           LOVED BY LEADING TEAMS
       </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: inView ? 1 : 0, transition: "opacity 1s 0.2s ease" }}>
        <MarqueeRow items={ROW1} reverse={false} />
        <MarqueeRow items={ROW2} reverse={true} />
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FEATURES BENTO GRID
// ══════════════════════════════════════════════════════════════════
function BentoGrid() {
  const [ref, inView] = useInView(0.08);
  
  const features = [
    // 1. Changed size to "small" so it matches the rest
    { icon: Globe, color: "124,58,237", title: "Live Web Search", desc: "Real-time results from across the internet with source attribution and smart summarization.", size: "small" },
    { icon: ImageIcon, color: "168,85,247", title: "Image Generation", desc: "Create stunning visuals in any style — photorealistic, anime, oil painting, cyberpunk.", size: "small" },
    { icon: Code2, color: "6,182,212", title: "Code Mastery", desc: "Write, debug, explain, and refactor across all languages with principal-level quality.", size: "small" },
    { icon: Eye, color: "99,102,241", title: "Vision AI", desc: "Analyze images, read text, extract data — your eyes for any visual content.", size: "small" },
    { icon: Brain, color: "168,85,247", title: "Persistent Memory", desc: "Vortis remembers your preferences, projects, and context across every conversation.", size: "small" },
    // 2. Changed size to "small" here too
    { icon: Microscope, color: "6,182,212", title: "Deep Research", desc: "Autonomous agents synthesize 50+ sources into comprehensive reports in minutes.", size: "small" },
    { icon: FileText, color: "124,58,237", title: "Document Analysis", desc: "Chat with PDFs, CSVs, Word docs — extract insights from any file instantly.", size: "small" },
    { icon: Cpu, color: "168,85,247", title: "Voice Mode", desc: "Speak naturally, hear responses — hands-free AI with multilingual support.", size: "small" },
    // 3. New 9th item to perfectly balance the 3x3 grid!
    { icon: BarChart3, color: "99,102,241", title: "Advanced Analytics", desc: "Track usage patterns, monitor latency, and optimize your AI workflows with built-in deep data insights.", size: "small" },
  ];
  

  return (
    <section ref={ref} style={{ padding: "80px 40px", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.04)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "opacity 0.6s ease" }}>
          <Sparkles size={11} color="#a855f7" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>Everything you need</span>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)", transition: "all 0.8s 0.1s ease" }}>
          One platform.{" "}
          <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Infinite capability.</span>
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, gridAutoRows: "200px" }}>
        <style>{`@media(max-width:800px){.bento-grid{grid-template-columns:1fr!important;grid-auto-rows:auto!important}.bento-large{grid-column:1!important;grid-row:auto!important}}`}</style>
        {features.map((f, i) => {
          const Icon = f.icon;
          const isLarge = f.size === "large" && i < 2;
          return (
            <div key={f.title} style={{
              gridColumn: isLarge ? "span 2" : "span 1",
              borderRadius: 18, padding: "28px 30px",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              position: "relative", overflow: "hidden",
              cursor: "default", transition: "all 0.3s",
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0) scale(1)" : "translateY(30px) scale(0.96)",
              transitionDelay: `${i * 0.06 + 0.15}s`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = `rgba(${f.color},0.4)`;
              e.currentTarget.style.background = `rgba(${f.color},0.07)`;
              e.currentTarget.style.transform = "translateY(-4px) scale(1.01)";
              e.currentTarget.style.boxShadow = `0 20px 60px rgba(${f.color},0.15)`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
              e.currentTarget.style.background = "rgba(255,255,255,0.025)";
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
            >
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 50% at 0% 0%, rgba(${f.color},0.08), transparent)`, pointerEvents: "none" }} />
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `rgba(${f.color},0.15)`, border: `1px solid rgba(${f.color},0.3)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon size={20} style={{ color: `rgb(${f.color})` }} />
              </div>
              <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17, margin: "0 0 8px", color: "#fff" }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HOW IT WORKS
// ══════════════════════════════════════════════════════════════════
function HowItWorks() {
  const [ref, inView] = useInView(0.1);
  const steps = [
    { num: "01", title: "Sign up free", desc: "Create your account in seconds with Google, GitHub, or email. No credit card required.", icon: Zap, color: "124,58,237" },
    { num: "02", title: "Ask anything", desc: "Type, speak, or upload files. Vortis understands context and remembers your preferences.", icon: MessageSquare, color: "168,85,247" },
    { num: "03", title: "Get results", desc: "Receive rich responses — with web data, images, code, documents, and more — instantly.", icon: Sparkles, color: "6,182,212" },
  ];

  return (
    <section id="howitworks" ref={ref} style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(6,182,212,0.3)", background: "rgba(6,182,212,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "opacity 0.6s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(6,182,212,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>Simple as 1-2-3</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(20px)", transition: "all 0.8s 0.1s ease" }}>
            How Vortis{" "}
            <span style={{ background: "linear-gradient(90deg,#06B6D4,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>works.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, position: "relative" }}>
          {/* Connector line */}
          <div style={{ position: "absolute", top: 42, left: "16%", right: "16%", height: 1, background: "linear-gradient(to right, rgba(124,58,237,0.4), rgba(6,182,212,0.4))", zIndex: 0, opacity: inView ? 1 : 0, transition: "opacity 1s 0.5s ease" }} />

          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.num} style={{
                textAlign: "center", position: "relative", zIndex: 1, padding: "28px 24px 32px",
                borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(32px)",
                transition: `all 0.8s ${i * 0.15 + 0.2}s ease`,
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px", background: `rgba(${s.color},0.12)`, border: `2px solid rgba(${s.color},0.4)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 30px rgba(${s.color},0.2)`, position: "relative" }}>
                  <Icon size={24} style={{ color: `rgb(${s.color})` }} />
                  <div style={{ position: "absolute", top: -10, right: -10, width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg,rgb(${s.color}),rgba(${s.color},0.7))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{s.num}</div>
                </div>
                <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, margin: "0 0 10px", color: "#fff" }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LIVE DEMO SHOWCASE (replaces NodeGraph)
// ══════════════════════════════════════════════════════════════════
const DEMO_TABS = [
  { id: "chat", name: "AI Chat", icon: MessageSquare, color: "124,58,237" },
  { id: "code", name: "Code", icon: Code2, color: "6,182,212" },
  { id: "search", name: "Web Search", icon: Globe, color: "168,85,247" },
  { id: "image", name: "Image Gen", icon: ImageIcon, color: "251,191,36" },
  { id: "research", name: "Deep Research", icon: Microscope, color: "6,182,212" },
  { id: "vision", name: "Vision AI", icon: Eye, color: "168,85,247" },
];

const DEMO_CONTENT = {
  chat: {
    messages: [
      { role: "user", text: "Explain quantum entanglement simply" },
      { role: "ai", text: "Imagine two coins that always land opposite — flip one anywhere in the universe, the other instantly mirrors it. That's entanglement: particles share a quantum state, measurement of one instantly defines the other, regardless of distance.", typing: false },
      { role: "user", text: "Give me an analogy a 10-year-old would get" },
      { role: "ai", text: "Think of magic gloves: you pack one in a box and ship it to Mars. The moment you open your box and see it's a left glove, you instantly know the Mars glove is right — no signal needed.", typing: false },
    ]
  },
  code: {
    filename: "auth.ts",
    language: "typescript",
    lines: [
      { n: 1,  t: "import", c: "keyword", text: `import { jwt, bcrypt } from '@vortis/auth';` },
      { n: 2,  t: "blank",  text: "" },
      { n: 3,  t: "comment", text: `// 🔐 Vortis-generated secure auth handler` },
      { n: 4,  t: "code",   text: `export async function signIn(email: string, password: string) {` },
      { n: 5,  t: "code",   text: `  const user = await db.users.findUnique({ where: { email } });` },
      { n: 6,  t: "code",   text: `  if (!user) throw new AuthError('User not found');` },
      { n: 7,  t: "blank",  text: "" },
      { n: 8,  t: "code",   text: `  const valid = await bcrypt.compare(password, user.passwordHash);` },
      { n: 9,  t: "code",   text: `  if (!valid) throw new AuthError('Invalid credentials');` },
      { n: 10, t: "blank",  text: "" },
      { n: 11, t: "return", text: `  return jwt.sign({ userId: user.id, role: user.role }, {` },
      { n: 12, t: "return", text: `    expiresIn: '7d', algorithm: 'RS256'` },
      { n: 13, t: "return", text: `  });` },
      { n: 14, t: "code",   text: `}` },
    ]
  },
  search: {
    query: "Latest breakthroughs in fusion energy 2026",
    results: [
      { source: "nature.com", title: "ITER achieves Q>1 sustained plasma for 47 seconds", time: "2h ago", snippet: "The International Thermonuclear Experimental Reactor reported a historic milestone..." },
      { source: "science.org", title: "Commonwealth Fusion's SPARC magnet sets world record", time: "5h ago", snippet: "High-temperature superconducting magnets reached 20 tesla field strength..." },
      { source: "reuters.com", title: "Three private fusion startups reach profitability", time: "1d ago", snippet: "Helion Energy, TAE Technologies and Zap Energy all reported positive..." },
    ]
  },
 image: {
  prompt: "Futuristic city at golden hour, cinematic, 8K",
  style: "Photorealistic",
  steps: ["Initializing…", "Generating image…", "Processing…", "Refining…", "Complete ✓"],
  colors: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A936F"],
},
  research: {
    topic: "Impact of AI on software engineering jobs 2025–2030",
    sources: 47,
    sections: [
      { title: "Executive Summary", status: "done", words: 340 },
      { title: "Market Analysis", status: "done", words: 1240 },
      { title: "Role-by-Role Breakdown", status: "done", words: 2100 },
      { title: "Emerging Opportunities", status: "active", words: 890 },
      { title: "Recommendations", status: "pending", words: 0 },
    ]
  },
  vision: {
    imageLabel: "Uploaded: dashboard_screenshot.png",
    findings: [
      { icon: "📊", label: "Chart detected", detail: "Bar chart — Q3 revenue by region" },
      { icon: "📝", label: "Text extracted", detail: "142 words, 3 tables parsed" },
      { icon: "⚠️", label: "Anomaly found", detail: "APAC revenue down 23% vs forecast" },
      { icon: "💡", label: "Insight", detail: "Seasonality pattern matches 2024 Q3" },
    ]
  }
};

function DemoPanel({ tabId, color }) {
  const data = DEMO_CONTENT[tabId];
  const [tick, setTick] = useState(0);
  const [codeLines, setCodeLines] = useState(0);
  const [searchDone, setSearchDone] = useState(false);
  const [imgStep, setImgStep] = useState(0);
  const [researchProgress, setResearchProgress] = useState(0);

  useEffect(() => {
    setTick(0); setCodeLines(0); setSearchDone(false); setImgStep(0); setResearchProgress(0);
    const id = setInterval(() => setTick(t => t + 1), 400);
    return () => clearInterval(id);
  }, [tabId]);

  useEffect(() => {
    if (tabId === "code") {
      const id = setInterval(() => setCodeLines(l => Math.min(l + 1, data.lines.length)), 120);
      return () => clearInterval(id);
    }
    if (tabId === "search") {
      const id = setTimeout(() => setSearchDone(true), 1200);
      return () => clearTimeout(id);
    }
    if (tabId === "image") {
      const id = setInterval(() => setImgStep(s => Math.min(s + 1, data.steps.length - 1)), 700);
      return () => clearInterval(id);
    }
    if (tabId === "research") {
      const id = setInterval(() => setResearchProgress(p => Math.min(p + 2, 100)), 40);
      return () => clearInterval(id);
    }
  }, [tabId]);

  const rgb = color;

  // CHAT
  if (tabId === "chat") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, height: "100%", overflowY: "auto" }}>
      {data.messages.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 10, justifyContent: m.role === "user" ? "flex-end" : "flex-start", opacity: tick > i * 1.5 ? 1 : 0, transform: tick > i * 1.5 ? "translateY(0)" : "translateY(12px)", transition: "all 0.5s ease" }}>
          {m.role === "ai" && (
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,rgb(${rgb}),rgba(${rgb},0.7))`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <VortisLogo size={14} color="#fff" />
            </div>
          )}
          <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px", background: m.role === "user" ? `linear-gradient(135deg,rgb(${rgb}),rgba(${rgb},0.8))` : "rgba(255,255,255,0.06)", border: m.role === "ai" ? "1px solid rgba(255,255,255,0.08)" : "none", fontSize: 13, lineHeight: 1.6, color: m.role === "user" ? "#fff" : "rgba(255,255,255,0.85)" }}>
            {m.text}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, opacity: tick > 6 ? 1 : 0, transition: "opacity 0.5s" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `rgba(${rgb},0.2)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <VortisLogo size={14} color={`rgb(${rgb})`} />
        </div>
        <div style={{ padding: "10px 14px", borderRadius: "4px 16px 16px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 5, alignItems: "center" }}>
          {[0,1,2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: `rgb(${rgb})`, animation: `pulse 1.2s ease-in-out ${d*0.2}s infinite` }} />)}
        </div>
      </div>
    </div>
  );

  // CODE
  if (tabId === "code") return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)" }}>
        <Code2 size={13} color={`rgb(${rgb})`} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace" }}>{data.filename}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `rgba(${rgb},0.15)`, color: `rgb(${rgb})`, fontFamily: "'JetBrains Mono',monospace" }}>TypeScript</span>
      </div>
      <div style={{ padding: "12px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
        {data.lines.slice(0, codeLines).map((line) => (
          <div key={line.n} style={{ display: "flex", padding: "1.5px 16px", animation: "fadeUp 0.2s ease both" }}>
            <span style={{ width: 24, color: "rgba(255,255,255,0.2)", userSelect: "none", flexShrink: 0 }}>{line.n}</span>
            <span style={{ color: line.t === "comment" ? "rgba(134,239,172,0.7)" : line.t === "keyword" ? "rgba(196,181,253,0.9)" : line.t === "return" ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.75)" }}>
              {line.text}
            </span>
          </div>
        ))}
        {codeLines < data.lines.length && (
          <div style={{ display: "flex", padding: "1.5px 16px" }}>
            <span style={{ width: 24, color: "rgba(255,255,255,0.2)" }}>{codeLines + 1}</span>
            <span style={{ display: "inline-block", width: 2, height: 14, background: `rgb(${rgb})`, animation: "blink 0.8s step-end infinite" }} />
          </div>
        )}
      </div>
    </div>
  );

  // SEARCH
  if (tabId === "search") return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
        <Globe size={14} color={`rgb(${rgb})`} />
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", flex: 1 }}>{data.query}</span>
        <span style={{ fontSize: 10, color: `rgb(${rgb})`, fontFamily: "'JetBrains Mono',monospace" }}>{searchDone ? "47 results" : "Searching…"}</span>
      </div>
      {searchDone ? data.results.map((r, i) => (
        <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", animation: `fadeUp 0.4s ${i * 0.12}s ease both` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgba(${rgb},0.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={9} color={`rgb(${rgb})`} />
            </div>
            <span style={{ fontSize: 10.5, color: `rgb(${rgb})` }}>{r.source}</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>{r.time}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{r.snippet}</div>
        </div>
      )) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[100, 75, 90].map((w, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ height: 12, borderRadius: 4, background: "rgba(255,255,255,0.06)", width: `${w}%`, animation: "pulse 1.5s ease-in-out infinite" }} />
              <div style={{ height: 10, borderRadius: 4, background: "rgba(255,255,255,0.04)", width: "60%", animation: `pulse 1.5s ease-in-out ${i*0.2}s infinite` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // IMAGE GEN - matches real Vortis UI
if (tabId === "image") return (
  <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
      <span style={{ color: `rgb(${rgb})` }}>Prompt: </span>{data.prompt}
    </div>
    {/* Pixel grid exactly like your real UI */}
    <div style={{ flex: 1, borderRadius: 14, overflow: "hidden", position: "relative", minHeight: 200, background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridTemplateRows: "repeat(8,1fr)", gap: 3, padding: 8, height: "100%" }}>
        {Array.from({length: 96}).map((_, i) => {
          const purples = ["#4c1d95","#5b21b6","#6d28d9","#7c3aed","#8b5cf6","#a78bfa","#3730a3","#4338ca","#312e81","#1e1b4b","#2e1065","#3b0764"];
          const c = purples[Math.floor(Math.random() * purples.length)];
          return (
            <div key={i} style={{ borderRadius: 4, background: c, opacity: imgStep > 0 ? (0.4 + Math.random() * 0.6) : 0.15, transition: `opacity ${0.3 + Math.random() * 0.5}s ease`, animation: `pulse ${1.5 + Math.random()}s ease-in-out infinite` }} />
          );
        })}
      </div>
      {imgStep < data.steps.length - 1 && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(109,40,217,0.15), rgba(139,92,246,0.1))", pointerEvents: "none" }} />
      )}
    </div>
    {/* Bottom bar matching your real UI */}
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: `rgb(${rgb})` }}>★</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>VORTIS Image AI</span>
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace" }}>{data.steps[imgStep]}</span>
    </div>
    {/* Progress bar */}
    <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg,rgb(${rgb}),#a855f7)`, width: `${(imgStep / (data.steps.length - 1)) * 100}%`, transition: "width 0.7s ease" }} />
    </div>
  </div>
);

  // DEEP RESEARCH
  if (tabId === "research") return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: `rgb(${rgb})`, marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>RESEARCH TOPIC</div>
        <div style={{ fontSize: 13.5, color: "#fff", fontWeight: 600, lineHeight: 1.4 }}>{data.topic}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>📄 {data.sources} sources</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>⏱ ~4 min remaining</span>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg,rgb(${rgb}),rgba(6,182,212,1))`, width: `${researchProgress}%`, transition: "width 0.1s linear" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.sections.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: s.status === "active" ? `rgba(${rgb},0.1)` : "rgba(255,255,255,0.03)", border: `1px solid ${s.status === "active" ? `rgba(${rgb},0.3)` : "rgba(255,255,255,0.05)"}`, transition: "all 0.3s" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: s.status === "done" ? "rgba(16,185,129,0.2)" : s.status === "active" ? `rgba(${rgb},0.2)` : "rgba(255,255,255,0.05)", flexShrink: 0 }}>
              {s.status === "done" ? <Check size={11} color="#10b981" /> : s.status === "active" ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: `rgb(${rgb})`, animation: "pulse 1s ease-in-out infinite" }} /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />}
            </div>
            <span style={{ flex: 1, fontSize: 13, color: s.status === "pending" ? "rgba(255,255,255,0.3)" : "#fff" }}>{s.title}</span>
            {s.words > 0 && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>{s.words}w</span>}
          </div>
        ))}
      </div>
    </div>
  );

  // VISION AI
  if (tabId === "vision") return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto" }}>
      <div style={{ borderRadius: 10, border: "1px dashed rgba(255,255,255,0.15)", padding: "16px", textAlign: "center", marginBottom: 16, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{data.imageLabel}</div>
        <div style={{ fontSize: 10, color: `rgb(${rgb})`, marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>Analyzing…</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.findings.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", opacity: tick > i * 1.2 ? 1 : 0, transform: tick > i * 1.2 ? "translateX(0)" : "translateX(-12px)", transition: "all 0.4s ease" }}>
            <span style={{ fontSize: 18 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: `rgb(${rgb})`, marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)" }}>{f.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}

function Showcase() {
  const [ref, inView] = useInView(0.08);
  const [active, setActive] = useState(0);
  const tab = DEMO_TABS[active];

  return (
    <section id="capabilities" ref={ref} style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "opacity 0.7s ease" }}>
            <Zap size={11} color="#a855f7" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>Live Demo</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)", transition: "all 0.8s 0.1s ease" }}>
            See Vortis{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>in action.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          {/* Tabs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {DEMO_TABS.map((t, i) => {
              const Icon = t.icon;
              const isActive = i === active;
              return (
                <button key={t.id} onClick={() => setActive(i)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 13px",
                  borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: isActive ? `1px solid rgba(${t.color},0.5)` : "1px solid rgba(255,255,255,0.05)",
                  background: isActive ? `rgba(${t.color},0.15)` : "rgba(255,255,255,0.02)",
                  boxShadow: isActive ? `0 0 20px rgba(${t.color},0.15)` : "none",
                  transition: "all 0.2s",
                  opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-20px)",
                  transitionDelay: `${i * 0.05 + 0.2}s`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? `rgba(${t.color},0.25)` : `rgba(${t.color},0.1)`, border: `1px solid rgba(${t.color},0.25)`, flexShrink: 0 }}>
                    <Icon size={15} style={{ color: `rgb(${t.color})` }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.5)" }}>{t.name}</span>
                  {isActive && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: `rgb(${t.color})`, animation: "pulse 2s ease-in-out infinite" }} />}
                </button>
              );
            })}
          </div>

          {/* Demo panel */}
          <div key={tab.id} style={{
            borderRadius: 20, minHeight: 420, overflow: "hidden",
            background: "rgba(5,5,18,0.95)", border: "1px solid rgba(255,255,255,0.07)",
            position: "relative",
            opacity: inView ? 1 : 0, transition: "opacity 0.5s ease",
          }}>
            {/* Top bar */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)" }}>
              {["#ef4444","#f59e0b","#10b981"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.6 }} />)}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>vortis.ai — {tab.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {DEMO_TABS.map((t, i) => (
                  <button key={t.id} onClick={() => setActive(i)} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer", background: i === active ? `rgba(${t.color},0.2)` : "transparent", color: i === active ? `rgb(${t.color})` : "rgba(255,255,255,0.25)", border: i === active ? `1px solid rgba(${t.color},0.3)` : "1px solid transparent", transition: "all 0.2s" }}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 380 }}>
              <DemoPanel key={tab.id} tabId={tab.id} color={tab.color} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  3D DASHBOARD PREVIEW
// ══════════════════════════════════════════════════════════════════
function DashboardPreview() {
  const [ref, inView] = useInView(0.1);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -10, y: dx * 10 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setHovered(false);
  }, []);

  const BARS = [65, 82, 47, 91, 73, 88, 55, 79, 94, 61, 85, 70];
  const SPARKLINE = [40, 55, 48, 72, 65, 80, 75, 90, 85, 95, 88, 100];

  return (
    <section ref={ref} style={{ padding: "100px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,58,237,0.06), transparent)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "opacity 0.7s ease" }}>
            <BarChart3 size={11} color="#a855f7" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>Your Dashboard</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: "0 0 16px", letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)", transition: "all 0.8s 0.1s ease" }}>
            Everything in{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>one place.</span>
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7, opacity: inView ? 1 : 0, transition: "opacity 0.8s 0.2s ease" }}>
            Your AI workspace — chats, usage, models, and insights, all beautifully organized.
          </p>
        </div>

        {/* 3D Card */}
        <div style={{ perspective: "1200px", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(60px)", transition: "all 1s 0.3s ease" }}>
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={handleMouseLeave}
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${inView && !hovered ? "rotateX(4deg) rotateY(-6deg)" : ""}`,
              transition: hovered ? "transform 0.1s ease" : "transform 0.8s ease",
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(6,6,20,0.97)",
              boxShadow: `
                0 80px 160px rgba(0,0,0,0.6),
                0 40px 80px rgba(0,0,0,0.4),
                0 0 0 1px rgba(124,58,237,0.15),
                inset 0 1px 0 rgba(255,255,255,0.07)
              `,
            }}
          >
            {/* Top chrome bar */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#ef4444","#f59e0b","#10b981"].map(c => <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
              </div>
              <div style={{ flex: 1, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", paddingLeft: 10, gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono',monospace" }}>app.vortis.ai/dashboard</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
               <div style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", fontSize: 10, color: "#a855f7", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                       <Diamond size={10} color="#a855f7" />
                      PLATINUM
                   </div>
              </div>
            </div>

            {/* Dashboard layout */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 520 }}>
              {/* Sidebar */}
              <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 8 }}>
                  <VortisLogo size={22} color="#8b5cf6" />
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 14, color: "#fff" }}>VORTIS</span>
                </div>
                {[
                  { icon: MessageSquare, label: "Chats", active: false },
                  { icon: BarChart3, label: "Analytics", active: true },
                  { icon: Brain, label: "Memory", active: false },
                  { icon: ImageIcon, label: "Image Gen", active: false },
                  { icon: Microscope, label: "Research", active: false },
                  { icon: FileText, label: "Documents", active: false },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, background: item.active ? "rgba(124,58,237,0.15)" : "transparent", border: item.active ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent", cursor: "default" }}>
                      <Icon size={14} style={{ color: item.active ? "#a855f7" : "rgba(255,255,255,0.3)" }} />
                      <span style={{ fontSize: 12.5, color: item.active ? "#fff" : "rgba(255,255,255,0.35)", fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
                      {item.active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#a855f7", animation: "pulse 2s infinite" }} />}
                    </div>
                  );
                })}
                <div style={{ marginTop: "auto", padding: "10px", borderRadius: 10, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.15)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>USAGE THIS MONTH</div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "67%", borderRadius: 2, background: "linear-gradient(90deg,#7C3AED,#06b6d4)" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>67% used</div>
                </div>
              </div>

              {/* Main content */}
              <div style={{ padding: 20, overflowY: "auto" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, margin: 0, color: "#fff" }}>Analytics Overview</h3>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>Last 30 days · Updated just now</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["7d","30d","90d"].map((d, i) => (
                      <button key={d} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "default", background: i === 1 ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.04)", color: i === 1 ? "#a855f7" : "rgba(255,255,255,0.4)", border: i === 1 ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.07)" }}>{d}</button>
                    ))}
                  </div>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Total Chats", value: "2,847", change: "+12%", color: "124,58,237", icon: MessageSquare },
                    { label: "Tokens Used", value: "1.2B", change: "+8%", color: "6,182,212", icon: Zap },
                    { label: "Images Gen", value: "384", change: "+31%", color: "168,85,247", icon: ImageIcon },
                    { label: "Researches", value: "47", change: "+22%", color: "251,191,36", icon: Microscope },
                  ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <div key={i} style={{ padding: "12px", borderRadius: 12, background: `rgba(${s.color},0.07)`, border: `1px solid rgba(${s.color},0.15)` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <Icon size={13} style={{ color: `rgb(${s.color})` }} />
                          <span style={{ fontSize: 10, color: "#10b981", fontFamily: "'JetBrains Mono',monospace" }}>{s.change}</span>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Grotesk',sans-serif", color: "#fff", lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{s.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Chart + sparklines */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                  {/* Bar chart */}
                  <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, fontWeight: 600 }}>Daily Conversations</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                      {BARS.map((h, i) => (
                        <div key={i} style={{ flex: 1, borderRadius: "3px 3px 0 0", background: i === 9 ? "linear-gradient(to top,#7C3AED,#a855f7)" : `rgba(124,58,237,${0.15 + (h/100)*0.35})`, height: `${h}%`, transition: "height 0.8s ease", transitionDelay: `${i*0.05}s` }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      {["Jun 1","","","","","","","","","","","Jun 12"].map((l, i) => (
                        <span key={i} style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono',monospace" }}>{l}</span>
                      ))}
                    </div>
                  </div>

                  {/* Right panel - top models */}
                  <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, fontWeight: 600 }}>Top Modes</div>
                    {[
                      { name: "Chat", pct: 45, color: "124,58,237" },
                      { name: "Code", pct: 28, color: "6,182,212" },
                      { name: "Research", pct: 18, color: "168,85,247" },
                      { name: "Vision", pct: 9, color: "251,191,36" },
                    ].map((m, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{m.name}</span>
                          <span style={{ fontSize: 10, color: `rgb(${m.color})`, fontFamily: "'JetBrains Mono',monospace" }}>{m.pct}%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                          <div style={{ height: "100%", borderRadius: 2, background: `rgb(${m.color})`, width: `${m.pct}%`, transition: "width 1s ease", transitionDelay: `${i*0.1+0.5}s` }} />
                        </div>
                      </div>
                    ))}
                    {/* Sparkline */}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>Trend</div>
                      <svg width="100%" height="32" viewBox="0 0 130 32" preserveAspectRatio="none">
                        <polyline
                          points={SPARKLINE.map((v, i) => `${i * (130/11)},${32 - (v/100)*28}`).join(" ")}
                          fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        />
                        <polyline
                          points={[...SPARKLINE.map((v, i) => `${i * (130/11)},${32 - (v/100)*28}`), "130,32", "0,32"].join(" ")}
                          fill="rgba(124,58,237,0.12)" stroke="none"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Recent activity */}
                <div style={{ marginTop: 12, padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10, fontWeight: 600 }}>Recent Activity</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { action: "Deep Research", topic: "AI in healthcare 2026", time: "2m ago", color: "6,182,212", icon: Microscope },
                      { action: "Code Generation", topic: "React dashboard component", time: "18m ago", color: "124,58,237", icon: Code2 },
                      { action: "Image Created", topic: "Product mockup renders", time: "1h ago", color: "168,85,247", icon: ImageIcon },
                    ].map((a, i) => {
                      const Icon = a.icon;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: `rgba(${a.color},0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon size={12} style={{ color: `rgb(${a.color})` }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#fff" }}>{a.action}</div>
                            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.topic}</div>
                          </div>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>{a.time}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating accent labels */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 32, flexWrap: "wrap", opacity: inView ? 1 : 0, transition: "opacity 0.8s 0.8s ease" }}>
          {[
            { icon: <BarChart3 size={12} />, text: "Real-time analytics" },
            { icon: <Brain size={12} />, text: "Persistent memory" },
            { icon: <Shield size={12} />, text: "Private & encrypted" },
            { icon: <Zap size={12} />, text: "Instant sync" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 99, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>
              <span style={{ color: "rgba(139,92,246,0.8)" }}>{f.icon}</span>{f.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
// ══════════════════════════════════════════════════════════════════
//  TESTIMONIALS
// ══════════════════════════════════════════════════════════════════
const TESTIMONIALS = [
  { name: "Sarah Chen", role: "Lead Engineer @ Stripe", avatar: "SC", text: "Vortis replaced 4 different AI tools for our team. The deep research feature alone saves us hours every week.", color: "124,58,237" },
  { name: "Marcus Johnson", role: "Product Designer @ Figma", avatar: "MJ", text: "The image generation quality is insane. Combined with vision AI for feedback loops — it's like having a design partner 24/7.", color: "168,85,247" },
  { name: "Priya Patel", role: "Data Scientist @ Anthropic", avatar: "PP", text: "Memory + web search together is a game changer. It actually knows my projects and finds current information simultaneously.", color: "6,182,212" },
  { name: "Alex Rivera", role: "CTO @ YC Startup", avatar: "AR", text: "We built our entire internal tooling assistant on top of Vortis. The API is clean, the quality is top-tier.", color: "99,102,241" },
  { name: "Yuki Tanaka", role: "Research Lead @ DeepMind", avatar: "YT", text: "Deep Research mode synthesized our literature review in 8 minutes. What used to take weeks now takes coffee breaks.", color: "124,58,237" },
  { name: "Emma Williams", role: "Founder @ AI Startup", avatar: "EW", text: "Switched from ChatGPT and never looked back. The UI is gorgeous and the responses are noticeably sharper.", color: "168,85,247" },
];

function Testimonials() {
  const [ref, inView] = useInView(0.08);
  return (
    <section ref={ref} style={{ padding: "80px 0", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 100, zIndex: 2, background: "linear-gradient(to right,#03030a,transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 100, zIndex: 2, background: "linear-gradient(to left,#03030a,transparent)", pointerEvents: "none" }} />

      <div style={{ textAlign: "center", marginBottom: 48, padding: "0 40px" }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(26px,4vw,44px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transition: "all 0.7s ease" }}>
          Loved by{" "}
          <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>builders worldwide.</span>
        </h2>
      </div>

      <div style={{
        display: "flex", gap: 16, width: "max-content",
        animation: "marquee-l 60s linear infinite",
        willChange: "transform",
        opacity: inView ? 1 : 0, transition: "opacity 1s 0.2s ease",
      }}>
        {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
          <div key={i} style={{
            width: 300, flexShrink: 0, padding: "24px", borderRadius: 16,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            transition: "all 0.25s",
          }}>
            <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
              {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: 13, color: "#f59e0b" }}>★</span>)}
            </div>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: "0 0 18px" }}>"{t.text}"</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,rgb(${t.color}),rgba(${t.color},0.6))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{t.avatar}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PRICING
// ══════════════════════════════════════════════════════════════════
const PLANS = [
  {
    name: "Silver", colorStr: "148,163,184", color: "#94a3b8", popular: false,
    icon: Star, iconBg: "rgba(148,163,184,0.15)", iconBorder: "rgba(148,163,184,0.35)",
    prices: { monthly: "$9", q: "$24", h: "$43", y: "$81" },
    badge: null, glowAnim: "silverGlow",
    features: ["300 messages/day", "40 documents/day", "20 images/day", "3 vision/day", "Priority access", "Voice mode"],
  },
  {
    name: "Gold", colorStr: "251,191,36", color: "#fbbf24", popular: true,
    icon: Crown, iconBg: "rgba(251,191,36,0.15)", iconBorder: "rgba(251,191,36,0.4)",
    prices: { monthly: "$19", q: "$51", h: "$91", y: "$171" },
    badge: "✦ Most Popular", glowAnim: "goldGlow",
    features: ["500 messages/day", "50 documents/day", "40 images/day", "10 vision/day", "Priority responses", "Deep research"],
  },
  {
    name: "Platinum", colorStr: "6,182,212", color: "#06b6d4", popular: false,
    icon: Gem, iconBg: "rgba(6,182,212,0.15)", iconBorder: "rgba(6,182,212,0.35)",
    prices: { monthly: "$29", q: "$78", h: "$139", y: "$261" },
    badge: null, glowAnim: "platinumGlow",
    features: ["Unlimited messages", "Unlimited documents", "Unlimited images", "Unlimited vision", "VIP support", "Early features"],
  },
];
const BILLING_NAMES = { monthly: "Monthly", q: "3 Months", h: "6 Months", y: "Annual" };
const BILLING_LABELS = { monthly: "/mo", q: "/3 mo", h: "/6 mo", y: "/yr" };
 
function Pricing() {
  const [billing, setBilling] = useState("monthly");
  const [ref, inView] = useInView(0.08);
  return (
    <section id="pricing" ref={ref} style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "all 0.7s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c4b5fd", fontFamily: "'JetBrains Mono',monospace" }}>Pricing</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: "0 0 28px", letterSpacing: "-0.03em", color: "#fff", opacity: inView ? 1 : 0, transition: "all 0.8s 0.1s ease" }}>
            Choose Your{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan.</span>
          </h2>
          <div style={{ display: "inline-flex", padding: 4, borderRadius: 99, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", gap: 3, opacity: inView ? 1 : 0, transition: "opacity 0.7s 0.2s ease" }}>
            {Object.keys(BILLING_NAMES).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: billing === b ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "transparent", color: billing === b ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.2s", boxShadow: billing === b ? "0 0 16px rgba(124,58,237,0.4)" : "none" }}>
                {BILLING_NAMES[b]}
              </button>
            ))}
          </div>
        </div>
 
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {PLANS.map((plan, idx) => {
            const PlanIcon = plan.icon;
            return (
              <div key={plan.name} style={{ borderRadius: 24, padding: "36px 30px", position: "relative", border: plan.popular ? `1px solid rgba(${plan.colorStr},0.6)` : "1px solid rgba(255,255,255,0.07)", background: plan.popular ? `rgba(${plan.colorStr},0.07)` : "rgba(255,255,255,0.02)", animation: `${plan.glowAnim} 3s ease-in-out infinite`, display: "flex", flexDirection: "column", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : `translateY(${idx === 1 ? 80 : 0}px)`, transition: `all 0.75s ${idx * 0.12 + 0.3}s ease` }}>
                {plan.popular && (
                  <>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "24px 24px 0 0", background: `linear-gradient(90deg, transparent, ${plan.color}, transparent)` }} />
                    <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg,${plan.color},#a855f7)`, padding: "4px 18px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", boxShadow: `0 4px 16px rgba(${plan.colorStr},0.5)` }}>{plan.badge}</div>
                  </>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 20, margin: 0, color: "#fff" }}>{plan.name}</h3>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: plan.iconBg, border: `1px solid ${plan.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlanIcon size={18} style={{ color: plan.color }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 26 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: 46, color: "#fff", lineHeight: 1 }}>{plan.prices[billing]}</span>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", paddingBottom: 5 }}>{BILLING_LABELS[billing]}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "rgba(255,255,255,0.7)" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: `rgba(${plan.colorStr},0.18)`, border: `1px solid rgba(${plan.colorStr},0.4)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check size={11} style={{ color: plan.color }} />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <button style={{ width: "100%", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", background: plan.popular ? `linear-gradient(135deg,${plan.color},#7C3AED)` : "rgba(255,255,255,0.06)", color: "#fff", border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.1)", boxShadow: plan.popular ? `0 0 24px rgba(${plan.colorStr},0.4)` : "none", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                  Get Started →
                </button>
              </div>
            );
          })}
        </div>
 
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 36, flexWrap: "wrap", opacity: inView ? 1 : 0, transition: "opacity 0.8s 0.5s ease" }}>
          {[{ icon: <Shield size={13} />, text: "Cancel anytime" }, { icon: <Lock size={13} />, text: "Enterprise-grade security" }, { icon: <Wifi size={13} />, text: "99.9% uptime SLA" }].map(s => (
            <div key={s.text} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "rgba(255,255,255,0.35)" }}>
              <span style={{ color: "rgba(139,92,246,0.7)" }}>{s.icon}</span>{s.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
 
// ══════════════════════════════════════════════════════════════════
//  FAQ
// ══════════════════════════════════════════════════════════════════
const FAQS = [
  { q: "What is Vortis AI?", a: "Vortis AI is a unified platform combining Chat, Image Generation, Web Search, Coding, Vision, Documents, Memory, Voice, and Deep Research — all in one beautiful interface." },
  { q: "What models power Vortis?", a: "Vortis routes intelligently between proprietary ultra-low-latency models and frontier models to give you the best result for each specific task type." },
  { q: "Is there a free trial?", a: "Yes — explore core capabilities completely free with no credit card required. Premium features like Deep Research and unlimited usage require a paid plan." },
  { q: "How does billing work?", a: "Choose monthly, quarterly, semi-annual, or annual billing. Longer commitments unlock big discounts — annual saves 25%. Cancel any time, no questions asked." },
  { q: "What is Deep Research mode?", a: "Autonomous agents browse the web, read documents, cross-reference sources, and synthesize comprehensive reports in minutes. Like having a research team on demand." },
  { q: "Is my data private and secure?", a: "Absolutely. Your conversations, documents, and outputs are never used to train models or shared with third parties. Enterprise-grade AES-256 encryption at rest and in transit." },
];

function FaqItem({ faq, index, inView }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      opacity: inView ? 1 : 0,
      transform: inView ? "translateX(0)" : `translateX(${index % 2 === 0 ? -40 : 40}px)`,
      transition: `all 0.6s ${index * 0.07}s ease`,
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: open ? "#fff" : "rgba(255,255,255,0.7)", transition: "color 0.2s" }}>{faq.q}</span>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginLeft: 16,
          border: `1px solid ${open ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.1)"}`,
          background: open ? "rgba(139,92,246,0.15)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: open ? "rotate(45deg)" : "rotate(0deg)", transition: "all 0.28s",
          boxShadow: open ? "0 0 12px rgba(139,92,246,0.3)" : "none",
        }}>
          <Plus size={14} style={{ color: open ? "#a855f7" : "rgba(255,255,255,0.4)" }} />
        </div>
      </button>
      <div style={{ maxHeight: open ? 220 : 0, overflow: "hidden", transition: "max-height 0.38s ease" }}>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.75, paddingBottom: 22, paddingRight: 48, margin: 0 }}>{faq.a}</p>
      </div>
    </div>
  );
}

function FAQ() {
  const [ref, inView] = useInView(0.08);
  return (
    <section id="faq" ref={ref} style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-40px)", transition: "all 0.7s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>FAQ</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(26px,4vw,44px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(40px)", transition: "all 0.8s 0.1s ease" }}>
            Frequently Asked{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Questions</span>
          </h2>
        </div>
        {FAQS.map((f, i) => <FaqItem key={i} faq={f} index={i} inView={inView} />)}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  CTA SECTION
// ══════════════════════════════════════════════════════════════════
function CTA({ onLogin }) {
  const [ref, inView] = useInView(0.15);
  return (
    <section ref={ref} style={{ padding: "100px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1, textAlign: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(124,58,237,0.07), transparent)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
        <div style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s ease" }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>✦</div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(32px,6vw,62px)", margin: "0 0 20px", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            Start thinking{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "gradientShift 4s ease-in-out infinite" }}>faster.</span>
          </h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 40 }}>
            Join 50,000+ professionals who use Vortis every day. Free to start.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => onLogin('google')} style={{
              padding: "16px 40px", borderRadius: 99, fontSize: 16, fontWeight: 700,
              background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", color: "#fff",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 0 60px rgba(124,58,237,0.55), 0 16px 40px rgba(124,58,237,0.3)",
              transition: "all 0.25s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px) scale(1.03)"; e.currentTarget.style.boxShadow = "0 0 80px rgba(124,58,237,0.7), 0 24px 60px rgba(124,58,237,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(124,58,237,0.55), 0 16px 40px rgba(124,58,237,0.3)"; }}
            >
              <Zap size={18} /> Get Started Free
            </button>
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
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "56px 40px 32px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 60, marginBottom: 48, alignItems: "start" }}>
          <div>
            <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 14 }}>
              <VortisLogo size={28} color="#8b5cf6" />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.1em", color: "#fff" }}>VORTIS</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a855f7" }}>AI</span>
            </a>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.28)", maxWidth: 280, lineHeight: 1.7, margin: "0 0 20px" }}>The intelligence platform for the world's most ambitious professionals.</p>
            <div style={{ display: "flex", gap: 10 }}>
              {["𝕏", "◆", "○", "◇"].map((icon, i) => (
                <a key={i} href="#" style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 14, textDecoration: "none", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.3)"; e.currentTarget.style.color = "#a855f7"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                >{icon}</a>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 56, flexWrap: "wrap" }}>
            {[
              { title: "Product", links: ["Capabilities", "Pricing", "Changelog", "API Docs"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
              { title: "Support", links: ["Documentation", "Status", "Contact", "Privacy"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono',monospace" }}>{col.title}</div>
                {col.links.map(l => <a key={l} href="#" style={{ display: "block", fontSize: 13.5, color: "rgba(255,255,255,0.32)", marginBottom: 9, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.7)"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.32)"}
                >{l}</a>)}
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono',monospace" }}>© 2026 Vortis AI Inc. All rights reserved.</span>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy Policy", "Terms of Service", "Cookie Policy"].map(l => <a key={l} href="#" style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>{l}</a>)}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LANDING PAGE
// ══════════════════════════════════════════════════════════════════
export default function LandingPage({ onLogin, authLoading = false, authError = "" }) {
  return (
    <div style={{ background: "#03030a", color: "#ffffff", minHeight: "100vh", fontFamily: "'Inter',sans-serif", overflowX: "hidden", position: "relative" }}>
      <StyleInjector />
      <CosmicBg />
      <FloatingParticles />
      <CursorOrb />
      <Nav onLogin={onLogin} />
      <main style={{ position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
          <Hero onLogin={onLogin} authLoading={authLoading} authError={authError} />
        </div>
        <Logos />
        <BentoGrid />
        <HowItWorks />
        <Showcase />
        <DashboardPreview /> 
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA onLogin={onLogin} />
        <Footer />
      </main>
    </div>
  );
}