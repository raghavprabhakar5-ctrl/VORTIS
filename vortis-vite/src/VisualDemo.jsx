// VisualDemo.jsx
// -----------------------------------------------------------------------------
// A self-contained, dependency-free interactive teaching widget renderer.
// Drop this file into your React project next to your main chat file.
//
// Public API (matches the import line already in your codebase):
//   import VisualDemo, {
//     VISUAL_DEMO_MARKER,
//     VISUAL_DEMO_PROMPT,
//     parseVisualDemoTrigger
//   } from './VisualDemo';
//
// Usage from your chat renderer:
//   if (text.startsWith(VISUAL_DEMO_MARKER)) {
//     return <VisualDemo spec={text.slice(VISUAL_DEMO_MARKER.length)} />;
//   }
//
// HOW IT WORKS
// ------------
// The AI can produce visuals in three ways (in order of flexibility):
//
//   1. HTML mode  (PRIMARY — like ChatGPT artifacts)
//      The AI emits complete HTML + CSS + JS for any custom visual.
//      Rendered in a sandboxed iframe so it can run scripts safely.
//      This is what makes "make anything" possible.
//
//   2. SVG mode
//      The AI emits raw <svg>...</svg> markup.
//      Rendered inline (no iframe) — best for static diagrams.
//
//   3. Structured types (SHORTCUT)
//      flowchart | cycle | process | circuit | anatomy | wave | graph |
//      timeline | comparison | equation | diagram
//      The AI fills in a JSON spec; we render it with a prebuilt widget.
//      Useful when the AI wants to be terse.
//
// If the spec fails to parse, a sleek info card is shown — NEVER an empty
// broken-looking box, NEVER raw text.
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// =============================================================================
// CONSTANTS
// =============================================================================

// Stored at the start of a chat message to mark it as a visual demo.
export const VISUAL_DEMO_MARKER = '\u0001VISUAL_DEMO\u0001';

// Instructions appended to the AI's system prompt so it knows how + when
// to emit a VISUAL_DEMO. Designed to push the AI toward html mode for
// maximum flexibility — that's what makes "make anything" possible.
export const VISUAL_DEMO_PROMPT = `
──────────────────────────────────────
VISUAL_DEMO — INTERACTIVE TEACHING WIDGET
──────────────────────────────────────
When the user asks "how does X work", "explain/diagram/show me", or any
mechanism / process / cycle / circuit / anatomy / waveform / graph / timeline
question, respond with a normal short text intro (1–3 sentences), THEN emit
this exact command on its OWN LINE, followed by a JSON spec:

VISUAL_DEMO:
{"title":"<short>","caption":"<one-line takeaway>","html":"<FULL HTML STRING>"}

NEVER narrate "Let me make a diagram" — just produce the spec silently.
NEVER wrap the JSON in markdown code fences.
NEVER emit raw SVG, mermaid, ascii art, or arrow diagrams.
The JSON must be valid (double quotes, escape inner quotes, no trailing commas).

═══════════════════════════════════════════════════════════════════════════
PREFERRED: HTML MODE (can make ANYTHING)
═══════════════════════════════════════════════════════════════════════════
Use html mode for anything that doesn't perfectly fit a structured type.
Write complete, self-contained HTML with inline <style> and <script>.
The HTML is rendered in a sandboxed iframe, so scripts run safely.

DESIGN RULES (very important — bad visuals are worse than no visual):
  • Dark theme: background #0b1224 or #0f172a, text #f1f5f9, accents #818cf8.
  • Use modern CSS: flexbox/grid, border-radius 10–14px, subtle shadows.
  • Make it INTERACTIVE: buttons, sliders, hover states, animations.
  • Include Play / Reset controls for any animation.
  • Keep it under 600px tall. Center the content. Don't waste space.
  • Use SVG for shapes; <canvas> is fine for particles/waves.
  • No external resources, no <img> tags pointing outside, no fetch calls.
  • Use system fonts (-apple-system, 'Segoe UI', Inter, Roboto, sans-serif).
  • Animate with requestAnimationFrame, not setInterval, for smoothness.

GOOD HTML EXAMPLE (Faraday's law):
{
  "title": "Faraday's Law",
  "caption": "Moving a magnet through a coil induces current.",
  "html": "<!DOCTYPE html><html><head><style>body{margin:0;background:#0f172a;color:#f1f5f9;font-family:system-ui;padding:20px;text-align:center}svg{max-width:100%}button{background:#6366f1;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;margin:4px}#needle{transform-origin:50px 50px;transition:transform .1s}</style></head><body><svg viewBox='0 0 100 80'><circle cx='50' cy='50' r='20' fill='none' stroke='#475569' stroke-width='.5'/><line id='needle' x1='50' y1='50' x2='50' y2='35' stroke='#818cf8' stroke-width='1.5'/><circle cx='50' cy='50' r='2' fill='#818cf8'/><rect id='magnet' x='10' y='46' width='12' height='8' fill='#ef4444'/></svg><div><button onclick='toggle()'>Play/Pause</button><button onclick='reset()'>Reset</button></div><script>let t=0,playing=true;function tick(){if(playing){t+=0.05;const x=10+20*Math.sin(t);document.getElementById('magnet').setAttribute('x',x);const a=Math.abs(Math.cos(t))*30;document.getElementById('needle').setAttribute('transform','rotate('+a+' 50 50)')}requestAnimationFrame(tick)}function toggle(){playing=!playing}function reset(){t=0}tick()</script></body></html>"
}

═══════════════════════════════════════════════════════════════════════════
SHORTCUT: STRUCTURED TYPES (use sparingly — html mode is more flexible)
═══════════════════════════════════════════════════════════════════════════
If the visual is simple and matches one of these exactly, you may use a
structured type instead of writing HTML. The system renders it for you.

Spec: {"type":"<one>","title":"...","caption":"...", ...fields}

  flowchart  — nodes:[{id,label,color?}] + edges:[{from,to,label?}]
  cycle      — nodes:[{id,label,color?}] + edges (last node auto-loops to first)
  process    — steps:[{label,description}] (linear, Play advances)
  circuit    — components:[{id,type,x1,y1,x2,y2,label?,value?}] where type ∈
               battery|resistor|wire|bulb|switch|motor|galvanometer|coil|magnet|capacitor|ammeter
               animateCurrent:true
  anatomy    — parts:[{label,x,y,description?,color?}] (x,y are 0–100 % of canvas)
  wave       — waveType:"sine|square|triangle|sawtooth", amplitude:0–1, frequency, showPhase
  graph      — series:[{label,color,points:[[x,y],...]}] OR function:"sin(x)",
               xLabel,yLabel,xMin,xMax,yMin,yMax
  timeline   — events:[{date,label,description?}]
  comparison — columns:[{label,color?,items:[string,...]}]
  equation   — equation:"E = m*c^2", variables:[{name,min,max,initial,step,unit?}],
               compute:"<JS expression using variable names>"
  diagram    — same as flowchart (freeform)

Color palette (use these names OR hex):
  indigo #6366f1, violet #8b5cf6, pink #ec4899, rose #f43f5e,
  orange #f97316, amber #f59e0b, green #10b981, teal #14b8a6,
  cyan #06b6d4, blue #3b82f6, red #ef4444, slate #64748b

═══════════════════════════════════════════════════════════════════════════
WHEN TO USE WHICH
═══════════════════════════════════════════════════════════════════════════
• "Explain Faraday's law"        → html (custom magnet+coil+needle)
• "Show me the water cycle"      → cycle (structured, simple)
• "How does a transistor work"   → html (custom labeled cross-section)
• "Compare mitosis vs meiosis"   → comparison (structured)
• "Graph y = x^2"                → graph (structured)
• "Diagram of a cell"            → html (custom labeled SVG) OR anatomy
• "Show AC vs DC waveform"       → html (two waves side by side) OR wave
• "Timeline of WW2"              → timeline (structured)
• Anything with custom drawing   → html

When in doubt, USE HTML MODE. It can make anything.
`;

