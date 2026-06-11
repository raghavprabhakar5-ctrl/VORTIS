import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare, Code2, Eye, Globe, Brain, Mic, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Star, Zap,
  BarChart3, PenTool, BookOpen, Search, Sparkles,
} from "lucide-react";

// ── VORTIS LOGO ──
function VortisLogo({ size = 36, color = "#8b5cf6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1254 1254" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0 C2.97551795 1.77603298 5.42755188 3.85510377 7 7 C7.11791887 8.38616367 7.17694276 9.77757631 7.20532227 11.16845703 C7.22524231 12.04519577 7.24516235 12.92193451 7.26568604 13.82524109 C7.29079254 15.27686394 7.29079254 15.27686394 7.31640625 16.7578125 C7.34791779 18.29215691 7.34791779 18.29215691 7.38006592 19.85749817 C7.44748254 23.27991239 7.50609512 26.70238724 7.5625 30.125 C7.7612943 42.0831845 7.87456786 50.48784107 7.97470093 58.89281464 C8.16186031 74.10092842 8.24010655 82.88021788 8.28610229 91.66033936 C8.42578125 112.21484375 8.45890861 123.44413203 2.46484375 133.75 C-1.84867608 137.28024641 -6.42325204 140.20200539 -11.15625 143.140625 C-24 153 -24.84691406 153.66128906 -25.7109375 154.3359375 C-35.03515625 163.6796875 -53.53623377 184.49599777 -68.55078125 229.13671875 C-72.41478281 249.33698163 -72.33618164 256.08447266 -67.625 298.625 C-58.52154173 331.10569329 -45.05403631 349.1091209 -31 364 C-16.1208883 379.7844922 1.32613078 390.31286386 19 396 C36.37825416 402.4427861 49.1200395 402.36489181 85 402 C93.23396028 398.83231815 104.0546875 395.25 111.1328125 392.5 C133.18530273 381.82714844 151.3125 371.0625 172.75 358.875 C199.33251953 343.51904297 212.1875 336.1875 232.46142578 324.52783203 C264.95166016 306.0612793 284.625 294.9375 326.8125 271.125 C360.74327062 251.68469519 402.625 228.4375 441 207 C468.98076126 191.33227435 499.60546875 174.234375 538.78125 163.6875 C546.77364224 167.41055268 564.296875 177.8449707 586.171875 190.484375 C601.95095764 199.47585767 612 213 608.58203125 233.25390625 C600.9485655 241.34849838 567.25390625 259.125 530.03710938 280.26220703 C493.390625 301.1953125 463.28540039 318.58300781 411.34350586 348.86303711 C360.3515625 378.98828125 306.375 411.0625 261.3125 438.3125 C224.22121781 460.81575833 198.68420609 476.63055454 167.59521484 492.74267578 C155.59013165 498.83271226 130 507 104.25 513.1875 C58.0633922 520.80335318 11.20464191 516.99238877 -29 499 C-59.15230804 485.57644135 -104 449 -126 425 C-149.07179934 396.0168839 -174 334 -182 223 C-178.1746366 200.45204967 -166 162 -153.60931815 128.82666809 C-136.29368097 100.96460775 -114 77 -91 54 C-69.83101453 35.8451406 -49.00928789 22.7179326 -28.12597656 11.17919922 C-9.76986213 0.79049358 -6.04710732 -0.61496007 0 0 Z" fill={color} transform="translate(320,528)"/>
      <path d="M0 0 C36.18525958 13.45452025 73 40 91.14585658 54.71651706 C131.88933834 106.34788041 150.9296875 149.60546875 164 205 C165.33645413 215.8994523 165.203125 233.921875 165.32357025 276.8890152 C165.33982443 297.6335565 160.578125 305.8515625 152.546875 307.3984375 C137.08167471 300.74266427 99.98120117 279.23681641 73.55029297 264.23608398 C65.3331585 259.59265086 56 246 54.71875 235.578125 C54.04551962 215.58192353 48.625 189.8125 42 175 C32.06899977 147.16478584 7.304472 126.2112154 -15 115 C-51 103 -84.3442227 97.12795437 -140 118 C-165 136 -191.16877943 160.3749499 -205.32041707 226.35818649 C-205.88846401 336.18833088 -206.10131836 397.78491211 -206.28979492 457.17358398 C-206.66535574 563.03733081 -206.98529428 636.55840379 -207.37494373 687.69657536 C-216.19628906 710.24951172 -228 718 -268.5637207 740.42895508 C-288.26977539 751.37426758 -302.3125 755.5 -315.74946022 738.79073524 C-315.75502992 701.98534536 -315.63134766 440.78710938 -315.66880485 516.13390052 C-315.62042307 465.9027603 -315.55757141 253.59127617 -315.53031926 235.72050564 C-315.63001513 202.21749298 -301.125 147.125 -261 77 C-254 69 -252.09375 66.77734375 -192.8930966 -1.14877909 C-95.91099103 -27.66080594 0 0 Z" fill={color} transform="translate(701,106)"/>
      <path d="M0 0 C48.625 29.25 120.4633796 71.8385265 206.0078125 121.9375 C283.78308792 167.70554595 339.0078125 200.23291016 365.9375 215.9375 C416.60946345 245.55018456 472.9375 297.9375 502.10135822 335.75667549 C525.29076688 383.25041717 528.1875 455.75 514.9375 541.9375 C505.328125 566.25 481.02832229 611.02851326 435.59521484 659.63916016 C401.9375 682.9375 342.125 707.875 288.44677734 714.32861328 C229.5625 708.25 194.9375 696.9375 135.9375 664.9375 C113.35253906 644.75219727 116.1953125 634.63671875 157.6875 608.5 C186.7109375 590.71484375 215.375 581.203125 247.5234375 595.04296875 C290.11462775 600.15640453 379.35546875 560.703125 415.49951172 495.02197266 C420.1238338 467.31681907 409.9375 402.9375 337.41015625 327.01171875 C283.77223545 295.54906491 226.55444336 262.02880859 144.65869141 213.56640625 C82.93652344 176.73925781 43.11157227 152.74481201 6.21069336 130.62011719 C-14.89790344 118.03100586 -45.0625 92.9375 -48.22363281 80.31396484 C-48.51191211 18.13832571 -38.58203125 0.11328125 0 0 Z" fill={color} transform="translate(587.0625,330.0625)"/>
    </svg>
  );
}

