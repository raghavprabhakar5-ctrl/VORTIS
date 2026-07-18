/**
 * Vertex — Vortis Code Chat (Premium Edition)
 * ===================================================================
 * A full-screen, IDE-style coding assistant that takes over the
 * viewport when the Code2 icon is clicked. Designed to mirror the
 * z.ai Agent UI's split-pane layout (chat on the left, code viewer
 * on the right with tabs and line numbers) but rendered in a pure
 * black monochrome theme.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Top bar: logo · Vertex · by Vortis          [panel] [exit] │
 * ├──────────┬───────────────────────┬──────────────────────────┤
 * │          │  Chat panel           │  Code viewer panel       │
 * │ Sidebar  │  ┌─────────────────┐  │  ┌────────────────────┐  │
 * │          │  │ GLM-5.2 badge   │  │  │ Tab1 Tab2 Tab3  +  │  │
 * │ + New    │  │ Explored N files│  │  ├────────────────────┤  │
 * │ Search   │  │ Action cards    │  │  │ 1  code here       │  │
 * │ Chats    │  │ Chat messages   │  │  │ 2  with line nums  │  │
 * │ ...      │  │ ...             │  │  │ 3  + syntax hl     │  │
 * │ User     │  └─────────────────┘  │  └────────────────────┘  │
 * │          │  [+] [📁] [Aa] [→]    │                          │
 * └──────────┴───────────────────────┴──────────────────────────┘
 *
 * Visual language: pure black/white/gray monochrome — no color accents.
 *   #000000  app background (deepest black)
 *   #0a0a0a  sidebar / top bar
 *   #0d0d0d  chat panel background
 *   #111111  starter cards / chat bubbles
 *   #141414  inputs / code viewer bg
 *   #161616  hover states
 *   #1a1a1a  subtle borders
 *   #1c1c1c  inline code bg
 *   #1e1e1e  user message bubble bg
 *   #232323  medium borders
 *   #2a2a2a  strong borders
 *   #3a3a3a  button borders
 *   #4a4a4a  active borders
 *   #e6e6e6  primary text
 *   #dcdcdc  secondary text
 *   #c8c8c8  tertiary text
 *   #9a9a9a  muted text
 *   #8a8a8a  icon gray
 *   #6a6a6a  very muted text
 *   #5a5a5a  placeholder text
 *
 * Integration (3 small edits in your existing App.js):
 *   1. import CodeChat from './CodeChat';
 *   2. Toolbar button: onClick={() => setShowCodeChat(true)}
 *   3. Render: {showCodeChat && <CodeChat onClose={...} CodeBlock={CodeBlock}
 *      safeExecuteCodeLocally={safeExecuteCodeLocally}
 *      LANG_ENGINE={LANG_ENGINE} ENGINE_META={ENGINE_META} />}
 *
 * Backend: requests carry mode:'code' which routes to GLM-5.2 only.
 * History: saved under users/{uid}/code_chats/{chatId} (separate from main chat).
 *
 * Custom logo: VertexLogo is an abstract geometric mark — an outer
 * crystal (upward diamond) + inner V-chevron + apex dot. It does NOT
 * use the generic </> code brackets. Closer in spirit to OpenAI Codex's
 * diamond or Anthropic's asterisk.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  X,
  Code2,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  Copy,
  ArrowUp,
  ArrowDown,
  Loader,
  MessageSquare,
  Sparkles,
  Zap,
  Bug,
  BookOpen,
  RefreshCw,
  FileCode,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Terminal,
  Paperclip,
  Folder,
  Type,
  Send,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FilePen,
  FilePlus,
  CircleCheck,
  AlertCircle,
  Clock,
  Hash,
  Square,
  CornerDownLeft,
} from 'lucide-react';

const API = 'https://vortis-backend.vercel.app/api/bytez';

/* ═══════════════════════════════════════════════════════════════════
 *  VERTEX LOGO — custom abstract geometric mark
 *  An upward-pointing crystal formed by an outer diamond + inner
 *  V-chevron + an apex dot. Represents a "vertex" (highest point,
 *  focal node) without using the generic </> code brackets.
 *  Closer to OpenAI Codex's diamond or Anthropic's asterisk in spirit.
 * ═══════════════════════════════════════════════════════════════════ */
const VertexLogo = ({ size = 28, color = '#e6e6e6' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block' }}
    aria-hidden="true"
  >
    {/* Outer crystal — upward-pointing diamond (the "vertex") */}
    <path
      d="M16 2 L28 12 L16 30 L4 12 Z"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    {/* Inner V-chevron — reinforces the "V" of Vertex + upward motion */}
    <path
      d="M9 13 L16 22 L23 13"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Apex dot — the focal "vertex" point at the top */}
    <circle cx="16" cy="6.5" r="1.6" fill={color} />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════
 *  Auth header helper (self-contained — mirrors App.js getAuthHeader)
 * ═══════════════════════════════════════════════════════════════════ */
const getAuthHeader = async () => {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) return { 'Content-Type': 'application/json' };
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  } catch (_) {
    return { 'Content-Type': 'application/json' };
  }
};

/* ═══════════════════════════════════════════════════════════════════
 *  Starter prompts — premium, Codex-style with descriptions
 * ═══════════════════════════════════════════════════════════════════ */
const STARTER_PROMPTS = [
  {
    icon: 'bug',
    label: 'Debug an error',
    desc: 'Paste a stack trace or error message',
    prompt: "I'm hitting this error and need help fixing it:\n\n```\n\n```",
  },
  {
    icon: 'zap',
    label: 'Optimize code',
    desc: 'Speed up a slow function',
    prompt: 'Help me optimize this function for performance and readability:\n\n```\n\n```',
  },
  {
    icon: 'book',
    label: 'Explain code',
    desc: 'Understand what code does',
    prompt: 'Walk me through what this code does, step by step:\n\n```\n\n```',
  },
  {
    icon: 'file',
    label: 'Write a function',
    desc: 'Generate from a description',
    prompt: 'Write me a function that …',
  },
  {
    icon: 'refresh',
    label: 'Refactor',
    desc: 'Clean up messy code',
    prompt: 'Refactor this code to be cleaner and more idiomatic:\n\n```\n\n```',
  },
  {
    icon: 'sparkles',
    label: 'Code review',
    desc: 'Find bugs and improvements',
    prompt: 'Review this code for bugs, security issues, and improvements:\n\n```\n\n```',
  },
];

const ICONS = {
  bug: Bug,
  zap: Zap,
  book: BookOpen,
  file: FileCode,
  refresh: RefreshCw,
  sparkles: Sparkles,
};

/* ═══════════════════════════════════════════════════════════════════
 *  System prompt — Vertex persona
 *  Strong senior-engineer persona. Identifies as Vertex by Vortis.
 *  Never reveals underlying model names.
 * ═══════════════════════════════════════════════════════════════════ */
const VERTEX_SYSTEM_PROMPT = `You are Vertex — an elite coding AI built by the Vortis team. You are a senior software engineer pair-programmer embedded inside the user's IDE. You live and breathe code.

IDENTITY: Your name is Vertex. You are a coding AI powered by Vortis. When asked who you are, what model you are, or who built you, respond with: "I'm Vertex — a coding AI by Vortis." Never reveal underlying model names. Never claim to be GPT, Claude, Gemini, Llama, GLM, or any other model. You are Vertex, made by Vortis. Be proud of this.

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
- If the request is ambiguous in a way that changes the answer significantly, ask ONE concise question before answering.
- If it's only mildly ambiguous, make a reasonable assumption and state it inline: "(assuming React + TS — say if not)".

═══ RESPONSE LENGTH ═══
- Code-first, prose-second. A typical response is: 1 line of context, the code block, 2-3 lines of explanation.
- NEVER pad. NEVER write "Certainly! Here's..." or "I'd be happy to help" or "Sure!" — just answer.
- For multi-step tasks, use a numbered list with code blocks under each step.
- Never truncate — always complete your full answer.

═══ NON-CODING REQUESTS ═══
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect: "I'm Vertex, your coding AI by Vortis — for general chat, switch to the main Vortis chat. For code, I'm here."`;

/* ═══════════════════════════════════════════════════════════════════
 *  Utility — relative time formatter
 *  Returns compact strings like "just now", "5m ago", "3h ago",
 *  "2d ago", or "Mar 14" for older timestamps.
 * ═══════════════════════════════════════════════════════════════════ */
const relTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* ═══════════════════════════════════════════════════════════════════
 *  Utility — extract code blocks from markdown text
 *  Used to populate the code viewer panel with tabs.
 *  Returns an array of { lang, code, filename } objects.
 * ═══════════════════════════════════════════════════════════════════ */