// =============================================================================
// SPEC PARSER
// =============================================================================

/**
 * Extract the visual spec string from the AI's raw response.
 * Returns the spec string (everything after "VISUAL_DEMO:") or null.
 */
export function parseVisualDemoTrigger(text) {
  if (!text || typeof text !== 'string') return null;

  const headerMatch = text.match(/VISUAL_DEMO\s*:\s*([\s\S]+)/i);
  if (!headerMatch) return null;

  let raw = headerMatch[1].trim();

  // Strip markdown code fences if the AI wrapped the spec.
  raw = raw
    .replace(/^```(?:json|js|javascript|html)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // If there's trailing conversational text after the JSON, try to trim it.
  if (raw.startsWith('{')) {
    const balanced = extractBalancedJSON(raw);
    if (balanced) raw = balanced;
  }

  return raw.length > 0 ? raw : null;
}

/**
 * Walk the string from the first '{' and return the substring that closes
 * the top-level object. Handles strings, escapes, and nested objects/arrays.
 */
function extractBalancedJSON(s) {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Best-effort parse of the spec string into a JS object.
 * On failure returns { type: 'fallback', title, caption, raw }.
 */
function parseSpec(spec) {
  if (!spec || typeof spec !== 'string') {
    return { type: 'fallback', title: 'Visual Demo', caption: '', raw: '' };
  }

  const trimmed = spec.trim();

  // Case 1: JSON object.
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') return normalizeSpec(obj, trimmed);
    } catch (_) { /* fall through */ }

    const balanced = extractBalancedJSON(trimmed);
    if (balanced && balanced !== trimmed) {
      try {
        const obj = JSON.parse(balanced);
        if (obj && typeof obj === 'object') return normalizeSpec(obj, balanced);
      } catch (_) { /* fall through */ }
    }
  }

  // Case 2: raw HTML.
  if (/^<(!doctype|html|head|body|div|svg|section|article|main|canvas)/i.test(trimmed)) {
    return {
      type: 'html',
      title: 'Visual Demo',
      caption: '',
      html: trimmed,
      raw: trimmed,
    };
  }

  // Case 3: raw SVG.
  const svgMatch = trimmed.match(/<svg[\s\S]*<\/svg>/i);
  if (svgMatch) {
    return {
      type: 'svg',
      title: 'Visual Demo',
      caption: '',
      svg: svgMatch[0],
      raw: trimmed,
    };
  }

  // Case 4: any embedded JSON.
  const anyJson = extractBalancedJSON(trimmed);
  if (anyJson) {
    try {
      const obj = JSON.parse(anyJson);
      if (obj && typeof obj === 'object') return normalizeSpec(obj, trimmed);
    } catch (_) { /* fall through */ }
  }

  // Case 5: fallback. NEVER dump raw text — show a sleek info card.
  return {
    type: 'fallback',
    title: 'Visual Demo',
    caption: '',
    raw: trimmed,
  };
}

function normalizeSpec(obj, raw) {
  const out = { ...obj };
  out.raw = raw;
  if (!out.type) {
    // Auto-detect: if html field present, treat as html; if svg, treat as svg.
    if (typeof out.html === 'string') out.type = 'html';
    else if (typeof out.svg === 'string') out.type = 'svg';
    else out.type = 'fallback';
  }
  // If the AI invented a type name not in our list, route to fallback
  // UNLESS we have html/svg field — then prefer that.
  const knownTypes = new Set([
    'html', 'svg', 'flowchart', 'cycle', 'process', 'circuit', 'anatomy',
    'wave', 'graph', 'timeline', 'comparison', 'equation', 'diagram',
  ]);
  if (!knownTypes.has(out.type)) {
    if (typeof out.html === 'string') out.type = 'html';
    else if (typeof out.svg === 'string') out.type = 'svg';
    else out.type = 'fallback';
  }
  if (!out.title) out.title = 'Visual Demo';
  if (!out.caption) out.caption = '';
  out.title = cleanupText(out.title);
  if (out.subtitle) out.subtitle = cleanupText(out.subtitle);
  if (out.caption) out.caption = cleanupText(out.caption);
  return out;
}

function cleanupText(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/^VISUAL_DEMO\s*:\s*/i, '')
    .replace(/^```(?:json|js|javascript|html)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

// =============================================================================
// THEME + SHARED UI
// =============================================================================

const PALETTE = {
  indigo: '#6366f1', violet: '#8b5cf6', pink: '#ec4899', rose: '#f43f5e',
  orange: '#f97316', amber: '#f59e0b', green: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', red: '#ef4444', slate: '#64748b',
};

function colorFor(name) {
  if (!name) return PALETTE.indigo;
  if (PALETTE[name]) return PALETTE[name];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(name)) return name;
  return PALETTE.indigo;
}

const THEME = {
  bg: '#0b1224',
  bgGrad: 'linear-gradient(135deg, #0b1224 0%, #1e1b4b 100%)',
  cardBg: 'rgba(15, 23, 42, 0.92)',
  border: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',
  text: '#f1f5f9',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  accent: '#818cf8',
  accentBright: '#a5b4fc',
  accentDim: 'rgba(129, 140, 248, 0.16)',
  success: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto',
          'Helvetica Neue', Arial, sans-serif`,
  mono: `'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas,
          'Liberation Mono', monospace`,
};

function Card({ title, subtitle, caption, children, rightHeader, footer, type }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div style={{
      width: '100%',
      maxWidth: 760,
      margin: '14px auto',
      borderRadius: 18,
      background: THEME.bgGrad,
      border: `1px solid ${THEME.border}`,
      boxShadow: '0 24px 60px -24px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
      overflow: 'hidden',
      fontFamily: THEME.font,
      color: THEME.text,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'linear-gradient(180deg, rgba(129,140,248,0.06) 0%, transparent 100%)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `linear-gradient(135deg, ${THEME.accent} 0%, ${PALETTE.violet} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 4px 14px ${THEME.accent}55`,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b1224"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: THEME.text,
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: 11, color: THEME.textDim, marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</div>
          )}
        </div>
        {type && (
          <span style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: THEME.accentBright,
            background: THEME.accentDim,
            border: `1px solid ${THEME.accent}44`,
          }}>{type}</span>
        )}
        {rightHeader}
      </div>

      {/* Body */}
      <div style={{ padding: '18px' }}>
        {children}
      </div>

      {/* Caption */}
      {caption && (
        <div style={{
          padding: '12px 18px',
          fontSize: 13,
          color: THEME.textDim,
          lineHeight: 1.55,
          borderTop: `1px solid ${THEME.border}`,
          background: 'rgba(0,0,0,0.22)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={THEME.accent} strokeWidth="2" strokeLinecap="round"
            style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{caption}</span>
        </div>
      )}

      {footer}
    </div>
  );
}

function Btn({ children, onClick, kind = 'default', disabled, size = 'sm' }) {
  const base = {
    padding: size === 'sm' ? '7px 14px' : '9px 18px',
    borderRadius: 9,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: THEME.font,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${THEME.borderStrong}`,
    background: 'rgba(255,255,255,0.04)',
    color: THEME.text,
    transition: 'all 120ms ease',
    opacity: disabled ? 0.4 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };
  const kinds = {
    default: {},
    primary: {
      background: `linear-gradient(135deg, ${THEME.accent} 0%, ${PALETTE.violet} 100%)`,
      color: '#0b1224',
      border: `1px solid ${THEME.accent}`,
      boxShadow: `0 4px 14px ${THEME.accent}55`,
    },
    ghost: {
      background: 'transparent',
      border: `1px solid ${THEME.border}`,
      color: THEME.textDim,
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...kinds[kind] }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}

const PlayIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);
const ResetIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);
const StepIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M5 5v14l9-7zM16 5h3v14h-3z" />
  </svg>
);

