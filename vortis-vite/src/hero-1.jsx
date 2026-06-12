import { useState, useRef, useEffect } from "react";
import {
  MessageSquare, Code2, Eye, Globe, Brain, Mic, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Star, Send, Zap, ArrowRight
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════
//  GLOBAL KEYFRAME STYLES
// ══════════════════════════════════════════════════════════════════
const KEYFRAMES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{overflow-x:hidden!important;scroll-behavior:smooth}
@keyframes marquee-l{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(80px,-60px) scale(1.2)}66%{transform:translate(-30px,70px) scale(.9)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(-70px,50px) scale(1.3)}70%{transform:translate(40px,-40px) scale(.85)}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-40px,-80px) scale(1.15)}}
@keyframes orb4{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(60px,40px) scale(1.1)}70%{transform:translate(-20px,-30px) scale(.92)}}
@keyframes tdot{0%,80%,100%{transform:scale(.65);opacity:.4}40%{transform:scale(1);opacity:1}}
@keyframes gold-glow{0%,100%{box-shadow:0 0 20px rgba(251,191,36,.15),0 0 50px rgba(124,58,237,.1),inset 0 0 0 1px rgba(251,191,36,.25)}50%{box-shadow:0 0 40px rgba(251,191,36,.35),0 0 90px rgba(124,58,237,.2),inset 0 0 0 1px rgba(251,191,36,.5)}}
@keyframes star-grid{0%{opacity:.014}50%{opacity:.025}100%{opacity:.014}}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes glow{0%,100%{box-shadow:0 0 20px rgba(124,58,237,.3)}50%{box-shadow:0 0 50px rgba(124,58,237,.7)}}
@keyframes borderPulse{0%,100%{border-color:rgba(124,58,237,.3)}50%{border-color:rgba(124,58,237,.8)}}
.tdot{display:inline-block;width:7px;height:7px;border-radius:50%;background:rgba(168,85,247,.8);animation:tdot 1.3s infinite}
.tdot:nth-child(2){animation-delay:.2s}
.tdot:nth-child(3){animation-delay:.4s}
::-webkit-scrollbar{width:6px;background:#050510}
::-webkit-scrollbar-thumb{background:#7C3AED44;border-radius:3px}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />;
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
  const [pos, setPos] = useState({ x: -200, y: -200 });
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const move = (e) => { setPos({ x: e.clientX, y: e.clientY }); setVisible(true); };
    const leave = () => setVisible(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseleave", leave);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseleave", leave); };
  }, []);
  return (
    <div style={{
      position: "fixed", pointerEvents: "none", zIndex: 9999,
      left: pos.x - 200, top: pos.y - 200, width: 400, height: 400,
      borderRadius: "50%", opacity: visible ? 1 : 0,
      background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)",
      transition: "left 0.08s ease, top 0.08s ease, opacity 0.3s ease",
      willChange: "transform",
    }} />
  );
}

