/**
 * richFormat.js — rich markdown formatting components shared by App.jsx and CodeChat.jsx
 *
 * These components let the AI produce rich, visually-distinct output without
 * needing custom syntax. The AI uses standard markdown that gets detected
 * and rendered with special styling:
 *
 *   > 📌 Info: ...                → blue callout box
 *   > 💡 Tip: ...                 → indigo callout box
 *   > ⚠️ Warning: ...             → amber callout box
 *   > ❌ Danger: ...              → red callout box
 *   > ✅ Success: ...             → green callout box
 *
 *   <details><summary>Title</summary>content</details>  → collapsible section
 *
 *   | Key | Value |               → already styled as table, but we add
 *   |-----|-------|                  a "key-value" variant when there are
 *   | Name | Foo |                   exactly 2 columns
 *
 * The AI is also taught (via system prompt) to use these when appropriate.
 *
 * EXPORTS
 * ───────
 *   detectCallout(text)         → { type, content } | null
 *   CalloutBox({ type, children })
 *   DetailsSection({ summary, children })
 *   StatCard({ label, value, unit })
 *   ProgressBar({ value, max, label })
 *   Badge({ children, color })
 *   enhanceBlockquote(children) → wraps children in CalloutBox if it matches
 *
 * USAGE
 * ─────
 *   In your markdown components, use:
 *
 *     blockquote: ({children}) => {
 *       const raw = /* extract text from children *\/;
 *       const callout = detectCallout(raw);
 *       if (callout) return <CalloutBox type={callout.type}>{callout.content}</CalloutBox>;
 *       return <blockquote>...default styling...</blockquote>;
 *     }
 */

import React from 'react';

// ── Callout detection ───────────────────────────────────────────────────────
// Recognises lines like "📌 Info: ..." or "Tip: ..." at the start of a
// blockquote and turns them into a coloured callout box.
const CALLOUT_PATTERNS = [
  { type: 'info',    emoji: '📌', regex: /^(📌|ℹ️)?\s*(info|note|note:|info:)\s*:?\s*/i, color: 'blue'   },
  { type: 'tip',     emoji: '💡', regex: /^(💡|⚡)?\s*(tip|hint|tip:|hint:|pro tip)\s*:?\s*/i, color: 'indigo' },
  { type: 'warning', emoji: '⚠️', regex: /^(⚠️|⚠)?\s*(warning|caution|warning:|caution:|attention)\s*:?\s*/i, color: 'amber' },
  { type: 'danger',  emoji: '❌', regex: /^(❌|🚫|🔴)?\s*(danger|error|danger:|error:|critical)\s*:?\s*/i, color: 'red'    },
  { type: 'success', emoji: '✅', regex: /^(✅|✓|🟢)?\s*(success|done|success:|done:|completed)\s*:?\s*/i, color: 'green'  },
];

// Flatten React children to a plain string for pattern matching.
const childrenToText = (children) => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (children?.props?.children) return childrenToText(children.props.children);
  return '';
};

export const detectCallout = (text) => {
  if (!text || typeof text !== 'string') return null;
  for (const p of CALLOUT_PATTERNS) {
    const match = text.match(p.regex);
    if (match) {
      return {
        type: p.type,
        emoji: p.emoji,
        color: p.color,
        content: text.slice(match[0].length).trim(),
      };
    }
  }
  return null;
};

// ── Color themes ────────────────────────────────────────────────────────────
const CALLOUT_THEMES = {
  blue:   { bg: 'rgba(59,130,246,.08)',  border: '#3b82f6', text: '#93c5fd', label: 'INFO'    },
  indigo: { bg: 'rgba(99,102,241,.08)',  border: '#818cf8', text: '#c7d2fe', label: 'TIP'     },
  amber:  { bg: 'rgba(245,158,11,.08)',  border: '#f59e0b', text: '#fcd34d', label: 'WARNING' },
  red:    { bg: 'rgba(239,68,68,.08)',   border: '#ef4444', text: '#fca5a5', label: 'DANGER'  },
  green:  { bg: 'rgba(34,197,94,.08)',   border: '#22c55e', text: '#86efac', label: 'SUCCESS' },
};

// ── CalloutBox component ────────────────────────────────────────────────────
export const CalloutBox = ({ type = 'info', emoji, children }) => {
  const theme = CALLOUT_THEMES[type] || CALLOUT_THEMES.blue;
  return (
    <div style={{
      background: theme.bg,
      borderLeft: `3px solid ${theme.border}`,
      borderRadius: '0 8px 8px 0',
      padding: '10px 14px',
      margin: '10px 0',
      fontSize: 13.5,
      lineHeight: 1.6,
      color: 'inherit',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
        color: theme.text, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace',
      }}>
        <span style={{ fontSize: 13 }}>{emoji}</span>
        <span>{theme.label}</span>
      </div>
      <div style={{ color: 'inherit' }}>{children}</div>
    </div>
  );
};