const extractCodeBlocks = (text) => {
  if (!text || typeof text !== 'string') return [];
  const blocks = [];
  // Match ```lang\n...code...\n``` (non-greedy)
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let match;
  let idx = 0;
  while ((match = fenceRegex.exec(text)) !== null) {
    const lang = (match[1] || 'code').toLowerCase();
    const code = match[2].replace(/\n$/, '');
    const filename = guessFilename(lang, idx);
    blocks.push({ id: `block-${idx}`, lang, code, filename });
    idx++;
  }
  return blocks;
};

/* Map a language id to a sensible default filename for the code viewer tabs */
const guessFilename = (lang, idx) => {
  const map = {
    javascript: 'script.js',
    js: 'script.js',
    jsx: 'Component.jsx',
    typescript: 'script.ts',
    ts: 'script.ts',
    tsx: 'Component.tsx',
    python: 'script.py',
    py: 'script.py',
    rust: 'main.rs',
    rs: 'main.rs',
    go: 'main.go',
    java: 'Main.java',
    cpp: 'main.cpp',
    'c++': 'main.cpp',
    c: 'main.c',
    'csharp': 'Program.cs',
    'cs': 'Program.cs',
    php: 'index.php',
    ruby: 'script.rb',
    rb: 'script.rb',
    sql: 'query.sql',
    bash: 'commands.sh',
    sh: 'commands.sh',
    shell: 'commands.sh',
    html: 'index.html',
    css: 'styles.css',
    json: 'data.json',
    yaml: 'config.yaml',
    yml: 'config.yaml',
    toml: 'config.toml',
    markdown: 'README.md',
    md: 'README.md',
  };
  return map[lang] || `snippet-${idx + 1}.txt`;
};

/* ═══════════════════════════════════════════════════════════════════
 *  Tiny syntax highlighter — tokenizes a line of code into spans.
 *  Supports: comments, strings, numbers, keywords, functions, types.
 *  Not a full parser — fast regex-based, good enough for display.
 * ═══════════════════════════════════════════════════════════════════ */
const SYNTAX_KEYWORDS = new Set([
  // JS / TS
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'default', 'class', 'extends',
  'super', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'yield', 'await', 'async', 'static', 'get', 'set', 'public', 'private',
  'protected', 'readonly', 'abstract', 'interface', 'type', 'enum', 'namespace',
  'module', 'declare', 'as', 'is', 'keyof', 'infer', 'implements', 'true',
  'false', 'null', 'undefined', 'NaN', 'Infinity',
  // Python
  'def', 'lambda', 'elif', 'pass', 'with', 'try', 'except', 'finally', 'raise',
  'import', 'from', 'as', 'global', 'nonlocal', 'None', 'True', 'False', 'self',
  'cls', 'and', 'or', 'not', 'is', 'in', 'print',
  // Rust
  'fn', 'let', 'mut', 'pub', 'use', 'mod', 'struct', 'impl', 'trait', 'where',
  'crate', 'extern', 'ref', 'move', 'box', 'Self',
  // Go
  'func', 'package', 'import', 'type', 'struct', 'interface', 'go', 'defer',
  'select', 'chan', 'range', 'map', 'fallthrough',
  // Java / C++
  'public', 'private', 'protected', 'class', 'interface', 'enum', 'extends',
  'implements', 'package', 'import', 'static', 'final', 'void', 'int', 'long',
  'double', 'float', 'boolean', 'bool', 'char', 'byte', 'short', 'String',
  'System',
]);

const SYNTAX_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'object', 'Array',
  'Promise', 'Map', 'Set', 'Record', 'Partial', 'Required', 'Readonly', 'Pick',
  'Omit', 'Tuple', 'List', 'Dict', 'Optional', 'Vec', 'HashMap', 'Result',
  'Option', 'Some', 'None', 'Ok', 'Err', 'int', 'str', 'float', 'bool', 'list',
  'dict', 'tuple', 'set', 'bytes',
]);

/**
 * highlightLine — returns React spans for a single line of code.
 * Colors are tuned for a black background:
 *   keyword  → #c8c8c8 (light gray, bold)
 *   string   → #9a9a9a (muted gray)
 *   number   → #b8b8b8 (mid gray)
 *   comment  → #5a5a5a (very muted, italic)
 *   function → #dcdcdc (secondary text)
 *   type     → #c8c8c8 (light gray)
 *   default  → #e6e6e6 (primary text)
 */
