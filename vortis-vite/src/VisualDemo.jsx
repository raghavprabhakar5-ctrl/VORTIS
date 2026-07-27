import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, X, Maximize2 } from 'lucide-react';

/* ============================================================
   VisualDemo.jsx  —  v2 (raw SVG engine)
   ------------------------------------------------------------
   Instead of a constrained JSON shape schema, the AI now writes
   REAL self-contained SVG markup (with inline <style> for CSS
   keyframe animation). This removes the ceiling entirely — the
   model can draw anything it could draw in any other SVG task:
   gradients, icons, layered compositions, precise typography.

   Exports (same names as before, so App.jsx needs no rewiring):
   1. VisualDemo            - renders the AI's raw SVG
   2. VISUAL_DEMO_PROMPT    - paste into your `sys` prompt
   3. VISUAL_DEMO_MARKER    - marker prefix used in message text
   4. parseVisualDemoTrigger - detects + extracts the AI's output

   ---- WIRING (unchanged from before) ------------------------
   Step 1:
     import VisualDemo, { VISUAL_DEMO_PROMPT, VISUAL_DEMO_MARKER, parseVisualDemoTrigger } from './VisualDemo';

   Step 2 (inside MsgContent):
     if (t.startsWith(VISUAL_DEMO_MARKER)) {
       return <VisualDemo spec={t.slice(VISUAL_DEMO_MARKER.length)} />;
     }

   Step 3 (inside getAI, after genMatch/searchMatch checks):
     const visualSpec = parseVisualDemoTrigger(cleaned);
     if (visualSpec) {
       addMsg('vortis', `${VISUAL_DEMO_MARKER}${visualSpec}`, false);
       setIsProcessing(false);
       return;
     }
   ============================================================ */

export const VISUAL_DEMO_MARKER = '__VISUAL_DEMO__';

export const VISUAL_DEMO_PROMPT = `

--------------------------------------
VISUAL_DEMO — interactive animated diagram
--------------------------------------
-> MANDATORY: if the user asks "how does X work", "explain X", "show me X",
   or asks you to diagram/illustrate/visualize something with real spatial
   or mechanical structure, you MUST use this command instead of (or in
   addition to) a text-only answer. This covers — but is not limited to:
   pendulums, EMI/induction, circuits, waves, projectile motion, orbits,
   gears, levers, pulleys, springs, oscillation, chemical reactions,
   biological cycles/processes, data structures, algorithms, architecture
   diagrams, and step-by-step mechanisms of any kind.
-> Output format — EXACTLY this, nothing else on those lines:

VISUAL_DEMO: <short title, 2-6 words>
<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg">
  ...your full SVG markup...
</svg>

-> The SVG must be a SINGLE self-contained block starting with <svg and
   ending with </svg>. Put the title on the line right after "VISUAL_DEMO:",
   then the SVG starts on the next line.
-> Use inline <style> inside the <svg> for animation via CSS @keyframes
   (preferred) — this lets Play/Pause work reliably. SMIL <animate> tags
   also work but are harder to pause/reset cleanly.
-> Theming — use these exact CSS variables so it matches the app's dark
   theme (they inherit automatically, no need to hardcode hex):
     fill/stroke: var(--indigo,#6366f1) var(--violet,#8b5cf6) var(--green,#10b981)
                  var(--amber,#f59e0b) var(--red,#ef4444) var(--cyan,#06b6d4)
                  var(--text1,#e8e8f8) var(--text2,#9090b0) var(--text3,#555575)
     background rect (if any): var(--bg3,#16162a)
-> Make it genuinely readable: label parts with <text>, use enough
   contrast, keep viewBox roughly 400-560 wide by 220-320 tall.
-> Keep the whole SVG reasonably compact (roughly under ~120 lines) —
   detailed but not bloated.
-> Never wrap the SVG in markdown code fences (no \`\`\`), never explain
   the SVG syntax to the user. You MAY add a short plain-text explanation
   AFTER the closing </svg> tag, on new lines, same as a normal answer.
-> If nothing in the conversation calls for a visual, don't use this
   command — answer normally.
`;

/**
 * Detects the VISUAL_DEMO: <title>\n<svg>...</svg> block in the AI's
 * cleaned output. Returns a JSON string {title, svg} for the marker
 * payload, or null if no valid block was found.
 */
export const parseVisualDemoTrigger = (cleanedText) => {
  if (!cleanedText) return null;
  const m = cleanedText.match(/^VISUAL_DEMO:\s*(.+?)\s*\n([\s\S]*?<svg[\s\S]*?<\/svg>)/im);
  if (!m) return null;
  const title = m[1].trim();
  let svg = m[2].trim();
  // strip accidental markdown fences if the model added them anyway
  svg = svg.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  if (!svg.startsWith('<svg')) return null;
  try {
    return JSON.stringify({ title, svg });
  } catch (_) {
    return null;
  }
};

/* Anything AFTER the </svg> block should still be shown as normal text
   by your existing displayText cleanup in App.jsx — see the regex
   addition suggested for getAI's cleanup step. */

const parseSpec = (spec) => {
  if (!spec) return null;
  if (typeof spec === 'object') return spec;
  try { return JSON.parse(spec); } catch (_) { return null; }
};

export default function VisualDemo({ spec, onClose }) {
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const [playing, setPlaying] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const containerRef = useRef(null);

  // Try to pause/unpause SMIL animations via the native SVG DOM API,
  // in addition to the CSS override class below (covers both animation
  // styles the AI might produce).
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;
    try {
      if (playing) svgEl.unpauseAnimations?.();
      else svgEl.pauseAnimations?.();
    } catch (_) {}
  }, [playing, resetKey]);

  const togglePlay = () => setPlaying((p) => !p);
  const reset = () => { setResetKey((k) => k + 1); setPlaying(true); };

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

  if (!parsed || !parsed.svg) {
    return (
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${c.border2}`, background: c.bg, color: c.text2, fontSize: 12.5 }}>
        Couldn't render this diagram — invalid or missing SVG.
      </div>
    );
  }

  return (
    <div style={{
      margin: '8px 0', maxWidth: 600, width: '100%',
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${c.border2}`, background: c.bg,
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* header */}
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

      {/* the AI's raw SVG, keyed so "Reset" fully remounts it and
          restarts any CSS keyframe animation from t=0 */}
      <div
        key={resetKey}
        ref={containerRef}
        className={playing ? '' : 'vdemo-paused'}
        style={{ position: 'relative', minHeight: 180, background: '#07070f', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}
        dangerouslySetInnerHTML={{ __html: parsed.svg }}
      />

      {/* CSS-animation pause override — works regardless of how the
          AI implemented its @keyframes, without needing it to know
          about any special class itself */}
      <style>{`
        .vdemo-paused, .vdemo-paused * {
          animation-play-state: paused !important;
        }
      `}</style>

      {/* controls */}
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