// ══════════════════════════════════════════════════════════════════
//  COSMIC BACKGROUND
// ══════════════════════════════════════════════════════════════════
function CosmicBg() {
  const orbs = [
    { anim: "orb1 28s ease-in-out infinite", top: "5%", left: "10%", w: 620, c: "rgba(124,58,237,0.055)", blur: 110 },
    { anim: "orb2 35s ease-in-out infinite 5s", top: "40%", right: "5%", w: 540, c: "rgba(168,85,247,0.045)", blur: 130 },
    { anim: "orb3 40s ease-in-out infinite 12s", bottom: "10%", left: "30%", w: 480, c: "rgba(6,182,212,0.032)", blur: 100 },
    { anim: "orb4 32s ease-in-out infinite 8s", top: "60%", left: "5%", w: 400, c: "rgba(124,58,237,0.038)", blur: 120 },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {orbs.map((o, i) => (
        <div key={i} style={{
          position: "absolute", borderRadius: "50%",
          width: o.w, height: o.w,
          top: o.top, left: o.left, right: o.right, bottom: o.bottom,
          background: o.c, filter: `blur(${o.blur}px)`,
          animation: o.anim, willChange: "transform",
        }} />
      ))}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
        backgroundSize: "60px 60px", animation: "star-grid 8s ease-in-out infinite", opacity: 0.018,
      }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  SCROLL ANIMATION HOOK
// ══════════════════════════════════════════════════════════════════
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════
const NAV_LINKS = [
  { label: "Capabilities", href: "#capabilities" },
  { label: "About", href: "#about" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

function Nav({ onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", height: 56,
      background: scrolled ? "rgba(5,5,16,0.88)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      transition: "all 0.3s ease",
    }}>
      <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", animation: "slideInLeft 0.7s ease both" }}>
        <VortisLogo size={28} color="#8b5cf6" />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "0.12em", color: "#fff" }}>VORTIS</span>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: 28, animation: "fadeIn 0.8s 0.2s ease both" }}>
        {NAV_LINKS.map(l => (
          <a key={l.label} href={l.href} style={{
            fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.55)",
            textDecoration: "none", transition: "color 0.2s",
          }}
          onMouseEnter={e => e.target.style.color = "#fff"}
          onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.55)"}
          >{l.label}</a>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "slideInRight 0.7s ease both" }}>
        <button onClick={() => onLogin('google')} style={{
          padding: "8px 20px", borderRadius: 99, fontSize: 13, fontWeight: 700,
          background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", color: "#fff",
          border: "none", cursor: "pointer", boxShadow: "0 0 24px rgba(124,58,237,0.35)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => { e.target.style.transform = "scale(1.04)"; e.target.style.boxShadow = "0 0 36px rgba(124,58,237,0.5)"; }}
        onMouseLeave={e => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "0 0 24px rgba(124,58,237,0.35)"; }}
        >Start Free</button>
      </div>
    </nav>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════
const CYCLE_WORDS = ["INTELLIGENCE", "REASONING", "CREATIVITY", "RESEARCH", "UNDERSTANDING", "AUTOMATION"];

function Hero({ onLogin, authLoading, authError }) {
  const [wordIdx, setWordIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setWordIdx(i => (i + 1) % CYCLE_WORDS.length);
        setVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "80px 24px 60px", position: "relative", zIndex: 1, overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(124,58,237,0.09) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle 400px at 50% 80%, rgba(6,182,212,0.04), transparent)" }} />

      {/* Badge */}
      <div style={{ animation: "fadeUp 0.6s ease both", marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 99,
          border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.07)",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8b5cf6", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(139,92,246,0.85)" }}>Vortis AI</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{ maxWidth: 900, margin: "0 auto 24px" }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.04em", margin: 0, fontSize: "clamp(3.2rem,11vw,9.5rem)" }}>
          <span style={{ display: "block", animation: "slideInLeft 0.8s 0.15s ease both", background: "linear-gradient(180deg,#fff 40%,rgba(255,255,255,0.3))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>THE</span>
          <span style={{
            display: "block",
            background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
            transition: "opacity 0.3s ease, transform 0.35s ease",
          }}>{CYCLE_WORDS[wordIdx]}</span>
          <span style={{ display: "block", animation: "slideInRight 0.8s 0.4s ease both", background: "linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.08))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>YOU DESERVE.</span>
        </h1>
      </div>

      <p style={{ fontSize: "clamp(15px,2vw,19px)", color: "rgba(255,255,255,0.48)", maxWidth: 560, lineHeight: 1.7, marginBottom: 40, animation: "fadeUp 0.7s 0.55s ease both" }}>
        Chat, Vision, Code, Research — one surface. One context. One experience built for the way you actually think.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 64, animation: "fadeUp 0.7s 0.7s ease both" }}>
        <button onClick={() => onLogin('google')} disabled={authLoading} style={{
          padding: "14px 32px", borderRadius: 99, fontSize: 15, fontWeight: 700,
          background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", color: "#fff",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 0 40px rgba(124,58,237,0.45)", opacity: authLoading ? 0.7 : 1,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1) translateY(0)"}
        >
          <Zap size={16} /> {authLoading ? "Signing in…" : "Start Free"}
        </button>
        <a href="#capabilities" style={{
          padding: "14px 28px", borderRadius: 99, fontSize: 15, fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.04)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
        >See Capabilities</a>
      </div>

      {authError && (
        <div style={{ color: "#f87171", fontSize: 13, marginBottom: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 16px" }}>
          {authError}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "32px 52px", justifyContent: "center", animation: "fadeUp 0.7s 0.9s ease both" }}>
        {[["50K+", "Professionals"], ["10B+", "Tokens / Month"], ["4.9★", "Avg Rating"], ["99.9%", "Uptime"]].map(([n, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(22px,4vw,30px)", background: "linear-gradient(135deg,#a855f7,#7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{n}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Scroll arrow */}
      <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.2)", animation: "float 2.2s ease-in-out infinite" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BRAND DATA + LOGOS MARQUEE
// ══════════════════════════════════════════════════════════════════
const BRAND_DATA = {
  Google: { multiPath: [
    { d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z", fill: "#4285F4" },
    { d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z", fill: "#34A853" },
    { d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z", fill: "#FBBC05" },
    { d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z", fill: "#EA4335" },
  ]},
  Microsoft: { multiPath: [
    { d: "M1 1h10.5v10.5H1z", fill: "#F25022" },
    { d: "M12.5 1H23v10.5H12.5z", fill: "#7FBA00" },
    { d: "M1 12.5h10.5V23H1z", fill: "#00A4EF" },
    { d: "M12.5 12.5H23V23H12.5z", fill: "#FFB900" },
  ]},
  Apple: { path: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.029-3.91 1.183-4.961 3.004-2.117 3.669-.54 9.115 1.512 12.067 1.004 1.442 2.184 3.055 3.754 2.997 1.516-.067 2.085-.98 3.924-.98 1.829 0 2.356.98 3.948.943 1.629-.029 2.665-1.462 3.654-2.907 1.149-1.678 1.619-3.302 1.644-3.389-.038-.019-3.174-1.21-3.208-4.793-.029-3.004 2.462-4.443 2.573-4.51-1.411-2.062-3.593-2.293-4.364-2.351-2.11-.173-3.611 1.04-4.522 1.04zm2.946-4.377c.806-.97 1.344-2.323 1.19-3.673-1.152.048-2.55.77-3.379 1.737-.73.845-1.363 2.217-1.181 3.539 1.286.096 2.592-.643 3.37-1.603z", color: "#FFFFFF" },
  Meta: { path: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602z", color: "#0467DF" },
  Amazon: { path: "M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94z", color: "#FF9900" },
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
  LinkedIn: { multiPath: [
    { d: "M6.5 8.36h2.88V18H6.5V8.36zM7.94 4.5A1.67 1.67 0 1 1 7.93 7.8a1.67 1.67 0 0 1 .01-3.3z", fill: "#0A66C2" },
    { d: "M11 8.36h2.76v1.32h.04c.38-.73 1.33-1.5 2.73-1.5 2.92 0 3.47 1.92 3.47 4.42V18h-2.88v-4.51c0-1.08-.02-2.46-1.5-2.46-1.5 0-1.73 1.17-1.73 2.38V18H11V8.36z", fill: "#0A66C2" },
  ]},
  Discord: { path: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z", color: "#5865F2" },
  OpenAI: { path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z", color: "#ffffff" },
  Anthropic: { path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z", color: "#D97706" },
  Shopify: { path: "M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715z", color: "#7AB55C" },
  X: { path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", color: "#ffffff" },
};

function BrandIcon({ name }) {
  const brand = BRAND_DATA[name];
  if (!brand) return null;
  const style = { width: 20, height: 20, display: "block", flexShrink: 0 };
  if (brand.multiPath) {
    return <svg viewBox="0 0 24 24" style={style}>{brand.multiPath.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</svg>;
  }
  return <svg viewBox="0 0 24 24" style={style}><path d={brand.path} fill={brand.color} /></svg>;
}

const ROW1 = ["Google", "Microsoft", "Apple", "Meta", "Amazon", "Netflix", "Spotify", "Adobe", "Stripe", "Vercel", "GitHub", "Notion"];
const ROW2 = ["Figma", "LinkedIn", "Discord", "OpenAI", "Anthropic", "Shopify", "X", "Google", "Microsoft", "Apple", "Meta", "Amazon"];

function LogoItem({ name }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      borderRadius: 99, border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)", height: 52, padding: "0 28px",
      cursor: "default", transition: "all 0.3s",
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; e.currentTarget.style.background = "rgba(124,58,237,0.05)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
    >
      <div style={{ opacity: 0.75 }}><BrandIcon name={name} /></div>
      <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{name}</span>
    </div>
  );
}

function MarqueeRow({ items, reverse }) {
  const all = [...items, ...items, ...items];
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{
        display: "flex", gap: 12, width: "max-content",
        animation: `${reverse ? "marquee-r" : "marquee-l"} ${reverse ? 45 : 38}s linear infinite`,
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
    <section ref={ref} style={{ padding: "80px 0", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.05)", background: "#050510" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 120, zIndex: 2, background: "linear-gradient(to right,#050510,transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 120, zIndex: 2, background: "linear-gradient(to left,#050510,transparent)", pointerEvents: "none" }} />
      <div style={{ textAlign: "center", marginBottom: 36, opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(20px)", transition: "all 0.7s ease" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.7)", margin: 0 }}>Trusted by teams at the world's leading companies</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: inView ? 1 : 0, transition: "opacity 0.9s 0.2s ease" }}>
        <MarqueeRow items={ROW1} reverse={false} />
        <MarqueeRow items={ROW2} reverse={true} />
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NODE GRAPH SHOWCASE
// ══════════════════════════════════════════════════════════════════
const CAPS = [
  { id: "chat", name: "AI Chat", icon: MessageSquare, color: "124,58,237", tagline: "Reason and create at the speed of thought",
    nodes: [{ x: 50, y: 18, label: "Context", size: 11 }, { x: 22, y: 50, label: "Memory", size: 8 }, { x: 78, y: 50, label: "Reasoning", size: 8 }, { x: 50, y: 82, label: "Response", size: 11 }],
    streams: [{ x1: 50, y1: 18, x2: 22, y2: 50 }, { x1: 50, y1: 18, x2: 78, y2: 50 }, { x1: 22, y1: 50, x2: 50, y2: 82 }, { x1: 78, y1: 50, x2: 50, y2: 82 }] },
  { id: "code", name: "Coding", icon: Code2, color: "6,182,212", tagline: "Write, refactor, review — principal quality",
    nodes: [{ x: 50, y: 18, label: "Analyze", size: 10 }, { x: 22, y: 48, label: "Refactor", size: 8 }, { x: 78, y: 48, label: "Generate", size: 8 }, { x: 35, y: 78, label: "Review", size: 8 }, { x: 65, y: 78, label: "Test", size: 8 }],
    streams: [{ x1: 50, y1: 18, x2: 22, y2: 48 }, { x1: 50, y1: 18, x2: 78, y2: 48 }, { x1: 22, y1: 48, x2: 35, y2: 78 }, { x1: 78, y1: 48, x2: 65, y2: 78 }, { x1: 35, y1: 78, x2: 65, y2: 78 }] },
  { id: "image", name: "Image Gen", icon: ImageIcon, color: "168,85,247", tagline: "Studio-quality visuals in milliseconds",
    nodes: [{ x: 50, y: 18, label: "Prompt", size: 9 }, { x: 20, y: 48, label: "Style", size: 8 }, { x: 80, y: 48, label: "Detail", size: 8 }, { x: 35, y: 78, label: "Compose", size: 8 }, { x: 65, y: 78, label: "Render", size: 8 }],
    streams: [{ x1: 50, y1: 18, x2: 20, y2: 48 }, { x1: 50, y1: 18, x2: 80, y2: 48 }, { x1: 20, y1: 48, x2: 35, y2: 78 }, { x1: 80, y1: 48, x2: 65, y2: 78 }] },
  { id: "search", name: "Web Search", icon: Globe, color: "124,58,237", tagline: "Real-time internet with perfect attribution",
    nodes: [{ x: 50, y: 50, label: "Query", size: 13 }, { x: 18, y: 22, label: "Source A", size: 7 }, { x: 50, y: 14, label: "Source B", size: 7 }, { x: 82, y: 22, label: "Source C", size: 7 }, { x: 82, y: 76, label: "Source D", size: 7 }, { x: 18, y: 76, label: "Source E", size: 7 }],
    streams: [{ x1: 18, y1: 22, x2: 50, y2: 50 }, { x1: 50, y1: 14, x2: 50, y2: 50 }, { x1: 82, y1: 22, x2: 50, y2: 50 }, { x1: 82, y1: 76, x2: 50, y2: 50 }, { x1: 18, y1: 76, x2: 50, y2: 50 }] },
  { id: "memory", name: "Memory", icon: Brain, color: "168,85,247", tagline: "Persistent context that never forgets",
    nodes: [{ x: 50, y: 50, label: "Core", size: 13 }, { x: 20, y: 24, label: "Session", size: 8 }, { x: 80, y: 24, label: "Long-term", size: 8 }, { x: 15, y: 70, label: "Projects", size: 7 }, { x: 85, y: 70, label: "Profile", size: 7 }],
    streams: [{ x1: 20, y1: 24, x2: 50, y2: 50 }, { x1: 80, y1: 24, x2: 50, y2: 50 }, { x1: 15, y1: 70, x2: 50, y2: 50 }, { x1: 85, y1: 70, x2: 50, y2: 50 }] },
  { id: "research", name: "Deep Research", icon: Microscope, color: "6,182,212", tagline: "Autonomous agents synthesizing 50+ sources",
    nodes: [{ x: 50, y: 50, label: "Agent", size: 13 }, { x: 18, y: 18, label: "Source A", size: 6 }, { x: 82, y: 18, label: "Source B", size: 6 }, { x: 12, y: 64, label: "Source C", size: 6 }, { x: 88, y: 64, label: "Source D", size: 6 }, { x: 50, y: 86, label: "Report", size: 9 }],
    streams: [{ x1: 18, y1: 18, x2: 50, y2: 50 }, { x1: 82, y1: 18, x2: 50, y2: 50 }, { x1: 12, y1: 64, x2: 50, y2: 50 }, { x1: 88, y1: 64, x2: 50, y2: 50 }, { x1: 50, y1: 50, x2: 50, y2: 86 }] },
];

function NodeGraph({ cap }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id={`glow-${cap.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {cap.streams.map((s, i) => (
          <g key={i}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={`rgba(${cap.color},0.12)`} strokeWidth="0.9" strokeLinecap="round" />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={`rgba(${cap.color},0.6)`} strokeWidth="0.3" strokeLinecap="round" filter={`url(#glow-${cap.id})`}>
              <animate attributeName="opacity" values="0;0.9;0.4;0.9;0" dur={`${2.4 + i * 0.18}s`} begin={`${i * 0.14}s`} repeatCount="indefinite" />
            </line>
            <circle r="1.4" fill={`rgb(${cap.color})`} filter={`url(#glow-${cap.id})`}>
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
              <circle cx={node.x} cy={node.y} fill="none" stroke={`rgba(${cap.color},0.3)`} strokeWidth="0.5">
                <animate attributeName="r" values={`${r * 1.5};${r * 2.4};${r * 1.5}`} dur={`${2.5 + i * 0.28}s`} begin={`${i * 0.22}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0;0.55" dur={`${2.5 + i * 0.28}s`} begin={`${i * 0.22}s`} repeatCount="indefinite" />
              </circle>
              <circle cx={node.x} cy={node.y} r={r} fill={`rgba(${cap.color},${big ? "0.2" : "0.1"})`} stroke={`rgba(${cap.color},0.85)`} strokeWidth={big ? 0.9 : 0.65} filter={`url(#glow-${cap.id})`} />
              {big && <circle cx={node.x} cy={node.y} r={r * 0.35} fill={`rgba(${cap.color},0.7)`}><animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" /></circle>}
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {cap.nodes.map((n, i) => (
          <div key={i} style={{
            position: "absolute", left: `${n.x}%`, top: `${n.y}%`,
            transform: `translate(-50%, ${n.y > 62 ? "12px" : "-145%"})`,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap", display: "block",
              background: `rgba(${cap.color},0.18)`, color: `rgb(${cap.color})`,
              border: `1px solid rgba(${cap.color},0.4)`, boxShadow: `0 0 8px rgba(${cap.color},0.25)`,
              backdropFilter: "blur(4px)",
            }}>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  const [ref, inView] = useInView(0.1);
  const [active, setActive] = useState(0);
  const cap = CAPS[active];

  return (
    <section id="capabilities" ref={ref} style={{ padding: "80px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", position: "relative", zIndex: 1 }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 50% at 20% 50%, rgba(124,58,237,0.05), transparent)" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18, opacity: inView ? 1 : 0, transition: "opacity 0.7s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>Intelligence Graph</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,5vw,48px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s 0.1s ease" }}>
            Every mode. <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One platform.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CAPS.map((c, i) => {
              const Icon = c.icon;
              const isActive = i === active;
              return (
                <button key={c.id} onClick={() => setActive(i)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: isActive ? `1px solid rgba(${c.color},0.45)` : "1px solid rgba(255,255,255,0.06)",
                  background: isActive ? `rgba(${c.color},0.2)` : "rgba(255,255,255,0.025)",
                  boxShadow: isActive ? `0 0 20px rgba(${c.color},0.2)` : "none",
                  transition: "all 0.2s",
                  opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-30px)",
                  transitionDelay: `${i * 0.06 + 0.2}s`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? `rgba(${c.color},0.3)` : `rgba(${c.color},0.12)`, border: `1px solid rgba(${c.color},0.25)`, flexShrink: 0 }}>
                    <Icon size={16} style={{ color: `rgb(${c.color})` }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>{c.name}</div>
                    {isActive && <div style={{ fontSize: 10.5, color: `rgba(${c.color},0.85)`, marginTop: 2 }}>{c.tagline}</div>}
                  </div>
                </button>
              );
            })}
          </div>

          <div key={cap.id} style={{
            borderRadius: 20, padding: 24, minHeight: 380,
            background: "#07070f", border: "1px solid rgba(255,255,255,0.06)",
            position: "relative", overflow: "hidden",
            opacity: inView ? 1 : 0, transform: inView ? "scale(1)" : "scale(0.97)",
            transition: "all 0.35s ease",
          }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.04, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(${cap.color},0.07), transparent)`, pointerEvents: "none" }} />
            <div style={{ position: "relative", height: 360 }}>
              <NodeGraph cap={cap} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PRICING
// ══════════════════════════════════════════════════════════════════
const PLANS = [
  { name: "Silver", color: "124,58,237", popular: false,
    prices: { monthly: "$9", q: "$24", h: "$43", y: "$81" },
    features: ["300 messages/day", "40 documents/day", "20 images/day", "3 vision/day", "Priority access", "Voice mode"] },
  { name: "Gold", color: "168,85,247", popular: true,
    prices: { monthly: "$19", q: "$51", h: "$91", y: "$171" },
    features: ["500 messages/day", "50 documents/day", "40 images/day", "10 vision/day", "Priority responses", "Deep research"] },
  { name: "Platinum", color: "6,182,212", popular: false,
    prices: { monthly: "$29", q: "$78", h: "$139", y: "$261" },
    features: ["Unlimited messages", "Unlimited documents", "Unlimited images", "Unlimited vision", "VIP support", "Early features"] },
];
const BILLING_NAMES = { monthly: "Monthly", q: "3 Months", h: "6 Months", y: "Annual" };
const BILLING_LABELS = { monthly: "/mo", q: "/3 mo", h: "/6 mo", y: "/yr" };

function Pricing() {
  const [billing, setBilling] = useState("monthly");
  const [ref, inView] = useInView(0.1);

  return (
    <section id="pricing" ref={ref} style={{ padding: "80px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18, opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-50px)", transition: "all 0.7s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>Pricing</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,5vw,48px)", margin: "0 0 28px", letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(60px)", transition: "all 0.8s 0.1s ease" }}>
            Choose Your <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan.</span>
          </h2>

          <div style={{ display: "inline-flex", padding: 4, borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", gap: 2, opacity: inView ? 1 : 0, transition: "opacity 0.7s 0.2s ease" }}>
            {Object.keys(BILLING_NAMES).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                background: billing === b ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "transparent",
                color: billing === b ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.2s",
              }}>{BILLING_NAMES[b]}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, maxWidth: 900, margin: "0 auto" }}>
          {PLANS.map((plan, idx) => (
            <div key={plan.name} style={{
              borderRadius: 20, padding: 28, position: "relative",
              border: plan.popular ? `1px solid rgba(${plan.color},0.55)` : "1px solid rgba(255,255,255,0.07)",
              background: plan.popular ? `rgba(${plan.color},0.1)` : "rgba(255,255,255,0.025)",
              boxShadow: plan.popular ? `0 0 50px -12px rgba(${plan.color},0.5)` : "none",
              animation: plan.popular ? "gold-glow 2.5s ease-in-out infinite" : "none",
              display: "flex", flexDirection: "column",
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : `translateY(${idx === 1 ? 90 : 0}px) translateX(${idx === 0 ? -90 : idx === 2 ? 90 : 0}px)`,
              transition: `all 0.75s ${idx * 0.12 + 0.3}s ease`,
            }}>
              {plan.popular && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg,rgb(${plan.color}),#7C3AED)`, padding: "4px 16px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                  Most Popular
                </div>
              )}
              <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 12px", color: "#fff" }}>{plan.name}</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 20 }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: 40, color: "#fff", lineHeight: 1 }}>{plan.prices[billing]}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", paddingBottom: 4 }}>{BILLING_LABELS[billing]}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `rgba(${plan.color},0.2)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={10} style={{ color: `rgb(${plan.color})` }} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <button style={{
                width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                background: plan.popular ? `linear-gradient(135deg,rgb(${plan.color}),#7C3AED)` : "rgba(255,255,255,0.06)",
                color: "#fff", border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.1)",
                boxShadow: plan.popular ? `0 0 20px rgba(${plan.color},0.4)` : "none", transition: "transform 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >Get Started</button>
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
  { q: "What is Vortis AI?", a: "Vortis AI is a unified platform combining Chat, Image Generation, Web Search, Coding, Vision, Documents, Memory, Voice, and Deep Research into a single cohesive experience." },
  { q: "What models power Vortis?", a: "Vortis routes between our proprietary ultra-low-latency models and frontier models to give you the best result for every specific task." },
  { q: "Is there a free trial?", a: "Yes — explore core capabilities free. Premium features like Deep Research and unlimited usage require a paid plan." },
  { q: "How does billing work?", a: "Choose monthly, quarterly, semi-annual, or annual billing. Longer commitments unlock the biggest discounts — annual saves 25%." },
  { q: "What is Deep Research?", a: "Autonomous agents browse the web, read documents, and synthesize massive reports in minutes — a tireless research partner with no limits." },
  { q: "Is my data private?", a: "Your conversations, documents, and outputs are never used to train models or shared with third parties. Enterprise-grade encryption at rest and in transit." },
];

function FaqItem({ faq, index, inView }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      opacity: inView ? 1 : 0,
      transform: inView ? "translateX(0)" : `translateX(${index % 2 === 0 ? -50 : 50}px)`,
      transition: `all 0.6s ${index * 0.07}s ease`,
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: open ? "#fff" : "rgba(255,255,255,0.72)", transition: "color 0.2s" }}>{faq.q}</span>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginLeft: 16,
          border: `1px solid ${open ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`,
          background: open ? "rgba(139,92,246,0.15)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: open ? "rotate(45deg)" : "rotate(0deg)", transition: "all 0.25s",
        }}>
          <Plus size={14} style={{ color: open ? "#a855f7" : "rgba(255,255,255,0.4)" }} />
        </div>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: "hidden", transition: "max-height 0.35s ease" }}>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", lineHeight: 1.7, paddingBottom: 20, paddingRight: 44 }}>{faq.a}</p>
      </div>
    </div>
  );
}

function FAQ() {
  const [ref, inView] = useInView(0.1);
  return (
    <section id="faq" ref={ref} style={{ padding: "80px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", position: "relative", zIndex: 1 }}>
      <div style={{ position: "absolute", right: 0, top: "25%", width: 320, height: 320, borderRadius: "50%", background: "rgba(168,85,247,0.04)", filter: "blur(120px)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18, opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-50px)", transition: "all 0.7s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>FAQ</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(26px,5vw,44px)", margin: 0, letterSpacing: "-0.03em", opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(60px)", transition: "all 0.8s 0.1s ease" }}>
            Frequently Asked <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Questions</span>
          </h2>
        </div>
        {FAQS.map((f, i) => <FaqItem key={i} faq={f} index={i} inView={inView} />)}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FOOTER
// ══════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "52px 24px 32px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
          <div>
            <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 12 }}>
              <VortisLogo size={26} color="#8b5cf6" />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.12em", color: "#fff" }}>VORTIS</span>
            </a>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", maxWidth: 240, lineHeight: 1.6, margin: 0 }}>The intelligence platform for the world's most ambitious professionals.</p>
          </div>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            {[
              { title: "Product", links: ["Capabilities", "Pricing", "Changelog", "Roadmap"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
              { title: "Legal", links: ["Privacy", "Terms", "Security", "Cookies"] },
              { title: "Connect", links: ["Twitter", "Discord", "GitHub", "LinkedIn"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{col.title}</div>
                {col.links.map(l => <a key={l} href="#" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 8, textDecoration: "none" }}>{l}</a>)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24, display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>© 2026 Vortis AI. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LANDING PAGE — DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════════
export default function LandingPage({ onLogin, authLoading = false, authError = "" }) {
  return (
    <div style={{ background: "#050510", color: "#ffffff", minHeight: "100vh", fontFamily: "'Inter',sans-serif", overflowX: "hidden", position: "relative" }}>
      <StyleInjector />
      <CosmicBg />
      <CursorOrb />
      <Nav onLogin={onLogin} />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero onLogin={onLogin} authLoading={authLoading} authError={authError} />
        <Logos />
        <Showcase />
        <Pricing />
        <FAQ />
        <Footer />
      </main>
    </div>
  );
}