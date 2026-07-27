import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, X } from 'lucide-react';

/* ============================================================
   VisualDemo.jsx
   ------------------------------------------------------------
   A GENERIC interactive animated diagram component + everything
   needed to wire it into your AI chat pipeline (Vortis App.jsx).

   Exports:
   1. VisualDemo            - the React component that renders a spec
   2. EXAMPLE_EMI_SPEC       - reference example spec (EMI induction)
   3. VISUAL_DEMO_PROMPT     - paste into your `sys` prompt in getAI
   4. VISUAL_DEMO_MARKER     - the marker prefix used in message text
   5. parseVisualDemoTrigger - detects + extracts the AI's output

   ---- HOW TO WIRE IT IN (3 steps in App.jsx) ----------------

   Step 1 - import at the top:
     import VisualDemo, { VISUAL_DEMO_PROMPT, VISUAL_DEMO_MARKER, parseVisualDemoTrigger } from './VisualDemo';

   Step 2 - inside MsgContent, add this check (next to __IMG_B64__):
     if (t.startsWith(VISUAL_DEMO_MARKER)) {
       return <VisualDemo spec={t.slice(VISUAL_DEMO_MARKER.length)} />;
     }

   Step 3 - inside getAI(), two places:
     a) Append VISUAL_DEMO_PROMPT to your `sys` string:
          sys += VISUAL_DEMO_PROMPT;

     b) After your existing genMatch / searchMatch checks, add:
          const visualSpec = parseVisualDemoTrigger(cleaned);
          if (visualSpec) {
            if (convHistory.current.length > 0) {
              convHistory.current[convHistory.current.length - 1] =
                { role: 'assistant', content: '[Rendered an interactive diagram]' };
            }
            addMsg('vortis', `${VISUAL_DEMO_MARKER}${visualSpec}`, false);
            setIsProcessing(false);
            return;
          }

   That's the whole integration - no other files, no registry needed.
   ============================================================ */

export const VISUAL_DEMO_MARKER = '__VISUAL_DEMO__';

export const VISUAL_DEMO_PROMPT = `

--------------------------------------
VISUAL_DEMO: <JSON spec on one line>
--------------------------------------
-> Use when explaining something with real visual/spatial structure: physics
   demos (EMI induction, pendulums, circuits, waves, projectile motion),
   mechanisms, cycles, or step-by-step spatial processes - where an animated
   diagram would teach it better than text alone.
-> Output ONLY: VISUAL_DEMO: {...valid JSON...} - one line, nothing else,
   no markdown fences, no explanation on that line.
-> JSON schema:
  {
    "title": string,
    "viewBox": "0 0 400 220",
    "duration": 2000-4000,
    "captions": [{"from":0,"to":0.5,"text":"..."}, ...],
    "elements": [
      { "type":"rect"|"circle"|"ellipse"|"line"|"path"|"text"|"group",
        "x","y","w","h","cx","cy","r","rx","ry","x1","y1","x2","y2","d","text",
        "fill","stroke","strokeWidth","fontSize","anchor",
        "children": [...],
        "animate": [
          { "prop":"x"|"y"|"rotate"|"opacity"|"scale",
            "keyframes":[{"t":0,"v":0},{"t":0.5,"v":50},{"t":1,"v":0}] }
        ]
      }
    ]
  }
-> Keep it simple: 5-15 elements is usually enough. Use "group" to move
   multiple shapes together.
-> Never explain the JSON to the user - it renders as a diagram, not text.
-> If nothing in the conversation calls for a visual, don't use this command.
`;

export const parseVisualDemoTrigger = (cleanedText) => {
  const m = cleanedText.match(/^VISUAL_DEMO:\s*(\{[\s\S]*\})\s*$/m);
  return m ? m[1] : null;
};

/* ==================== rendering engine ==================== */

const DEFAULT_VIEWBOX = '0 0 400 220';
const DEFAULT_DURATION = 2600;

const lerp = (a, b, f) => a + (b - a) * f;

const evalProp = (keyframes, t) => {
  if (!keyframes || keyframes.length === 0) return null;
  const kf = [...keyframes].sort((a, b) => a.t - b.t);
  if (t <= kf[0].t) return kf[0].v;
  if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].v;
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return lerp(a.v, b.v, f);
    }
  }
  return kf[kf.length - 1].v;
};

