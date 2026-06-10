"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import {
  MessageSquare, Code2, Eye, Globe, Brain, Mic, FileText,
  Image as ImageIcon, Microscope, Check, Plus, Star, Send, Zap,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════
//  GLOBAL KEYFRAME STYLES  (injected once into <head>)
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
function VortisLogo({ size = 28, color = "#8b5cf6" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L29 9.5V22.5L16 30 3 22.5V9.5z" stroke={color} strokeWidth="1.6" fill={color + "18"} strokeLinejoin="round"/>
      <path d="M10.5 11.5l5.5 9 5.5-9" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="11" r="2.2" fill={color}/>
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
    const move = (e: MouseEvent) => { setPos({ x: e.clientX, y: e.clientY }); setVisible(true); };
    const leave = () => setVisible(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseleave", leave);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseleave", leave); };
  }, []);
  return (
    <div
      className="fixed pointer-events-none z-[9999]"
      style={{
        left: pos.x - 200, top: pos.y - 200, width: 400, height: 400,
        borderRadius: "50%", opacity: visible ? 1 : 0,
        background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)",
        transition: "left 0.08s ease, top 0.08s ease, opacity 0.3s ease",
        willChange: "transform",
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════
//  COSMIC BACKGROUND  (CSS keyframe – zero JS per frame)
// ══════════════════════════════════════════════════════════════════
function CosmicBg() {
  const orbs = [
    { anim: "orb1 28s ease-in-out infinite", top: "5%", left: "10%", w: 620, h: 620, c: "rgba(124,58,237,0.055)", blur: 110 },
    { anim: "orb2 35s ease-in-out infinite 5s", top: "40%", right: "5%", w: 540, h: 540, c: "rgba(168,85,247,0.045)", blur: 130 },
    { anim: "orb3 40s ease-in-out infinite 12s", bottom: "10%", left: "30%", w: 480, h: 480, c: "rgba(6,182,212,0.032)", blur: 100 },
    { anim: "orb4 32s ease-in-out infinite 8s", top: "60%", left: "5%", w: 400, h: 400, c: "rgba(124,58,237,0.038)", blur: 120 },
  ];
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {orbs.map((o, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: o.w, height: o.h, top: o.top, left: (o as any).left, right: (o as any).right,
          bottom: (o as any).bottom, background: o.c, filter: `blur(${o.blur}px)`,
          animation: o.anim, willChange: "transform",
        }} />
      ))}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
        backgroundSize: "60px 60px", animation: "star-grid 8s ease-in-out infinite", opacity: 0.018,
      }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════
const NAV_LINKS = [{ label: "Capabilities", href: "#capabilities" }, { label: "About", href: "#about" }, { label: "Pricing", href: "#pricing" }, { label: "FAQ", href: "#faq" }];

function Nav() {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 80], [0, 1]);
  return (
    <motion.nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3.5">
     <motion.div 
  style={{ opacity: bg, background: "rgba(5,5,16,0.88)" }} 
  className="absolute inset-0 border-b border-white/5 backdrop-blur-xl" 
/>
      <div className="absolute inset-0 border-b border-white/5" style={{ background: "rgba(5,5,16,0)", backdropFilter: "blur(20px)" }} />
      <div className="relative flex items-center gap-8">
        <motion.a href="#" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="flex items-center gap-2.5 no-underline">
          <VortisLogo size={28} color="#8b5cf6" />
          <span className="text-lg font-black tracking-widest text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>VORTIS</span>
        </motion.a>
        <div className="hidden md:flex items-center gap-5 text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
          {NAV_LINKS.map((l, i) => (
            <motion.a key={l.label} href={l.href} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2, color: "#fff" }} whileTap={{ scale: 0.95 }} transition={{ delay: i * 0.05 + 0.2, duration: 0.5 }} className="relative group py-1" style={{ willChange: "transform" }}>
              {l.label}
              <motion.span className="absolute -bottom-0.5 left-0 h-px bg-gradient-to-r from-violet-500 via-purple-400 to-cyan-400" initial={{ width: "0%" }} whileHover={{ width: "100%" }} transition={{ duration: 0.22, ease: "easeOut" }} />
            </motion.a>
          ))}
        </div>
      </div>
      <div className="relative flex items-center gap-2.5">
        <motion.a href="#" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} whileHover={{ borderColor: "rgba(255,255,255,0.25)", color: "#fff" }} className="hidden sm:inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border transition-all" style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.04)" }}>
          Sign In
        </motion.a>
        <motion.a href="#" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.38, duration: 0.6 }} whileHover={{ scale: 1.04, opacity: 0.92 }} whileTap={{ scale: 0.96 }} className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", willChange: "transform" }}>
          Sign Up
        </motion.a>
      </div>
    </motion.nav>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════