function PlayControls({ isPlaying, onPlayPause, onStep, onReset, stepLabel, current, total }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 0 0', marginTop: 14,
      borderTop: `1px solid ${THEME.border}`,
      flexWrap: 'wrap',
    }}>
      <Btn kind="primary" onClick={onPlayPause}>
        {isPlaying ? <><PauseIcon /> Pause</> : <><PlayIcon /> Play</>}
      </Btn>
      {onStep && (
        <Btn onClick={onStep} disabled={isPlaying}>
          <StepIcon /> Step
        </Btn>
      )}
      <Btn kind="ghost" onClick={onReset}>
        <ResetIcon /> Reset
      </Btn>
      {stepLabel && (
        <div style={{
          marginLeft: 'auto',
          fontSize: 11, color: THEME.textDim,
          fontFamily: THEME.mono,
          padding: '4px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          border: `1px solid ${THEME.border}`,
        }}>
          {typeof current === 'number' && typeof total === 'number'
            ? `${current + 1} / ${total} — `
            : ''}
          {stepLabel}
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120, flex: 1 }}>
      <span style={{
        fontSize: 11, color: THEME.textDim, display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{label}</span>
        <span style={{ fontFamily: THEME.mono, color: THEME.text }}>
          {Number.isFinite(value) ? value.toFixed(2) : value}{unit || ''}
        </span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ accentColor: THEME.accent, width: '100%' }}
      />
    </label>
  );
}

// =============================================================================
// RENDERER: HTML (PRIMARY — sandboxed iframe for "make anything")
// =============================================================================
//
// The AI emits complete HTML + CSS + JS. We render it in a sandboxed iframe
// via srcdoc. Scripts run inside the iframe; the parent app is isolated.
//
// Auto-resize: the iframe injects a small ResizeObserver script that posts
// the content height to the parent. The parent sets iframe.height to match.

