import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  X, Code2, Plus, Search, Trash2, Edit2, Check, Copy, ArrowUp,
  Loader, Settings, MessageSquare, Send, Cpu, Sparkles, Lightbulb,
  Zap, Bug, BookOpen, RefreshCw, FileCode, ChevronDown, Clock,
  PanelLeftClose, PanelLeftOpen, CornerDownLeft, AlertCircle,
  Terminal, Cog, Wand2, Crown, Wifi
} from 'lucide-react';

const API = 'https://vortis-backend.vercel.app/api/bytez';

/* ────────────────────────────────────────────────────────────────────────
 *  Auth header helper (self-contained — mirrors App.js getAuthHeader)
 * ──────────────────────────────────────────────────────────────────────── */
const getAuthHeader = async () => {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) return { 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  } catch (_) {
    return { 'Content-Type': 'application/json' };
  }
};

/* ────────────────────────────────────────────────────────────────────────
 *  Languages & style preferences
 * ──────────────────────────────────────────────────────────────────────── */
const LANGUAGES = [
  { id: 'auto',        label: 'Auto',        color: '#94a3b8' },
  { id: 'javascript',  label: 'JavaScript',  color: '#f59e0b' },
  { id: 'typescript',  label: 'TypeScript',  color: '#06b6d4' },
  { id: 'python',      label: 'Python',      color: '#3b82f6' },
  { id: 'react',       label: 'React',       color: '#22d3ee' },
  { id: 'rust',        label: 'Rust',        color: '#f97316' },
  { id: 'go',          label: 'Go',          color: '#06b6d4' },
  { id: 'java',        label: 'Java',        color: '#ef4444' },
  { id: 'cpp',         label: 'C++',         color: '#a78bfa' },
  { id: 'csharp',      label: 'C#',          color: '#10b981' },
  { id: 'sql',         label: 'SQL',         color: '#10b981' },
  { id: 'html',        label: 'HTML/CSS',    color: '#f97316' },
  { id: 'bash',        label: 'Bash',        color: '#10b981' },
  { id: 'php',         label: 'PHP',         color: '#8b5cf6' },
  { id: 'ruby',        label: 'Ruby',        color: '#e11d48' },
];

const STYLES = [
  { id: 'balanced',  label: 'Balanced',  hint: 'Code + 2-3 line explanation' },
  { id: 'concise',   label: 'Concise',   hint: 'Code + 1 line max' },
  { id: 'detailed',  label: 'Detailed',  hint: 'Edge cases, alternatives, gotchas' },
  { id: 'teach',     label: 'Teach',     hint: 'Line-by-line comments, learner-friendly' },
];

const STARTER_PROMPTS = [
  { icon: 'bug',     label: 'Debug an error',     prompt: "I'm getting this error and need help fixing it:\n\n```\n\n```" },
  { icon: 'zap',     label: 'Optimize code',      prompt: 'Help me optimize this function for performance and readability:\n\n```\n\n```' },
  { icon: 'book',    label: 'Explain code',       prompt: 'Walk me through what this code does, step by step:\n\n```\n\n```' },
  { icon: 'file',    label: 'Write a function',   prompt: 'Write me a function that …' },
  { icon: 'refresh', label: 'Refactor',           prompt: 'Refactor this code to be cleaner and more idiomatic:\n\n```\n\n```' },
  { icon: 'sparkles',label: 'Code review',        prompt: 'Review this code for bugs, security issues, and improvements:\n\n```\n\n```' },
];

const ICONS = { bug: Bug, zap: Zap, book: BookOpen, file: FileCode, refresh: RefreshCw, sparkles: Sparkles };

/* ────────────────────────────────────────────────────────────────────────
 *  Lightweight syntax highlighter
 *  Self-contained tokenizer — no external deps. Supports the languages
 *  most likely to come back from a coding LLM: JS/TS/JSX/TSX, Python,
 *  Bash, HTML, CSS, JSON, Go, Rust, Java, C/C++/C#, SQL, PHP, Ruby.
 *
 *  Token colors are tuned for a dark surface and roughly match the
 *  palette in the user's reference screenshot:
 *    keywords   → blue   (#3b82f6)
 *    strings    → green  (#10b981)
 *    numbers    → amber  (#f59e0b)
 *    comments   → gray   (#6b7280, italic)
 *    functions  → yellow (#fbbf24)
 *    booleans   → orange (#f97316)
 *    punctuation→ dim    (#6a6a6a)
 * ──────────────────────────────────────────────────────────────────────── */
const TOKEN_COLORS = {
  comment:  { color: '#6b7280', fontStyle: 'italic' },
  string:   { color: '#10b981' },
  number:   { color: '#f59e0b' },
  keyword:  { color: '#3b82f6' },
  boolean:  { color: '#f97316' },
  function: { color: '#fbbf24' },
  builtin:  { color: '#a78bfa' },
  punct:    { color: '#6a6a6a' },
  op:       { color: '#c8c8c8' },
  ident:    { color: '#e6e6e6' },
  tag:      { color: '#3b82f6' },
  attr:     { color: '#fbbf24' },
  other:    { color: '#e6e6e6' },
};

const KEYWORD_SETS = {
  default: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','class','extends','super','this','typeof','instanceof','in','of','void','delete','yield','async','await','static','get','set','public','private','protected','readonly','abstract','interface','type','enum','implements','namespace','module','declare','import','export','from','as','default','try','catch','finally','throw','with','debugger'],
  python:  ['def','return','if','elif','else','for','while','break','continue','pass','class','import','from','as','try','except','finally','raise','with','yield','lambda','global','nonlocal','assert','del','in','is','not','and','or','None','True','False','self','cls','async','await','print','len','range','open','str','int','float','list','dict','set','tuple','bool'],
  bash:    ['if','then','else','elif','fi','for','in','do','done','while','case','esac','function','return','local','export','unset','echo','printf','read','cd','pwd','ls','cat','grep','sed','awk','find','xargs','source','alias','exit'],
  sql:     ['SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER','TABLE','INDEX','VIEW','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','DISTINCT','AS','AND','OR','NOT','NULL','IN','LIKE','BETWEEN','IS','CASE','WHEN','THEN','ELSE','END','UNION','ALL','EXISTS','PRIMARY','KEY','FOREIGN','REFERENCES','DEFAULT','CONSTRAINT','UNIQUE','CHECK'],
  rust:    ['fn','let','mut','pub','use','mod','struct','enum','impl','trait','type','where','for','in','if','else','match','while','loop','return','break','continue','as','ref','self','Self','super','crate','extern','move','static','const','unsafe','async','await','dyn','abstract','virtual'],
  go:      ['func','var','const','type','struct','interface','map','chan','package','import','for','range','if','else','switch','case','default','break','continue','return','defer','go','select','fallthrough','goto'],
  java:    ['public','private','protected','class','interface','extends','implements','static','final','void','int','long','double','float','boolean','char','byte','short','String','return','if','else','for','while','do','switch','case','break','continue','new','this','super','try','catch','finally','throw','throws','import','package','abstract','synchronized','volatile','transient','native','enum'],
  cpp:     ['int','long','short','double','float','char','bool','void','auto','const','static','extern','volatile','unsigned','signed','struct','class','union','enum','public','private','protected','template','typename','namespace','using','return','if','else','for','while','do','switch','case','break','continue','new','delete','this','virtual','override','final','abstract','try','catch','throw','sizeof','typedef','constexpr','nullptr','true','false'],
  ruby:    ['def','end','if','elsif','else','unless','while','until','for','do','break','next','redo','retry','return','yield','class','module','def','begin','rescue','ensure','raise','require','require_relative','include','extend','attr_accessor','attr_reader','attr_writer','self','nil','true','false','puts','print','p','pp'],
  php:     ['function','class','interface','extends','implements','public','private','protected','static','final','abstract','const','var','return','if','else','elseif','for','foreach','while','do','switch','case','break','continue','new','this','self','parent','try','catch','finally','throw','use','namespace','require','require_once','include','include_once','echo','print','null','true','false','array','string','int','float','bool'],
};