const buildTransform = (el, t) => {
  if (!el.animate || el.animate.length === 0) return {};
  let x = 0, y = 0, rotate = 0, scale = 1, opacity = null;
  for (const a of el.animate) {
    const val = evalProp(a.keyframes, t);
    if (val == null) continue;
    if (a.prop === 'x') x = val;
    else if (a.prop === 'y') y = val;
    else if (a.prop === 'rotate') rotate = val;
    else if (a.prop === 'scale') scale = val;
    else if (a.prop === 'opacity') opacity = val;
  }
  const originX = el.cx ?? el.x ?? 0;
  const originY = el.cy ?? el.y ?? 0;
  return {
    transform: `translate(${x}px,${y}px) rotate(${rotate}deg) scale(${scale})`,
    transformOrigin: `${originX}px ${originY}px`,
    opacity: opacity != null ? opacity : undefined,
  };
};

const renderElement = (el, t, keyPrefix) => {
  const key = el.id || keyPrefix;
  const wrapStyle = buildTransform(el, t);
  const needsWrap = el.animate && el.animate.length > 0;

  let node;
  switch (el.type) {
    case 'rect':
      node = <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx || 0}
        fill={el.fill || 'none'} stroke={el.stroke || 'none'} strokeWidth={el.strokeWidth || 0} />;
      break;
    case 'circle':
      node = <circle cx={el.cx} cy={el.cy} r={el.r}
        fill={el.fill || 'none'} stroke={el.stroke || 'none'} strokeWidth={el.strokeWidth || 0} />;
      break;
    case 'ellipse':
      node = <ellipse cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry}
        fill={el.fill || 'none'} stroke={el.stroke || 'none'} strokeWidth={el.strokeWidth || 0} />;
      break;
    case 'line':
      node = <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
        stroke={el.stroke || '#888'} strokeWidth={el.strokeWidth || 1.5}
        strokeDasharray={el.dash || undefined} strokeLinecap="round" />;
      break;
    case 'path':
      node = <path d={el.d} fill={el.fill || 'none'} stroke={el.stroke || 'none'} strokeWidth={el.strokeWidth || 0} />;
      break;
    case 'text':
      node = <text x={el.x} y={el.y} textAnchor={el.anchor || 'middle'}
        fontSize={el.fontSize || 12} fontWeight={el.fontWeight || 400}
        fill={el.fill || '#e8e8f8'}
        fontFamily={el.mono ? "'JetBrains Mono',monospace" : "'Inter',sans-serif"}>
        {el.text}
      </text>;
      break;
    case 'group':
      node = <g>{(el.children || []).map((c, i) => renderElement(c, t, `${key}_${i}`))}</g>;
      break;
    default:
      node = null;
  }

  if (!needsWrap) return <g key={key}>{node}</g>;
  return <g key={key} style={wrapStyle}>{node}</g>;
};

const parseSpec = (spec) => {
  if (!spec) return null;
  if (typeof spec === 'object') return spec;
  try { return JSON.parse(spec); } catch (_) { return null; }
};