// ── STYLE INJECTION ──
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{margin:0;padding:0;overflow-x:hidden;background:#050510;color:#ffffff}
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(80px,-60px) scale(1.2)}66%{transform:translate(-30px,70px) scale(.9)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(-70px,50px) scale(1.3)}70%{transform:translate(40px,-40px) scale(.85)}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-40px,-80px) scale(1.15)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes glow{0%,100%{box-shadow:0 0 20px rgba(124,58,237,.2)}50%{box-shadow:0 0 40px rgba(124,58,237,.5)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes marqueeR{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes dotBob{0%,80%,100%{transform:scale(.65);opacity:.4}40%{transform:scale(1);opacity:1}}
::-webkit-scrollbar{width:5px;background:#050510}
::-webkit-scrollbar-thumb{background:#7C3AED55;border-radius:3px}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

// ── COSMIC BACKGROUND ──
function CosmicBg() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {[
        { top: "5%", left: "10%", w: 600, c: "rgba(124,58,237,0.055)", blur: 110, anim: "orb1 28s ease-in-out infinite" },
        { top: "40%", right: "5%", w: 520, c: "rgba(168,85,247,0.045)", blur: 130, anim: "orb2 35s ease-in-out infinite 5s" },
        { bottom: "10%", left: "30%", w: 460, c: "rgba(6,182,212,0.032)", blur: 100, anim: "orb3 40s ease-in-out infinite 12s" },
      ].map((o, i) => (
        <div key={i} style={{
          position: "absolute", width: o.w, height: o.w, borderRadius: "50%",
          top: o.top, left: o.left, right: o.right, bottom: o.bottom,
          background: o.c, filter: `blur(${o.blur}px)`, animation: o.anim, willChange: "transform",
        }} />
      ))}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.018,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />
    </div>
  );
}

// ── NAV ──
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
      background: scrolled ? "rgba(5,5,16,0.9)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      transition: "all 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <VortisLogo size={28} />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "0.12em", color: "#fff" }}>VORTIS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onLogin("google")}
          style={{
            padding: "8px 20px", borderRadius: 99, fontSize: 13, fontWeight: 600,
            background: "linear-gradient(135deg,#7C3AED,#8b5cf6)",
            color: "#fff", border: "none", cursor: "pointer",
            boxShadow: "0 0 24px rgba(124,58,237,0.35)",
          }}
        >
          Start Free
        </button>
      </div>
    </nav>
  );
}