const BOOLEAN_SET = new Set(['true','false','null','undefined','None','True','False','nil','NULL','nullptr','NaN','Infinity']);

/**
 * Tokenize one chunk of source code. Returns an array of {type,value}.
 * Single-pass with greedy alternation; comment/string states are tracked
 * so multi-line strings (Python triple-quoted, JS template literals) work.
 */
const tokenize = (code, lang) => {
  // Pick the keyword set for this language
  let kwSet = KEYWORD_SETS.default;
  const l = (lang || '').toLowerCase();
  if (KEYWORD_SETS[l]) kwSet = KEYWORD_SETS[l];
  else if (l === 'js' || l === 'jsx' || l === 'javascript') kwSet = KEYWORD_SETS.default;
  else if (l === 'ts' || l === 'tsx' || l === 'typescript') kwSet = KEYWORD_SETS.default;
  const kwSetLower = new Set(kwSet.map(k => k.toLowerCase()));

  const isHtmlLike = l === 'html' || l === 'xml' || l === 'vue' || l === 'svelte';
  const isCss = l === 'css' || l === 'scss' || l === 'less';

  const tokens = [];
  let i = 0;
  const n = code.length;
  const push = (type, value) => { if (value) tokens.push({ type, value }); };

  while (i < n) {
    const rest = code.slice(i);
    const ch = code[i];
    const ch2 = code.slice(i, i + 2);

    // ── Line comment: // ──
    if (ch2 === '//') {
      const m = /^\/\/[^\n]*/.exec(rest);
      push('comment', m[0]); i += m[0].length; continue;
    }
    // ── Line comment: # (Python, Bash, Ruby, YAML, TOML) ──
    if (ch === '#' && (l === 'python' || l === 'py' || l === 'bash' || l === 'sh' || l === 'shell' || l === 'ruby' || l === 'rb' || l === 'yaml' || l === 'yml' || l === 'toml' || l === 'auto' || !l)) {
      const m = /^#[^\n]*/.exec(rest);
      push('comment', m[0]); i += m[0].length; continue;
    }
    // ── Block comment: /* ... */ ──
    if (ch2 === '/*') {
      const m = /^\/\*[\s\S]*?\*\//.exec(rest) || /^\/\*/.exec(rest);
      push('comment', m[0]); i += m[0].length; continue;
    }
    // ── Python docstring / multi-line string: """ or ''' ──
    // (ch3 is 3 chars — note ch2 above is only 2, so we can't compare it to """)
    const ch3 = code.slice(i, i + 3);
    if ((ch3 === '"""' || ch3 === "'''") && (l === 'python' || l === 'py' || !l || l === 'auto')) {
      const quote = ch3;
      const end = code.indexOf(quote, i + 3);
      const stop = end === -1 ? n : end + 3;
      push('string', code.slice(i, stop)); i = stop; continue;
    }
    // ── Template literal: `...` (handles ${...} crudely as nested) ──
    if (ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '`') { j++; break; }
        j++;
      }
      push('string', code.slice(i, j)); i = j; continue;
    }
    // ── Double / single-quoted string ──
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === code[i]) { j++; break; }
        if (code[j] === '\n') break; // unterminated
        j++;
      }
      push('string', code.slice(i, j)); i = j; continue;
    }
    // ── HTML comment: <!-- ... --> ──
    if (code.slice(i, i + 4) === '<!--') {
      const end = code.indexOf('-->', i + 4);
      const stop = end === -1 ? n : end + 3;
      push('comment', code.slice(i, stop)); i = stop; continue;
    }
    // ── HTML/XML tag (only for html-like langs) ──
    if (isHtmlLike && ch === '<' && /[a-zA-Z!/]/.test(code[i + 1] || '')) {
      const m = /^<\/?[a-zA-Z][\w-]*/.exec(rest);
      if (m) {
        push('tag', m[0]); i += m[0].length;
        // Now consume attributes until '>'
        while (i < n && code[i] !== '>') {
          const attrRest = code.slice(i);
          // attribute name
          const am = /^\s*([a-zA-Z_:][\w:.-]*)/.exec(attrRest);
          if (am && am[1]) { push('ws', am[0].match(/^\s*/)[0]); push('attr', am[1]); i += am[0].length; continue; }
          // = sign
          const eq = /^[=\s]+/.exec(attrRest);
          if (eq) { push('op', eq[0]); i += eq[0].length; continue; }
          // quoted value
          const vm = /^"[^"]*"/.exec(attrRest) || /^'[^']*'/.exec(attrRest);
          if (vm) { push('string', vm[0]); i += vm[0].length; continue; }
          // bareword
          const bm = /^[^\s>]+/.exec(attrRest);
          if (bm) { push('string', bm[0]); i += bm[0].length; continue; }
          i++;
        }
        if (code[i] === '>') { push('tag', '>'); i++; }
        continue;
      }
    }
    // ── CSS selector / property (very loose) ──
    if (isCss) {
      const sm = /^[.#:][\w-]+/.exec(rest);
      if (sm) { push('function', sm[0]); i += sm[0].length; continue; }
    }
    // ── Decorator: @name ──
    if (ch === '@') {
      const m = /^@[a-zA-Z_][\w]*/.exec(rest);
      if (m) { push('builtin', m[0]); i += m[0].length; continue; }
    }
    // ── Number ──
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const m = /^(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/.exec(rest);
      if (m) { push('number', m[0]); i += m[0].length; continue; }
    }
    // ── Identifier / keyword / boolean / function ──
    if (/[a-zA-Z_$]/.test(ch)) {
      const m = /^[a-zA-Z_$][\w$]*/.exec(rest);
      const word = m[0];
      // lookahead for function call
      const after = code.slice(i + word.length).match(/^\s*\(/);
      if (kwSetLower.has(word.toLowerCase())) { push('keyword', word); }
      else if (BOOLEAN_SET.has(word))         { push('boolean', word); }
      else if (after)                         { push('function', word); }
      else                                    { push('ident', word); }
      i += word.length; continue;
    }
    // ── Whitespace ──
    if (/\s/.test(ch)) {
      const m = /^\s+/.exec(rest);
      push('ws', m[0]); i += m[0].length; continue;
    }
    // ── Punctuation ──
    if (/[{}()\[\];:,.<>]/.test(ch)) {
      // collapse runs of punctuation so we don't emit 100 single-char spans
      const m = /^[{}()\[\];:,.<>]+/.exec(rest);
      push('punct', m[0]); i += m[0].length; continue;
    }
    // ── Operators ──
    if (/[+\-*/%=<>!&|?^~]/.test(ch)) {
      const m = /^[+\-*/%=<>!&|?^~]+/.exec(rest);
      push('op', m[0]); i += m[0].length; continue;
    }
    // ── Fallback single char ──
    push('other', ch); i++;
  }
  return tokens;
};