export default function VisualDemo({ spec, onClose }) {
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const pausedAtRef = useRef(0);

  const duration = parsed?.duration || DEFAULT_DURATION;

  const tick = useCallback((now) => {
    if (startRef.current == null) startRef.current = now - pausedAtRef.current;
    const elapsed = now - startRef.current;
    setT((elapsed % duration) / duration);
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  useEffect(() => {
    if (playing && parsed) rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick, parsed]);

  const togglePlay = () => {
    if (playing) {
      pausedAtRef.current = (startRef.current != null) ? (performance.now() - startRef.current) % duration : 0;
      cancelAnimationFrame(rafRef.current);
    } else {
      startRef.current = null;
    }
    setPlaying(p => !p);
  };

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    pausedAtRef.current = 0;
    setT(0);
    setPlaying(true);
  };

  const c = {
    bg: 'var(--bg2, #111120)',
    bg3: 'var(--bg3, #16162a)',
    border: 'var(--border, #1e1e35)',
    border2: 'var(--border2, #2a2a4a)',
    text1: 'var(--text1, #e8e8f8)',
    text2: 'var(--text2, #9090b0)',
    text3: 'var(--text3, #555575)',
    indigo: 'var(--indigo, #6366f1)',
  };

  if (!parsed) {
    return (
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${c.border2}`, background: c.bg, color: c.text2, fontSize: 12.5 }}>
        Couldn't render this diagram - invalid spec.
      </div>
    );
  }

  const activeCaption = (() => {
    if (parsed.captions?.length) {
      const hit = parsed.captions.find(seg => t >= seg.from && t < seg.to);
      if (hit) return hit.text;
    }
    return parsed.caption || '';
  })();

  return (
    <div style={{
      margin: '8px 0', maxWidth: 560, width: '100%',
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${c.border2}`, background: c.bg,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: `1px solid ${c.border}`, background: c.bg3,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.indigo, letterSpacing: '.06em', fontFamily: 'monospace' }}>
          {(parsed.title || 'INTERACTIVE DIAGRAM').toUpperCase()}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={reset} title="Reset" style={iconBtn(c)}><RotateCcw size={12} /></button>
          {onClose && <button onClick={onClose} title="Close" style={iconBtn(c)}><X size={12} /></button>}
        </div>
      </div>

      <div style={{ position: 'relative', height: 220, background: '#07070f', overflow: 'hidden' }}>
        <svg viewBox={parsed.viewBox || DEFAULT_VIEWBOX} width="100%" height="100%" style={{ display: 'block' }}>
          {(parsed.elements || []).map((el, i) => renderElement(el, t, `el_${i}`))}
        </svg>
      </div>

      {activeCaption && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${c.border}`, textAlign: 'center' }}>
          <span style={{ fontSize: 12.5, color: c.text2 }}>{activeCaption}</span>
        </div>
      )}

      <div style={{ display: 'flex', borderTop: `1px solid ${c.border}` }}>
        <button onClick={togglePlay} style={controlBtn(c, true)}>
          {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
        </button>
        <button onClick={reset} style={controlBtn(c, false)}>
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </div>
  );
}

const iconBtn = (c) => ({
  width: 22, height: 22, borderRadius: 6, background: 'transparent',
  border: `1px solid ${c.border2}`, color: c.text2, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const controlBtn = (c, first) => ({
  flex: 1, padding: '10px', background: 'transparent',
  border: 'none', borderRight: first ? `1px solid ${c.border}` : 'none',
  color: c.text1, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
});

/* ---- reference example - electromagnetic induction ---- */
export const EXAMPLE_EMI_SPEC = {
  title: 'Electromagnetic Induction',
  viewBox: '0 0 400 220',
  duration: 2600,
  captions: [
    { from: 0, to: 0.5, text: 'Magnet moving in - flux increasing, current flows one way' },
    { from: 0.5, to: 1, text: 'Magnet moving out - flux decreasing, current reverses' },
  ],
  elements: [
    {
      type: 'group', id: 'coil',
      children: [-32, -16, 0, 16, 32].map((dx) => ({
        type: 'ellipse', cx: 70 + dx, cy: 110, rx: 14, ry: 46,
        fill: 'none', stroke: '#f59e0b', strokeWidth: 4,
      })).concat([{ type: 'text', x: 70, y: 188, text: 'COIL', fontSize: 11, fill: '#555575', mono: true }]),
    },
    { type: 'line', x1: 118, y1: 78, x2: 250, y2: 55, stroke: '#555575', strokeWidth: 1.5 },
    { type: 'line', x1: 118, y1: 142, x2: 250, y2: 165, stroke: '#555575', strokeWidth: 1.5 },
    {
      type: 'group', id: 'galvanometer', cx: 290, cy: 110,
      children: [
        { type: 'circle', cx: 290, cy: 110, r: 40, fill: '#16162a', stroke: '#2a2a4a', strokeWidth: 2 },
        { type: 'path', d: 'M 264 118 A 28 28 0 0 1 316 118', stroke: '#555575', strokeWidth: 2 },
        {
          type: 'line', x1: 290, y1: 110, x2: 290, y2: 84, stroke: '#10b981', strokeWidth: 2.5, id: 'needle',
          animate: [{ prop: 'rotate', keyframes: [{ t: 0, v: 0 }, { t: 0.25, v: 28 }, { t: 0.5, v: 0 }, { t: 0.75, v: -28 }, { t: 1, v: 0 }] }],
        },
        { type: 'circle', cx: 290, cy: 110, r: 3.5, fill: '#e8e8f8' },
        { type: 'text', x: 290, y: 168, text: 'GALVANOMETER', fontSize: 11, fill: '#555575', mono: true },
      ],
    },
    {
      type: 'group', id: 'magnet',
      animate: [{ prop: 'x', keyframes: [{ t: 0, v: -70 }, { t: 0.5, v: 190 }, { t: 1, v: -70 }] }],
      children: [
        { type: 'rect', x: 46, y: 94, w: 24, h: 32, rx: 3, fill: '#3b82f6' },
        { type: 'rect', x: 70, y: 94, w: 24, h: 32, rx: 3, fill: '#ef4444' },
        { type: 'text', x: 58, y: 115, text: 'S', fontSize: 13, fontWeight: 700, fill: '#fff' },
        { type: 'text', x: 82, y: 115, text: 'N', fontSize: 13, fontWeight: 700, fill: '#fff' },
      ],
    },
    { type: 'line', x1: 0, y1: 150, x2: 260, y2: 150, stroke: '#555575', strokeWidth: 1, dash: '3 4' },
  ],
};