// ── HERO ──
const CYCLE = ["INTELLIGENCE", "CREATIVITY", "RESEARCH", "REASONING", "AUTOMATION", "VISION"];

function Hero({ onLogin, authLoading, authError }) {
  const [wi, setWi] = useState(0);
  const [vis, setVis] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVis(false);
      setTimeout(() => { setWi(i => (i + 1) % CYCLE.length); setVis(true); }, 300);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "80px 24px 60px", position: "relative", zIndex: 1,
    }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(124,58,237,0.09), transparent 70%)" }} />

      {/* Badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
        borderRadius: 99, border: "1px solid rgba(139,92,246,0.4)",
        background: "rgba(139,92,246,0.08)", marginBottom: 28,
        animation: "fadeUp 0.6s ease both",
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8b5cf6", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(139,92,246,0.9)" }}>Vortis AI · 2026</span>
      </div>

      {/* Headline */}
      <div style={{ maxWidth: 900, margin: "0 auto 24px", animation: "fadeUp 0.7s 0.1s ease both" }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.04em", margin: 0 }}>
          <span style={{ display: "block", fontSize: "clamp(3rem,11vw,9rem)", background: "linear-gradient(180deg,#fff 40%,rgba(255,255,255,0.28))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>THE</span>
          <span style={{
            display: "block", fontSize: "clamp(3rem,11vw,9rem)",
            background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
          }}>{CYCLE[wi]}</span>
          <span style={{ display: "block", fontSize: "clamp(3rem,11vw,9rem)", background: "linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.08))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>YOU DESERVE.</span>
        </h1>
      </div>

      <p style={{ fontSize: "clamp(15px,2vw,19px)", color: "rgba(255,255,255,0.48)", maxWidth: 560, lineHeight: 1.7, marginBottom: 40, animation: "fadeUp 0.7s 0.25s ease both" }}>
        Chat, Vision, Code, Research — one surface. One context. One experience built for the way you actually think.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 60, animation: "fadeUp 0.7s 0.38s ease both" }}>
        <button
          onClick={() => onLogin("google")}
          disabled={authLoading}
          style={{
            padding: "14px 32px", borderRadius: 99, fontSize: 15, fontWeight: 700,
            background: "linear-gradient(135deg,#7C3AED,#8b5cf6)",
            color: "#fff", border: "none", cursor: "pointer",
            boxShadow: "0 0 40px rgba(124,58,237,0.45)",
            display: "flex", alignItems: "center", gap: 8,
            opacity: authLoading ? 0.7 : 1,
          }}
        >
          <Zap size={16} /> {authLoading ? "Signing in…" : "Start Free"}
        </button>
        <a href="#capabilities" style={{
          padding: "14px 28px", borderRadius: 99, fontSize: 15, fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.04)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          See Capabilities
        </a>
      </div>

      {authError && (
        <div style={{ color: "#f87171", fontSize: 13, marginBottom: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 16px" }}>
          {authError}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "32px 48px", justifyContent: "center", animation: "fadeUp 0.7s 0.5s ease both" }}>
        {[["50K+", "Professionals"], ["10B+", "Tokens/Month"], ["4.9★", "Avg Rating"], ["99.9%", "Uptime"]].map(([n, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(22px,4vw,30px)", background: "linear-gradient(135deg,#a855f7,#7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{n}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── MARQUEE LOGOS ──
const LOGOS1 = ["Google", "Microsoft", "Apple", "Meta", "Amazon", "Netflix", "Spotify", "Adobe", "Stripe", "Vercel", "GitHub", "Notion"];
const LOGOS2 = ["Figma", "LinkedIn", "Discord", "Shopify", "Dropbox", "Atlassian", "Salesforce", "Airbnb", "Uber", "OpenAI", "Anthropic", "TikTok"];

function LogoChip({ name }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "0 22px", height: 48,
      borderRadius: 99, border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.025)", flexShrink: 0,
      fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(139,92,246,0.7)", flexShrink: 0 }} />
      {name}
    </div>
  );
}

function MarqueeRow({ items, reverse }) {
  const all = [...items, ...items, ...items];
  return (
    <div style={{ overflow: "hidden", position: "relative" }}>
      <div style={{
        display: "flex", gap: 10, width: "max-content",
        animation: `${reverse ? "marqueeR" : "marquee"} ${reverse ? 45 : 38}s linear infinite`,
        willChange: "transform",
      }}>
        {all.map((name, i) => <LogoChip key={i} name={name} />)}
      </div>
    </div>
  );
}

function Logos() {
  return (
    <section style={{ padding: "72px 0", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <p style={{ textAlign: "center", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 32 }}>
        Trusted by teams at the world's leading companies
      </p>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 100, zIndex: 2, background: "linear-gradient(to right, #050510, transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 100, zIndex: 2, background: "linear-gradient(to left, #050510, transparent)", pointerEvents: "none" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MarqueeRow items={LOGOS1} reverse={false} />
          <MarqueeRow items={LOGOS2} reverse={true} />
        </div>
      </div>
    </section>
  );
}

// ── CAPABILITIES ──
const CAPS = [
  { id: "chat", name: "AI Chat", icon: MessageSquare, color: "#7C3AED", tagline: "Reason and create at the speed of thought" },
  { id: "code", name: "Coding", icon: Code2, color: "#06b6d4", tagline: "Write, refactor, review — principal quality" },
  { id: "image", name: "Image Gen", icon: ImageIcon, color: "#a855f7", tagline: "Studio-quality visuals in milliseconds" },
  { id: "search", name: "Web Search", icon: Globe, color: "#8b5cf6", tagline: "Real-time internet with perfect attribution" },
  { id: "vision", name: "Vision", icon: Eye, color: "#06b6d4", tagline: "Analyze and extract from any image" },
  { id: "memory", name: "Memory", icon: Brain, color: "#a855f7", tagline: "Persistent context that never forgets" },
  { id: "research", name: "Deep Research", icon: Microscope, color: "#7C3AED", tagline: "Synthesizing 50+ sources autonomously" },
  { id: "docs", name: "Documents", icon: FileText, color: "#06b6d4", tagline: "Chat with PDFs, CSVs, and more" },
];

function Capabilities() {
  const [active, setActive] = useState(0);
  const cap = CAPS[active];
  const Icon = cap.icon;

  return (
    <section id="capabilities" style={{ padding: "80px 24px", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>Capabilities</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,5vw,48px)", margin: 0, letterSpacing: "-0.03em" }}>
            Every mode.{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One platform.</span>
          </h2>
        </div>

        {/* Grid layout */}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CAPS.map((c, i) => {
              const CI = c.icon;
              const isActive = i === active;
              return (
                <button key={c.id} onClick={() => setActive(i)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 12, textAlign: "left",
                  border: isActive ? `1px solid ${c.color}66` : "1px solid rgba(255,255,255,0.06)",
                  background: isActive ? `${c.color}22` : "rgba(255,255,255,0.025)",
                  cursor: "pointer", transition: "all 0.2s",
                  boxShadow: isActive ? `0 0 18px ${c.color}33` : "none",
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? `${c.color}33` : `${c.color}18`, border: `1px solid ${c.color}33`, flexShrink: 0 }}>
                    <CI size={16} style={{ color: c.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>{c.name}</div>
                    {isActive && <div style={{ fontSize: 10.5, color: c.color, marginTop: 2, opacity: 0.85 }}>{c.tagline}</div>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Feature panel */}
          <div style={{
            borderRadius: 20, padding: 36, minHeight: 340,
            background: "#07070f", border: "1px solid rgba(255,255,255,0.07)",
            position: "relative", overflow: "hidden",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${cap.color}11, transparent)`, pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.04, pointerEvents: "none" }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: `${cap.color}28`, border: `1.5px solid ${cap.color}55`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, animation: "float 3s ease-in-out infinite", boxShadow: `0 0 30px ${cap.color}40` }}>
                <Icon size={28} style={{ color: cap.color }} />
              </div>
              <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 28, margin: "0 0 10px", color: "#fff" }}>{cap.name}</h3>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", margin: "0 0 28px", lineHeight: 1.6, maxWidth: 480 }}>{cap.tagline}</p>
            </div>

            {/* Animated nodes */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["Fast", "Accurate", "Context-Aware", "Private", "Multilingual"].map((tag) => (
                <span key={tag} style={{ padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: `${cap.color}18`, border: `1px solid ${cap.color}44`, color: cap.color }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile responsive override */}
      <style>{`@media(max-width:700px){#cap-grid{grid-template-columns:1fr!important}}`}</style>
    </section>
  );
}

// ── PRICING ──
const PLANS = [
  { name: "Silver", color: "#7C3AED", monthly: "$9", q: "$24", h: "$43", y: "$81", features: ["300 messages/day", "40 documents/day", "20 images/day", "3 vision/day", "Priority access", "Voice mode"] },
  { name: "Gold", color: "#a855f7", monthly: "$19", q: "$51", h: "$91", y: "$171", popular: true, features: ["500 messages/day", "50 documents/day", "40 images/day", "10 vision/day", "Priority responses", "Deep research"] },
  { name: "Platinum", color: "#06b6d4", monthly: "$29", q: "$78", h: "$139", y: "$261", features: ["Unlimited messages", "Unlimited documents", "Unlimited images", "Unlimited vision", "VIP support", "Early features"] },
];
const BILLING_LABELS = { monthly: "/mo", q: "/3 mo", h: "/6 mo", y: "/yr" };
const BILLING_NAMES = { monthly: "Monthly", q: "3 Months", h: "6 Months", y: "Annual" };

function Pricing() {
  const [billing, setBilling] = useState("monthly");
  return (
    <section id="pricing" style={{ padding: "80px 24px", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>Pricing</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(28px,5vw,48px)", margin: "0 0 28px", letterSpacing: "-0.03em" }}>
            Choose Your <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan.</span>
          </h2>

          {/* Billing toggle */}
          <div style={{ display: "inline-flex", padding: 4, borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", gap: 2 }}>
            {Object.keys(BILLING_NAMES).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: "8px 16px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                background: billing === b ? "linear-gradient(135deg,#7C3AED,#a855f7)" : "transparent",
                color: billing === b ? "#fff" : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
              }}>{BILLING_NAMES[b]}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, maxWidth: 900, margin: "0 auto" }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{
              borderRadius: 20, padding: 28, position: "relative",
              border: plan.popular ? `1px solid ${plan.color}55` : "1px solid rgba(255,255,255,0.07)",
              background: plan.popular ? `${plan.color}12` : "rgba(255,255,255,0.025)",
              boxShadow: plan.popular ? `0 0 50px -12px ${plan.color}50` : "none",
              display: "flex", flexDirection: "column",
            }}>
              {plan.popular && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg,${plan.color},#7C3AED)`, padding: "4px 16px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                  Most Popular
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 10px", color: "#fff" }}>{plan.name}</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: 38, color: "#fff", lineHeight: 1 }}>{plan[billing]}</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", paddingBottom: 4 }}>{BILLING_LABELS[billing]}</span>
                </div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${plan.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={10} style={{ color: plan.color }} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <button style={{
                width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: plan.popular ? `linear-gradient(135deg,${plan.color},#7C3AED)` : "rgba(255,255,255,0.06)",
                color: "#fff", border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer", boxShadow: plan.popular ? `0 0 20px ${plan.color}40` : "none",
              }}>
                Get Started
              </button>
            </div>
          ))}
        </div>

        <style>{`@media(max-width:700px){.plans-grid{grid-template-columns:1fr!important}}`}</style>
      </div>
    </section>
  );
}

// ── FAQ ──
const FAQS = [
  { q: "What is Vortis AI?", a: "Vortis AI is a unified platform combining Chat, Image Generation, Web Search, Coding, Vision, Documents, Memory, Voice, and Deep Research into a single cohesive experience." },
  { q: "What models power Vortis?", a: "Vortis routes between proprietary ultra-low-latency models and frontier models to give you the best result for every specific task." },
  { q: "Is there a free trial?", a: "Yes — explore core capabilities free. Premium features like Deep Research and unlimited usage require a paid plan." },
  { q: "How does billing work?", a: "Choose monthly, quarterly, semi-annual, or annual billing. Longer commitments unlock the biggest discounts — annual saves up to 25%." },
  { q: "Is my data private?", a: "Your conversations, documents, and outputs are never used to train models or shared with third parties. Enterprise-grade encryption at rest and in transit." },
  { q: "What is Deep Research?", a: "Autonomous agents browse the web, read documents, and synthesize massive reports in minutes — a tireless research partner with no limits." },
];

function FaqItem({ faq, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 0", textAlign: "left", background: "none", border: "none", cursor: "pointer",
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
  return (
    <section id="faq" style={{ padding: "80px 24px", position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(139,92,246,0.8)" }}>FAQ</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(26px,5vw,44px)", margin: 0, letterSpacing: "-0.03em" }}>
            Frequently Asked{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Questions</span>
          </h2>
        </div>
        {FAQS.map((f, i) => <FaqItem key={i} faq={f} index={i} />)}
      </div>
    </section>
  );
}

// ── FOOTER ──
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "52px 24px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <VortisLogo size={26} />
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "0.12em", color: "#fff" }}>VORTIS</span>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", maxWidth: 240, lineHeight: 1.6, margin: 0 }}>
            The intelligence platform for the world's most ambitious professionals.
          </p>
        </div>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          {[
            { title: "Product", links: ["Capabilities", "Pricing", "Changelog"] },
            { title: "Company", links: ["About", "Blog", "Careers"] },
            { title: "Legal", links: ["Privacy", "Terms", "Security"] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{col.title}</div>
              {col.links.map(l => (
                <a key={l} href="#" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.38)", marginBottom: 8, textDecoration: "none" }}>{l}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24, display: "flex", justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>© 2026 Vortis AI. All rights reserved.</span>
      </div>
    </footer>
  );
}

// ── LANDING PAGE (DEFAULT EXPORT) ──
export default function LandingPage({ onLogin, authLoading = false, authError = "" }) {
  return (
    <div style={{ background: "#050510", color: "#ffffff", minHeight: "100vh", fontFamily: "'Inter',sans-serif", overflowX: "hidden", position: "relative" }}>
      <StyleInjector />
      <CosmicBg />
      <Nav onLogin={onLogin} />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero onLogin={onLogin} authLoading={authLoading} authError={authError} />
        <Logos />
        <Capabilities />
        <Pricing />
        <FAQ />
        <Footer />
      </main>
    </div>
  );
}