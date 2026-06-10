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
// All paths sourced from simple-icons v13 (https://simpleicons.org) with official brand hex colors
// Microsoft: classic 4-rect design (using official brand SVG layout)

interface BrandConfig {
  path?: string | null;
  color: string;
  multiPath?: { d: string; fill: string }[];
}

const BRAND_DATA: Record<string, BrandConfig> = {
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
  TikTok: { path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z", color: "#ffffff" },
};

function BrandIcon({ name }: { name: string }) {
  const brand = BRAND_DATA[name];
  if (!brand) return null;

  const style = { width: 20, height: 20, display: "block" as const, flexShrink: 0 };

  if (brand.multiPath) {
    return (
      <svg viewBox="0 0 24 24" style={style}>
        {brand.multiPath.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} />
        ))}
      </svg>
    );
  }

  if (brand.path) {
    return (
      <svg viewBox="0 0 24 24" style={style}>
        <path d={brand.path} fill={brand.color} />
      </svg>
    );
  }

  return null;
}

const row1 = [
  "Google", "Microsoft", "Apple", "Meta", "Amazon", "Netflix", "Spotify", "Adobe", "Stripe", "Vercel", "GitHub", "Notion", "Figma", "LinkedIn", "Discord",
];
const row2 = [
  "Linear", "Salesforce", "Airbnb", "Uber", "X", "OpenAI", "Anthropic", "Shopify", "Dropbox", "Atlassian", "PayPal", "Zoom", "Pinterest", "Reddit", "TikTok",
];

function LogoItem({ name }: { name: string }) {
  return (
    <div
      className="flex items-center gap-3 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] cursor-default group transition-all duration-300 hover:border-primary/40 hover:bg-primary/5"
      style={{ height: 52, padding: "0 28px", minWidth: "fit-content" }}
    >
      <div className="opacity-75 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
        <BrandIcon name={name} />
      </div>
      <span
        className="text-[15px] font-semibold whitespace-nowrap tracking-wide text-white/[0.55] group-hover:text-white transition-colors duration-300"
        style={{ textShadow: "none" }}
      >
        {name}
      </span>
    </div>
  );
}

function MarqueeRow({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const tripled = [...items, ...items, ...items];
  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex gap-3 will-change-transform"
        style={{ width: "max-content" }}
        animate={{ x: reverse ? ["-33.33%", "0%"] : ["0%", "-33.33%"] }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      >
        {tripled.map((name, i) => (
          <LogoItem key={i} name={name} />
        ))}
      </motion.div>
    </div>
  );
}

export function Logos() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-20 relative overflow-hidden bg-neutral-950" data-testid="section-logos">
      {/* Edge-fade masking gradients */}
      <div className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none bg-gradient-to-r from-neutral-950 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-32 z-10 pointer-events-none bg-gradient-to-l from-neutral-950 to-transparent" />

      <div ref={ref} className="mb-10 px-6 relative z-10">
        <motion.h3
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center text-lg md:text-xl font-bold text-white/80 tracking-tight"
        >
          Trusted by teams at the world&rsquo;s leading companies
        </motion.h3>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 1, delay: 0.25 }}
        className="flex flex-col gap-5"
      >
        <MarqueeRow items={row1} reverse={false} />
        <MarqueeRow items={row2} reverse={true} />
      </motion.div>
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
        <Showcase />
        <Pricing />
        <FAQ />
        <Footer />
      </main>
    </div>
  );
}
