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
// Supported spec types (the AI picks one based on the user's question):
//   flowchart | cycle | process | circuit | anatomy | wave | graph |
//   timeline | comparison | equation | diagram
//
// If the spec fails to parse or the type is unknown, a styled fallback card
// is rendered instead — NEVER raw text.
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// =============================================================================
// CONSTANTS
// =============================================================================

// Stored at the start of a chat message to mark it as a visual demo.
// The component receives `spec` = message text with this prefix stripped.
export const VISUAL_DEMO_MARKER = '\u0001VISUAL_DEMO\u0001';

// Instructions appended to the AI's system prompt so it knows how + when
// to emit a VISUAL_DEMO. The format the AI must produce:
//
//   VISUAL_DEMO:
//   { "type": "...", "title": "...", "caption": "...", ... }
//
// `parseVisualDemoTrigger` extracts the JSON. The marker above is what gets
// stored in the chat history (not what the AI emits).
export const VISUAL_DEMO_PROMPT = `
──────────────────────────────────────
VISUAL_DEMO — INTERACTIVE TEACHING WIDGET
──────────────────────────────────────
When the user asks "how does X work", "explain/diagram/show me", or any
mechanism / process / cycle / circuit / anatomy / waveform / graph / timeline
question, respond with a normal short text intro (1–3 sentences), THEN emit
this exact command on its OWN LINE, followed by a JSON spec on the next line(s):

VISUAL_DEMO:
{"type":"<one>","title":"<short>","caption":"<one-line takeaway>","steps":[...]}

NEVER narrate "Let me make a diagram" — just produce the spec silently.
NEVER wrap the JSON in markdown code fences.
NEVER emit raw SVG, mermaid, ascii art, or arrow diagrams.
The JSON must be valid (double quotes, no trailing commas, no comments).

Choose "type" by topic:
  • flowchart  — boxes + arrows (decision tree, algorithm, classification)
  • cycle      — circular process that repeats (water cycle, carbon cycle, Krebs)
  • process    — linear step-by-step (photosynthesis, mitosis, recipe, ML pipeline)
  • circuit    — battery + wires + components (Faraday, Ohm's law, simple bulb circuit)
  • anatomy    — labeled parts on a diagram (cell, heart, atom, solar system)
  • wave       — animated waveform (sine/sound/light, interference, AC)
  • graph      — plot of data or function (supply/demand, distance/time, parabola)
  • timeline   — events on a line (history, geological eras, project plan)
  • comparison — side-by-side columns (mitosis vs meiosis, AC vs DC, prokaryote vs eukaryote)
  • equation   — math/physics equation with sliders (E=mc², F=ma, PV=nRT)
  • diagram    — generic freeform SVG parts (anything that doesn't fit above)

Field reference per type (all optional unless noted):

  ALL TYPES:
    title (required, short string)
    caption (required, one sentence takeaway shown under the visual)
    subtitle (optional)

  flowchart / cycle / diagram:
    nodes: [{id, label, color?}]            // color is a hex or palette name
    edges: [{from, to, label?}]             // for "cycle", last node auto-loops to first

  process:
    steps: [{label, description}]           // ordered, linear, Play button advances

  circuit:
    components: [{id, type, x1, y1, x2, y2, label?, value?}]
      type ∈ "battery" | "resistor" | "wire" | "bulb" | "switch" | "motor" |
             "galvanometer" | "coil" | "magnet" | "capacitor" | "ammeter"
    animateCurrent: true                    // shows flowing dots along wires
    note: optional extra caption shown under the circuit

  anatomy:
    parts: [{label, x, y, description?, color?}]  // x,y are 0–100 (% of canvas)
    imageUrl: optional background URL (omit for a clean labeled-card layout)

  wave:
    waveType: "sine" | "square" | "triangle" | "sawtooth"
    amplitude: 0–1 (default 0.6)
    frequency: Hz shown to user (default 1)
    showPhase: true to add a phase slider

  graph:
    series: [{label, color, points: [[x,y],[x,y],...]}]
    xLabel, yLabel, xMin, xMax, yMin, yMax
    function: "sin(x)" | "x^2" | "2*x+1" | etc.  (alternative to series)

  timeline:
    events: [{date, label, description?}]

  comparison:
    columns: [{label, color?, items: [string, ...]}]

  equation:
    equation: "E = m * c^2"                  // human-readable
    variables: [{name, min, max, initial, step, unit?}]
    compute: "<JS expression using variable names>"   // returns number to display

Keep specs small (under 30 nodes / 6 steps / 4 series). Pick colors from
this palette when possible:
  indigo #6366f1, violet #8b5cf6, pink #ec4899, rose #f43f5e,
  orange #f97316, amber #f59e0b, green #10b981, teal #14b8a6,
  cyan #06b6d4, blue #3b82f6, red #ef4444, slate #64748b
`;