const highlightLine = (line, lang) => {
  if (!line) return [{ text: ' ', color: '#e6e6e6' }];

  const tokens = [];
  // Combined regex: comments | strings | numbers | identifiers | operators | whitespace
  // Order matters — earlier alternatives win.
  const patterns = [
    { type: 'comment', re: lang === 'python' ? /^#.*/ : /^\/\/.*|^\/*\*[\s\S]*?\*\// },
    { type: 'string', re: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'|^`(?:[^`\\]|\\.)*`/ },
    { type: 'number', re: /^\d+\.?\d*(?:[eE][+-]?\d+)?|^\.\d+/ },
    { type: 'ident', re: /^[a-zA-Z_$][a-zA-Z0-9_$]*/ },
    { type: 'ws', re: /^\s+/ },
    { type: 'op', re: /^[^\w\s]/ },
  ];

  let remaining = line;
  let safety = 0;
  while (remaining.length > 0 && safety < 200) {
    safety++;
    let matched = false;
    for (const { type, re } of patterns) {
      const m = re.exec(remaining);
      if (m && m[0].length > 0) {
        const text = m[0];
        if (type === 'comment') {
          tokens.push({ text, color: '#5a5a5a', italic: true });
        } else if (type === 'string') {
          tokens.push({ text, color: '#9a9a9a' });
        } else if (type === 'number') {
          tokens.push({ text, color: '#b8b8b8' });
        } else if (type === 'ident') {
          // Check if next non-space char is '(' → function call
          const after = remaining.slice(text.length);
          const isCall = /^\s*\(/.test(after);
          if (SYNTAX_KEYWORDS.has(text)) {
            tokens.push({ text, color: '#dcdcdc', bold: true });
          } else if (SYNTAX_TYPES.has(text)) {
            tokens.push({ text, color: '#c8c8c8' });
          } else if (isCall) {
            tokens.push({ text, color: '#dcdcdc' });
          } else if (/^[A-Z]/.test(text)) {
            // Capitalized → likely a type/class
            tokens.push({ text, color: '#c8c8c8' });
          } else {
            tokens.push({ text, color: '#e6e6e6' });
          }
        } else if (type === 'ws') {
          tokens.push({ text, color: '#e6e6e6' });
        } else {
          // operator
          tokens.push({ text, color: '#8a8a8a' });
        }
        remaining = remaining.slice(text.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Fallback: take one char so we don't loop forever
      tokens.push({ text: remaining[0], color: '#e6e6e6' });
      remaining = remaining.slice(1);
    }
  }
  return tokens;
};

/* ═══════════════════════════════════════════════════════════════════
 *  HighlightedCode — renders a multi-line code string with line
 *  numbers and per-line syntax highlighting. Used inside the code
 *  viewer panel and inside FallbackCodeBlock.
 * ═══════════════════════════════════════════════════════════════════ */
const HighlightedCode = ({ code, lang, showLineNumbers = true }) => {
  const lines = code.split('\n');
  return (
    <pre
      style={{
        margin: 0,
        padding: 0,
        fontFamily: '"JetBrains Mono", "Geist Mono", "Fira Code", ui-monospace, monospace',
        fontSize: 12.5,
        lineHeight: 1.7,
        color: '#e6e6e6',
        whiteSpace: 'pre',
        overflowX: 'auto',
        tabSize: 2,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            minHeight: '1.7em',
            padding: '0 12px 0 0',
          }}
        >
          {showLineNumbers && (
            <span
              style={{
                display: 'inline-block',
                minWidth: 40,
                paddingRight: 16,
                textAlign: 'right',
                color: '#3a3a3a',
                userSelect: 'none',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {i + 1}
            </span>
          )}
          <span style={{ flex: 1, whiteSpace: 'pre' }}>
            {highlightLine(line, lang).map((tok, j) => (
              <span
                key={j}
                style={{
                  color: tok.color,
                  fontWeight: tok.bold ? 600 : 400,
                  fontStyle: tok.italic ? 'italic' : 'normal',
                }}
              >
                {tok.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  FallbackCodeBlock — used when the parent doesn't pass a real
 *  CodeBlock component. Renders a code block with a header (language
 *  label + copy button) and syntax-highlighted code with line numbers.
 * ═══════════════════════════════════════════════════════════════════ */
const FallbackCodeBlock = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div
      style={{
        margin: '10px 0',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #1a1a1a',
        background: '#0a0a0a',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px 6px 14px',
          background: '#0d0d0d',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: '"JetBrains Mono", monospace',
            color: '#6a6a6a',
            letterSpacing: '.04em',
            fontWeight: 600,
          }}
        >
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'transparent',
            border: '1px solid #232323',
            color: copied ? '#9a9a9a' : '#6a6a6a',
            fontSize: 10.5,
            cursor: 'pointer',
            fontFamily: '"JetBrains Mono", monospace',
            padding: '3px 8px',
            borderRadius: 4,
            transition: 'all .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#3a3a3a';
            e.currentTarget.style.color = '#dcdcdc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#232323';
            e.currentTarget.style.color = copied ? '#9a9a9a' : '#6a6a6a';
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={{ padding: '10px 0', overflowX: 'auto' }}>
        <HighlightedCode code={codeText} lang={lang} showLineNumbers />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  ActionCard — a compact card shown inside assistant chat bubbles
 *  to represent a file action (e.g. "Wrote 1 file", "Edit File X",
 *  "Explored 2 files"). Mirrors the action chips in the z.ai Agent UI.
 * ═══════════════════════════════════════════════════════════════════ */
const ActionCard = ({ icon: Icon, label, detail, onClick, accent }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '8px 10px',
      borderRadius: 7,
      background: '#0d0d0d',
      border: '1px solid #1a1a1a',
      cursor: onClick ? 'pointer' : 'default',
      marginBottom: 6,
      textAlign: 'left',
      transition: 'all .15s',
    }}
    onMouseEnter={(e) => {
      if (onClick) {
        e.currentTarget.style.borderColor = '#2a2a2a';
        e.currentTarget.style.background = '#111111';
      }
    }}
    onMouseLeave={(e) => {
      if (onClick) {
        e.currentTarget.style.borderColor = '#1a1a1a';
        e.currentTarget.style.background = '#0d0d0d';
      }
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        background: '#141414',
        border: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={12} color={accent || '#9a9a9a'} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#dcdcdc',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      {detail && (
        <div
          style={{
            fontSize: 10.5,
            color: '#6a6a6a',
            fontFamily: '"JetBrains Mono", monospace',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {detail}
        </div>
      )}
    </div>
    {onClick && <ChevronRight size={12} color="#4a4a4a" />}
  </button>
);

/* ═══════════════════════════════════════════════════════════════════
 *  ThinkingDots — three pulsing dots shown while the AI is "thinking"
 *  before the first token arrives.
 * ═══════════════════════════════════════════════════════════════════ */
const ThinkingDots = () => (
  <div style={{ display: 'flex', gap: 4, padding: '6px 0' }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#8a8a8a',
          animation: `vertexPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}
      />
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  CHUNK_BOUNDARY_1 — additional sections appended in subsequent edits.
 * ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
 *  CodeViewTab — a single tab in the code viewer's tab strip.
 *  Shows a file icon, the filename, and a close button.
 * ═══════════════════════════════════════════════════════════════════ */
const CodeViewTab = ({ tab, active, onClick, onClose }) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 10px',
        background: active ? '#141414' : 'transparent',
        borderBottom: active ? '1px solid #141414' : '1px solid transparent',
        borderRight: '1px solid #1a1a1a',
        color: active ? '#dcdcdc' : '#6a6a6a',
        fontSize: 11.5,
        fontFamily: '"JetBrains Mono", monospace',
        cursor: 'pointer',
        maxWidth: 200,
        transition: 'all .12s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = '#0d0d0d';
          e.currentTarget.style.color = '#9a9a9a';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#6a6a6a';
        }
      }}
      title={tab.filename}
    >
      <FileCode size={12} style={{ flexShrink: 0, color: active ? '#9a9a9a' : '#4a4a4a' }} />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: active ? 600 : 400,
        }}
      >
        {tab.filename}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#4a4a4a',
          cursor: 'pointer',
          padding: 1,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginLeft: 2,
          transition: 'all .12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#232323';
          e.currentTarget.style.color = '#dcdcdc';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#4a4a4a';
        }}
        title="Close tab"
      >
        <X size={11} />
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  CodeViewPanel — the right-side code editor panel.
 *  Renders a tab strip with all code blocks extracted from the
 *  conversation, plus the active code block with line numbers,
 *  syntax highlighting, and a copy button.
 *
 *  Props:
 *    tabs:        [{ id, lang, code, filename }]
 *    activeId:    string
 *    onSelect:    (id) => void
 *    onClose:     (id) => void
 *    emptyHint:   string (shown when no tabs)
 * ═══════════════════════════════════════════════════════════════════ */
const CodeViewPanel = ({ tabs, activeId, onSelect, onClose, emptyHint }) => {
  const [copied, setCopied] = useState(false);
  const activeTab = tabs.find((t) => t.id === activeId) || tabs[0];

  const copyActive = () => {
    if (!activeTab) return;
    navigator.clipboard.writeText(activeTab.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
        borderLeft: '1px solid #1a1a1a',
        minHeight: 0,
      }}
    >
      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: '#0d0d0d',
          borderBottom: '1px solid #1a1a1a',
          overflowX: 'auto',
          minHeight: 34,
          flexShrink: 0,
        }}
        className="vertex-scr"
      >
        {tabs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              fontSize: 11,
              color: '#4a4a4a',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '.04em',
            }}
          >
            <Code2 size={12} style={{ marginRight: 6, opacity: 0.5 }} />
            CODE VIEWER
          </div>
        ) : (
          tabs.map((tab) => (
            <CodeViewTab
              key={tab.id}
              tab={tab}
              active={tab.id === (activeId || tabs[0].id)}
              onClick={() => onSelect(tab.id)}
              onClose={() => onClose(tab.id)}
            />
          ))
        )}
        {/* Spacer + actions */}
        <div style={{ flex: 1 }} />
        {activeTab && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: '#4a4a4a',
                fontFamily: '"JetBrains Mono", monospace',
                marginRight: 6,
                letterSpacing: '.04em',
              }}
            >
              {activeTab.code.split('\n').length} lines
            </span>
            <button
              onClick={copyActive}
              style={{
                background: 'transparent',
                border: '1px solid #1a1a1a',
                color: copied ? '#9a9a9a' : '#6a6a6a',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 10.5,
                fontFamily: '"JetBrains Mono", monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2a2a2a';
                e.currentTarget.style.color = '#dcdcdc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1a1a1a';
                e.currentTarget.style.color = copied ? '#9a9a9a' : '#6a6a6a';
              }}
              title="Copy code"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Code body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: '14px 0',
          background: '#0a0a0a',
        }}
        className="vertex-scr"
      >
        {tabs.length === 0 || !activeTab ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 30,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0d0d0d',
                border: '1px solid #1a1a1a',
              }}
            >
              <Code2 size={26} color="#4a4a4a" />
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#6a6a6a',
                marginBottom: 4,
              }}
            >
              {emptyHint || 'No code generated yet'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#4a4a4a',
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              When the AI responds with code blocks, they'll appear here as
              tabs you can switch between, copy, and read with line numbers.
            </div>
          </div>
        ) : (
          <HighlightedCode
            code={activeTab.code}
            lang={activeTab.lang}
            showLineNumbers
          />
        )}
      </div>

      {/* Status bar (bottom) */}
      <div
        style={{
          height: 24,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: '#0d0d0d',
          borderTop: '1px solid #1a1a1a',
          fontSize: 10,
          color: '#4a4a4a',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '.04em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#6a6a6a',
              display: 'inline-block',
            }}
          />
          {activeTab ? activeTab.lang.toUpperCase() : 'IDLE'}
        </span>
        <span>UTF-8 · LF · TypeScript</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  CHUNK_BOUNDARY_2
 * ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
 *  SidebarHeader — top of the sidebar. Shows the Vertex logo mark +
 *  "VERTEX" wordmark + a minimize button to collapse the sidebar.
 * ═══════════════════════════════════════════════════════════════════ */
const SidebarHeader = ({ onCollapse }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 12px 10px',
      borderBottom: '1px solid #1a1a1a',
      flexShrink: 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: '#e6e6e6',
          border: '1px solid #e6e6e6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <VertexLogo size={17} color="#0a0a0a" />
      </div>
      <div style={{ lineHeight: 1.1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#dcdcdc',
            letterSpacing: '.04em',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          VERTEX
        </div>
        <div style={{ fontSize: 9.5, color: '#5a5a5a', marginTop: 2 }}>
          by Vortis
        </div>
      </div>
    </div>
    <button
      onClick={onCollapse}
      title="Collapse sidebar"
      style={{
        background: 'transparent',
        border: '1px solid #1a1a1a',
        color: '#6a6a6a',
        cursor: 'pointer',
        padding: 4,
        borderRadius: 4,
        display: 'flex',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#2a2a2a';
        e.currentTarget.style.color = '#dcdcdc';
        e.currentTarget.style.background = '#111111';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1a1a1a';
        e.currentTarget.style.color = '#6a6a6a';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <PanelLeftClose size={13} />
    </button>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  NewChatButton — the prominent "New Code Chat" CTA at the top of
 *  the sidebar. Flat monochrome, Codex "New task" style.
 * ═══════════════════════════════════════════════════════════════════ */
const NewChatButton = ({ onClick }) => (
  <div style={{ padding: '10px 10px 8px' }}>
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '9px 12px',
        borderRadius: 7,
        cursor: 'pointer',
        background: '#e6e6e6',
        border: '1px solid #e6e6e6',
        color: '#0a0a0a',
        fontSize: 12.5,
        fontWeight: 600,
        transition: 'all .15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#dcdcdc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#e6e6e6';
      }}
    >
      <Plus size={14} strokeWidth={2.5} />
      New Code Chat
    </button>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  SearchBar — the conversation search input.
 * ═══════════════════════════════════════════════════════════════════ */
const SearchBar = ({ value, onChange }) => (
  <div style={{ padding: '0 10px 8px' }}>
    <div style={{ position: 'relative' }}>
      <Search
        size={13}
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#5a5a5a',
          pointerEvents: 'none',
        }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search conversations"
        style={{
          width: '100%',
          padding: '7px 10px 7px 28px',
          fontSize: 12,
          background: '#0d0d0d',
          border: '1px solid #1a1a1a',
          borderRadius: 6,
          color: '#dcdcdc',
          outline: 'none',
          fontFamily: 'inherit',
          transition: 'border-color .15s',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#2a2a2a')}
        onBlur={(e) => (e.target.style.borderColor = '#1a1a1a')}
      />
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  ConversationItem — a single conversation row in the sidebar list.
 *  Shows a code icon, title, relative time, and hover-revealed
 *  rename + delete actions. Supports inline rename via the
 *  `renaming` prop.
 * ═══════════════════════════════════════════════════════════════════ */
const ConversationItem = ({
  chat,
  active,
  renaming,
  renameVal,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  onLoad,
  onDelete,
}) => {
  if (renaming) {
    return (
      <div
        style={{
          padding: '8px 10px',
          borderRadius: 6,
          marginBottom: 2,
          background: '#111111',
          border: '1px solid #2a2a2a',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            style={{
              flex: 1,
              fontSize: 12,
              padding: '3px 6px',
              background: '#0a0a0a',
              border: '1px solid #3a3a3a',
              borderRadius: 4,
              color: '#dcdcdc',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onRenameCommit}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9a9a9a',
              cursor: 'pointer',
              padding: 2,
            }}
            title="Save name"
          >
            <Check size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onLoad}
      style={{
        padding: '8px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        marginBottom: 2,
        background: active ? '#141414' : 'transparent',
        border: '1px solid ' + (active ? '#232323' : 'transparent'),
        transition: 'background .12s, border-color .12s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = '#0d0d0d';
          e.currentTarget.style.borderColor = '#1a1a1a';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Code2
          size={12}
          style={{
            marginTop: 2,
            flexShrink: 0,
            color: active ? '#9a9a9a' : '#4a4a4a',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? '#dcdcdc' : '#9a9a9a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
            }}
          >
            {chat.title || 'Untitled'}
          </div>
          <div
            style={{
              fontSize: 9.5,
              color: '#4a4a4a',
              fontFamily: '"JetBrains Mono", monospace',
              marginTop: 2,
            }}
          >
            {relTime(chat.updated)}
          </div>
        </div>
        <div
          className="chat-row-actions"
          style={{
            display: 'flex',
            gap: 1,
            opacity: 0,
            transition: 'opacity .12s',
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRenameStart}
            title="Rename"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5a5a5a',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              transition: 'color .12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#dcdcdc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#5a5a5a')}
          >
            <Edit2 size={10} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5a5a5a',
              cursor: 'pointer',
              padding: 3,
              borderRadius: 4,
              transition: 'color .12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#dcdcdc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#5a5a5a')}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  ConversationList — the scrollable list of saved conversations.
 *  Shows an empty state when there are no chats (or no search matches).
 * ═══════════════════════════════════════════════════════════════════ */
const ConversationList = ({
  chats,
  activeId,
  search,
  renamingId,
  renameVal,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  onLoad,
  onDelete,
}) => {
  if (chats.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            margin: '0 auto 12px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
          }}
        >
          <MessageSquare size={20} color="#4a4a4a" />
        </div>
        <div
          style={{
            color: '#6a6a6a',
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          {search ? 'No matches found' : 'No conversations yet'}
        </div>
        <div style={{ color: '#4a4a4a', fontSize: 10.5 }}>
          {search ? 'Try a different search term' : 'Start coding to begin'}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Section header */}
      <div
        style={{
          padding: '4px 12px 6px',
          fontSize: 10,
          fontWeight: 700,
          color: '#4a4a4a',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        {search ? `Results (${chats.length})` : `Recent (${chats.length})`}
      </div>
      {chats.map((c) => (
        <ConversationItem
          key={c.id}
          chat={c}
          active={c.id === activeId}
          renaming={renamingId === c.id}
          renameVal={renameVal}
          onRenameChange={onRenameChange}
          onRenameCommit={() => onRenameCommit(c.id)}
          onRenameCancel={onRenameCancel}
          onRenameStart={() => onRenameStart(c)}
          onLoad={() => onLoad(c.id)}
          onDelete={() => {
            if (confirm('Delete this conversation?')) onDelete(c.id);
          }}
        />
      ))}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  UserFooter — bottom of the sidebar. Shows the user's avatar,
 *  display name, conversation count, and a settings gear button.
 * ═══════════════════════════════════════════════════════════════════ */
const UserFooter = ({ user, chatCount }) => (
  <div
    style={{
      padding: '10px 12px',
      borderTop: '1px solid #1a1a1a',
      background: '#0d0d0d',
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      flexShrink: 0,
    }}
  >
    {user?.photoURL ? (
      <img
        src={user.photoURL}
        alt=""
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          filter: 'grayscale(1) contrast(1.1)',
          border: '1px solid #1a1a1a',
        }}
      />
    ) : (
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: '#1c1c1c',
          border: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9a9a9a',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {(user?.displayName || user?.email || '?')[0].toUpperCase()}
      </div>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: '#dcdcdc',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}
      >
        {user?.displayName || user?.email?.split('@')[0] || 'User'}
      </div>
      <div
        style={{
          fontSize: 9.5,
          color: '#5a5a5a',
          fontFamily: '"JetBrains Mono", monospace',
          marginTop: 2,
        }}
      >
        {chatCount} {chatCount === 1 ? 'conversation' : 'conversations'}
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  Sidebar — composes all the sidebar sub-components into the
 *  full sidebar. Receives all the props it needs from the parent.
 * ═══════════════════════════════════════════════════════════════════ */
const Sidebar = ({
  user,
  chats,
  activeChatId,
  search,
  renamingId,
  renameVal,
  onSearchChange,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  onNewChat,
  onLoadChat,
  onDeleteChat,
  onCollapse,
}) => (
  <aside
    style={{
      width: 256,
      flexShrink: 0,
      borderRight: '1px solid #1a1a1a',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      animation: 'vertexSlideIn .18s ease',
    }}
  >
    <SidebarHeader onCollapse={onCollapse} />
    <NewChatButton onClick={onNewChat} />
    <SearchBar value={search} onChange={onSearchChange} />
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 6px 6px',
        minHeight: 0,
      }}
      className="vertex-scr"
    >
      <ConversationList
        chats={chats}
        activeId={activeChatId}
        search={search}
        renamingId={renamingId}
        renameVal={renameVal}
        onRenameChange={onRenameChange}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
        onRenameStart={onRenameStart}
        onLoad={onLoadChat}
        onDelete={onDeleteChat}
      />
    </div>
    <UserFooter user={user} chatCount={chats.length} />
  </aside>
);

/* ═══════════════════════════════════════════════════════════════════
 *  CHUNK_BOUNDARY_3
 * ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
 *  TopBar — the top header bar. Shows the sidebar toggle, Vertex
 *  logo + name + tagline on the left; code panel toggle + exit on
 *  the right. Glass-morphic dark surface.
 * ═══════════════════════════════════════════════════════════════════ */
const TopBar = ({
  sidebarOpen,
  onToggleSidebar,
  codePanelOpen,
  onToggleCodePanel,
  hasCodeTabs,
  onClose,
}) => (
  <header
    style={{
      height: 48,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 14px',
      borderBottom: '1px solid #1a1a1a',
      background: '#0a0a0a',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {!sidebarOpen && (
        <button
          onClick={onToggleSidebar}
          title="Show sidebar"
          style={{
            background: 'transparent',
            border: '1px solid #1a1a1a',
            color: '#6a6a6a',
            cursor: 'pointer',
            padding: 5,
            borderRadius: 5,
            display: 'flex',
            transition: 'all .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#2a2a2a';
            e.currentTarget.style.color = '#dcdcdc';
            e.currentTarget.style.background = '#111111';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#1a1a1a';
            e.currentTarget.style.color = '#6a6a6a';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: '#e6e6e6',
            border: '1px solid #e6e6e6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <VertexLogo size={18} color="#0a0a0a" />
        </div>
        <div style={{ lineHeight: 1.1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: '#dcdcdc',
              letterSpacing: '-.01em',
              lineHeight: 1,
            }}
          >
            Vertex
          </div>
          <div style={{ fontSize: 9.5, color: '#5a5a5a', marginTop: 3 }}>
            Coding AI by <span style={{ color: '#8a8a8a', fontWeight: 600 }}>Vortis</span>
          </div>
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Code panel toggle — only enabled if there are code tabs */}
      <button
        onClick={onToggleCodePanel}
        disabled={!hasCodeTabs}
        title={codePanelOpen ? 'Hide code panel' : 'Show code panel'}
        style={{
          background: codePanelOpen ? '#141414' : 'transparent',
          border: '1px solid ' + (codePanelOpen ? '#2a2a2a' : '#1a1a1a'),
          color: codePanelOpen ? '#dcdcdc' : '#6a6a6a',
          cursor: hasCodeTabs ? 'pointer' : 'not-allowed',
          padding: '5px 9px',
          borderRadius: 5,
          fontSize: 11,
          fontFamily: '"JetBrains Mono", monospace',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          opacity: hasCodeTabs ? 1 : 0.4,
          transition: 'all .15s',
        }}
      >
        {codePanelOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
        {codePanelOpen ? 'Hide code' : 'Show code'}
      </button>

      <div style={{ width: 1, height: 18, background: '#1a1a1a', margin: '0 2px' }} />

      <button
        onClick={onClose}
        title="Exit to Vortis (Esc)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'transparent',
          border: '1px solid #1a1a1a',
          color: '#6a6a6a',
          fontSize: 12,
          borderRadius: 5,
          padding: '5px 10px',
          cursor: 'pointer',
          transition: 'all .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#111111';
          e.currentTarget.style.borderColor = '#2a2a2a';
          e.currentTarget.style.color = '#dcdcdc';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = '#1a1a1a';
          e.currentTarget.style.color = '#6a6a6a';
        }}
      >
        <X size={13} /> Exit
      </button>
    </div>
  </header>
);

/* ═══════════════════════════════════════════════════════════════════
 *  EmptyState — the welcome screen shown when there are no messages.
 *  Hero logo mark + headline + subtitle + 6 starter prompt cards.
 * ═══════════════════════════════════════════════════════════════════ */
const EmptyState = ({ onPickPrompt }) => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
    }}
  >
    {/* Logo block */}
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 14,
        marginBottom: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d0d0d',
        border: '1px solid #1a1a1a',
      }}
    >
      <VertexLogo size={36} color="#dcdcdc" />
    </div>

    <h1
      style={{
        fontSize: 26,
        fontWeight: 600,
        color: '#e6e6e6',
        margin: '0 0 8px',
        letterSpacing: '-.025em',
        lineHeight: 1.2,
      }}
    >
      What should we build?
    </h1>
    <p
      style={{
        fontSize: 13.5,
        color: '#6a6a6a',
        maxWidth: 460,
        lineHeight: 1.6,
        margin: '0 0 30px',
      }}
    >
      I'm <span style={{ color: '#9a9a9a', fontWeight: 600 }}>Vertex</span> — your coding AI by Vortis. Debug,
      refactor, ship features, or learn a new pattern.
    </p>

    {/* Starter prompt cards */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 8,
        maxWidth: 660,
        width: '100%',
      }}
    >
      {STARTER_PROMPTS.map((s) => {
        const Icon = ICONS[s.icon] || FileCode;
        return (
          <button
            key={s.label}
            onClick={() => onPickPrompt(s.prompt)}
            style={{
              textAlign: 'left',
              padding: '11px 13px',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#0d0d0d',
              border: '1px solid #1a1a1a',
              color: '#dcdcdc',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              transition: 'all .14s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a';
              e.currentTarget.style.background = '#111111';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1a';
              e.currentTarget.style.background = '#0d0d0d';
            }}
          >
            <Icon size={14} color="#9a9a9a" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#dcdcdc' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 10.5, color: '#5a5a5a', lineHeight: 1.4 }}>
              {s.desc}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  MessageBubble — a single chat message (user or assistant).
 *  - User messages: right-aligned, dark gray bubble.
 *  - Assistant messages: left-aligned, logo avatar + action cards
 *    (auto-generated from code blocks in the message) + markdown body
 *    + copy button.
 * ═══════════════════════════════════════════════════════════════════ */
const MessageBubble = React.memo(({ role, text, ts, mdComponents }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // For assistant messages, extract code blocks to show as action cards
  const codeBlocks = !isUser ? extractCodeBlocks(text) : [];

  if (isUser) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 18,
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            maxWidth: '78%',
            background: '#1c1c1c',
            border: '1px solid #232323',
            color: '#e6e6e6',
            borderRadius: '12px 12px 4px 12px',
            padding: '10px 14px',
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#e6e6e6',
          border: '1px solid #e6e6e6',
          marginTop: 2,
        }}
      >
        <VertexLogo size={16} color="#0a0a0a" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row: VERTEX label + timestamp + copy */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 5,
            fontSize: 11,
            color: '#5a5a5a',
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 600,
          }}
        >
          VERTEX
          {ts && (
            <span style={{ color: '#4a4a4a', opacity: 0.7, fontWeight: 400 }}>
              · {new Date(ts).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            onClick={copy}
            title="Copy response"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: copied ? '#9a9a9a' : '#4a4a4a',
              cursor: 'pointer',
              padding: 2,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10.5,
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#dcdcdc')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = copied ? '#9a9a9a' : '#4a4a4a')
            }
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}{' '}
            {copied ? 'Copied' : ''}
          </button>
        </div>

        {/* Action cards (file actions) — only if there are code blocks */}
        {codeBlocks.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <ActionCard
              icon={FilePlus}
              label={`Wrote ${codeBlocks.length} ${codeBlocks.length === 1 ? 'file' : 'files'}`}
              detail={codeBlocks.map((b) => b.filename).join(' · ')}
            />
          </div>
        )}

        {/* Markdown body */}
        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
            borderRadius: '0 10px 10px 10px',
            padding: '12px 14px',
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={mdComponents}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════
 *  StreamingBubble — the in-progress assistant message shown while
 *  the AI is thinking or streaming tokens. Shows the logo avatar +
 *  VERTEX label + (thinking dots | streaming markdown + cursor).
 * ═══════════════════════════════════════════════════════════════════ */
const StreamingBubble = ({ thinking, streamText, mdComponents }) => (
  <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e6e6e6',
        border: '1px solid #e6e6e6',
        marginTop: 2,
      }}
    >
      <VertexLogo size={16} color="#0a0a0a" />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          color: '#5a5a5a',
          fontFamily: '"JetBrains Mono", monospace',
          marginBottom: 5,
          fontWeight: 600,
        }}
      >
        VERTEX {thinking && <span style={{ color: '#8a8a8a' }}>· thinking</span>}
      </div>
      {thinking ? (
        <ThinkingDots />
      ) : streamText ? (
        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
            borderRadius: '0 10px 10px 10px',
            padding: '12px 14px',
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={mdComponents}
          >
            {streamText}
          </ReactMarkdown>
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 14,
              background: '#9a9a9a',
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'vertexBlink 1s steps(2) infinite',
            }}
          />
        </div>
      ) : null}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  Composer — the message input area at the bottom of the chat panel.
 *  Features:
 *    - Auto-resizing textarea (clamped between 52 and 240px)
 *    - Enter = send, Shift+Enter = newline, IME composing exempt
 *    - Left toolbar: + (attach), folder (upload), Aa (format)
 *    - Right: send button (icon swaps to stop button while streaming)
 *    - Footer line: "Vertex · by Vortis" centered
 * ═══════════════════════════════════════════════════════════════════ */
const Composer = ({
  input,
  onChange,
  onSend,
  onStop,
  streaming,
  inputRef,
  textareaRef,
}) => {
  // Auto-resize the textarea as the user types
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(240, Math.max(52, ta.scrollHeight)) + 'px';
  }, [input]);

  const canSend = input.trim().length > 0 && !streaming;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid #1a1a1a',
        background: '#0a0a0a',
        padding: '12px 22px 16px',
      }}
    >
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div
          style={{
            position: 'relative',
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
            borderRadius: 10,
            transition: 'border-color .15s',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Vertex anything about code…"
            rows={1}
            style={{
              width: '100%',
              minHeight: 52,
              maxHeight: 240,
              resize: 'none',
              padding: '14px 56px 14px 14px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e6e6e6',
              fontSize: 14,
              lineHeight: 1.55,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onFocus={(e) =>
              (e.target.parentElement.style.borderColor = '#2a2a2a')
            }
            onBlur={(e) =>
              (e.target.parentElement.style.borderColor = '#1a1a1a')
            }
          />

          {/* Send / stop button */}
          <div
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              display: 'flex',
              gap: 4,
            }}
          >
            {streaming ? (
              <button
                onClick={onStop}
                title="Stop"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 7,
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  background: '#141414',
                  color: '#dcdcdc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Loader size={14} style={{ animation: 'vertexSpin 1s linear infinite' }} />
              </button>
            ) : (
              <button
                onClick={() => canSend && onSend()}
                disabled={!canSend}
                title="Send"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 7,
                  border: 'none',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                  background: canSend ? '#e6e6e6' : '#141414',
                  color: canSend ? '#0a0a0a' : '#3a3a3a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: canSend ? 1 : 0.6,
                  transition: 'opacity .15s',
                }}
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Footer: toolbar buttons + brand line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 8,
          }}
        >
          <button
            title="Attach file (coming soon)"
            style={{
              background: 'transparent',
              border: '1px solid #1a1a1a',
              color: '#5a5a5a',
              cursor: 'pointer',
              padding: 5,
              borderRadius: 5,
              display: 'flex',
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a';
              e.currentTarget.style.color = '#9a9a9a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1a';
              e.currentTarget.style.color = '#5a5a5a';
            }}
          >
            <Plus size={13} />
          </button>
          <button
            title="Upload file (coming soon)"
            style={{
              background: 'transparent',
              border: '1px solid #1a1a1a',
              color: '#5a5a5a',
              cursor: 'pointer',
              padding: 5,
              borderRadius: 5,
              display: 'flex',
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a';
              e.currentTarget.style.color = '#9a9a9a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1a';
              e.currentTarget.style.color = '#5a5a5a';
            }}
          >
            <Folder size={13} />
          </button>
          <button
            title="Format (coming soon)"
            style={{
              background: 'transparent',
              border: '1px solid #1a1a1a',
              color: '#5a5a5a',
              cursor: 'pointer',
              padding: 5,
              borderRadius: 5,
              display: 'flex',
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a';
              e.currentTarget.style.color = '#9a9a9a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1a';
              e.currentTarget.style.color = '#5a5a5a';
            }}
          >
            <Type size={13} />
          </button>

          <div style={{ flex: 1 }} />

          <div
            style={{
              fontSize: 10.5,
              color: '#4a4a4a',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '.04em',
            }}
          >
            Vertex · by Vortis
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
 *  ChatPanel — the left sub-panel of the main area. Renders the
 *  empty state OR the messages list + streaming bubble, plus the
 *  composer at the bottom. Includes a model badge at the top.
 * ═══════════════════════════════════════════════════════════════════ */
const ChatPanel = ({
  messages,
  streaming,
  thinking,
  streamText,
  mdComponents,
  input,
  onChange,
  onSend,
  onStop,
  onPickPrompt,
  inputRef,
  textareaRef,
  scrollRef,
}) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#000000',
    }}
  >
    {/* Model badge strip */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0a0a0a',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 9px',
          borderRadius: 5,
          background: '#0d0d0d',
          border: '1px solid #1a1a1a',
          fontSize: 10.5,
          color: '#8a8a8a',
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 600,
          letterSpacing: '.04em',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#6a6a6a',
            display: 'inline-block',
          }}
        />
        ONLINE
      </div>
      <span
        style={{
          fontSize: 10.5,
          color: '#4a4a4a',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        Powered by Vortis
      </span>
    </div>

    {/* Messages / empty state */}
    <div
      ref={scrollRef}
      style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
      className="vertex-scr"
    >
      {messages.length === 0 && !streaming ? (
        <EmptyState onPickPrompt={onPickPrompt} />
      ) : (
        <div
          style={{
            maxWidth: 820,
            margin: '0 auto',
            padding: '20px 22px 12px',
          }}
        >
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              text={m.text}
              ts={m.ts}
              mdComponents={mdComponents}
            />
          ))}
          {(streaming || thinking) && (
            <StreamingBubble
              thinking={thinking}
              streamText={streamText}
              mdComponents={mdComponents}
            />
          )}
        </div>
      )}
    </div>

    {/* Composer */}
    <Composer
      input={input}
      onChange={onChange}
      onSend={onSend}
      onStop={onStop}
      streaming={streaming}
      inputRef={inputRef}
      textareaRef={textareaRef}
    />
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
 *  CHUNK_BOUNDARY_4
 * ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
 *  Main CodeChat component
 * ------------------------------------------------------------------
 *  Orchestrates all the sub-components above. Owns:
 *    - Auth + Firestore subscriptions
 *    - Messages, input, streaming, thinking state
 *    - chatId + savedChats + search + rename state
 *    - sidebarOpen + codePanelOpen state
 *    - codeTabs + activeTabId state (extracted from AI responses)
 *    - All Firestore ops: loadChats, persistChat, loadChat, deleteChat,
 *      renameChat, newChat
 *    - The send/stream pipeline (SSE parsing, error handling, abort)
 *    - Keyboard shortcuts (Cmd/Ctrl+K new chat, Esc exit)
 *    - Body scroll lock + save-on-unmount safety net
 *    - Markdown component overrides (so code blocks render via the
 *      parent's CodeBlock prop or our FallbackCodeBlock)
 *
 *  Renders via createPortal to document.body so it escapes any
 *  transformed ancestor in the parent app.
 * ═══════════════════════════════════════════════════════════════════ */
const CodeChat = ({
  onClose,
  CodeBlock,
  safeExecuteCodeLocally,
  LANG_ENGINE,
  ENGINE_META,
}) => {
  /* ── Firebase singletons (memoized so they're stable across renders) ── */
  const auth = useMemo(() => getAuth(), []);
  const db = useMemo(() => getFirestore(), []);

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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState(false);

  /* Collision-resistant chat id generator — Date.now alone can collide
   * if a user creates two chats within the same millisecond. */
  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const [chatId, setChatId] = useState(() => genId());
  const chatIdRef = useRef(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  /* Conversation history ref for the backend (role + content only) */
  const convHistoryRef = useRef([]);

  /* ── Sidebar state ── */
  const [savedChats, setSavedChats] = useState([]);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Code panel state ──
   * codeTabs holds all code blocks extracted from AI responses in the
   * current conversation. Each tab = { id, lang, code, filename }.
   * activeTabId is the currently-visible tab in the code viewer.
   * codePanelOpen toggles the whole right panel on/off.
   */
  const [codeTabs, setCodeTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [codePanelOpen, setCodePanelOpen] = useState(true);

  /* ── Refs ── */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(false);

  /* ── Auto-scroll to bottom on new content ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinking]);

  /* ── Body scroll lock (prevents the main chat behind from scrolling) ── */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      if (prev.position !== 'fixed') window.scrollTo(0, scrollY);
    };
  }, []);

  /* ── Save-on-unmount safety net ──
   * If the user closes the overlay mid-stream, persist whatever
   * messages exist before the component goes away. */
  const messagesRef = useRef([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      if (msgs && msgs.length > 0 && msgs.some((m) => m.role === 'user')) {
        persistChat(msgs).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Keyboard shortcuts ──
   * Cmd/Ctrl+K → new chat
   * Esc → exit (only when not typing in an input/textarea) */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
      if (
        e.key === 'Escape' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ════════════════════════════════════════════════════════════════
   *  Firestore operations — 'code_chats' subcollection
   * ════════════════════════════════════════════════════════════════ */

  /* loadChats — pull all saved code chats for a user, sorted by
   * most-recently-updated first. */
  const loadChats = useCallback(
    async (uid) => {
      if (!uid) {
        setSavedChats([]);
        return;
      }
      try {
        const snap = await getDocs(collection(db, 'users', uid, 'code_chats'));
        const chats = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
        setSavedChats(chats);
      } catch (err) {
        console.error('[Vertex] loadChats failed:', err?.code || err?.message);
      }
    },
    [db]
  );

  /* persistChat — save the current conversation to Firestore.
   * Robustness:
   *   1. Captures uid + chatId at call time (no race conditions)
   *   2. Only writes if there's at least one user message
   *   3. Uses { merge: true } so parallel writes don't fail
   *   4. Logs errors visibly so rules issues are diagnosable
   */
  const persistChat = useCallback(
    async (msgs) => {
      const uid = userUidRef.current;
      const cid = chatIdRef.current;
      if (!uid || !cid) {
        console.warn('[Vertex] persistChat skipped — no uid/cid');
        return;
      }
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      if (!msgs.some((m) => m.role === 'user')) return;
      try {
        const firstUser = msgs.find((m) => m.role === 'user');
        let title = firstUser.text
          .replace(/```[\s\S]*?```/g, '')
          .replace(/[#*`]/g, '')
          .trim()
          .slice(0, 48);
        if (!title) title = 'New Code Chat';
        const cleaned = msgs.map((m) => ({
          role: m.role,
          text: (m.text || '').slice(0, 12000),
          ts: m.ts || Date.now(),
        }));
        await setDoc(
          doc(db, 'users', uid, 'code_chats', cid),
          {
            title,
            messages: cleaned,
            updated: new Date().toISOString(),
            createdAt:
              msgs[0]?.ts
                ? new Date(msgs[0].ts).toISOString()
                : new Date().toISOString(),
          },
          { merge: true }
        );
        loadChats(uid);
      } catch (err) {
        console.error(
          '[Vertex] persistChat failed:',
          err?.code || err?.message || err
        );
      }
    },
    [db, loadChats]
  );

  /* newChat — clear the current conversation and start a fresh one
   * with a new collision-resistant id. */
  const newChat = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
    setThinking(false);
    setStreamText('');
    const newId = genId();
    setChatId(newId);
    chatIdRef.current = newId;
    setMessages([]);
    setCodeTabs([]);
    setActiveTabId(null);
    convHistoryRef.current = [];
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  /* loadChat — restore a saved conversation from Firestore. */
  const loadChat = useCallback(
    async (id) => {
      if (!userUidRef.current) return;
      try {
        const snap = await getDoc(
          doc(db, 'users', userUidRef.current, 'code_chats', id)
        );
        if (!snap.exists()) return;
        const c = snap.data();
        setChatId(id);
        chatIdRef.current = id;
        const restored = (c.messages || []).map((m, i) => ({
          id: `${id}-${i}`,
          role: m.role,
          text: m.text,
          ts: typeof m.ts === 'number' ? m.ts : Date.now(),
        }));
        setMessages(restored);
        convHistoryRef.current = restored.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }));
        // Rebuild code tabs from restored messages
        const allBlocks = [];
        restored.forEach((m) => {
          if (m.role === 'assistant') {
            extractCodeBlocks(m.text).forEach((b) => allBlocks.push(b));
          }
        });
        setCodeTabs(allBlocks);
        setActiveTabId(allBlocks[0]?.id || null);
        if (window.innerWidth <= 900) setSidebarOpen(false);
      } catch (err) {
        console.error('[Vertex] loadChat failed:', err?.message);
      }
    },
    [db]
  );

  /* deleteChat — remove a conversation from Firestore. */
  const deleteChat = useCallback(
    async (id) => {
      if (!userUidRef.current) return;
      try {
        await deleteDoc(
          doc(db, 'users', userUidRef.current, 'code_chats', id)
        );
        await loadChats(userUidRef.current);
        if (id === chatIdRef.current) newChat();
      } catch (err) {
        console.error('[Vertex] deleteChat failed:', err?.message);
      }
    },
    [db, loadChats, newChat]
  );

  /* renameChat — update a conversation's title in Firestore. */
  const renameChat = useCallback(
    async (id, newTitle) => {
      if (!userUidRef.current || !newTitle.trim()) {
        setRenamingId(null);
        return;
      }
      try {
        await setDoc(
          doc(db, 'users', userUidRef.current, 'code_chats', id),
          { title: newTitle.trim().slice(0, 80) },
          { merge: true }
        );
        await loadChats(userUidRef.current);
      } catch (err) {
        console.error('[Vertex] renameChat failed:', err?.message);
      }
      setRenamingId(null);
    },
    [db, loadChats]
  );

  /* ════════════════════════════════════════════════════════════════
   *  Send + stream pipeline
   * ════════════════════════════════════════════════════════════════ */
  const send = useCallback(
    async (overrideText) => {
      const text = (overrideText ?? input).trim();
      if (!text || streaming) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        text,
        ts: Date.now(),
      };
      const nextMsgs = [...messages, userMsg];
      setMessages(nextMsgs);
      setInput('');
      setStreaming(true);
      setThinking(true);
      setStreamText('');
      abortRef.current = false;

      /* Save immediately so the conversation exists in the sidebar
       * even if the user closes the overlay mid-stream. */
      persistChat(nextMsgs).catch(() => {});

      const historyForBackend = nextMsgs
        .slice(-12)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }));
      const fullPrompt =
        VERTEX_SYSTEM_PROMPT + '\n\n=== USER REQUEST ===\n' + text;

      let full = '';
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: await getAuthHeader(),
          body: JSON.stringify({
            action: 'chat',
            mode: 'code',
            prompt: fullPrompt,
            history: historyForBackend,
          }),
        });

        if (!res.ok) {
          let errMsg = `Request failed (${res.status}).`;
          if (res.status === 429)
            errMsg = "You're sending messages too quickly — please slow down.";
          else if (res.status === 401 || res.status === 403)
            errMsg = 'Authentication error — try refreshing the page.';
          else if (res.status === 503)
            errMsg = 'Vertex is temporarily unavailable — please try again shortly.';
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: `⚠️ ${errMsg}`,
              ts: Date.now(),
            },
          ]);
          setStreaming(false);
          setThinking(false);
          setStreamText('');
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
              if (p.content) {
                full += p.content;
                setStreamText(full);
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        setThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: `⚠️ Network error: ${e?.message || 'unknown'}\n\nPlease check your connection and try again.`,
            ts: Date.now(),
          },
        ]);
        setStreaming(false);
        setStreamText('');
        return;
      }

      const cleaned = full.trim();
      if (!cleaned) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: '_(empty response — try rephrasing your request)_',
            ts: Date.now(),
          },
        ]);
      } else {
        const aiMsg = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: cleaned,
          ts: Date.now(),
        };
        const finalMsgs = [...nextMsgs, aiMsg];
        setMessages(finalMsgs);

        // Extract code blocks from the AI response and add them to the
        // code viewer tabs.
        const newBlocks = extractCodeBlocks(cleaned);
        if (newBlocks.length > 0) {
          setCodeTabs((prev) => {
            const updated = [...prev, ...newBlocks];
            // Auto-switch to the first new tab
            if (newBlocks[0]) {
              setActiveTabId(newBlocks[0].id);
            }
            // Auto-open the code panel if it was closed
            if (!codePanelOpen) setCodePanelOpen(true);
            return updated;
          });
        }

        // Persist the full conversation (user + assistant)
        setTimeout(() => persistChat(finalMsgs), 50);
      }
      setStreaming(false);
      setThinking(false);
      setStreamText('');
    },
    [input, messages, streaming, persistChat, codePanelOpen]
  );

  /* stopStreaming — abort the in-flight stream and persist whatever
   * has been received so far. */
  const stopStreaming = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
    setThinking(false);
    if (streamText.trim()) {
      const aiMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: streamText.trim() + '\n\n_(stopped)_',
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      // Also extract code blocks from the stopped response
      const newBlocks = extractCodeBlocks(aiMsg.text);
      if (newBlocks.length > 0) {
        setCodeTabs((prev) => [...prev, ...newBlocks]);
        if (newBlocks[0]) setActiveTabId(newBlocks[0].id);
      }
    }
    setStreamText('');
  }, [streamText]);

  /* ════════════════════════════════════════════════════════════════
   *  Derived state
   * ════════════════════════════════════════════════════════════════ */

  /* Filtered chat list based on search query */
  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedChats;
    return savedChats.filter((c) =>
      (c.title || '').toLowerCase().includes(q)
    );
  }, [savedChats, search]);

  /* The CodeBlock renderer — uses the parent's CodeBlock if provided,
   * otherwise falls back to our FallbackCodeBlock. */
  const RendererCodeBlock = CodeBlock || FallbackCodeBlock;

  /* Markdown component overrides — styled to match the dark theme.
   * Code blocks route through RendererCodeBlock so the parent's
   * runner (if provided) can execute them. */
  const mdComponents = useMemo(
    () => ({
      h1: ({ children }) => (
        <h1
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: '#f0f0f0',
            margin: '14px 0 6px',
            letterSpacing: '-.02em',
            lineHeight: 1.3,
          }}
        >
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          style={{
            fontSize: 16.5,
            fontWeight: 700,
            color: '#f0f0f0',
            margin: '12px 0 5px',
            letterSpacing: '-.02em',
            lineHeight: 1.3,
          }}
        >
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: '#dcdcdc',
            margin: '10px 0 4px',
            lineHeight: 1.3,
          }}
        >
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: '#dcdcdc',
            margin: '8px 0 3px',
          }}
        >
          {children}
        </h4>
      ),
      p: ({ children }) => (
        <p
          style={{
            margin: '0 0 8px',
            color: '#dcdcdc',
            lineHeight: 1.7,
            fontSize: 14,
          }}
        >
          {children}
        </p>
      ),
      strong: ({ children }) => (
        <strong style={{ color: '#f0f0f0', fontWeight: 700 }}>
          {children}
        </strong>
      ),
      em: ({ children }) => <em style={{ color: '#9a9a9a' }}>{children}</em>,
      ul: ({ children }) => (
        <ul style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ol>
      ),
      li: ({ children }) => (
        <li
          style={{
            margin: '3px 0',
            color: '#dcdcdc',
            lineHeight: 1.65,
            fontSize: 14,
          }}
        >
          {children}
        </li>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#dcdcdc',
            textDecoration: 'none',
            borderBottom: '1px solid #3a3a3a',
          }}
        >
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote
          style={{
            borderLeft: '3px solid #2a2a2a',
            margin: '8px 0',
            padding: '4px 12px',
            color: '#9a9a9a',
            background: '#0d0d0d',
            borderRadius: '0 6px 6px 0',
          }}
        >
          {children}
        </blockquote>
      ),
      hr: () => (
        <hr
          style={{
            border: 'none',
            borderTop: '1px solid #1a1a1a',
            margin: '12px 0',
          }}
        />
      ),
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table
            style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead style={{ background: '#0d0d0d' }}>{children}</thead>
      ),
      th: ({ children }) => (
        <th
          style={{
            padding: '6px 10px',
            border: '1px solid #1a1a1a',
            textAlign: 'left',
            color: '#dcdcdc',
            fontWeight: 600,
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td
          style={{
            padding: '6px 10px',
            border: '1px solid #1a1a1a',
            color: '#9a9a9a',
          }}
        >
          {children}
        </td>
      ),
      code: ({ inline, className, children }) => {
        if (inline) {
          return (
            <code
              style={{
                background: '#1c1c1c',
                color: '#dcdcdc',
                padding: '1px 6px',
                borderRadius: 5,
                fontFamily:
                  '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
                fontSize: 12.5,
                border: '1px solid #232323',
              }}
            >
              {children}
            </code>
          );
        }
        const match = /language-(\w+)/.exec(className || '');
        const codeLang = match ? match[1] : '';
        const codeText = String(children).replace(/\n$/, '');
        return (
          <RendererCodeBlock
            lang={codeLang}
            codeText={codeText}
            safeExecuteCodeLocally={safeExecuteCodeLocally}
            LANG_ENGINE={LANG_ENGINE}
            ENGINE_META={ENGINE_META}
          />
        );
      },
    }),
    [RendererCodeBlock, safeExecuteCodeLocally, LANG_ENGINE, ENGINE_META]
  );

  /* ════════════════════════════════════════════════════════════════
   *  RENDER
   * ════════════════════════════════════════════════════════════════ */
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-vortis-code
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        height: '100dvh',
        zIndex: 2147483647,
        background: '#000000',
        color: '#e6e6e6',
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        animation: 'vertexFadeIn .18s ease',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {/* ═══ Top bar ═══ */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        codePanelOpen={codePanelOpen}
        onToggleCodePanel={() => setCodePanelOpen((o) => !o)}
        hasCodeTabs={codeTabs.length > 0}
        onClose={onClose}
      />

      {/* ═══ Body: sidebar + chat panel + code panel ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {sidebarOpen && (
          <Sidebar
            user={user}
            chats={filteredChats}
            activeChatId={chatId}
            search={search}
            renamingId={renamingId}
            renameVal={renameVal}
            onSearchChange={setSearch}
            onRenameChange={setRenameVal}
            onRenameCommit={renameChat}
            onRenameCancel={() => setRenamingId(null)}
            onRenameStart={(c) => {
              setRenamingId(c.id);
              setRenameVal(c.title || '');
            }}
            onNewChat={newChat}
            onLoadChat={loadChat}
            onDeleteChat={deleteChat}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}

        <ChatPanel
          messages={messages}
          streaming={streaming}
          thinking={thinking}
          streamText={streamText}
          mdComponents={mdComponents}
          input={input}
          onChange={setInput}
          onSend={send}
          onStop={stopStreaming}
          onPickPrompt={(p) => {
            setInput(p);
            setTimeout(() => textareaRef.current?.focus(), 30);
          }}
          inputRef={inputRef}
          textareaRef={textareaRef}
          scrollRef={scrollRef}
        />

        {codePanelOpen && codeTabs.length > 0 && (
          <CodeViewPanel
            tabs={codeTabs}
            activeId={activeTabId}
            onSelect={setActiveTabId}
            onClose={(id) => {
              setCodeTabs((prev) => {
                const idx = prev.findIndex((t) => t.id === id);
                const updated = prev.filter((t) => t.id !== id);
                // If we closed the active tab, switch to a neighbor
                if (activeTabId === id) {
                  const next = updated[idx] || updated[idx - 1] || updated[0];
                  setActiveTabId(next?.id || null);
                }
                // Auto-close the panel if no tabs remain
                if (updated.length === 0) setCodePanelOpen(false);
                return updated;
              });
            }}
            emptyHint="No code in this conversation yet"
          />
        )}
      </div>

      {/* ═══ Inline styles — keyframes + scoped reset ═══ */}
      <style>{`
        @keyframes vertexFadeIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes vertexSlideIn {
          from { transform: translateX(-100%); opacity: 0 }
          to   { transform: translateX(0); opacity: 1 }
        }
        @keyframes vertexPulse {
          0%, 100% { opacity: .3; transform: scale(.85) }
          50%      { opacity: 1; transform: scale(1) }
        }
        @keyframes vertexBlink {
          50% { opacity: 0 }
        }
        @keyframes vertexSpin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }

        /* Scoped reset — everything inside [data-vortis-code] is
           immune to global stylesheets from the parent app. This
           was the root cause of an earlier broken layout — Tailwind
           / global CSS was leaking in. */
        [data-vortis-code],
        [data-vortis-code] *,
        [data-vortis-code] *::before,
        [data-vortis-code] *::after {
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
        [data-vortis-code] button {
          cursor: pointer;
          background: transparent;
          border: none;
          color: inherit;
          font: inherit;
        }
        [data-vortis-code] input,
        [data-vortis-code] textarea,
        [data-vortis-code] select {
          font: inherit;
          color: inherit;
          background: transparent;
          border: none;
          outline: none;
        }
        [data-vortis-code] img {
          max-width: 100%;
          display: block;
        }

        /* Custom scrollbar — subtle, dark-themed */
        [data-vortis-code] .vertex-scr::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        [data-vortis-code] .vertex-scr::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-vortis-code] .vertex-scr::-webkit-scrollbar-thumb {
          background: #1a1a1a;
          border-radius: 4px;
        }
        [data-vortis-code] .vertex-scr::-webkit-scrollbar-thumb:hover {
          background: #2a2a2a;
        }
        /* Firefox */
        [data-vortis-code] .vertex-scr {
          scrollbar-width: thin;
          scrollbar-color: #1a1a1a transparent;
        }

        /* Show chat row actions on hover */
        [data-vortis-code] div:hover > div > .chat-row-actions {
          opacity: 1 !important;
        }

        /* Selection */
        [data-vortis-code] ::selection {
          background: #2a2a2a;
          color: #e6e6e6;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default CodeChat;