// ── Collapsible details section ─────────────────────────────────────────────
// Renders an HTML <details> element with styled summary. The AI can use
// <details><summary>Title</summary>content</details> in its markdown.
export const DetailsSection = ({ summary, children, defaultOpen = false }) => (
  <details open={defaultOpen} style={{
    margin: '8px 0',
    border: '1px solid rgba(128,128,128,.2)',
    borderRadius: 8,
    background: 'rgba(128,128,128,.03)',
    overflow: 'hidden',
  }}>
    <summary style={{
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 600,
      userSelect: 'none',
      listStyle: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      <span style={{ fontSize: 10, opacity: 0.6 }}>▶</span>
      {summary}
    </summary>
    <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(128,128,128,.15)', fontSize: 13.5, lineHeight: 1.6 }}>
      {children}
    </div>
  </details>
);

// ── Stat card (for metrics/numbers) ─────────────────────────────────────────
export const StatCard = ({ label, value, unit, color = 'indigo' }) => {
  const colors = {
    indigo: '#818cf8', blue: '#3b82f6', green: '#22c55e',
    amber: '#f59e0b', red: '#ef4444', purple: '#a855f7', cyan: '#06b6d4',
  };
  const c = colors[color] || colors.indigo;
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', gap: 2,
      padding: '10px 14px', borderRadius: 8,
      background: `${c}11`, border: `1px solid ${c}33`,
      minWidth: 100, marginRight: 8, marginBottom: 8,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: c, textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 700, color: 'inherit', lineHeight: 1.1 }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 3, opacity: 0.7 }}>{unit}</span>}
      </span>
    </div>
  );
};

// ── Progress bar ────────────────────────────────────────────────────────────
export const ProgressBar = ({ value, max = 100, label, color = 'indigo' }) => {
  const pct = Math.min(100, Math.max(0, (Number(value) / Number(max)) * 100));
  const colors = {
    indigo: '#818cf8', blue: '#3b82f6', green: '#22c55e',
    amber: '#f59e0b', red: '#ef4444', purple: '#a855f7',
  };
  const c = colors[color] || colors.indigo;
  return (
    <div style={{ margin: '8px 0' }}>
      {label && <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: 'rgba(128,128,128,.15)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 4, transition: 'width .3s ease' }}/>
        </div>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', opacity: 0.7, minWidth: 36, textAlign: 'right' }}>{Math.round(pct)}%</span>
      </div>
    </div>
  );
};

// ── Badge / pill ────────────────────────────────────────────────────────────
export const Badge = ({ children, color = 'indigo' }) => {
  const colors = {
    indigo: { bg: 'rgba(99,102,241,.15)',  text: '#a5b4fc', border: 'rgba(99,102,241,.3)'  },
    blue:   { bg: 'rgba(59,130,246,.15)',  text: '#93c5fd', border: 'rgba(59,130,246,.3)'  },
    green:  { bg: 'rgba(34,197,94,.15)',   text: '#86efac', border: 'rgba(34,197,94,.3)'   },
    amber:  { bg: 'rgba(245,158,11,.15)',  text: '#fcd34d', border: 'rgba(245,158,11,.3)'  },
    red:    { bg: 'rgba(239,68,68,.15)',   text: '#fca5a5', border: 'rgba(239,68,68,.3)'   },
    purple: { bg: 'rgba(168,85,247,.15)',  text: '#d8b4fe', border: 'rgba(168,85,247,.3)'  },
    cyan:   { bg: 'rgba(6,182,212,.15)',   text: '#67e8f9', border: 'rgba(6,182,212,.3)'   },
    grey:   { bg: 'rgba(128,128,128,.15)', text: '#d1d5db', border: 'rgba(128,128,128,.3)' },
  };
  const t = colors[color] || colors.indigo;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      background: t.bg, color: t.text, border: `1px solid ${t.border}`,
      fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '.02em',
    }}>
      {children}
    </span>
  );
};

// ── Key-value grid ──────────────────────────────────────────────────────────
export const KeyValueGrid = ({ pairs }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px',
    padding: '10px 14px', margin: '8px 0', borderRadius: 8,
    background: 'rgba(128,128,128,.04)', border: '1px solid rgba(128,128,128,.12)',
    fontSize: 13,
  }}>
    {pairs.map(([k, v], i) => (
      <React.Fragment key={i}>
        <span style={{ fontWeight: 600, color: 'var(--text2, #b8b8b8)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{k}</span>
        <span style={{ color: 'inherit' }}>{v}</span>
      </React.Fragment>
    ))}
  </div>
);

// ── Helper: enhance a blockquote's children ─────────────────────────────────
// Pass the blockquote's children. If the text content matches a callout
// pattern, returns <CalloutBox>; otherwise returns null (caller falls back
// to default blockquote styling).
export const enhanceBlockquote = (children) => {
  const raw = childrenToText(children);
  const callout = detectCallout(raw);
  if (callout) {
    return <CalloutBox type={callout.type} emoji={callout.emoji}>{callout.content}</CalloutBox>;
  }
  return null;
};