const CYCLE_WORDS = ["INTELLIGENCE", "REASONING", "CREATIVITY", "RESEARCH", "UNDERSTANDING", "AUTOMATION"];
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function Hero() {
  const [wordIdx, setWordIdx] = useState(0);
  const [display, setDisplay] = useState(CYCLE_WORDS[0]);
  useEffect(() => {
    const id = setInterval(() => {
      setWordIdx(i => {
        const next = (i + 1) % CYCLE_WORDS.length;
        setDisplay(CYCLE_WORDS[next]);
        return next;
      });
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden" style={{ paddingTop: 80 }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(124,58,237,0.09) 0%, transparent 70%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle 400px at 50% 80%, rgba(6,182,212,0.04), transparent)" }} />

      <div className="relative z-10 flex flex-col items-center px-6" style={{ maxWidth: "100vw", overflow: "hidden" }}>
        <motion.div initial={{ opacity: 0, x: -80 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE_OUT }}
          className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase"
          style={{ border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.07)", color: "rgba(139,92,246,0.85)" }}>
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#8b5cf6" }} />
          Vortis AI
        </motion.div>

        <div style={{ overflow: "hidden", maxWidth: "72rem", width: "100%" }}>
          <h1 className="font-black tracking-tighter leading-none mb-6" style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(3rem,11vw,9.5rem)" }}>
            <div style={{ overflow: "hidden" }}>
              <motion.span className="block" initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: EASE_OUT }} style={{ background: "linear-gradient(180deg,#fff 40%,rgba(255,255,255,0.35))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", willChange: "transform" }}>
                THE
              </motion.span>
            </div>
            <div style={{ overflow: "hidden" }}>
              <AnimatePresence mode="wait">
                <motion.span key={wordIdx} className="block" initial={{ opacity: 0, x: -90, filter: "blur(8px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: 90, filter: "blur(8px)" }} transition={{ duration: 0.55, ease: EASE_OUT }} style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", willChange: "transform" }}>
                  {display}
                </motion.span>
              </AnimatePresence>
            </div>
            <div style={{ overflow: "hidden" }}>
              <motion.span className="block" initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4, ease: EASE_OUT }} style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0.1))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", willChange: "transform" }}>
                YOU DESERVE.
              </motion.span>
            </div>
          </h1>
        </div>

        <motion.p initial={{ opacity: 0, y: 30, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay: 0.55 }} className="text-base md:text-xl mb-10 max-w-2xl leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          Chat, Vision, Code, Research — one surface. One context. One experience built for the way you actually think.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.7 }} className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <motion.a href="#" whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-sm" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", boxShadow: "0 0 40px rgba(124,58,237,0.4)", willChange: "transform" }}>
            <Zap className="w-4 h-4" /> Start Free
          </motion.a>
          <motion.a href="#capabilities" whileHover={{ scale: 1.03, borderColor: "rgba(255,255,255,0.2)" }} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-sm transition-all" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.04)" }}>
            See Capabilities
          </motion.a>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }} className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {[["50K+", "Professionals"], ["10B+", "Tokens / Month"], ["4.9★", "Avg Rating"], ["99.9%", "Uptime"]].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="text-2xl md:text-3xl font-black" style={{ fontFamily: "'Space Grotesk',sans-serif", background: "linear-gradient(135deg,#a855f7,#7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{n}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{l}</div>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-8 left-1/2 -translate-x-1/2" style={{ color: "rgba(255,255,255,0.2)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LOGOS MARQUEE  (pure CSS animation — zero JS per frame)
// ══════════════════════════════════════════════════════════════════
const BRANDS = ["Google","Microsoft","Apple","Meta","Amazon","Netflix","Spotify","Adobe","Stripe","Vercel","GitHub","Notion","Figma","Slack","Discord","Linear","Shopify","Dropbox","Zoom","OpenAI","Anthropic","Salesforce","Airbnb","Uber","PayPal","Reddit","Pinterest","Atlassian","Databricks","Mistral"];
const ROW1 = BRANDS.slice(0, 15);
const ROW2 = BRANDS.slice(15);

function LogoPill({ name }: { name: string }) {
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-5 py-2.5 rounded-full border transition-all cursor-default select-none" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgba(139,92,246,0.6)" }} />
      {name}
    </div>
  );
}

function Logos() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const makeRow = (items: string[], doubled: string[], dir: "l" | "r") => (
    <div className="overflow-hidden relative py-1" style={{ maskImage: "linear-gradient(90deg,transparent,black 12%,black 88%,transparent)" }}>
      <div style={{ display: "flex", gap: 12, width: "max-content", animation: `marquee-${dir} 38s linear infinite`, willChange: "transform" }}>
        {[...doubled, ...doubled].map((b, i) => <LogoPill key={i} name={b} />)}
      </div>
    </div>
  );
  return (
    <section ref={ref} className="py-20 border-t border-white/5 relative overflow-hidden">
      <div className="container mx-auto px-6 mb-10">
        <motion.p initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-center text-sm font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.25)" }}>
          Trusted by teams at the world&rsquo;s leading companies
        </motion.p>
      </div>
      <div className="flex flex-col gap-4">
        {makeRow(ROW1, ROW1, "l")}
        {makeRow(ROW2, ROW2, "r")}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  CHAT PREVIEW  (auto-playing animated demo)
// ══════════════════════════════════════════════════════════════════
type ChatMsg = { id: number; from: "user" | "ai"; text?: string; code?: string; bullets?: string[]; tool?: string };

const CHAT_MSGS: ChatMsg[] = [
  { id: 1, from: "user", text: "Analyze our Q3 revenue data and identify the top growth drivers" },
  { id: 2, from: "ai", tool: "📊 Analyzing 847 data points across 12 segments...", text: "Found your top 3 growth drivers:", bullets: ["Enterprise plan upgrades → +34% month-over-month", "API usage expansion → +28% month-over-month", "APAC market penetration → +19% quarter-over-quarter"] },
  { id: 3, from: "user", text: "Write a Python script to automate this analysis monthly" },
  { id: 4, from: "ai", code: `def analyze_drivers(path: str) -> dict:\n    df = pd.read_csv(path)\n    return (\n        df.groupby("segment")\n          .agg({"revenue":"sum","growth":"mean"})\n          .nlargest(3, "growth")\n          .to_dict()\n    )` },
  { id: 5, from: "user", text: "Perfect — now draft a board-ready executive summary" },
  { id: 6, from: "ai", text: "Q3 Executive Summary: Revenue hit $4.2M (+23% YoY). Enterprise led at $1.8M. APAC delivered ahead of forecast. Recommended action: double enterprise motion in Q4 to capture the $2.1M identified pipeline." },
];

const TIMELINE = [
  { ms: 0,     vis: 1, typing: false, tool: "" },
  { ms: 500,   vis: 1, typing: false, tool: "📊 Analyzing 847 data points across 12 segments..." },
  { ms: 2200,  vis: 2, typing: false, tool: "" },
  { ms: 4800,  vis: 3, typing: false, tool: "" },
  { ms: 5600,  vis: 3, typing: true,  tool: "" },
  { ms: 7200,  vis: 4, typing: false, tool: "" },
  { ms: 9800,  vis: 5, typing: false, tool: "" },
  { ms: 10500, vis: 5, typing: true,  tool: "" },
  { ms: 12200, vis: 6, typing: false, tool: "" },
];
const LOOP_MS = 15500;

function CodeBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  const COLORS: Record<string, string> = { def: "#c084fc", return: "#c084fc", str: "#c084fc", dict: "#c084fc" };
  return (
    <div className="rounded-xl overflow-hidden text-xs mt-1" style={{ background: "#0a0a1a", border: "1px solid rgba(139,92,246,0.2)" }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.03)" }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
        <span className="ml-2 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>python</span>
      </div>
      <div className="p-3 overflow-x-auto">
        {lines.map((line, i) => {
          const indent = line.match(/^(\s+)/)?.[1]?.length ?? 0;
          const trimmed = line.trim();
          const keyword = Object.keys(COLORS).find(k => trimmed.startsWith(k));
          return (
            <div key={i} style={{ paddingLeft: indent * 6, lineHeight: 1.7, whiteSpace: "nowrap" }}>
              <span className="mr-3 select-none" style={{ color: "rgba(255,255,255,0.18)", userSelect: "none", minWidth: 16, display: "inline-block", textAlign: "right" }}>{i + 1}</span>
              {keyword
                ? <><span style={{ color: COLORS[keyword] }}>{keyword}</span><span style={{ color: "rgba(255,255,255,0.72)" }}>{trimmed.slice(keyword.length)}</span></>
                : <span style={{ color: "rgba(255,255,255,0.72)" }}>{trimmed}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [vis, setVis] = useState(0);
  const [typing, setTyping] = useState(false);
  const [tool, setTool] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setVis(0); setTyping(false); setTool("");
      TIMELINE.forEach(({ ms, vis: v, typing: t, tool: tl }) => {
        timers.push(setTimeout(() => { setVis(v); setTyping(t); setTool(tl); }, ms));
      });
      timers.push(setTimeout(run, LOOP_MS));
    };
    const init = setTimeout(run, 600);
    timers.push(init);
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [vis, typing, tool]);

  const visible = CHAT_MSGS.slice(0, vis);

  return (
    <section id="about" ref={ref} className="py-28 border-t border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 70% 50%, rgba(6,182,212,0.04), transparent)" }} />
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: description */}
          <div>
            <motion.div initial={{ opacity: 0, x: -50 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7, ease: EASE_OUT }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
              style={{ border: "1px solid rgba(6,182,212,0.35)", background: "rgba(6,182,212,0.07)", color: "rgba(6,182,212,0.85)" }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#06B6D4", animation: "tdot 2s infinite" }} />
              Live Demo
            </motion.div>

            <motion.h2 initial={{ opacity: 0, x: -60 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.8, delay: 0.08, ease: EASE_OUT }}
              className="text-4xl md:text-5xl font-black mb-5 leading-tight" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
              One conversation.<br />
              <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Every capability.
              </span>
            </motion.h2>

            <motion.p initial={{ opacity: 0, y: 20, filter: "blur(6px)" }} animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}} transition={{ delay: 0.2, duration: 0.7 }} className="text-base mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              VORTIS doesn&rsquo;t switch modes — it understands what you need and routes seamlessly across intelligence, code, data, and research in a single thread.
            </motion.p>

            {[
              { icon: Brain, title: "Context-Aware Reasoning", desc: "Persistent memory means you never re-explain. VORTIS knows your work." },
              { icon: Code2, title: "Code at Principal Level", desc: "Write, refactor, and review across 20+ languages with test generation." },
              { icon: Zap, title: "Real-Time Data Analysis", desc: "Upload datasets, query them in natural language, get instant insights." },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} initial={{ opacity: 0, x: -40 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: EASE_OUT }} className="flex gap-4 mb-6">
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
                  <Icon className="w-5 h-5" style={{ color: "#a855f7" }} />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm mb-1">{title}</div>
                  <div className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>{desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right: chat window */}
          <motion.div initial={{ opacity: 0, x: 60 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }} style={{ willChange: "transform" }}>
            <div className="rounded-2xl overflow-hidden" style={{ background: "#080818", border: "1px solid rgba(139,92,246,0.2)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)", maxHeight: 540 }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)" }}>
                <div className="flex items-center gap-2.5">
                  <VortisLogo size={20} color="#8b5cf6" />
                  <span className="text-sm font-bold text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>VORTIS</span>
                  <div className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>Pro</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(6,182,212,0.8)" }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#06B6D4", animation: "tdot 2.5s infinite" }} />
                  Online
                </div>
              </div>

              {/* Messages */}
              <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto" style={{ minHeight: 400, maxHeight: 436, scrollbarWidth: "none" }}>
                <AnimatePresence>
                  {visible.map((msg) => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.from === "ai" && (
                        <div className="flex gap-2.5 max-w-[90%]">
                          <div className="shrink-0 w-6 h-6 rounded-full mt-0.5 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)" }}>
                            <VortisLogo size={12} color="#fff" />
                          </div>
                          <div className="flex-1">
                            {msg.tool && (
                              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", color: "rgba(6,182,212,0.8)" }}>
                                {msg.tool}
                              </div>
                            )}
                            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)" }}>
                              {msg.text && <div>{msg.text}</div>}
                              {msg.bullets && (
                                <ul className="mt-2 space-y-1.5">
                                  {msg.bullets.map((b, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                                      <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full" style={{ background: "#a855f7" }} />{b}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {msg.code && <CodeBlock code={msg.code} />}
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.from === "user" && (
                        <div className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm" style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.5),rgba(139,92,246,0.4))", border: "1px solid rgba(139,92,246,0.3)", color: "rgba(255,255,255,0.9)" }}>
                          {msg.text}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {typing && (
                    <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex justify-start">
                      <div className="flex gap-2.5">
                        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)" }}>
                          <VortisLogo size={12} color="#fff" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <span className="tdot" /><span className="tdot" /><span className="tdot" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {tool && !typing && (
                    <motion.div key="tool" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex justify-start pl-8">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.18)", color: "rgba(6,182,212,0.85)" }}>
                        {tool}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="flex-1 text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>Ask VORTIS anything…</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)" }}>
                    <Send className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NODE GRAPH SHOWCASE
// ══════════════════════════════════════════════════════════════════
type Cap = { id: string; name: string; icon: React.ElementType; color: string; tagline: string; nodes: Array<{ x: number; y: number; label: string; size: number }>; streams: Array<{ x1: number; y1: number; x2: number; y2: number }> };

const CAPS: Cap[] = [
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

function NodeGraph({ cap }: { cap: Cap }) {
  return (
    <div className="relative w-full h-full">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
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
              {big && (
                <circle cx={node.x} cy={node.y} fill="none" stroke={`rgba(${cap.color},0.18)`} strokeWidth="0.4">
                  <animate attributeName="r" values={`${r * 2.2};${r * 3.2};${r * 2.2}`} dur={`${3.8 + i * 0.2}s`} begin={`${i * 0.3 + 0.5}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0;0.4" dur={`${3.8 + i * 0.2}s`} begin={`${i * 0.3 + 0.5}s`} repeatCount="indefinite" />
                </circle>
              )}
              <motion.circle
                cx={node.x} cy={node.y} r={r}
                fill={`rgba(${cap.color},${big ? "0.2" : "0.1"})`}
                stroke={`rgba(${cap.color},0.85)`} strokeWidth={big ? 0.9 : 0.65}
                filter={`url(#glow-${cap.id})`}
                initial={{ scale: 0 }} animate={{ scale: 1, y: [0, big ? -3 : -2, big ? 2 : 1, -1.5, 0] }}
                transition={{ scale: { delay: i * 0.09, type: "spring", stiffness: 200, damping: 16 }, y: { delay: i * 0.09 + 0.5, duration: 4.5 + i * 0.4, repeat: Infinity, ease: "easeInOut" } }}
                style={{ willChange: "transform", transformOrigin: `${node.x}px ${node.y}px` }}
              />
              {big && <motion.circle cx={node.x} cy={node.y} r={r * 0.35} fill={`rgba(${cap.color},0.7)`} animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.35, 1] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ transformOrigin: `${node.x}px ${node.y}px` }} />}
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 pointer-events-none">
        {cap.nodes.map((n, i) => (
          <motion.div key={i} className="absolute" style={{ left: `${n.x}%`, top: `${n.y}%`, transform: `translate(-50%, ${n.y > 62 ? "12px" : "-145%"})` }}
            initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1, y: [0, n.y > 62 ? -1.5 : 1.5, 0] }}
            transition={{ opacity: { delay: i * 0.09 + 0.5, duration: 0.4 }, scale: { delay: i * 0.09 + 0.5, duration: 0.4 }, y: { delay: i * 0.09 + 0.9, duration: 4 + i * 0.4, repeat: Infinity, ease: "easeInOut" } }}>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap block" style={{ background: `rgba(${cap.color},0.18)`, color: `rgb(${cap.color})`, border: `1px solid rgba(${cap.color},0.4)`, boxShadow: `0 0 8px rgba(${cap.color},0.25)`, backdropFilter: "blur(4px)" }}>
              {n.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [active, setActive] = useState(0);
  const cap = CAPS[active];

  return (
    <section id="capabilities" ref={ref} className="py-28 border-t border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 20% 50%, rgba(124,58,237,0.05), transparent)" }} />
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="text-center mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", color: "rgba(139,92,246,0.8)" }}>
            Intelligence Graph
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.8 }} className="text-4xl md:text-5xl font-black" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
            Every mode. <span style={{ background: "linear-gradient(90deg,#7C3AED,#a855f7,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One platform.</span>
          </motion.h2>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar */}
          <div className="flex flex-col gap-2">
            {CAPS.map((c, i) => {
              const Icon = c.icon;
              const isActive = i === active;
              return (
                <motion.button key={c.id} onClick={() => setActive(i)} initial={{ opacity: 0, x: -30 }} animate={inView ? { opacity: 1, x: 0 } : {}} whileHover={{ x: isActive ? 0 : 4, scale: 1.01 }} transition={{ delay: i * 0.06 + 0.2, duration: 0.5, scale: { type: "spring", stiffness: 400 } }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all" style={{
                    background: isActive ? `linear-gradient(135deg,rgba(${c.color},0.2),rgba(${c.color},0.1))` : "rgba(255,255,255,0.03)",
                    border: isActive ? `1px solid rgba(${c.color},0.45)` : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: isActive ? `0 0 20px rgba(${c.color},0.2), inset 0 1px 0 rgba(255,255,255,0.06)` : "none",
                    willChange: "transform",
                  }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isActive ? `rgba(${c.color},0.3)` : `rgba(${c.color},0.12)`, border: `1px solid rgba(${c.color},0.25)` }}>
                    <Icon className="w-4 h-4" style={{ color: `rgb(${c.color})` }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.65)" }}>{c.name}</div>
                    {isActive && <div className="text-[10px] mt-0.5" style={{ color: `rgba(${c.color},0.8)` }}>{c.tagline}</div>}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Graph panel */}
          <AnimatePresence mode="wait">
            <motion.div key={cap.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}
              className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "#07070f", border: "1px solid rgba(255,255,255,0.06)", minHeight: 380 }}>
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.04 }} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(${cap.color},0.07), transparent)` }} />
              <div className="relative" style={{ height: 360 }}>
                <NodeGraph cap={cap} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PRICING
// ══════════════════════════════════════════════════════════════════
type BillingCycle = "monthly" | "quarterly" | "semi" | "yearly";
const DISCOUNTS: Record<BillingCycle, number> = { monthly: 0, quarterly: 0.1, semi: 0.18, yearly: 0.28 };
const CYCLE_LABELS: Record<BillingCycle, string> = { monthly: "Monthly", quarterly: "Quarterly −10%", semi: "Semi-Annual −18%", yearly: "Annual −28%" };

const PLANS = [
  { name: "Silver", monthly: 19, color: "180,180,200", features: ["50K tokens / month", "AI Chat + Image Gen", "Web Search", "5 Projects", "Email support"] },
  { name: "Gold", monthly: 49, color: "251,191,36", popular: true, features: ["Unlimited tokens", "All 9 capabilities", "Deep Research", "Memory + Voice", "Priority support", "API access"] },
  { name: "Platinum", monthly: 99, color: "168,85,247", features: ["Everything in Gold", "Dedicated model routing", "Custom memory profiles", "SLA 99.99%", "Slack support", "Team seats (5)"] },
];

function Pricing() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <section id="pricing" ref={ref} className="py-28 border-t border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(124,58,237,0.045), transparent)" }} />
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-14">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", color: "rgba(139,92,246,0.8)" }}>
            Pricing
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1, duration: 0.8 }} className="text-4xl md:text-5xl font-black mb-10" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
            Simple, transparent <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>pricing.</span>
          </motion.h2>
          <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.25 }} className="inline-flex items-center gap-1 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(Object.keys(DISCOUNTS) as BillingCycle[]).map(c => (
              <motion.button key={c} onClick={() => setCycle(c)} whileTap={{ scale: 0.95 }} className="px-4 py-2 rounded-full text-xs font-semibold transition-all" style={{ background: cycle === c ? "linear-gradient(135deg,#7C3AED,#8b5cf6)" : "transparent", color: cycle === c ? "#fff" : "rgba(255,255,255,0.45)" }}>
                {CYCLE_LABELS[c].split(" ")[0]}
              </motion.button>
            ))}
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan, i) => {
            const disc = DISCOUNTS[cycle];
            const price = Math.round(plan.monthly * (1 - disc));
            const isGold = plan.name === "Gold";
            return (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} whileHover={{ y: -6, scale: 1.015 }} transition={{ delay: i * 0.1 + 0.2, duration: 0.6, ease: EASE_OUT, scale: { type: "spring", stiffness: 300 } }}
                className="relative rounded-2xl p-6 flex flex-col" style={{
                  background: isGold ? "linear-gradient(160deg,rgba(251,191,36,0.07),rgba(124,58,237,0.08))" : "rgba(255,255,255,0.03)",
                  border: isGold ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,255,255,0.07)",
                  animation: isGold ? "gold-glow 3.5s ease-in-out infinite" : "none",
                  willChange: isGold ? "box-shadow" : "transform",
                }}>
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold" style={{ background: "linear-gradient(135deg,#7C3AED,rgba(251,191,36,0.8))", color: "#fff", boxShadow: "0 4px 12px rgba(124,58,237,0.4)" }}>
                    Most Popular
                  </div>
                )}
                <div className="text-sm font-bold tracking-widest uppercase mb-1" style={{ color: `rgba(${plan.color},0.8)` }}>{plan.name}</div>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-5xl font-black" style={{ fontFamily: "'Space Grotesk',sans-serif", color: "#fff" }}>${price}</span>
                  <span className="mb-2 text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>/mo</span>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                      <Check className="w-4 h-4 shrink-0" style={{ color: `rgb(${plan.color})` }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {isGold && (
                  <motion.a href="#" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full py-3 rounded-xl text-center font-semibold text-sm text-white" style={{ background: "linear-gradient(135deg,#7C3AED,#8b5cf6)", boxShadow: "0 4px 20px rgba(124,58,237,0.35)" }}>
                    Get Started
                  </motion.a>
                )}
              </motion.div>
            );
          })}
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
  { q: "How does billing work?", a: "Choose monthly, quarterly, semi-annual, or annual billing. Longer commitments unlock the biggest discounts — annual saves 28%." },
  { q: "What is Deep Research?", a: "Autonomous agents browse the web, read documents, and synthesize massive reports in minutes — a tireless research partner with no limits." },
  { q: "Is my data private?", a: "Your conversations, documents, and outputs are never used to train models or shared with third parties. Enterprise-grade encryption at rest and in transit." },
];

function FAQItem({ faq, index }: { faq: typeof FAQS[0]; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ delay: index * 0.07, duration: 0.6, ease: EASE_OUT }}
      className="border-b overflow-hidden" style={{ borderColor: open ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.07)" }}>
      <motion.button onClick={() => setOpen(!open)} whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 400, damping: 25 }} className="w-full flex items-center justify-between py-5 text-left group" style={{ willChange: "transform" }}>
        <span className="text-base font-medium transition-colors duration-300" style={{ color: open ? "#fff" : "rgba(255,255,255,0.7)" }}>{faq.q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0, scale: open ? 1.1 : 1 }} transition={{ duration: 0.28, ease: EASE_OUT }}
          className="ml-4 shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all" style={{ borderColor: open ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.1)", background: open ? "rgba(139,92,246,0.15)" : "transparent", boxShadow: open ? "0 0 12px rgba(124,58,237,0.35)" : "none" }}>
          <Plus className="w-3.5 h-3.5" style={{ color: open ? "#a855f7" : "rgba(255,255,255,0.4)" }} />
        </motion.div>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.38, ease: EASE_OUT }}>
            <p className="pb-5 text-sm leading-relaxed pr-10" style={{ color: "rgba(255,255,255,0.5)" }}>{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FAQ() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <section id="faq" className="py-36 border-t border-white/5 relative overflow-hidden">
      <div className="absolute right-0 top-1/4 w-80 h-80 rounded-full pointer-events-none" style={{ background: "rgba(168,85,247,1)", filter: "blur(120px)", opacity: 0.04 }} />
      <div className="container mx-auto px-6 max-w-3xl relative z-10">
        <div ref={ref} className="text-center mb-16">
          <motion.div initial={{ opacity: 0, x: -50 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7, ease: EASE_OUT }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", color: "rgba(139,92,246,0.8)" }}>
            FAQ
          </motion.div>
          <motion.h2 initial={{ opacity: 0, x: 60 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.8, delay: 0.1, ease: EASE_OUT }} className="text-4xl md:text-5xl font-black" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
            Frequently Asked{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Questions</span>
          </motion.h2>
        </div>
        <div>{FAQS.map((f, i) => <FAQItem key={i} faq={f} index={i} />)}</div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FOOTER
// ══════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer className="border-t py-16" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10 mb-12">
          <div>
            <a href="#" className="flex items-center gap-2.5 mb-4">
              <VortisLogo size={26} color="#8b5cf6" />
              <span className="text-lg font-black tracking-widest text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>VORTIS</span>
            </a>
            <p className="text-sm max-w-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              The intelligence platform for the world&rsquo;s most ambitious professionals.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            {[
              { title: "Product", links: ["Capabilities", "Pricing", "Changelog", "Roadmap"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
              { title: "Legal", links: ["Privacy", "Terms", "Security", "Cookies"] },
              { title: "Connect", links: ["Twitter", "Discord", "GitHub", "LinkedIn"] },
            ].map(col => (
              <div key={col.title}>
                <div className="font-semibold text-white mb-3">{col.title}</div>
                {col.links.map(l => (
                  <a key={l} href="#" className="block mb-2 transition-colors duration-200 hover:text-white" style={{ color: "rgba(255,255,255,0.38)" }}>{l}</a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>© 2025 Vortis AI. All rights reserved.</span>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Security"].map(l => (
              <a key={l} href="#" className="text-xs transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.28)" }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LANDING PAGE  (default export)
// ══════════════════════════════════════════════════════════════════
export default function LandingPage() {
  return (
    <div style={{ background: "#050510", color: "#ffffff", overflowX: "hidden", minHeight: "100vh", position: "relative", fontFamily: "'Inter',sans-serif", isolation: "isolate" }}>
      <StyleInjector />
      <CosmicBg />
      <CursorOrb />
      <Nav />
      <main>
        <Hero />
        <Logos />
        <ChatPreview />
        <Showcase />
        <Pricing />
        <FAQ />
        <Footer />
      </main>
    </div>
  );
}