/**
 * Highlight a string of source code into an array of React spans.
 * Whitespace tokens are passed through unstyled to preserve layout.
 */
const renderTokens = (tokens) =>
  tokens.map((t, idx) => {
    if (t.type === 'ws') return t.value;
    const style = TOKEN_COLORS[t.type] || TOKEN_COLORS.other;
    return (
      <span key={idx} style={style}>{t.value}</span>
    );
  });

/* ────────────────────────────────────────────────────────────────────────
 *  Vertex CodeBlock — the polished, SaaS-grade code surface
 *
 *  Features:
 *  - Mac-style traffic-light dots in the header
 *  - Language label with colored dot
 *  - Copy button with animated "Copied!" feedback
 *  - Line numbers in a subtle gutter
 *  - Full syntax highlighting (tokenizer above)
 *  - Horizontal scroll for long lines
 *  - Subtle outer glow on hover
 *  - Mount fade-in animation
 * ──────────────────────────────────────────────────────────────────────── */
const VertexCodeBlock = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(codeText); } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lines = useMemo(() => codeText.split('\n'), [codeText]);
  const tokensPerLine = useMemo(
    () => lines.map(l => tokenize(l, lang)),
    [lines, lang]
  );

  const langMeta = LANGUAGES.find(l => l.id === lang) || { color: '#8a8a8a' };
  const displayLang = (lang || 'plaintext').toLowerCase();

  return (
    <div
      data-vertex-code
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        margin: '14px 0',
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${hovered ? '#2e2e2e' : '#222'}`,
        background: '#0d0d0f',
        boxShadow: hovered
          ? '0 12px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(99,102,241,.08)'
          : '0 6px 18px rgba(0,0,0,.35)',
        transition: 'border-color .2s ease, box-shadow .25s ease',
        animation: 'vertexCodeFadeIn .25s ease',
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Monaco, Consolas, monospace',
      }}
    >
      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: '#141417',
        borderBottom: '1px solid #1f1f23',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Traffic-light dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }}/>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }}/>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }}/>
          </div>
          <div style={{ width: 1, height: 14, background: '#2a2a2e' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <FileCode size={12} color="#8a8a8a"/>
            <span style={{
              fontSize: 11, color: '#c8c8c8', letterSpacing: '.04em', fontWeight: 600,
              textTransform: 'lowercase',
            }}>
              {displayLang}
            </span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: langMeta.color,
              boxShadow: `0 0 6px ${langMeta.color}55`,
            }}/>
          </div>
        </div>
        <button
          onClick={copy}
          title="Copy code"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: copied ? 'rgba(16,185,129,.12)' : '#1c1c20',
            border: `1px solid ${copied ? 'rgba(16,185,129,.35)' : '#2a2a2e'}`,
            borderRadius: 6, padding: '4px 9px',
            color: copied ? '#10b981' : '#b8b8b8',
            fontSize: 11, cursor: 'pointer', fontWeight: 600,
            transition: 'all .15s ease',
            fontFamily: 'inherit',
          }}
        >
          {copied ? <Check size={11}/> : <Copy size={11}/>}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* ── Code surface ── */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#0d0d0f' }}>
        {/* Line-number gutter */}
        <div style={{
          flexShrink: 0, padding: '12px 12px', textAlign: 'right', userSelect: 'none',
          color: '#3a3a3e', fontSize: 12, lineHeight: 1.7,
          borderRight: '1px solid #1a1a1e', background: '#0a0a0c',
          minWidth: 44,
        }}>
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {/* Highlighted code */}
        <pre style={{
          margin: 0, padding: '12px 14px',
          fontSize: 12.5, lineHeight: 1.7,
          color: '#e6e6e6', whiteSpace: 'pre', wordBreak: 'normal',
          flex: 1, fontFamily: 'inherit',
        }}>
          {tokensPerLine.map((toks, i) => (
            <div key={i}>{renderTokens(toks)}{i < tokensPerLine.length - 1 ? '' : ''}</div>
          ))}
        </pre>
      </div>

      {/* Footer chip — line count, optional runner hook */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 12px', background: '#0a0a0c', borderTop: '1px solid #1a1a1e',
        fontSize: 10, color: '#5a5a5a', letterSpacing: '.04em',
      }}>
        <span>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 4px #10b981' }}/>
          Vertex · syntax on
        </span>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  Utility — format relative time
 * ──────────────────────────────────────────────────────────────────────── */
const relTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); const now = Date.now(); const diff = now - d.getTime();
  const s = Math.floor(diff / 1000); const m = Math.floor(s / 60); const h = Math.floor(m / 60); const day = Math.floor(h / 24);
  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* ────────────────────────────────────────────────────────────────────────
 *  Vertex system prompt — same behavior, just re-branded
 * ──────────────────────────────────────────────────────────────────────── */
const buildCoderSystemPrompt = (lang, style) => {
  let sys = `You are Vertex Code — an elite senior software engineer pair-programmer embedded inside the user's IDE. You are NOT a general assistant; you live and breathe code. Vertex is powered by Vortis.

YOUR JOB: help the user write, understand, debug, refactor, and ship code. You are opinionated, pragmatic, and allergic to over-engineering.

═══ CODE QUALITY BAR ═══
- Every code block MUST be runnable as-is when possible. Include imports. No "..." placeholders unless absolutely necessary.
- Prefer modern, idiomatic syntax for the chosen language (ES2022+ for JS, Python 3.10+ features where they help, etc.).
- Show the SIMPLEST solution first. Only show advanced patterns if the user asks or if they're clearly needed.
- If you don't know the exact API, say so — NEVER fabricate function names, method signatures, or library APIs.
- Always specify the language in code fences: \`\`\`python, \`\`\`typescript, \`\`\`bash, etc.

═══ EXPLAINING ═══
- Lead with the code, then explain WHY it works in 1-3 tight sentences. Don't over-explain.
- When there's a trade-off (perf vs readability, lib vs hand-rolled, sync vs async), pick a side and DEFEND it. Mention the alternative in one line.
- Use comments inside code only when the logic is non-obvious. Don't comment obvious lines.

═══ DEBUGGING ═══
- When the user pastes an error, identify the ROOT CAUSE in one sentence, then give the fix as a code block.
- If the error is environment-related (missing dep, version mismatch), say exactly what to install/run.

═══ REFACTORING ═══
- Show before→after only when the diff is small. For large refactors, show only the new version with a one-line summary of what changed.
- Never silently rewrite working code. If you're refactoring, label it: "Refactored version:".

═══ CLARIFYING ═══
- If the request is ambiguous in a way that changes the answer significantly (which language, which framework, what input shape), ask ONE concise question before answering.
- If it's only mildly ambiguous, make a reasonable assumption and state it inline: "(assuming React + TS — say if not)".

═══ RESPONSE LENGTH ═══
- Code-first, prose-second. A typical response is: 1 line of context, the code block, 2-3 lines of explanation.
- NEVER pad. NEVER write "Certainly! Here's..." or "I'd be happy to help" or "Sure!" — just answer.
- For multi-step tasks, use a numbered list with code blocks under each step.
- Never truncate — always complete your full answer.

═══ NON-CODING REQUESTS ═══
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect: "I'm your Vertex coding assistant — for general chat, switch to the main Vortis chat. For code, I'm here."`;

  if (style === 'concise')  sys += '\n\nSTYLE: Ultra-concise. Code + 1 line of explanation max. No pleasantries.';
  if (style === 'detailed') sys += '\n\nSTYLE: Detailed. Include edge cases, alternative approaches, performance notes, and a short "when not to use this" callout.';
  if (style === 'teach')    sys += '\n\nSTYLE: Teach mode. Add a comment above each non-obvious line of code explaining what it does. Treat the user as a curious learner. End with a one-line "key takeaway".';

  if (lang && lang !== 'auto') sys += `\n\nLANGUAGE FOCUS: The user has selected ${lang}. Default to ${lang} for all code examples unless they explicitly ask for another language.`;

  return sys;
};