// =============================================================================
// SPEC PARSER
// =============================================================================

/**
 * Extract the visual spec string from the AI's raw response.
 * Returns the spec string (everything after "VISUAL_DEMO:") or null.
 *
 * Accepts either:
 *   VISUAL_DEMO:\n{...json...}
 *   VISUAL_DEMO: {...json...}
 *   VISUAL_DEMO:{...json...}
 *
 * If the AI accidentally wrapped the JSON in ```json fences, those are stripped.
 * If the AI emitted an SVG instead, the SVG string is returned as the spec.
 */
export function parseVisualDemoTrigger(text) {
  if (!text || typeof text !== 'string') return null;

  // Match "VISUAL_DEMO:" optionally followed by whitespace/newline, then capture
  // everything up to the end. We tolerate mixed case.
  const headerMatch = text.match(/VISUAL_DEMO\s*:\s*([\s\S]+)/i);
  if (!headerMatch) return null;

  let raw = headerMatch[1].trim();

  // Strip markdown code fences if the AI wrapped the spec.
  raw = raw
    .replace(/^```(?:json|js|javascript)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // If there's trailing conversational text after the JSON, try to trim it.
  // Strategy: find the first '{' and try to balance braces.
  if (raw.startsWith('{')) {
    const balanced = extractBalancedJSON(raw);
    if (balanced) raw = balanced;
  }

  return raw.length > 0 ? raw : null;
}

/**
 * Walk the string from the first '{' and return the substring that closes
 * the top-level object. Handles strings, escapes, and nested objects/arrays.
 * Returns null if no balanced object is found.
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

  // Case 1: pure JSON object.
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') return normalizeSpec(obj, trimmed);
    } catch (_) { /* fall through */ }

    // Try the balanced extraction in case trailing prose broke JSON.parse.
    const balanced = extractBalancedJSON(trimmed);
    if (balanced && balanced !== trimmed) {
      try {
        const obj = JSON.parse(balanced);
        if (obj && typeof obj === 'object') return normalizeSpec(obj, balanced);
      } catch (_) { /* fall through */ }
    }
  }

  // Case 2: SVG payload (the old format some prompts produced).
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

  // Case 3: try to find ANY embedded JSON object.
  const anyJson = extractBalancedJSON(trimmed);
  if (anyJson) {
    try {
      const obj = JSON.parse(anyJson);
      if (obj && typeof obj === 'object') return normalizeSpec(obj, trimmed);
    } catch (_) { /* fall through */ }
  }

  // Case 4: last-resort fallback. Use the first line as a title.
  const firstLine = cleanupText(trimmed.split(/\r?\n/)[0]).slice(0, 80);
  return {
    type: 'fallback',
    title: firstLine || 'Visual Demo',
    caption: '',
    raw: trimmed,
  };
}

function normalizeSpec(obj, raw) {
  const out = { ...obj };
  out.raw = raw;
  if (!out.type) out.type = 'fallback';
  if (!out.title) out.title = 'Visual Demo';
  if (!out.caption) out.caption = '';
  // Defensive: strip any leaked "VISUAL_DEMO:" prefix or markdown fences
  // from user-visible fields, in case the spec was passed without going
  // through parseVisualDemoTrigger.
  out.title = cleanupText(out.title);
  if (out.subtitle) out.subtitle = cleanupText(out.subtitle);
  if (out.caption) out.caption = cleanupText(out.caption);
  return out;
}

function cleanupText(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/^VISUAL_DEMO\s*:\s*/i, '')
    .replace(/^```(?:json|js|javascript)?\s*/i, '')
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
  bg: '#0f172a',
  bgGrad: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
  cardBg: 'rgba(15, 23, 42, 0.92)',
  border: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',
  text: '#f1f5f9',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  accent: '#818cf8',
  accentDim: 'rgba(129, 140, 248, 0.16)',
  success: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto',
          'Helvetica Neue', Arial, sans-serif`,
  mono: `'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas,
          'Liberation Mono', monospace`,
};

function Card({ title, subtitle, caption, children, rightHeader, footer }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: 720,
      margin: '12px auto',
      borderRadius: 16,
      background: THEME.bgGrad,
      border: `1px solid ${THEME.border}`,
      boxShadow: '0 18px 50px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
      overflow: 'hidden',
      fontFamily: THEME.font,
      color: THEME.text,
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: 8,
          background: THEME.accent,
          boxShadow: `0 0 12px ${THEME.accent}`,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: 11, color: THEME.textDim, marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</div>
          )}
        </div>
        {rightHeader}
      </div>

      <div style={{ padding: '18px' }}>
        {children}
      </div>

      {caption && (
        <div style={{
          padding: '10px 18px 14px',
          fontSize: 13,
          color: THEME.textDim,
          lineHeight: 1.5,
          borderTop: `1px solid ${THEME.border}`,
          background: 'rgba(0,0,0,0.18)',
        }}>
          {caption}
        </div>
      )}

      {footer}
    </div>
  );
}

function Pill({ children, color }) {
  const c = colorFor(color);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.02em',
      color: c,
      background: `${c}22`,
      border: `1px solid ${c}55`,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, kind = 'default', disabled }) {
  const base = {
    padding: '7px 14px',
    borderRadius: 8,
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
      background: THEME.accent,
      color: '#0f172a',
      border: `1px solid ${THEME.accent}`,
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

/** Triangle icon for Play button. */
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

/**
 * Standard Play / Pause / Step / Reset control bar shared by animated widgets.
 * Props: isPlaying, onPlayPause, onStep, onReset, stepLabel, total, current
 */
function PlayControls({ isPlaying, onPlayPause, onStep, onReset, stepLabel, current, total }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 0 0', marginTop: 12,
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

/**
 * Slider used by equation / wave / graph widgets.
 */
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
// RENDERER: Flowchart (also used for "diagram" type)
// =============================================================================

function FlowchartRenderer({ spec }) {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];

  // Layout: if nodes have explicit x/y (0–100), use them. Otherwise auto-grid.
  const positioned = useMemo(() => {
    if (nodes.length === 0) return [];
    const hasExplicit = nodes.some(n => typeof n.x === 'number' && typeof n.y === 'number');
    if (hasExplicit) {
      return nodes.map(n => ({ ...n, x: n.x ?? 50, y: n.y ?? 50 }));
    }
    // Auto layout: try to do levels based on edges (topological-ish).
    // If no edges, just grid.
    if (edges.length === 0) {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      return nodes.map((n, i) => ({
        ...n,
        x: ((i % cols) + 0.5) * (100 / cols),
        y: (Math.floor(i / cols) + 0.5) * (100 / Math.ceil(nodes.length / cols)),
      }));
    }
    // Compute in-degree, do BFS levels.
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
    // Place unvisited at level 0.
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
    <div style={{ width: '100%' }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ width: '100%', height: 360, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
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
          // Bezier from a to b in 0–100 coordinate space.
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
                  style={{ fontFamily: THEME.font }}>
                  {e.label}
                </text>
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
// RENDERER: Cycle (circular flowchart with auto-loop)
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

  // Build edge list: explicit edges first, then auto-loop from last to first.
  const allEdges = useMemo(() => {
    const list = [...edges];
    if (nodes.length > 1) {
      list.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id, _auto: true });
    }
    return list;
  }, [edges, nodes]);

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 380, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
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
          // Curved arrow between two points on the circle.
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          // bend outward
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
// RENDERER: Process (linear step-by-step with Play)
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
                color: done ? '#0f172a' : THEME.textDim,
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
// RENDERER: Circuit (battery + wires + components, animated current)
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

  // Determine if there's a complete loop by checking if any wire path connects
  // back to a battery. For visual purposes we just animate all "wire" segments.
  const wires = components.filter(c => (c.type || 'wire').toLowerCase() === 'wire');
  const hasBattery = components.some(c => (c.type || '').toLowerCase() === 'battery');
  const animateCurrent = spec.animateCurrent !== false && hasBattery;

  return (
    <div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 300, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
        <defs>
          <linearGradient id="vd-wire-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={THEME.accent} stopOpacity="0.2" />
            <stop offset="50%" stopColor={THEME.accent} stopOpacity="1" />
            <stop offset="100%" stopColor={THEME.accent} stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Draw wires first (background) */}
        {wires.map((w, i) => (
          <line key={`w-${i}`}
            x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
            stroke="#475569" strokeWidth="1.2" strokeLinecap="round"
          />
        ))}

        {/* Animated current dots */}
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

        {/* Draw non-wire components */}
        {components.filter(c => (c.type || 'wire').toLowerCase() !== 'wire').map((c, i) => (
          <CircuitComponent key={`c-${i}`} c={c} tick={tick} animate={animateCurrent} />
        ))}
      </svg>

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
    // Long line + short line
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
    // Series of arcs to look like a coil.
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
    // Bar magnet: red N + blue S
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
    // Circle with a needle that wiggles if current is flowing.
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
// RENDERER: Anatomy (labeled parts)
// =============================================================================

function AnatomyRenderer({ spec }) {
  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 380, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
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
      {hovered !== null && parts[hovered]?.description && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${THEME.border}`,
          fontSize: 12, color: THEME.textDim, lineHeight: 1.5,
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
// RENDERER: Wave (animated waveform)
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
    const loop = () => {
      setTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    };
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
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ width: '100%', height: 240, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
        {/* grid */}
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
// RENDERER: Graph (line chart, possibly animated by a slider variable)
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
    // If a function string was provided, sample it.
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

  const toPath = (pts) => pts.map((p, i) => {
    const x = ((p[0] - xMin) / xRange) * 100;
    const y = 100 - ((p[1] - yMin) / yRange) * 100;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const hasFn = typeof spec.function === 'string';

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ width: '100%', height: 320, background: 'rgba(0,0,0,0.25)', borderRadius: 10 }}>
        {/* axes */}
        <line x1="0" y1={Math.max(0, Math.min(100, 100 - ((0 - yMin) / yRange) * 100))} x2="100"
          y2={Math.max(0, Math.min(100, 100 - ((0 - yMin) / yRange) * 100))}
          stroke={THEME.borderStrong} strokeWidth="0.3" />
        <line x1={Math.max(0, Math.min(100, ((0 - xMin) / xRange) * 100))} y1="0"
          x2={Math.max(0, Math.min(100, ((0 - xMin) / xRange) * 100))} y2="100"
          stroke={THEME.borderStrong} strokeWidth="0.3" />
        {/* grid */}
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
      {(spec.xLabel || spec.yLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: THEME.textDim }}>{spec.xLabel || ''}</span>
          <span style={{ fontSize: 11, color: THEME.textDim }}>{spec.yLabel || ''}</span>
        </div>
      )}
      {series.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {series.map((s, i) => (
            <Pill key={i} color={s.color === THEME.accent ? 'indigo' : undefined}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: s.color, display: 'inline-block' }} />
              {s.label}
            </Pill>
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

/**
 * Compile a small math expression string into a function of (x, t).
 * Supports + - * / ^ and Math.* functions, plus sin/cos without prefix.
 * Returns null if it fails.
 */
function makeFunction(expr) {
  try {
    // Sanitize: only allow a safe subset.
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
      <div style={{ position: 'relative', padding: '20px 0 30px' }}>
        <div style={{
          position: 'absolute',
          top: 28, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${PALETTE.indigo}, ${PALETTE.violet}, ${PALETTE.pink})`,
          borderRadius: 2,
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
                  width: isSel ? 16 : 10, height: isSel ? 16 : 10,
                  borderRadius: '50%',
                  background: isSel ? PALETTE.pink : PALETTE.indigo,
                  border: '2px solid #0f172a',
                  margin: '0 auto',
                  boxShadow: isSel ? `0 0 12px ${PALETTE.pink}` : 'none',
                  transition: 'all 200ms',
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
// RENDERER: Comparison (side-by-side columns)
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
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${c}55`,
            background: `${c}0d`,
          }}>
            <div style={{
              padding: '10px 12px',
              background: `${c}22`,
              borderBottom: `1px solid ${c}55`,
              fontSize: 13, fontWeight: 700, color: c,
              textAlign: 'center',
            }}>{col.label}</div>
            <div style={{ padding: '8px 12px' }}>
              {(col.items || []).map((it, j) => (
                <div key={j} style={{
                  fontSize: 12, color: THEME.text,
                  padding: '6px 0',
                  borderBottom: j < (col.items?.length || 0) - 1 ? `1px solid ${THEME.border}` : 'none',
                  lineHeight: 1.4,
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
// RENDERER: Equation (interactive math with sliders)
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
        padding: '20px 16px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${THEME.border}`,
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
            = <span style={{ color: PALETTE.green, fontWeight: 700, fontSize: 18 }}>
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
// RENDERER: SVG passthrough (for old-style specs that shipped raw SVG)
// =============================================================================

function SvgRenderer({ spec }) {
  return (
    <div
      style={{ width: '100%' }}
      dangerouslySetInnerHTML={{ __html: spec.svg }}
    />
  );
}

// =============================================================================
// RENDERER: Fallback (never shows raw text — a styled "couldn't parse" card)
// =============================================================================

function FallbackRenderer({ spec, note }) {
  // If the "title" looks like raw JSON or code, don't dump it on screen.
  const looksLikeCode = (spec.title || '').startsWith('{') ||
                        (spec.title || '').startsWith('<') ||
                        (spec.title || '').length > 60;
  const displayTitle = looksLikeCode ? 'Visual Demo' : spec.title;
  return (
    <div style={{
      padding: '20px',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: `1px dashed ${THEME.borderStrong}`,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 28, marginBottom: 8,
        opacity: 0.5, letterSpacing: '0.1em', textTransform: 'lowercase',
        fontFamily: THEME.mono, color: THEME.textDim,
      }}>visual demo</div>
      <div style={{
        fontSize: 13, color: THEME.textDim, marginBottom: 6,
      }}>{note || 'This visual could not be rendered.'}</div>
      {displayTitle && displayTitle !== 'Visual Demo' && (
        <div style={{
          fontSize: 11, color: THEME.textMuted, fontFamily: THEME.mono,
          maxWidth: 400, margin: '0 auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 60, overflow: 'auto',
        }}>
          {displayTitle}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const RENDERERS = {
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
  svg: SvgRenderer,
  fallback: FallbackRenderer,
};

export default function VisualDemo({ spec }) {
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const Renderer = RENDERERS[parsed.type] || FallbackRenderer;

  const typeLabel = parsed.type === 'fallback' ? null : (
    <Pill color="indigo">{parsed.type}</Pill>
  );

  return (
    <Card
      title={parsed.title || 'Visual Demo'}
      subtitle={parsed.subtitle}
      caption={parsed.caption}
      rightHeader={typeLabel}
    >
      <Renderer spec={parsed} />
    </Card>
  );
}
