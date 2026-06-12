import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, Code2, Eye, Globe, Brain, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Zap,
  Shield, Cpu, Layers, ArrowRight, Sparkles, Lock,
  BarChart3, Wifi, ChevronDown, Star, Award, Crown,
  Gem, Diamond, Medal, Trophy, Target, Rocket, Users,
  TrendingUp, Clock, Database, Search, Palette,
} from "lucide-react";

function TypewriterEffect({ words }) {
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  useEffect(() => {
    const word = words[currentWordIdx];
    let timer;
    
    if (!isDeleting && currentText === word) {
      timer = setTimeout(() => setIsDeleting(true), 1500);
    } else if (isDeleting && currentText === "") {
      setIsDeleting(false);
      setCurrentWordIdx((prev) => (prev + 1) % words.length);
    } else {
      const speed = isDeleting ? 50 : 100;
      timer = setTimeout(() => {
        setCurrentText(
          isDeleting 
            ? word.substring(0, currentText.length - 1)
            : word.substring(0, currentText.length + 1)
        );
      }, speed);
    }
    
    return () => clearTimeout(timer);
  }, [currentText, isDeleting, currentWordIdx, words]);

  return (
    <span>
      {currentText}
      <span style={{ animation: "blink 0.7s infinite", fontWeight: "normal" }}>|</span>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </span>
  );
}

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
        <button style={{
          padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 600,
          background: "transparent", color: "rgba(255,255,255,0.65)",
          border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.target.style.borderColor = "rgba(139,92,246,0.5)"; e.target.style.color = "#fff"; }}
        onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.color = "rgba(255,255,255,0.65)"; }}
        >Sign In</button>
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
const CYCLE_WORDS = ["INTELLIGENCE", "REASONING", "CREATIVITY", "RESEARCH", "UNDERSTANDING", "AUTOMATION"];

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
      {displayed}
      <span style={{
        display: "inline-block", width: 4, height: "0.85em",
        background: "#a855f7", marginLeft: 3, verticalAlign: "middle",
        animation: phase === "done" ? "blink 0.8s step-end infinite" : "none",
        opacity: phase === "done" ? 1 : 1,
      }} />
    </span>
  );
}

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
    <div style={{
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

function Hero({ onLogin, authLoading, authError }) {
  const [wordIdx, setWordIdx] = useState(0);
  // Add the array here at the top of your existing component!
  const wordsArray = [
    "INTELLIGENCE", "VISION", "FUTURE", "CREATIVITY", 
    "INNOVATION", "EXCELLENCE", "CLARITY", "EXPERIENCE", "RESULTS"
  ];

  useEffect(() => {
    const id = setInterval(() => setWordIdx(i => (i + 1) % CYCLE_WORDS.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{
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

   <>
  {/* Headline */}
  <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.04em", margin: "0 0 24px", fontSize: "clamp(3rem,5.5vw,5.5rem)" }}>
    <span style={{ display: "block", color: "#fff", animation: "slideInLeft 0.7s 0.1s ease both" }}>THE</span>
    <span style={{ 
      display: "block", 
      background: "linear-gradient(90deg,#7C3AED 0%,#a855f7 40%,#06B6D4 100%)", 
      backgroundSize: "200% auto", 
      backgroundClip: "text", 
      WebkitBackgroundClip: "text", 
      WebkitTextFillColor: "transparent", 
      animation: "gradientShift 4s ease-in-out infinite" 
    }}>
      <TypewriterWord word={[
        "INTELLIGENCE", 
        "VISION", 
        "FUTURE", 
        "CREATIVITY", 
        "INNOVATION", 
        "EXCELLENCE", 
        "CLARITY", 
        "EXPERIENCE", 
        "RESULTS"
      ][(wordIdx ?? 0) % 9]} />
    </span>
    <span style={{ display: "block", color: "rgba(255,255,255,0.25)", animation: "slideInRight 0.7s 0.4s ease both" }}>YOU DESERVE.</span>
  </h1>

  {/* Description Sub-headline */}
  <p style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", maxWidth: 480, lineHeight: 1.75, marginBottom: 40, animation: "fadeUp 0.7s 0.5s ease both" }}>
    Chat, Vision, Code, Research — unified in one surface. Built for the way you actually think.
  </p>
</>
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
          {[["50K+", "Users"], ["10B+", "Tokens/mo"], ["4.9★", "Rating"]].map(([n, l]) => (
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
  Google: { multiPath: [
    { d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z", fill: "#4285F4" },
    { d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z", fill: "#34A853" },
    { d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z", fill: "#FBBC05" },
    { d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z", fill: "#EA4335" },
  ]},
  Microsoft: { multiPath: [
    { d: "M1 1h10.5v10.5H1z", fill: "#F25022" },{ d: "M12.5 1H23v10.5H12.5z", fill: "#7FBA00" },
    { d: "M1 12.5h10.5V23H1z", fill: "#00A4EF" },{ d: "M12.5 12.5H23V23H12.5z", fill: "#FFB900" },
  ]},
  Apple: { path: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.029-3.91 1.183-4.961 3.004-2.117 3.669-.54 9.115 1.512 12.067 1.004 1.442 2.184 3.055 3.754 2.997 1.516-.067 2.085-.98 3.924-.98 1.829 0 2.356.98 3.948.943 1.629-.029 2.665-1.462 3.654-2.907 1.149-1.678 1.619-3.302 1.644-3.389-.038-.019-3.174-1.21-3.208-4.793-.029-3.004 2.462-4.443 2.573-4.51-1.411-2.062-3.593-2.293-4.364-2.351-2.11-.173-3.611 1.04-4.522 1.04zm2.946-4.377c.806-.97 1.344-2.323 1.19-3.673-1.152.048-2.55.77-3.379 1.737-.73.845-1.363 2.217-1.181 3.539 1.286.096 2.592-.643 3.37-1.603z", color: "#FFFFFF" },
  Meta: { path: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303z", color: "#0467DF" },
  Amazon: { path: "M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.226-.088.39-.046.525.13.12.174.09.336-.12.48-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.405.48.283.45.195.57.06.254.105.42.135.51.062.3.076.615.02.553v5.28c0 .376.06.72.165 1.036.105.313.315.674.51.674.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94z", color: "#FF9900" },
  Netflix: { path: "m5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z", color: "#E50914" },
  Spotify: { path: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z", color: "#1ED760" },
  Adobe: { path: "M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm15.116 0h-8.884L24 22.624Z", color: "#FF0000" },
  Stripe: { path: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z", color: "#635BFF" },
  Vercel: { path: "m12 1.608 12 20.784H0Z", color: "#ffffff" },
  GitHub: { path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", color: "#ffffff" },
  Notion: { path: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933z", color: "#FFFFFF" },
  Figma: { multiPath: [
    { d: "M12 0H8a4 4 0 0 0-4 4a4 4 0 0 0 4 4h4V0z", fill: "#F24E1E" },
    { d: "M12 0h4a4 4 0 0 1 4 4a4 4 0 0 1-4 4h-4V0z", fill: "#FF7262" },
    { d: "M12 8H8a4 4 0 0 0-4 4a4 4 0 0 0 4 4h4V8z", fill: "#A259FF" },
    { d: "M20 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0z", fill: "#1ABCFE" },
    { d: "M12 16v4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4h4z", fill: "#0ACF83" },
  ]},
  OpenAI: { path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944z", color: "#ffffff" },
  Anthropic: { path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z", color: "#D97706" },
  Discord: { path: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z", color: "#5865F2" },
  X: { path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", color: "#ffffff" },
};

function BrandIcon({ name }) {
  const brand = BRAND_DATA[name];
  if (!brand) return null;
  const s = { width: 18, height: 18, display: "block", flexShrink: 0 };
  if (brand.multiPath) return <svg viewBox="0 0 24 24" style={s}>{brand.multiPath.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</svg>;
  return <svg viewBox="0 0 24 24" style={s}><path d={brand.path} fill={brand.color} /></svg>;
}

const ROW1 = ["Google","Microsoft","Apple","Meta","Amazon","Netflix","Spotify","Adobe","Stripe","Vercel","GitHub","Notion"];
const ROW2 = ["Figma","OpenAI","Anthropic","Discord","X","Google","Microsoft","Apple","Meta","Amazon","Netflix","Spotify"];

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
        animation: `${reverse ? "marquee-r" : "marquee-l"} ${reverse ? 48 : 40}s linear infinite`,
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
        Trusted by professionals at
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
    { icon: Globe, color: "124,58,237", title: "Live Web Search", desc: "Real-time results from across the internet with source attribution and smart summarization.", size: "large" },
    { icon: ImageIcon, color: "168,85,247", title: "Image Generation", desc: "Create stunning visuals in any style — photorealistic, anime, oil painting, cyberpunk.", size: "small" },
    { icon: Code2, color: "6,182,212", title: "Code Mastery", desc: "Write, debug, explain, and refactor across all languages with principal-level quality.", size: "small" },
    { icon: Eye, color: "99,102,241", title: "Vision AI", desc: "Analyze images, read text, extract data — your eyes for any visual content.", size: "small" },
    { icon: Brain, color: "168,85,247", title: "Persistent Memory", desc: "Vortis remembers your preferences, projects, and context across every conversation.", size: "small" },
    { icon: Microscope, color: "6,182,212", title: "Deep Research", desc: "Autonomous agents synthesize 50+ sources into comprehensive reports in minutes.", size: "large" },
    { icon: FileText, color: "124,58,237", title: "Document Analysis", desc: "Chat with PDFs, CSVs, Word docs — extract insights from any file instantly.", size: "small" },
    { icon: Cpu, color: "168,85,247", title: "Voice Mode", desc: "Speak naturally, hear responses — hands-free AI with multilingual support.", size: "small" },
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
//  NODE GRAPH SHOWCASE
// ══════════════════════════════════════════════════════════════════
const CAPS = [
  { id: "chat", name: "AI Chat", icon: MessageSquare, color: "124,58,237", tagline: "Reason and create at the speed of thought", nodes: [{ x: 50, y: 18, label: "Context", size: 11 }, { x: 22, y: 50, label: "Memory", size: 8 }, { x: 78, y: 50, label: "Reasoning", size: 8 }, { x: 50, y: 82, label: "Response", size: 11 }], streams: [{ x1: 50, y1: 18, x2: 22, y2: 50 }, { x1: 50, y1: 18, x2: 78, y2: 50 }, { x1: 22, y1: 50, x2: 50, y2: 82 }, { x1: 78, y1: 50, x2: 50, y2: 82 }] },
  { id: "code", name: "Coding", icon: Code2, color: "6,182,212", tagline: "Write, refactor, review — principal quality", nodes: [{ x: 50, y: 18, label: "Analyze", size: 10 }, { x: 22, y: 48, label: "Refactor", size: 8 }, { x: 78, y: 48, label: "Generate", size: 8 }, { x: 35, y: 78, label: "Review", size: 8 }, { x: 65, y: 78, label: "Test", size: 8 }], streams: [{ x1: 50, y1: 18, x2: 22, y2: 48 }, { x1: 50, y1: 18, x2: 78, y2: 48 }, { x1: 22, y1: 48, x2: 35, y2: 78 }, { x1: 78, y1: 48, x2: 65, y2: 78 }, { x1: 35, y1: 78, x2: 65, y2: 78 }] },
  { id: "image", name: "Image Gen", icon: ImageIcon, color: "168,85,247", tagline: "Studio-quality visuals in milliseconds", nodes: [{ x: 50, y: 18, label: "Prompt", size: 9 }, { x: 20, y: 48, label: "Style", size: 8 }, { x: 80, y: 48, label: "Detail", size: 8 }, { x: 35, y: 78, label: "Compose", size: 8 }, { x: 65, y: 78, label: "Render", size: 8 }], streams: [{ x1: 50, y1: 18, x2: 20, y2: 48 }, { x1: 50, y1: 18, x2: 80, y2: 48 }, { x1: 20, y1: 48, x2: 35, y2: 78 }, { x1: 80, y1: 48, x2: 65, y2: 78 }] },
  { id: "search", name: "Web Search", icon: Globe, color: "124,58,237", tagline: "Real-time internet with perfect attribution", nodes: [{ x: 50, y: 50, label: "Query", size: 13 }, { x: 18, y: 22, label: "Source A", size: 7 }, { x: 50, y: 14, label: "Source B", size: 7 }, { x: 82, y: 22, label: "Source C", size: 7 }, { x: 82, y: 76, label: "Source D", size: 7 }, { x: 18, y: 76, label: "Source E", size: 7 }], streams: [{ x1: 18, y1: 22, x2: 50, y2: 50 }, { x1: 50, y1: 14, x2: 50, y2: 50 }, { x1: 82, y1: 22, x2: 50, y2: 50 }, { x1: 82, y1: 76, x2: 50, y2: 50 }, { x1: 18, y1: 76, x2: 50, y2: 50 }] },
  { id: "memory", name: "Memory", icon: Brain, color: "168,85,247", tagline: "Persistent context that never forgets", nodes: [{ x: 50, y: 50, label: "Core", size: 13 }, { x: 20, y: 24, label: "Session", size: 8 }, { x: 80, y: 24, label: "Long-term", size: 8 }, { x: 15, y: 70, label: "Projects", size: 7 }, { x: 85, y: 70, label: "Profile", size: 7 }], streams: [{ x1: 20, y1: 24, x2: 50, y2: 50 }, { x1: 80, y1: 24, x2: 50, y2: 50 }, { x1: 15, y1: 70, x2: 50, y2: 50 }, { x1: 85, y1: 70, x2: 50, y2: 50 }] },
  { id: "research", name: "Deep Research", icon: Microscope, color: "6,182,212", tagline: "Autonomous agents synthesizing 50+ sources", nodes: [{ x: 50, y: 50, label: "Agent", size: 13 }, { x: 18, y: 18, label: "Source A", size: 6 }, { x: 82, y: 18, label: "Source B", size: 6 }, { x: 12, y: 64, label: "Source C", size: 6 }, { x: 88, y: 64, label: "Source D", size: 6 }, { x: 50, y: 86, label: "Report", size: 9 }], streams: [{ x1: 18, y1: 18, x2: 50, y2: 50 }, { x1: 82, y1: 18, x2: 50, y2: 50 }, { x1: 12, y1: 64, x2: 50, y2: 50 }, { x1: 88, y1: 64, x2: 50, y2: 50 }, { x1: 50, y1: 50, x2: 50, y2: 86 }] },
];

function NodeGraph({ cap }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id={`glow-${cap.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {cap.streams.map((s, i) => (
          <g key={i}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={`rgba(${cap.color},0.1)`} strokeWidth="1" strokeLinecap="round" />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={`rgba(${cap.color},0.65)`} strokeWidth="0.35" strokeLinecap="round" filter={`url(#glow-${cap.id})`}>
              <animate attributeName="opacity" values="0;0.9;0.3;0.9;0" dur={`${2.4 + i * 0.18}s`} begin={`${i * 0.14}s`} repeatCount="indefinite" />
            </line>
            <circle r="1.6" fill={`rgb(${cap.color})`} filter={`url(#glow-${cap.id})`}>
              <animateMotion dur={`${1.7 + i * 0.22}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} path={`M${s.x1},${s.y1} L${s.x2},${s.y2}`} />
              <animate attributeName="opacity" values="0;1;1;0" dur={`${1.7 + i * 0.22}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} />
            </circle>
          </g>
        ))}
        {cap.nodes.map((node, i) => {
          const r = node.size * 0.46;
          const big = node.size >= 10;
          return (
            <g key={i}>
              <circle cx={node.x} cy={node.y} fill="none" stroke={`rgba(${cap.color},0.25)`} strokeWidth="0.5">
                <animate attributeName="r" values={`${r*1.5};${r*2.6};${r*1.5}`} dur={`${2.5+i*.28}s`} begin={`${i*.22}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur={`${2.5+i*.28}s`} begin={`${i*.22}s`} repeatCount="indefinite" />
              </circle>
              <circle cx={node.x} cy={node.y} r={r} fill={`rgba(${cap.color},${big?"0.2":"0.1"})`} stroke={`rgba(${cap.color},0.9)`} strokeWidth={big?0.9:0.6} filter={`url(#glow-${cap.id})`} />
              {big && <circle cx={node.x} cy={node.y} r={r*0.38} fill={`rgba(${cap.color},0.75)`}><animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite"/></circle>}
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {cap.nodes.map((n, i) => (
          <div key={i} style={{ position: "absolute", left: `${n.x}%`, top: `${n.y}%`, transform: `translate(-50%, ${n.y > 62 ? "12px" : "-145%"})` }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap", display: "block", background: `rgba(${cap.color},0.18)`, color: `rgb(${cap.color})`, border: `1px solid rgba(${cap.color},0.45)`, boxShadow: `0 0 10px rgba(${cap.color},0.3)`, backdropFilter: "blur(4px)" }}>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  const [ref, inView] = useInView(0.08);
  const [active, setActive] = useState(0);
  const cap = CAPS[active];

  return (
    <section id="capabilities" ref={ref} style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.04)", position: "relative", zIndex: 1 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 15% 50%, rgba(124,58,237,0.04), transparent)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)", marginBottom: 16, opacity: inView ? 1 : 0, transition: "opacity 0.7s ease" }}>
            <Layers size={11} color="#a855f7" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(168,85,247,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>Intelligence Graph</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,4.5vw,48px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)", transition: "all 0.8s 0.1s ease" }}>
            Every mode.{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One platform.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CAPS.map((c, i) => {
              const Icon = c.icon;
              const isActive = i === active;
              return (
                <button key={c.id} onClick={() => setActive(i)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: isActive ? `1px solid rgba(${c.color},0.5)` : "1px solid rgba(255,255,255,0.05)",
                  background: isActive ? `rgba(${c.color},0.18)` : "rgba(255,255,255,0.02)",
                  boxShadow: isActive ? `0 0 24px rgba(${c.color},0.2), inset 0 1px 0 rgba(255,255,255,0.05)` : "none",
                  transition: "all 0.2s",
                  opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-30px)",
                  transitionDelay: `${i * 0.06 + 0.2}s`,
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? `rgba(${c.color},0.3)` : `rgba(${c.color},0.1)`, border: `1px solid rgba(${c.color},0.3)`, flexShrink: 0 }}>
                    <Icon size={16} style={{ color: `rgb(${c.color})` }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.55)" }}>{c.name}</div>
                    {isActive && <div style={{ fontSize: 10.5, color: `rgba(${c.color},0.8)`, marginTop: 2 }}>{c.tagline}</div>}
                  </div>
                </button>
              );
            })}
          </div>

          <div key={cap.id} style={{
            borderRadius: 20, padding: 24, minHeight: 400,
            background: "rgba(5,5,18,0.9)", border: "1px solid rgba(255,255,255,0.06)",
            position: "relative", overflow: "hidden",
            opacity: inView ? 1 : 0, transition: "all 0.4s ease",
          }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "26px 26px", opacity: 0.035, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 65% 60% at 50% 50%, rgba(${cap.color},0.08), transparent)`, pointerEvents: "none" }} />
            {/* Scan line effect */}
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, rgba(${cap.color},0.4), transparent)`, animation: "scanLine 4s linear infinite", pointerEvents: "none", zIndex: 2 }} />
            <div style={{ position: "relative", height: 380 }}>
              <NodeGraph cap={cap} />
            </div>
          </div>
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
const BILLING_SAVINGS = { monthly: null, q: "Save 11%", h: "Save 20%", y: "Save 25%" };
 
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
                {BILLING_SAVINGS[b] && billing === b && <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(16,185,129,0.2)", color: "#10b981", padding: "1px 5px", borderRadius: 99 }}>{BILLING_SAVINGS[b]}</span>}
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
  { q: "Can I use Vortis via API?", a: "Yes — Vortis offers a clean REST API with streaming support. Build your own products on top of Vortis intelligence. Docs available for all paid plans." },
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
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA onLogin={onLogin} />
        <Footer />
      </main>
    </div>
  );
}