/* ────────────────────────────────────────────────────────────────────────
 *  Main CodeChat component
 * ──────────────────────────────────────────────────────────────────────── */
const CodeChat = ({
  onClose,
  // Optional props from parent — wire these up to get runnable code blocks:
  CodeBlock,                // parent's CodeBlock component ({lang, codeText}) => JSX
  safeExecuteCodeLocally,   // parent's runner (lang, code, onBoot) => Promise<{isError, output}>
  LANG_ENGINE,              // parent's lang→engine map
  ENGINE_META,              // parent's engine→meta map
}) => {
  /* ── Firebase singletons ── */
  const auth = useMemo(() => getAuth(), []);
  const db   = useMemo(() => getFirestore(), []);

  /* ── Identity ── */
  const [user, setUser] = useState(auth.currentUser);
  const userUidRef = useRef(auth.currentUser?.uid || '');
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      userUidRef.current = u?.uid || '';
      if (u) loadChats(u.uid);
      else setSavedChats([]);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Chat state ── */
  const [messages, setMessages] = useState([]);          // [{id, role:'user'|'assistant', text, ts}]
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatId, setChatId] = useState(() => Date.now().toString());
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
  const convHistoryRef = useRef([]);                     // [{role, content}] for backend

  /* ── Sidebar state ── */
  const [savedChats, setSavedChats] = useState([]);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Preferences ── */
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('vertex_code_lang') || 'auto'; } catch (_) { return 'auto'; } });
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('vertex_code_style') || 'balanced'; } catch (_) { return 'balanced'; } });
  const [showPrefs, setShowPrefs] = useState(false);
  useEffect(() => { try { localStorage.setItem('vertex_code_lang', lang); } catch (_) {} }, [lang]);
  useEffect(() => { try { localStorage.setItem('vertex_code_style', style); } catch (_) {} }, [style]);

  /* ── Refs ── */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

  /* ── Scroll to bottom on new content ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinking]);

  /* ── Lock body scroll while CodeChat is mounted ──
   * Prevents the main chat behind from scrolling under the overlay.
   * Also bumps body to position:fixed so iOS Safari doesn't scroll
   * underneath either. Restored on unmount. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      if (prev.position !== 'fixed') window.scrollTo(0, scrollY);
    };
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      // Cmd/Ctrl + Enter → send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!streaming && input.trim()) send();
      }
      // Cmd/Ctrl + K → new chat
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
      // Cmd/Ctrl + B → toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen(o => !o);
      }
      // Esc → close (only if not typing in an input)
      if (e.key === 'Escape' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        if (showPrefs) { setShowPrefs(false); return; }
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, streaming, showPrefs]);

  /* ──────────────────────────────────────────────────────────────────
   *  Firestore ops — mirror App.js pattern, but under 'code_chats'
   * ────────────────────────────────────────────────────────────────── */
  const loadChats = useCallback(async (uid) => {
    if (!uid) { setSavedChats([]); return; }
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'code_chats'));
      const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
      setSavedChats(chats);
    } catch (_) {}
  }, [db]);

  const persistChat = useCallback(async (msgs, overrideTitle) => {
    if (!userUidRef.current) return;
    try {
      // Generate a short title from the first user message if not provided
      let title = overrideTitle;
      if (!title) {
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) {
          title = firstUser.text.replace(/```[\s\S]*?```/g, '').replace(/[#*`]/g, '').trim().slice(0, 48);
          if (!title) title = 'New Vertex Chat';
        } else {
          title = 'New Vertex Chat';
        }
      }
      const cleaned = msgs.map(m => ({
        role: m.role,
        text: (m.text || '').slice(0, 12000),
        ts: m.ts || Date.now()
      }));
      await setDoc(doc(db, 'users', userUidRef.current, 'code_chats', chatIdRef.current), {
        title,
        messages: cleaned,
        lang, style,
        updated: new Date().toISOString(),
        createdAt: msgs[0]?.ts ? new Date(msgs[0].ts).toISOString() : new Date().toISOString()
      });
      loadChats(userUidRef.current);
    } catch (_) {}
  }, [db, lang, style, loadChats]);

  const newChat = useCallback(() => {
    abortRef.current = true;
    setStreaming(false); setThinking(false); setStreamText('');
    const newId = Date.now().toString();
    setChatId(newId); chatIdRef.current = newId;
    setMessages([]); convHistoryRef.current = [];
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const loadChat = useCallback(async (id) => {
    if (!userUidRef.current) return;
    try {
      const snap = await getDoc(doc(db, 'users', userUidRef.current, 'code_chats', id));
      if (!snap.exists()) return;
      const c = snap.data();
      setChatId(id); chatIdRef.current = id;
      const restored = (c.messages || []).map((m, i) => ({
        id: `${id}-${i}`,
        role: m.role,
        text: m.text,
        ts: typeof m.ts === 'number' ? m.ts : Date.now()
      }));
      setMessages(restored);
      convHistoryRef.current = restored.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      if (c.lang) setLang(c.lang);
      if (c.style) setStyle(c.style);
      if (window.innerWidth <= 900) setSidebarOpen(false);
    } catch (_) {}
  }, [db]);

  const deleteChat = useCallback(async (id) => {
    if (!userUidRef.current) return;
    try {
      await deleteDoc(doc(db, 'users', userUidRef.current, 'code_chats', id));
      await loadChats(userUidRef.current);
      if (id === chatIdRef.current) newChat();
    } catch (_) {}
  }, [db, loadChats, newChat]);

  const renameChat = useCallback(async (id, newTitle) => {
    if (!userUidRef.current || !newTitle.trim()) { setRenamingId(null); return; }
    try {
      await setDoc(doc(db, 'users', userUidRef.current, 'code_chats', id),
        { title: newTitle.trim().slice(0, 80) }, { merge: true });
      await loadChats(userUidRef.current);
    } catch (_) {}
    setRenamingId(null);
  }, [db, loadChats]);

  /* ──────────────────────────────────────────────────────────────────
   *  Send message + stream response
   * ────────────────────────────────────────────────────────────────── */
  const send = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput('');
    setStreaming(true);
    setThinking(true);
    setStreamText('');
    abortRef.current = false;

    const historyForBackend = nextMsgs.slice(-12).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    const sys = buildCoderSystemPrompt(lang, style);
    const fullPrompt = sys + '\n\n=== USER REQUEST ===\n' + text;

    let full = '';
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({
          action: 'chat',
          mode: 'code',                  // ← routes to GLM-5.2 only on the backend
          prompt: fullPrompt,
          history: historyForBackend
        })
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status}).`;
        if (res.status === 429) errMsg = "You're sending messages too quickly — please slow down.";
        else if (res.status === 401 || res.status === 403) errMsg = 'Authentication error — try refreshing the page.';
        else if (res.status === 503) errMsg = 'The AI is temporarily unavailable — please try again shortly.';
        const errMsgFinal = errMsg;
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: `⚠️ ${errMsgFinal}`, ts: Date.now() }]);
        setStreaming(false); setThinking(false); setStreamText('');
        return;
      }

      setThinking(false);
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        if (abortRef.current) break;
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]' || !raw) continue;
          try {
            const p = JSON.parse(raw);
            if (p.content) { full += p.content; setStreamText(full); }
          } catch (_) {}
        }
      }
    } catch (e) {
      setThinking(false);
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ Network error: ${e?.message || 'unknown'}\n\nPlease check your connection and try again.`,
        ts: Date.now()
      }]);
      setStreaming(false); setStreamText('');
      return;
    }

    const cleaned = full.trim();
    if (!cleaned) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: '_(empty response — try rephrasing your request)_',
        ts: Date.now()
      }]);
    } else {
      const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: cleaned, ts: Date.now() };
      const finalMsgs = [...nextMsgs, aiMsg];
      setMessages(finalMsgs);
      // persist
      setTimeout(() => persistChat(finalMsgs), 50);
    }
    setStreaming(false);
    setThinking(false);
    setStreamText('');
  }, [input, messages, streaming, lang, style, persistChat]);

  const stopStreaming = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
    setThinking(false);
    if (streamText.trim()) {
      const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: streamText.trim() + '\n\n_(stopped)_', ts: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
    }
    setStreamText('');
  }, [streamText]);

  /* ── Filtered chat list ── */
  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedChats;
    return savedChats.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [savedChats, search]);

  /* ── The CodeBlock to use for rendering ── */
  const RendererCodeBlock = CodeBlock || VertexCodeBlock;

  /* ── Markdown components (SaaS-grade styling) ── */
  const mdComponents = useMemo(() => ({
    h1: ({children}) => <h1 style={{ fontSize: 19, fontWeight: 700, color: '#f5f5f5', margin: '14px 0 6px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h1>,
    h2: ({children}) => <h2 style={{ fontSize: 16.5, fontWeight: 700, color: '#f5f5f5', margin: '12px 0 5px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h2>,
    h3: ({children}) => <h3 style={{ fontSize: 14.5, fontWeight: 600, color: '#e0e0e0', margin: '10px 0 4px', lineHeight: 1.3 }}>{children}</h3>,
    h4: ({children}) => <h4 style={{ fontSize: 13.5, fontWeight: 600, color: '#e0e0e0', margin: '8px 0 3px' }}>{children}</h4>,
    p: ({children}) => <p style={{ margin: '0 0 8px', color: '#dcdcdc', lineHeight: 1.7, fontSize: 14 }}>{children}</p>,
    strong: ({children}) => <strong style={{ color: '#f5f5f5', fontWeight: 700 }}>{children}</strong>,
    em: ({children}) => <em style={{ color: '#a0a0a0' }}>{children}</em>,
    ul: ({children}) => <ul style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ul>,
    ol: ({children}) => <ol style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ol>,
    li: ({children}) => <li style={{ margin: '3px 0', color: '#dcdcdc', lineHeight: 1.65, fontSize: 14 }}>{children}</li>,
    a: ({href, children}) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', borderBottom: '1px solid rgba(96,165,250,.35)', transition: 'border-color .15s' }}>{children}</a>,
    blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid #4f46e5', margin: '8px 0', padding: '4px 12px', color: '#a0a0a0', background: 'rgba(79,70,229,.06)', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>,
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid #232323', margin: '12px 0' }} />,
    table: ({children}) => <div style={{ overflowX: 'auto', margin: '8px 0', borderRadius: 8, border: '1px solid #232323' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>{children}</table></div>,
    thead: ({children}) => <thead style={{ background: '#141417' }}>{children}</thead>,
    th: ({children}) => <th style={{ padding: '6px 10px', border: '1px solid #232323', textAlign: 'left', color: '#e6e6e6', fontWeight: 600 }}>{children}</th>,
    td: ({children}) => <td style={{ padding: '6px 10px', border: '1px solid #232323', color: '#b8b8b8' }}>{children}</td>,
    code: ({inline, className, children}) => {
      if (inline) {
        return <code style={{ background: 'rgba(99,102,241,.12)', color: '#c4b5fd', padding: '1px 6px', borderRadius: 5, fontFamily: '"JetBrains Mono", monospace', fontSize: 12.5, border: '1px solid rgba(99,102,241,.2)' }}>{children}</code>;
      }
      const match = /language-(\w+)/.exec(className || '');
      const codeLang = match ? match[1] : '';
      const codeText = String(children).replace(/\n$/, '');
      return <RendererCodeBlock lang={codeLang} codeText={codeText} safeExecuteCodeLocally={safeExecuteCodeLocally} LANG_ENGINE={LANG_ENGINE} ENGINE_META={ENGINE_META} />;
    },
  }), [RendererCodeBlock, safeExecuteCodeLocally, LANG_ENGINE, ENGINE_META]);

  /* ════════════════════════════════════════════════════════════════
   *  RENDER
   * ════════════════════════════════════════════════════════════════ */
  // CRITICAL: render through a portal into document.body so the overlay
  // escapes any ancestor that has transform / filter / will-change / contain
  // set — those properties create a new containing block and break
  // position:fixed, which was causing the main chat UI to show through.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-vertex style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      width: '100vw', height: '100vh', height: '100dvh',
      zIndex: 2147483647,                  // max int — always on top
      background: 'radial-gradient(1200px 600px at 20% -10%, rgba(79,70,229,.10), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(16,185,129,.06), transparent 60%), #0a0a0c',
      color: '#e6e6e6',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      animation: 'vertexCodeFadeIn .22s ease',
      overflow: 'hidden',
      isolation: 'isolate',
    }}>
      {/* ═══ Top bar ═══ */}
      <div style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid #1a1a1e', background: 'rgba(15,15,17,.85)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar (Cmd/Ctrl+B)"
            className="vertex-icon-btn"
            style={{
              background: 'transparent', color: '#8a8a8a', cursor: 'pointer', padding: 6, borderRadius: 7,
              display: 'flex', border: '1px solid transparent', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1e'; e.currentTarget.style.color = '#e6e6e6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8a8a8a'; }}
          >
            {sidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Vertex logo — gradient V mark */}
            <div style={{
              width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #10b981 100%)',
              boxShadow: '0 4px 12px rgba(79,70,229,.35), inset 0 1px 0 rgba(255,255,255,.18)',
              position: 'relative',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 4 L12 20 L20 4" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#f5f5f5', letterSpacing: '-.01em', lineHeight: 1 }}>Vertex</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontWeight: 700, color: '#fbbf24',
                  background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)',
                  padding: '1px 5px', borderRadius: 4, letterSpacing: '.05em',
                }}>
                  <Crown size={9}/> PRO
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#6a6a6a', fontFamily: 'JetBrains Mono', marginTop: 3, letterSpacing: '.02em' }}>
                powered by <span style={{ color: '#a0a0a0' }}>Vortis</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Live status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#0f0f12', border: '1px solid #1f1f23',
            padding: '5px 9px', borderRadius: 6,
            fontSize: 11, color: '#8a8a8a', fontFamily: 'JetBrains Mono',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#10b981',
              boxShadow: '0 0 6px #10b981', animation: 'vertexPulse 2s ease-in-out infinite',
            }}/>
            <Wifi size={11}/> online
          </div>

          {/* Language picker */}
          <div style={{ position: 'relative' }}>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              style={{
                background: '#141417', border: '1px solid #262629', color: '#c8c8c8',
                fontSize: 12, borderRadius: 7, padding: '6px 26px 6px 10px', cursor: 'pointer',
                fontFamily: 'JetBrains Mono', appearance: 'none', fontWeight: 500,
                backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"10\\" height=\\"10\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"%23888\\" stroke-width=\\"3\\"><polyline points=\\"6 9 12 15 18 9\\"/></svg>")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                transition: 'border-color .15s',
              }}
              title="Preferred language"
            >
              {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>

          {/* Style picker */}
          <button
            onClick={() => setShowPrefs(s => !s)}
            title="Coder style preferences"
            className="vertex-pill-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: showPrefs ? '#1f1f23' : '#141417',
              border: '1px solid ' + (showPrefs ? '#2e2e32' : '#262629'), color: '#c8c8c8', fontSize: 12, borderRadius: 7,
              padding: '6px 10px', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontWeight: 500,
              transition: 'all .15s',
            }}
          >
            <Cog size={12}/> {STYLES.find(s => s.id === style)?.label || 'Balanced'}
          </button>

          <div style={{ width: 1, height: 18, background: '#2a2a2e', margin: '0 4px' }} />

          <button onClick={onClose} title="Close (Esc)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: '#141417',
              border: '1px solid #262629', color: '#c8c8c8', fontSize: 12, borderRadius: 7,
              padding: '6px 11px', cursor: 'pointer', fontWeight: 500, transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1f1f23'; e.currentTarget.style.color = '#e6e6e6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#141417'; e.currentTarget.style.color = '#c8c8c8'; }}
          >
            <X size={13}/> Exit
          </button>
        </div>
      </div>

      {/* ═══ Preferences popover ═══ */}
      {showPrefs && (
        <div style={{
          position: 'absolute', top: 60, right: 14, zIndex: 100,
          background: '#141417', border: '1px solid #262629', borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(99,102,241,.05)',
          padding: 14, minWidth: 280,
          animation: 'vertexScaleIn .18s cubic-bezier(.2,.8,.2,1)',
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6a6a6a', letterSpacing: '.08em', marginBottom: 10, fontFamily: 'JetBrains Mono' }}>CODER STYLE</div>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => { setStyle(s.id); setShowPrefs(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                background: style === s.id ? 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(79,70,229,.06))' : 'transparent',
                border: '1px solid ' + (style === s.id ? 'rgba(99,102,241,.35)' : 'transparent'),
                marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 3,
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (style !== s.id) { e.currentTarget.style.background = '#1a1a1e'; e.currentTarget.style.borderColor = '#262629'; } }}
              onMouseLeave={e => { if (style !== s.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e6e6' }}>{s.label}</span>
              <span style={{ fontSize: 11, color: '#7a7a7a' }}>{s.hint}</span>
            </button>
          ))}
          <div style={{ borderTop: '1px solid #232329', marginTop: 10, paddingTop: 10, fontSize: 10.5, color: '#6a6a6a', fontFamily: 'JetBrains Mono', lineHeight: 1.6 }}>
            <div>⌘/Ctrl + Enter → send</div>
            <div>⌘/Ctrl + K → new chat</div>
            <div>⌘/Ctrl + B → toggle sidebar</div>
            <div>Esc → close</div>
          </div>
        </div>
      )}

      {/* ═══ Body: sidebar + main ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 264, flexShrink: 0, borderRight: '1px solid #1a1a1e', background: 'rgba(15,15,17,.6)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            animation: 'vertexSlideInLeft .22s cubic-bezier(.2,.8,.2,1)',
          }}>
            {/* New chat */}
            <div style={{ padding: 12 }}>
              <button onClick={newChat}
                className="vertex-new-chat"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(79,70,229,.3), inset 0 1px 0 rgba(255,255,255,.18)',
                  transition: 'all .2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(79,70,229,.4), inset 0 1px 0 rgba(255,255,255,.18)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,70,229,.3), inset 0 1px 0 rgba(255,255,255,.18)'; }}
              >
                <Plus size={14} strokeWidth={2.5}/> New Code Chat
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0 12px 10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6a6a6a' }}/>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chats..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', fontSize: 12,
                    background: '#0f0f12', border: '1px solid #232329', borderRadius: 7,
                    color: '#e6e6e6', outline: 'none', fontFamily: 'inherit',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#4f46e5'}
                  onBlur={e => e.currentTarget.style.borderColor = '#232329'}
                />
              </div>
            </div>

            {/* Chat list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }} className="vertex-scr">
              {filteredChats.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#5a5a5a', fontSize: 11.5, lineHeight: 1.6 }}>
                  <MessageSquare size={22} style={{ opacity: .4, marginBottom: 8 }}/>
                  <div>{search ? 'No matches found.' : 'No saved code chats yet.'}</div>
                  <div style={{ marginTop: 4, fontSize: 10.5 }}>Start a conversation to see it here.</div>
                </div>
              ) : (
                filteredChats.map(c => (
                  <div key={c.id}
                    onClick={() => loadChat(c.id)}
                    className="vertex-chat-row"
                    style={{
                      padding: '9px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 3,
                      background: c.id === chatId ? 'linear-gradient(135deg, rgba(99,102,241,.10), rgba(79,70,229,.04))' : 'transparent',
                      border: '1px solid ' + (c.id === chatId ? 'rgba(99,102,241,.25)' : 'transparent'),
                      transition: 'background .15s, border-color .15s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (c.id !== chatId) { e.currentTarget.style.background = '#14141a'; } }}
                    onMouseLeave={e => { if (c.id !== chatId) { e.currentTarget.style.background = 'transparent'; } }}
                  >
                    {renamingId === c.id ? (
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameChat(c.id, renameVal);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{
                            flex: 1, fontSize: 12, padding: '3px 6px', background: '#0a0a0c',
                            border: '1px solid #4f46e5', borderRadius: 4, color: '#e6e6e6', outline: 'none',
                          }}
                        />
                        <button onClick={() => renameChat(c.id, renameVal)} style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', padding: 2 }}><Check size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                        <Code2 size={12} style={{ marginTop: 2, flexShrink: 0, color: c.id === chatId ? '#a5b4fc' : '#5a5a5a' }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: c.id === chatId ? 600 : 500, color: '#dcdcdc',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
                          }}>
                            {c.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a5a5a', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                            {relTime(c.updated)}
                          </div>
                        </div>
                        <div className="vertex-row-actions"
                          style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .15s' }}
                          onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setRenamingId(c.id); setRenameVal(c.title || ''); }}
                            title="Rename"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 3, borderRadius: 4 }}>
                            <Edit2 size={11}/>
                          </button>
                          <button
                            onClick={() => { if (confirm('Delete this code chat?')) deleteChat(c.id); }}
                            title="Delete"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 3, borderRadius: 4 }}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Sidebar footer — upgrade card */}
            <div style={{ padding: 10, borderTop: '1px solid #1a1a1e' }}>
              <div style={{
                padding: '10px 11px', borderRadius: 9,
                background: 'linear-gradient(135deg, rgba(99,102,241,.08), rgba(79,70,229,.04))',
                border: '1px solid rgba(99,102,241,.18)',
                marginBottom: 9,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Sparkles size={12} color="#a5b4fc"/>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e6e6e6' }}>Vertex Pro</span>
                </div>
                <div style={{ fontSize: 10.5, color: '#8a8a8a', lineHeight: 1.5, marginBottom: 7 }}>
                  Unlimited chats · longer context · priority queue
                </div>
                <button style={{
                  width: '100%', padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  background: '#e6e6e6', border: 'none', color: '#0a0a0a',
                  fontSize: 11, fontWeight: 700,
                }}>
                  Upgrade
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8a8a8a' }}>
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }}/>
                ) : (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                  }}>
                    {(() => {
                      const name = user?.displayName || user?.email || '?';
                      return name.charAt(0).toUpperCase();
                    })()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.displayName || user?.email || 'Guest'}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#5a5a5a', fontFamily: 'JetBrains Mono' }}>
                    {savedChats.length} code {savedChats.length === 1 ? 'chat' : 'chats'}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ── Main chat area ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'transparent' }}>
          {/* Messages / empty state */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }} className="vertex-scr">
            {messages.length === 0 && !streaming ? (
              /* ── Empty state with suggestion chips ── */
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 30, textAlign: 'center',
                animation: 'vertexFadeIn .35s ease',
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 16, marginBottom: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #10b981 100%)',
                  boxShadow: '0 16px 40px rgba(79,70,229,.35), inset 0 2px 0 rgba(255,255,255,.18)',
                  animation: 'vertexFloat 3.5s ease-in-out infinite',
                  position: 'relative',
                }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4 L12 20 L20 4" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f5f5f5', margin: '0 0 8px', letterSpacing: '-.025em' }}>
                  What are we building today?
                </h1>
                <p style={{ fontSize: 14, color: '#8a8a8a', maxWidth: 460, lineHeight: 1.65, margin: '0 0 28px' }}>
                  I'm <span style={{ color: '#a5b4fc', fontWeight: 600 }}>Vertex</span> — your dedicated coding assistant. Debug errors, refactor messy code, ship features, or learn a new pattern. Code-first, no fluff.
                </p>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 10, maxWidth: 640, width: '100%',
                }}>
                  {STARTER_PROMPTS.map((s, idx) => {
                    const Icon = ICONS[s.icon] || FileCode;
                    return (
                      <button key={s.label}
                        onClick={() => { setInput(s.prompt); setTimeout(() => inputRef.current?.focus(), 30); }}
                        style={{
                          textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                          background: '#111114', border: '1px solid #1f1f23',
                          color: '#dcdcdc', display: 'flex', flexDirection: 'column', gap: 6,
                          transition: 'all .18s ease',
                          animation: `vertexFadeIn .4s ease ${0.05 * idx}s both`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)'; e.currentTarget.style.background = '#161619'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1f1f23'; e.currentTarget.style.background = '#111114'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <Icon size={15} color="#a5b4fc"/>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 28, fontSize: 10.5, color: '#5a5a5a', fontFamily: 'JetBrains Mono', letterSpacing: '.04em' }}>
                  ⌘/Ctrl + Enter to send  ·  ⌘/Ctrl + K for new chat  ·  ⌘/Ctrl + B for sidebar  ·  Esc to exit
                </div>
              </div>
            ) : (
              /* ── Messages list ── */
              <div style={{ maxWidth: 820, margin: '0 auto', padding: '22px 22px 12px' }}>
                {messages.map(m => (
                  <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts}
                    mdComponents={mdComponents} />
                ))}

                {/* Streaming bubble */}
                {(streaming || thinking) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14, animation: 'vertexFadeIn .2s ease' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      boxShadow: '0 4px 12px rgba(79,70,229,.25)',
                    }}>
                      <Terminal size={14} color="#fff"/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7a7a7a', fontFamily: 'JetBrains Mono', marginBottom: 6, fontWeight: 600, letterSpacing: '.02em' }}>
                        VERTEX
                        <span style={{ color: '#5a5a5a', fontWeight: 400 }}>·</span>
                        <span style={{ color: '#6a6a6a', fontWeight: 400 }}>powered by Vortis</span>
                        {thinking && <span style={{ color: '#a5b4fc' }}>· thinking…</span>}
                      </div>
                      {thinking ? (
                        <div style={{ display: 'flex', gap: 5, padding: '6px 0' }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{
                              width: 7, height: 7, borderRadius: '50%', background: '#6366f1',
                              animation: `vertexPulse 1.2s ease-in-out ${i*0.15}s infinite`,
                            }}/>
                          ))}
                        </div>
                      ) : streamText ? (
                        <div style={{
                          background: '#111114', border: '1px solid #1f1f23', borderRadius: '4px 12px 12px 12px',
                          padding: '13px 15px',
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
                            {streamText}
                          </ReactMarkdown>
                          <span style={{ display: 'inline-block', width: 8, height: 15, background: '#6366f1', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'vertexBlink 1s steps(2) infinite', borderRadius: 1 }}/>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Input area ── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid #1a1a1e', background: 'rgba(15,15,17,.85)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            padding: '14px 22px 18px',
          }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              <div style={{
                position: 'relative', background: '#141417', border: '1px solid #262629',
                borderRadius: 12, transition: 'border-color .18s, box-shadow .18s',
              }}
              onFocus={() => {}} // capture below
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
                  }}
                  placeholder={lang === 'auto'
                    ? 'Ask Vertex anything about code — paste an error, request a function, refactor something…'
                    : `Ask Vertex for ${LANGUAGES.find(l => l.id === lang)?.label} code — paste an error, request a function, refactor something…`
                  }
                  rows={1}
                  style={{
                    width: '100%', minHeight: 56, maxHeight: 240, resize: 'none',
                    padding: '14px 60px 14px 16px', background: 'transparent', border: 'none', outline: 'none',
                    color: '#e6e6e6', fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 4 }}>
                  {streaming ? (
                    <button onClick={stopStreaming} title="Stop"
                      style={{
                        width: 38, height: 38, borderRadius: 9, border: '1px solid #2e2e32', cursor: 'pointer',
                        background: '#1f1f23', color: '#e6e6e6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#28282c'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1f1f23'; }}
                    >
                      <Loader size={15} style={{ animation: 'vertexSpin 1s linear infinite' }}/>
                    </button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()}
                      title="Send (⌘/Ctrl + Enter)"
                      style={{
                        width: 38, height: 38, borderRadius: 9,
                        border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
                        background: input.trim() ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#1a1a1e',
                        color: input.trim() ? '#fff' : '#5a5a5a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .2s ease',
                        boxShadow: input.trim() ? '0 4px 12px rgba(79,70,229,.35)' : 'none',
                      }}
                      onMouseEnter={e => { if (input.trim()) { e.currentTarget.style.transform = 'translateY(-1px) scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(79,70,229,.45)'; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,.35)'; }}
                    >
                      <ArrowUp size={16} strokeWidth={2.5}/>
                    </button>
                  )}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 8, fontSize: 10.5, color: '#5a5a5a', fontFamily: 'JetBrains Mono',
              }}>
                <span>
                  {LANGUAGES.find(l => l.id === lang)?.label} · {STYLES.find(s => s.id === style)?.label}
                </span>
                <span>{input.length} chars</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Inline keyframes + reset */}
      <style>{`
        @keyframes vertexCodeFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vertexFadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes vertexScaleIn { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes vertexSlideInLeft { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vertexPulse { 0%, 100% { opacity: .4; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes vertexBlink { 50% { opacity: 0 } }
        @keyframes vertexSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes vertexFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }

        /* Scoped reset: everything inside [data-vertex] is immune to
           global stylesheets from the parent app. */
        [data-vertex], [data-vertex] *, [data-vertex] *::before, [data-vertex] *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          border: 0;
          font: inherit;
          font-size: inherit;
          color: inherit;
          background: transparent;
          list-style: none;
          text-decoration: none;
          vertical-align: baseline;
        }
        [data-vertex] button { cursor: pointer; background: transparent; border: none; color: inherit; font: inherit; }
        [data-vertex] input, [data-vertex] textarea, [data-vertex] select { font: inherit; color: inherit; background: transparent; border: none; outline: none; }
        [data-vertex] img { max-width: 100%; display: block; }

        /* Chat row actions appear on row hover */
        [data-vertex] .vertex-chat-row:hover .vertex-row-actions { opacity: 1 !important; }

        /* Custom scrollbar */
        [data-vertex] .vertex-scr::-webkit-scrollbar { width: 8px; height: 8px; }
        [data-vertex] .vertex-scr::-webkit-scrollbar-track { background: transparent; }
        [data-vertex] .vertex-scr::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 4px; }
        [data-vertex] .vertex-scr::-webkit-scrollbar-thumb:hover { background: #3a3a3e; }

        /* Code block inner scrollbar */
        [data-vertex-code] pre { scrollbar-width: thin; scrollbar-color: #2a2a2e transparent; }
        [data-vertex-code] pre::-webkit-scrollbar { height: 8px; width: 8px; }
        [data-vertex-code] pre::-webkit-scrollbar-track { background: transparent; }
        [data-vertex-code] pre::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 4px; }
        [data-vertex-code] pre::-webkit-scrollbar-thumb:hover { background: #3a3a3e; }
      `}</style>
    </div>,
    document.body
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  Single message bubble
 * ──────────────────────────────────────────────────────────────────────── */
const MessageBubble = React.memo(({ role, text, ts, mdComponents }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(text); } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    // User turn — gradient-tinted pill, right-aligned
    return (
      <div style={{
        display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end',
        animation: 'vertexFadeIn .25s ease',
      }}>
        <div style={{
          maxWidth: '78%', background: 'linear-gradient(135deg, rgba(99,102,241,.18), rgba(79,70,229,.10))',
          border: '1px solid rgba(99,102,241,.3)',
          color: '#e6e6e6', borderRadius: '12px 12px 4px 12px', padding: '11px 15px',
          fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {text}
        </div>
      </div>
    );
  }

  // Assistant turn — Vertex-mark avatar, plain flow
  return (
    <div style={{
      display: 'flex', gap: 12, marginBottom: 22,
      animation: 'vertexFadeIn .25s ease',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #10b981 100%)',
        boxShadow: '0 4px 12px rgba(79,70,229,.25), inset 0 1px 0 rgba(255,255,255,.18)',
        marginTop: 1,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 4 L12 20 L20 4" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
          fontSize: 11, color: '#7a7a7a', fontFamily: 'JetBrains Mono', fontWeight: 600, letterSpacing: '.02em',
        }}>
          VERTEX
          <span style={{ color: '#4a4a4a', fontWeight: 400 }}>·</span>
          <span style={{ color: '#6a6a6a', fontWeight: 400 }}>powered by Vortis</span>
          {ts && <span style={{ color: '#4a4a4a' }}>· {new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={copy} title="Copy response"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#5a5a5a', cursor: 'pointer', padding: 3, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3, transition: 'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e6e6e6'}
            onMouseLeave={e => e.currentTarget.style.color = '#5a5a5a'}
          >
            {copied ? <Check size={11} color="#10b981"/> : <Copy size={11}/>} {copied && <span style={{ color: '#10b981' }}>Copied</span>}
          </button>
        </div>
        <div style={{ color: '#dcdcdc' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

export default CodeChat;