function IframeRenderer({ spec }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(360);
  const [showCode, setShowCode] = useState(false);
  const [errored, setErrored] = useState(false);

  const html = useMemo(() => {
    let h = spec.html || '';
    // If the AI didn't include a full HTML document, wrap it.
    if (!/<html|<!doctype/i.test(h)) {
      h = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        *{box-sizing:border-box}
        body{margin:0;padding:18px;background:#0f172a;color:#f1f5f9;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;
          min-height:100%;overflow-x:hidden}
        button,input,select{font-family:inherit}
      </style></head><body>${h}</body></html>`;
    } else {
      // Inject a default dark background if the AI forgot.
      if (!/background[:\s]/i.test(h.slice(0, 800)) && !/<body[^>]*style/i.test(h)) {
        h = h.replace(/<body([^>]*)>/i, '<body$1 style="background:#0f172a;color:#f1f5f9;margin:0;padding:18px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Roboto,sans-serif;">');
      }
    }

    // Inject the auto-resize script just before </body>.
    const resizeScript = `<script>
      (function(){
        function send(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
          try{parent.postMessage({__vd_resize:true,height:h},'*')}catch(e){}}
        if(document.readyState==='complete'){send()}else{window.addEventListener('load',send)}
        if(window.ResizeObserver){var ro=new ResizeObserver(send);ro.observe(document.body)}
        setInterval(send,500);
      })();
    </script>`;
    if (/<\/body>/i.test(h)) {
      h = h.replace(/<\/body>/i, resizeScript + '</body>');
    } else {
      h = h + resizeScript;
    }
    return h;
  }, [spec.html]);

  useEffect(() => {
    function onMsg(e) {
      if (e.data && e.data.__vd_resize && typeof e.data.height === 'number') {
        // Clamp to a sane range.
        setHeight(Math.max(160, Math.min(2400, e.data.height + 4)));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Reset errored state when html changes.
  useEffect(() => { setErrored(false); }, [html]);

  if (errored) {
    return <FallbackRenderer spec={spec} note="The custom widget failed to load." />;
  }

  return (
    <div>
      <div style={{
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${THEME.border}`,
        background: '#0f172a',
      }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title={spec.title || 'Visual Demo'}
          sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals"
          style={{
            width: '100%',
            height: height,
            border: 'none',
            display: 'block',
            background: '#0f172a',
          }}
          onError={() => setErrored(true)}
        />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'flex-end', marginTop: 8,
      }}>
        <Btn kind="ghost" size="sm" onClick={() => setShowCode(s => !s)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          {showCode ? 'Hide code' : 'View code'}
        </Btn>
      </div>
      {showCode && (
        <pre style={{
          marginTop: 8,
          padding: 12,
          background: 'rgba(0,0,0,0.35)',
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          fontSize: 11,
          color: THEME.textDim,
          fontFamily: THEME.mono,
          maxHeight: 220,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>{spec.html}</pre>
      )}
    </div>
  );
}

// =============================================================================
// RENDERER: SVG passthrough
// =============================================================================

function SvgRenderer({ spec }) {
  return (
    <div style={{
      width: '100%',
      padding: 12,
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 10,
      border: `1px solid ${THEME.border}`,
    }}>
      <div
        style={{ width: '100%' }}
        dangerouslySetInnerHTML={{ __html: spec.svg }}
      />
    </div>
  );
}

// =============================================================================
// RENDERER: Flowchart (also used for "diagram" type)
// =============================================================================

function FlowchartRenderer({ spec }) {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];

  const positioned = useMemo(() => {
    if (nodes.length === 0) return [];
    const hasExplicit = nodes.some(n => typeof n.x === 'number' && typeof n.y === 'number');
    if (hasExplicit) {
      return nodes.map(n => ({ ...n, x: n.x ?? 50, y: n.y ?? 50 }));
    }
    if (edges.length === 0) {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      return nodes.map((n, i) => ({
        ...n,
        x: ((i % cols) + 0.5) * (100 / cols),
        y: (Math.floor(i / cols) + 0.5) * (100 / Math.ceil(nodes.length / cols)),
      }));
    }
    const indeg = {};
    nodes.forEach(n => { indeg[n.id] = 0; });
    edges.forEach(e => { if (indeg[e.to] !== undefined) indeg[e.to]++; });
    let frontier = nodes.filter(n => indeg[n.id] === 0).map(n => n.id);
    if (frontier.length === 0) frontier = [nodes[0].id];
    const level = {};
    frontier.forEach(id => { level[id] = 0; });
    let next = frontier;
    let guard = 0;
    while (next.length && guard++ < 50) {
      const layer = [];
      next.forEach(id => {
        edges.filter(e => e.from === id).forEach(e => {
          if (level[e.to] === undefined) {
            level[e.to] = (level[id] || 0) + 1;
            layer.push(e.to);
          }
        });
      });
      next = layer;
    }
    nodes.forEach(n => { if (level[n.id] === undefined) level[n.id] = 0; });
    const byLevel = {};
    nodes.forEach(n => {
      const l = level[n.id] || 0;
      (byLevel[l] = byLevel[l] || []).push(n);
    });
    const maxLevel = Math.max(...Object.keys(byLevel).map(Number));
    return nodes.map(n => {
      const l = level[n.id] || 0;
      const peers = byLevel[l];
      const idx = peers.indexOf(n);
      return {
        ...n,
        x: ((idx + 0.5) / peers.length) * 100,
        y: maxLevel === 0 ? 50 : (l + 0.5) * (100 / (maxLevel + 1)),
      };
    });
  }, [nodes, edges]);

  const nodeById = useMemo(() => {
    const m = {};
    positioned.forEach(n => { m[n.id] = n; });
    return m;
  }, [positioned]);

  return (
    <div style={{
      width: '100%',
      padding: 12,
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 10,
      border: `1px solid ${THEME.border}`,
    }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ width: '100%', height: 360 }}>
        <defs>
          <marker id="vd-arrow" markerWidth="4" markerHeight="4" refX="3.5" refY="2"
            orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L4,2 L0,4 z" fill={THEME.textDim} />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = nodeById[e.from];
          const b = nodeById[e.to];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <path
                d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                fill="none" stroke={THEME.textDim} strokeWidth="0.4"
                markerEnd="url(#vd-arrow)" opacity="0.7"
              />
              {e.label && (
                <text x={mx} y={my} textAnchor="middle"
                  fontSize="2.4" fill={THEME.textDim}
                  style={{ fontFamily: THEME.font }}>{e.label}</text>
              )}
            </g>
          );
        })}
        {positioned.map((n, i) => {
          const c = colorFor(n.color);
          return (
            <g key={i}>
              <rect
                x={n.x - 9} y={n.y - 4} width="18" height="8" rx="2"
                fill={`${c}22`} stroke={c} strokeWidth="0.3"
              />
              <text x={n.x} y={n.y + 0.7} textAnchor="middle"
                fontSize="2.4" fill={THEME.text} style={{ fontFamily: THEME.font, fontWeight: 600 }}>
                {String(n.label || n.id).slice(0, 22)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================
// RENDERER: Cycle
// =============================================================================

function CycleRenderer({ spec }) {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || nodes.length === 0) return;
    const t = setInterval(() => setActive(a => (a + 1) % nodes.length), 900);
    return () => clearInterval(t);
  }, [playing, nodes.length]);

  useEffect(() => { setActive(-1); }, [nodes]);

  const positioned = useMemo(() => {
    if (nodes.length === 0) return [];
    return nodes.map((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...n,
        x: 50 + 36 * Math.cos(angle),
        y: 50 + 36 * Math.sin(angle),
      };
    });
  }, [nodes]);

  const nodeById = useMemo(() => {
    const m = {};
    positioned.forEach(n => { m[n.id] = n; });
    return m;
  }, [positioned]);

  const allEdges = useMemo(() => {
    const list = [...edges];
    if (nodes.length > 1) {
      list.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id, _auto: true });
    }
    return list;
  }, [edges, nodes]);

  return (
    <div>
      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        border: `1px solid ${THEME.border}`,
      }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 380 }}>
          <defs>
            <marker id="vd-cycle-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L5,2.5 L0,5 z" fill={THEME.accent} />
            </marker>
          </defs>
          {allEdges.map((e, i) => {
            const a = nodeById[e.from];
            const b = nodeById[e.to];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const cx = 50 + (mx - 50) * 0.4;
            const cy = 50 + (my - 50) * 0.4;
            const isActive = active >= 0 && (positioned[active]?.id === e.from);
            return (
              <path key={i}
                d={`M ${a.x} ${a.y} Q ${cx} ${cy}, ${b.x} ${b.y}`}
                fill="none"
                stroke={isActive ? THEME.accent : THEME.textDim}
                strokeWidth={isActive ? 0.8 : 0.4}
                markerEnd="url(#vd-cycle-arrow)"
                opacity={isActive ? 1 : 0.5}
                style={{ transition: 'stroke 200ms, stroke-width 200ms, opacity 200ms' }}
              />
            );
          })}
          {positioned.map((n, i) => {
            const c = colorFor(n.color);
            const isActive = i === active;
            return (
              <g key={i} style={{ cursor: 'pointer' }} onClick={() => setActive(i)}>
                <circle cx={n.x} cy={n.y} r={isActive ? 10 : 8}
                  fill={`${c}${isActive ? 'ee' : '33'}`}
                  stroke={c} strokeWidth={isActive ? 0.8 : 0.4}
                  style={{ transition: 'all 220ms' }}
                />
                <text x={n.x} y={n.y + 1} textAnchor="middle"
                  fontSize="2.6" fill={THEME.text}
                  style={{ fontFamily: THEME.font, fontWeight: 700, pointerEvents: 'none' }}>
                  {String(n.label || n.id).slice(0, 14)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <PlayControls
        isPlaying={playing}
        onPlayPause={() => setPlaying(p => !p)}
        onReset={() => { setPlaying(false); setActive(-1); }}
        stepLabel={active >= 0 ? positioned[active]?.label : 'idle'}
        current={active >= 0 ? active : undefined}
        total={nodes.length}
      />
    </div>
  );
}

// =============================================================================
// RENDERER: Process
// =============================================================================

function ProcessRenderer({ spec }) {
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const t = setInterval(() => {
      setCurrent(c => {
        if (c + 1 >= steps.length) { setPlaying(false); return steps.length - 1; }
        return c + 1;
      });
    }, 1200);
    return () => clearInterval(t);
  }, [playing, steps.length]);

  useEffect(() => { setCurrent(-1); setPlaying(false); }, [steps]);

  if (steps.length === 0) {
    return <FallbackRenderer spec={spec} note="No steps provided." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const done = i <= current;
          const active = i === current;
          const c = colorFor(s.color) || THEME.accent;
          return (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '10px 12px',
              borderRadius: 10,
              background: active
                ? `${c}22`
                : done
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(0,0,0,0.18)',
              border: `1px solid ${active ? c : THEME.border}`,
              opacity: done || active ? 1 : 0.55,
              transition: 'all 240ms ease',
              transform: active ? 'translateX(4px)' : 'none',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: done ? c : 'rgba(255,255,255,0.06)',
                color: done ? '#0b1224' : THEME.textDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                fontFamily: THEME.mono,
                boxShadow: active ? `0 0 16px ${c}99` : 'none',
                transition: 'all 240ms',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                  marginBottom: 2,
                }}>{s.label}</div>
                {s.description && (
                  <div style={{ fontSize: 12, color: THEME.textDim, lineHeight: 1.5 }}>
                    {s.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <PlayControls
        isPlaying={playing}
        onPlayPause={() => {
          if (current >= steps.length - 1) setCurrent(-1);
          setPlaying(p => !p);
        }}
        onStep={() => {
          setPlaying(false);
          setCurrent(c => Math.min(c + 1, steps.length - 1));
        }}
        onReset={() => { setPlaying(false); setCurrent(-1); }}
        stepLabel={current >= 0 ? steps[current]?.label : 'idle'}
        current={current >= 0 ? current : undefined}
        total={steps.length}
      />
    </div>
  );
}

// =============================================================================
// RENDERER: Circuit
// =============================================================================

function CircuitRenderer({ spec }) {
  const components = Array.isArray(spec.components) ? spec.components : [];
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => { setTick(t => (t + 1) % 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const wires = components.filter(c => (c.type || 'wire').toLowerCase() === 'wire');
  const hasBattery = components.some(c => (c.type || '').toLowerCase() === 'battery');
  const animateCurrent = spec.animateCurrent !== false && hasBattery;

  return (
    <div>
      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        border: `1px solid ${THEME.border}`,
      }}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 300 }}>
          <defs>
            <linearGradient id="vd-wire-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.2" />
              <stop offset="50%" stopColor={THEME.accent} stopOpacity="1" />
              <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {wires.map((w, i) => (
            <line key={`w-${i}`}
              x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
              stroke="#475569" strokeWidth="1.2" strokeLinecap="round"
            />
          ))}
          {animateCurrent && wires.map((w, i) => {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const dots = Math.max(2, Math.floor(len / 8));
            return Array.from({ length: dots }).map((_, d) => {
              const t = ((tick / 60) + d / dots + (i * 0.1)) % 1;
              const x = w.x1 + (w.x2 - w.x1) * t;
              const y = w.y1 + (w.y2 - w.y1) * t;
              return (
                <circle key={`d-${i}-${d}`} cx={x} cy={y} r="0.8"
                  fill={THEME.accent}
                  opacity="0.9"
                  style={{ filter: `drop-shadow(0 0 3px ${THEME.accent})` }}
                />
              );
            });
          })}
          {components.filter(c => (c.type || 'wire').toLowerCase() !== 'wire').map((c, i) => (
            <CircuitComponent key={`c-${i}`} c={c} tick={tick} animate={animateCurrent} />
          ))}
        </svg>
      </div>

      {spec.note && (
        <div style={{
          marginTop: 8, fontSize: 12, color: THEME.textDim,
          fontStyle: 'italic', textAlign: 'center',
        }}>{spec.note}</div>
      )}

      <PlayControls
        isPlaying={playing}
        onPlayPause={() => setPlaying(p => !p)}
        onReset={() => { setTick(0); setPlaying(true); }}
        stepLabel={animateCurrent ? 'Current flowing' : 'Static circuit'}
      />
    </div>
  );
}

function CircuitComponent({ c, tick, animate }) {
  const t = (c.type || '').toLowerCase();
  const cx = (c.x1 + c.x2) / 2;
  const cy = (c.y1 + c.y2) / 2;
  const dx = c.x2 - c.x1;
  const dy = c.y2 - c.y1;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const transform = `rotate(${angle} ${cx} ${cy})`;

  if (t === 'battery') {
    return (
      <g transform={transform}>
        <line x1={cx - 2} y1={cy - 3} x2={cx - 2} y2={cy + 3} stroke={THEME.text} strokeWidth="0.6" />
        <line x1={cx + 2} y1={cy - 1.5} x2={cx + 2} y2={cy + 1.5} stroke={THEME.text} strokeWidth="1.4" />
        {c.label && (
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'resistor') {
    return (
      <g transform={transform}>
        <rect x={cx - 4} y={cy - 1.5} width="8" height="3" rx="0.5"
          fill="none" stroke={THEME.text} strokeWidth="0.5" />
        {c.label && (
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'bulb') {
    const on = animate;
    return (
      <g>
        <circle cx={cx} cy={cy} r="2.5"
          fill={on ? '#fde047' : 'rgba(0,0,0,0.4)'}
          stroke={on ? '#facc15' : THEME.text} strokeWidth="0.5"
          style={on ? { filter: 'drop-shadow(0 0 6px #fde047)' } : {}}
        />
        {c.label && (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'switch') {
    const closed = c.value !== 'open';
    return (
      <g transform={transform}>
        <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy}
          stroke={closed ? THEME.text : 'transparent'} strokeWidth="0.6" />
        {!closed && (
          <line x1={cx - 3} y1={cy} x2={cx + 2} y2={cy - 2.5}
            stroke={THEME.text} strokeWidth="0.5" />
        )}
        {c.label && (
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'coil') {
    const coils = 5;
    const totalLen = Math.hypot(dx, dy);
    const coilW = totalLen / coils;
    const segs = [];
    for (let i = 0; i < coils; i++) {
      const sx = c.x1 + (dx / coils) * i;
      const sy = c.y1 + (dy / coils) * i;
      const ex = c.x1 + (dx / coils) * (i + 0.5);
      const ey = c.y1 + (dy / coils) * (i + 0.5);
      const ex2 = c.x1 + (dx / coils) * (i + 1);
      const ey2 = c.y1 + (dy / coils) * (i + 1);
      segs.push(
        <path key={i}
          d={`M ${sx} ${sy} A ${coilW / 2} ${coilW / 2} 0 0 1 ${ex} ${ey}`}
          fill="none" stroke={THEME.text} strokeWidth="0.5" />
      );
      segs.push(
        <path key={`b-${i}`}
          d={`M ${ex} ${ey} A ${coilW / 2} ${coilW / 2} 0 0 0 ${ex2} ${ey2}`}
          fill="none" stroke={THEME.text} strokeWidth="0.5" />
      );
    }
    return (
      <g>
        {segs}
        {c.label && (
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'magnet') {
    return (
      <g transform={transform}>
        <rect x={cx - 5} y={cy - 1.5} width="5" height="3" fill="#ef4444" />
        <rect x={cx} y={cy - 1.5} width="5" height="3" fill="#3b82f6" />
        <text x={cx - 2.5} y={cy + 0.8} textAnchor="middle" fontSize="2.4"
          fill="#fff" style={{ fontFamily: THEME.font, fontWeight: 700 }}>N</text>
        <text x={cx + 2.5} y={cy + 0.8} textAnchor="middle" fontSize="2.4"
          fill="#fff" style={{ fontFamily: THEME.font, fontWeight: 700 }}>S</text>
        {c.label && (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'galvanometer') {
    const needleAngle = animate ? Math.sin(tick / 8) * 30 : 0;
    return (
      <g>
        <circle cx={cx} cy={cy} r="3.5" fill="rgba(0,0,0,0.4)"
          stroke={THEME.text} strokeWidth="0.4" />
        <line x1={cx} y1={cy}
          x2={cx + 2.5 * Math.sin(needleAngle * Math.PI / 180)}
          y2={cy - 2.5 * Math.cos(needleAngle * Math.PI / 180)}
          stroke={THEME.accent} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r="0.5" fill={THEME.accent} />
        {c.label && (
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'motor') {
    return (
      <g>
        <circle cx={cx} cy={cy} r="2.5" fill="rgba(0,0,0,0.4)"
          stroke={THEME.text} strokeWidth="0.5" />
        <text x={cx} y={cy + 1} textAnchor="middle" fontSize="3"
          fill={THEME.text} style={{ fontFamily: THEME.font, fontWeight: 700 }}>M</text>
        {c.label && (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'capacitor') {
    return (
      <g transform={transform}>
        <line x1={cx - 1} y1={cy - 2.5} x2={cx - 1} y2={cy + 2.5}
          stroke={THEME.text} strokeWidth="0.7" />
        <line x1={cx + 1} y1={cy - 2.5} x2={cx + 1} y2={cy + 2.5}
          stroke={THEME.text} strokeWidth="0.7" />
        {c.label && (
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  if (t === 'ammeter') {
    return (
      <g>
        <circle cx={cx} cy={cy} r="2.5" fill="rgba(0,0,0,0.4)"
          stroke={THEME.text} strokeWidth="0.4" />
        <text x={cx} y={cy + 1} textAnchor="middle" fontSize="3"
          fill={THEME.text} style={{ fontFamily: THEME.font, fontWeight: 700 }}>A</text>
        {c.label && (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="3"
            fill={THEME.textDim} style={{ fontFamily: THEME.font }}>{c.label}</text>
        )}
      </g>
    );
  }
  return null;
}

// =============================================================================
// RENDERER: Anatomy
// =============================================================================

function AnatomyRenderer({ spec }) {
  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        border: `1px solid ${THEME.border}`,
      }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 380 }}>
          {parts.map((p, i) => {
            const c = colorFor(p.color);
            const isHover = hovered === i;
            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}>
                <circle cx={p.x} cy={p.y} r={isHover ? 3 : 2.2}
                  fill={c} stroke="#fff" strokeWidth="0.3"
                  style={{ transition: 'all 200ms', filter: isHover ? `drop-shadow(0 0 6px ${c})` : 'none' }} />
                <line x1={p.x} y1={p.y} x2={p.x + 6} y2={p.y - 6}
                  stroke={c} strokeWidth="0.3" opacity={isHover ? 1 : 0.5} />
                <text x={p.x + 6.5} y={p.y - 5.5}
                  fontSize="2.6" fill={isHover ? '#fff' : THEME.textDim}
                  style={{ fontFamily: THEME.font, fontWeight: isHover ? 700 : 500 }}>
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {hovered !== null && parts[hovered]?.description && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${THEME.border}`,
          fontSize: 13, color: THEME.textDim, lineHeight: 1.5,
        }}>
          <strong style={{ color: THEME.text }}>{parts[hovered].label}: </strong>
          {parts[hovered].description}
        </div>
      )}
      {parts.length === 0 && (
        <div style={{ textAlign: 'center', color: THEME.textDim, fontSize: 13, padding: 20 }}>
          No parts defined.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RENDERER: Wave
// =============================================================================

function WaveRenderer({ spec }) {
  const [amplitude, setAmplitude] = useState(spec.amplitude ?? 0.6);
  const [frequency, setFrequency] = useState(spec.frequency ?? 1);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => { setTick(t => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const waveType = spec.waveType || 'sine';

  const points = useMemo(() => {
    const N = 200;
    const pts = [];
    const livePhase = phase + (tick / 30);
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * 100;
      const t = (i / N) * Math.PI * 2 * frequency - livePhase;
      let y = 0;
      if (waveType === 'sine') y = Math.sin(t);
      else if (waveType === 'square') y = Math.sin(t) >= 0 ? 1 : -1;
      else if (waveType === 'triangle') y = (2 / Math.PI) * Math.asin(Math.sin(t));
      else if (waveType === 'sawtooth') y = 2 * ((t / (2 * Math.PI)) - Math.floor(0.5 + t / (2 * Math.PI)));
      const cy = 50 - y * amplitude * 30;
      pts.push(`${x},${cy}`);
    }
    return pts.join(' ');
  }, [amplitude, frequency, phase, tick, waveType]);

  return (
    <div>
      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        border: `1px solid ${THEME.border}`,
      }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ width: '100%', height: 240 }}>
          {[25, 50, 75].map(g => (
            <line key={g} x1="0" y1={g} x2="100" y2={g}
              stroke={THEME.border} strokeWidth="0.15" />
          ))}
          <line x1="0" y1="50" x2="100" y2="50"
            stroke={THEME.borderStrong} strokeWidth="0.25" />
          <polyline points={points}
            fill="none" stroke={THEME.accent} strokeWidth="0.8"
            style={{ filter: `drop-shadow(0 0 4px ${THEME.accent}88)` }} />
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <Slider label="Amplitude" value={amplitude} min={0.05} max={1} step={0.05}
          onChange={setAmplitude} />
        <Slider label="Frequency" value={frequency} min={0.2} max={5} step={0.1}
          onChange={setFrequency} unit=" Hz" />
        {spec.showPhase && (
          <Slider label="Phase" value={phase} min={0} max={Math.PI * 2} step={0.1}
            onChange={setPhase} />
        )}
      </div>

      <PlayControls
        isPlaying={playing}
        onPlayPause={() => setPlaying(p => !p)}
        onReset={() => { setAmplitude(spec.amplitude ?? 0.6); setFrequency(spec.frequency ?? 1); setPhase(0); setTick(0); }}
        stepLabel={`${waveType} · ${frequency.toFixed(1)} Hz`}
      />
    </div>
  );
}

// =============================================================================
// RENDERER: Graph
// =============================================================================

function GraphRenderer({ spec }) {
  const [t, setT] = useState(0);

  const series = useMemo(() => {
    if (Array.isArray(spec.series) && spec.series.length) {
      return spec.series.map(s => ({
        label: s.label || 'Series',
        color: colorFor(s.color),
        points: Array.isArray(s.points) ? s.points : [],
      }));
    }
    if (typeof spec.function === 'string') {
      const fn = makeFunction(spec.function);
      if (fn) {
        const xMin = spec.xMin ?? -5, xMax = spec.xMax ?? 5;
        const pts = [];
        for (let i = 0; i <= 100; i++) {
          const x = xMin + (xMax - xMin) * (i / 100);
          const y = fn(x, t);
          if (Number.isFinite(y)) pts.push([x, y]);
        }
        return [{ label: spec.function, color: THEME.accent, points: pts }];
      }
    }
    return [];
  }, [spec, t]);

  const allPts = series.flatMap(s => s.points);
  const xs = allPts.map(p => p[0]);
  const ys = allPts.map(p => p[1]);
  const xMin = spec.xMin ?? (xs.length ? Math.min(...xs) : 0);
  const xMax = spec.xMax ?? (xs.length ? Math.max(...xs) : 1);
  const yMin = spec.yMin ?? (ys.length ? Math.min(...ys) : -1);
  const yMax = spec.yMax ?? (ys.length ? Math.max(...ys) : 1);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const hasFn = typeof spec.function === 'string';

  return (
    <div>
      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        border: `1px solid ${THEME.border}`,
      }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ width: '100%', height: 320 }}>
          <line x1="0" y1={Math.max(0, Math.min(100, 100 - ((0 - yMin) / yRange) * 100))} x2="100"
            y2={Math.max(0, Math.min(100, 100 - ((0 - yMin) / yRange) * 100))}
            stroke={THEME.borderStrong} strokeWidth="0.3" />
          <line x1={Math.max(0, Math.min(100, ((0 - xMin) / xRange) * 100))} y1="0"
            x2={Math.max(0, Math.min(100, ((0 - xMin) / xRange) * 100))} y2="100"
            stroke={THEME.borderStrong} strokeWidth="0.3" />
          {[20, 40, 60, 80].map(g => (
            <g key={g}>
              <line x1={g} y1="0" x2={g} y2="100" stroke={THEME.border} strokeWidth="0.1" />
              <line x1="0" y1={g} x2="100" y2={g} stroke={THEME.border} strokeWidth="0.1" />
            </g>
          ))}
          {series.map((s, i) => (
            <polyline key={i} points={s.points.map((p) => {
              const x = ((p[0] - xMin) / xRange) * 100;
              const y = 100 - ((p[1] - yMin) / yRange) * 100;
              return `${x},${y}`;
            }).join(' ')}
              fill="none" stroke={s.color} strokeWidth="0.8"
              style={{ filter: `drop-shadow(0 0 3px ${s.color}66)` }}
            />
          ))}
        </svg>
      </div>
      {(spec.xLabel || spec.yLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: THEME.textDim }}>{spec.xLabel || ''}</span>
          <span style={{ fontSize: 11, color: THEME.textDim }}>{spec.yLabel || ''}</span>
        </div>
      )}
      {series.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {series.map((s, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 999,
              fontSize: 11, fontWeight: 600,
              color: s.color, background: `${s.color}22`, border: `1px solid ${s.color}55`,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color, display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {hasFn && (
        <div style={{ marginTop: 12 }}>
          <Slider label="t" value={t} min={0} max={10} step={0.1} onChange={setT} />
        </div>
      )}
    </div>
  );
}

function makeFunction(expr) {
  try {
    if (!/^[\sa-zA-Z0-9_().,+\-*/^]+$/.test(expr)) return null;
    const safe = expr
      .replace(/\^/g, '**')
      .replace(/\b(sin|cos|tan|sqrt|abs|log|exp|pow|min|max|floor|ceil|round)\b/g, 'Math.$1')
      .replace(/\bpi\b/g, 'Math.PI')
      .replace(/\be\b/g, 'Math.E');
    // eslint-disable-next-line no-new-func
    return new Function('x', 't', `return (${safe});`);
  } catch (_) {
    return null;
  }
}

// =============================================================================
// RENDERER: Timeline
// =============================================================================

function TimelineRenderer({ spec }) {
  const events = Array.isArray(spec.events) ? spec.events : [];
  const [selected, setSelected] = useState(0);

  if (events.length === 0) {
    return <FallbackRenderer spec={spec} note="No events provided." />;
  }

  return (
    <div>
      <div style={{ position: 'relative', padding: '24px 0 30px' }}>
        <div style={{
          position: 'absolute',
          top: 32, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${PALETTE.indigo}, ${PALETTE.violet}, ${PALETTE.pink})`,
          borderRadius: 3,
          boxShadow: `0 0 20px ${PALETTE.violet}66`,
        }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          position: 'relative', gap: 8,
        }}>
          {events.map((e, i) => {
            const isSel = i === selected;
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => setSelected(i)}>
                <div style={{
                  width: isSel ? 18 : 12, height: isSel ? 18 : 12,
                  borderRadius: '50%',
                  background: isSel ? PALETTE.pink : PALETTE.indigo,
                  border: '3px solid #0b1224',
                  margin: '0 auto',
                  boxShadow: isSel ? `0 0 16px ${PALETTE.pink}` : `0 0 6px ${PALETTE.indigo}88`,
                  transition: 'all 220ms',
                  position: 'relative', top: 2,
                }} />
                <div style={{
                  fontSize: 10, color: THEME.textDim, marginTop: 8,
                  fontFamily: THEME.mono,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{e.date}</div>
              </div>
            );
          })}
        </div>
      </div>
      {events[selected] && (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${THEME.border}`,
          marginTop: 8,
        }}>
          <div style={{
            fontSize: 11, color: PALETTE.pink, fontFamily: THEME.mono,
            marginBottom: 4, fontWeight: 700,
          }}>{events[selected].date}</div>
          <div style={{
            fontSize: 14, color: THEME.text, fontWeight: 600,
            marginBottom: 4,
          }}>{events[selected].label}</div>
          {events[selected].description && (
            <div style={{ fontSize: 12, color: THEME.textDim, lineHeight: 1.5 }}>
              {events[selected].description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RENDERER: Comparison
// =============================================================================

function ComparisonRenderer({ spec }) {
  const columns = Array.isArray(spec.columns) ? spec.columns : [];
  if (columns.length === 0) return <FallbackRenderer spec={spec} note="No columns provided." />;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
      gap: 10,
    }}>
      {columns.map((col, i) => {
        const c = colorFor(col.color) || [PALETTE.indigo, PALETTE.pink, PALETTE.teal, PALETTE.amber][i % 4];
        return (
          <div key={i} style={{
            borderRadius: 12, overflow: 'hidden',
            border: `1px solid ${c}55`,
            background: `${c}0d`,
          }}>
            <div style={{
              padding: '12px',
              background: `linear-gradient(180deg, ${c}33 0%, ${c}11 100%)`,
              borderBottom: `1px solid ${c}55`,
              fontSize: 13, fontWeight: 700, color: c,
              textAlign: 'center',
              letterSpacing: '0.02em',
            }}>{col.label}</div>
            <div style={{ padding: '8px 12px' }}>
              {(col.items || []).map((it, j) => (
                <div key={j} style={{
                  fontSize: 12, color: THEME.text,
                  padding: '7px 0',
                  borderBottom: j < (col.items?.length || 0) - 1 ? `1px solid ${THEME.border}` : 'none',
                  lineHeight: 1.45,
                }}>{typeof it === 'string' ? it : it.text}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// RENDERER: Equation
// =============================================================================

function EquationRenderer({ spec }) {
  const variables = Array.isArray(spec.variables) ? spec.variables : [];
  const [vals, setVals] = useState(() => {
    const v = {};
    variables.forEach(vr => { v[vr.name] = vr.initial ?? ((vr.min + vr.max) / 2); });
    return v;
  });

  const result = useMemo(() => {
    if (typeof spec.compute !== 'string') return null;
    try {
      const safe = spec.compute
        .replace(/\^/g, '**')
        .replace(/\b(sin|cos|tan|sqrt|abs|log|exp|pow|min|max|floor|ceil|round)\b/g, 'Math.$1')
        .replace(/\bpi\b/g, 'Math.PI');
      // eslint-disable-next-line no-new-func
      const fn = new Function(...variables.map(v => v.name), `return (${safe});`);
      const r = fn(...variables.map(v => vals[v.name]));
      return Number.isFinite(r) ? r : null;
    } catch (_) {
      return null;
    }
  }, [spec.compute, variables, vals]);

  return (
    <div>
      <div style={{
        padding: '24px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(129,140,248,0.1) 0%, rgba(139,92,246,0.05) 100%)',
        border: `1px solid ${THEME.accent}33`,
        textAlign: 'center',
        marginBottom: 16,
        fontFamily: THEME.mono,
      }}>
        <div style={{
          fontSize: 22, color: THEME.text, fontWeight: 600,
          marginBottom: result !== null ? 8 : 0,
        }}>{spec.equation || 'Equation'}</div>
        {result !== null && (
          <div style={{ fontSize: 13, color: THEME.textDim }}>
            = <span style={{
              color: PALETTE.green, fontWeight: 700, fontSize: 18,
              textShadow: `0 0 12px ${PALETTE.green}66`,
            }}>
              {result.toFixed(3)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {variables.map((v, i) => (
          <Slider key={i}
            label={v.name} value={vals[v.name]}
            min={v.min} max={v.max} step={v.step || 0.1}
            onChange={(nv) => setVals(s => ({ ...s, [v.name]: nv }))}
            unit={v.unit}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// RENDERER: Fallback (sleek info card — NEVER a broken empty box)
// =============================================================================

function FallbackRenderer({ spec, note }) {
  return (
    <div style={{
      padding: '32px 20px',
      borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(129,140,248,0.08) 0%, rgba(139,92,246,0.04) 100%)',
      border: `1px solid ${THEME.accent}33`,
      textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `linear-gradient(135deg, ${THEME.accent} 0%, ${PALETTE.violet} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
        boxShadow: `0 8px 24px ${THEME.accent}44`,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="#0b1224" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
        </svg>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 600, color: THEME.text,
        marginBottom: 6,
      }}>{spec.title && spec.title !== 'Visual Demo' ? spec.title : 'Visual ready'}</div>
      <div style={{
        fontSize: 12, color: THEME.textDim,
        maxWidth: 360, margin: '0 auto', lineHeight: 1.5,
      }}>
        {note || 'This topic would benefit from a custom diagram. Ask for one — e.g. "draw the water cycle" or "diagram how a transistor works".'}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const RENDERERS = {
  html: IframeRenderer,
  svg: SvgRenderer,
  flowchart: FlowchartRenderer,
  cycle: CycleRenderer,
  process: ProcessRenderer,
  circuit: CircuitRenderer,
  anatomy: AnatomyRenderer,
  wave: WaveRenderer,
  graph: GraphRenderer,
  timeline: TimelineRenderer,
  comparison: ComparisonRenderer,
  equation: EquationRenderer,
  diagram: FlowchartRenderer, // diagram reuses flowchart renderer
  fallback: FallbackRenderer,
};

export default function VisualDemo({ spec }) {
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const Renderer = RENDERERS[parsed.type] || FallbackRenderer;

  return (
    <Card
      title={parsed.title || 'Visual Demo'}
      subtitle={parsed.subtitle}
      caption={parsed.caption}
      type={parsed.type === 'fallback' ? null : parsed.type}
    >
      <Renderer spec={parsed} />
    </Card>
  );
}
