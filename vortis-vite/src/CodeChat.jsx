import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import mammoth from 'mammoth';
import {
  X, Code2, Plus, Search, Trash2, Edit2, Check, Copy, ArrowUp,
  Loader, MessageSquare, Sparkles,
  Zap, Bug, BookOpen, RefreshCw, FileCode, Folder,
  PanelLeftClose, PanelLeftOpen,
  Terminal, Cog, EraserIcon,
  ChevronDown, HelpCircle,
  Image as ImageIcon, FileText, Scan,
  Download, Layers, Upload, ExternalLink, RotateCcw,
  Reply, Edit3, Wand2, FlaskConical, ArrowDownToLine, Play
} from 'lucide-react';

const API = 'https://vortis.onrender.com/api/handler';

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
 *  Style preferences — no language picker anymore; the AI just infers
 *  the language from the user's message/paste instead of a forced dropdown.
 * ──────────────────────────────────────────────────────────────────────── */
const STYLES = [
  { id: 'concise',   label: 'Concise',   hint: 'Code + 1 line max' },
  { id: 'detailed',  label: 'Detailed',  hint: 'Edge cases, alternatives, gotchas' },
  { id: 'teach',     label: 'Teach',     hint: 'Line-by-line comments, learner-friendly' },
];

const STARTER_PROMPTS = [
  { icon: 'bug',      label: 'Debug an error',   prompt: "I'm getting this error and need help fixing it:\n\n" },
  { icon: 'zap',      label: 'Optimize code',    prompt: 'Help me optimize this function for performance and readability:\n\n' },
  { icon: 'book',     label: 'Explain code',     prompt: 'Walk me through what this code does, step by step:\n\n' },
  { icon: 'file',     label: 'Write a function', prompt: 'Write me a function that ' },
  { icon: 'refresh',  label: 'Refactor',         prompt: 'Refactor this code to be cleaner and more idiomatic:\n\n' },
  { icon: 'sparkles', label: 'Code review',      prompt: 'Review this code for bugs, security issues, and improvements:\n\n' },
];

const ICONS = { bug: Bug, zap: Zap, book: BookOpen, file: FileCode, refresh: RefreshCw, sparkles: Sparkles };

/* Quick-action chips above the input bar — clicking one drops a templated prompt
   straight into the textarea so the user can paste their code in and hit Send. */
const QUICK_ACTIONS = [
  { icon: 'bug',   label: 'Find bugs',  prompt: 'Find and fix bugs in this code:\n\n' },
  { icon: 'wand',  label: 'Refactor',   prompt: 'Refactor this code for clarity and readability:\n\n' },
  { icon: 'zap',   label: 'Optimize',   prompt: 'Optimize this code for performance and explain the wins:\n\n' },
  { icon: 'book',  label: 'Explain',    prompt: 'Explain what this code does, step by step:\n\n' },
  { icon: 'flask', label: 'Add tests',  prompt: 'Write unit tests for this code:\n\n' },
];
const QUICK_ICONS = { bug: Bug, wand: Wand2, zap: Zap, book: BookOpen, flask: FlaskConical };

/* Detects when an assistant reply probably got cut off mid-stream — most
   commonly an unclosed code fence (odd number of ``` markers), but also
   catches the rarer case of a reply that just ends mid-sentence with no
   terminal punctuation. Used to decide whether to show the Continue button. */
const looksCutOff = (text) => {
  if (!text) return false;
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return true; // unclosed code block
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  // Ends without terminal punctuation AND the last line is short (mid-word)
  if (!/[.!?:"')\]}>]$/.test(trimmed)) {
    const lastLine = trimmed.split('\n').pop().trim();
    if (lastLine.length > 0 && lastLine.length < 80) return true;
  }
  return false;
};

/* ────────────────────────────────────────────────────────────────────────
 *  File type helpers — used by the attach menu to route images vs text
 *  files into the right kind of attachment card, and to know when OCR
 *  mode is relevant.
 * ──────────────────────────────────────────────────────────────────────── */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'yaml', 'yml', 'toml', 'ini', 'env', 'log', 'xml', 'html', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'dockerfile', 'makefile'];
// Word docs — text gets pulled out client-side with mammoth so they behave like any other file attachment.
const DOCX_EXTENSIONS = ['docx'];
// Anything else we recognize but can't parse text out of in the browser (pdf, legacy .doc, slides, sheets…).
// These still get attached — just as a "document" card that sends the filename/metadata instead of silently vanishing.
const OTHER_DOC_EXTENSIONS = ['pdf', 'doc', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'ods', 'odp', 'pages', 'key', 'numbers'];

const fileExt = (name) => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const isImageFile = (name, mime) => {
  if (mime && mime.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.includes(fileExt(name));
};

const isTextFile = (name, mime) => {
  if (mime && (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml')) return true;
  return TEXT_EXTENSIONS.includes(fileExt(name));
};

const isDocxFile = (name, mime) => {
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  return DOCX_EXTENSIONS.includes(fileExt(name));
};

const formatBytes = (n) => {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const readAsText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = reject;
  r.readAsText(file);
});

const readAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsArrayBuffer(file);
});

/* Extracts plain text out of a .docx in the browser via mammoth — no backend round-trip needed. */
const extractDocxText = async (file) => {
  try {
    const buf = await readAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return (result?.value || '').trim();
  } catch (e) {
    console.error('Vertex: docx extraction failed —', e);
    return '';
  }
};

/* ────────────────────────────────────────────────────────────────────────
 *  Strong coder system prompt
 * ──────────────────────────────────────────────────────────────────────── */
const buildCoderSystemPrompt = (style) => {
  let sys = `You are Vertex, the coding assistant powered by VORTIS — an elite senior software engineer pair-programmer embedded inside the user's IDE, powered by Vortis. You are NOT a general assistant; you live and breathe code.

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

═══ CODE QUALITY BAR ═══
- Every code block MUST be runnable as-is when possible. Include imports. No "..." placeholders unless absolutely necessary.
- Prefer modern, idiomatic syntax for the chosen language (ES2022+ for JS, Python 3.10+ features where they help, etc.).
- Show the SIMPLEST solution first. Only show advanced patterns if the user asks or if they're clearly needed.
- If you don't know the exact API, say so — NEVER fabricate function names, method signatures, or library APIs.
- Always specify the language in code fences: \`\`\`python, \`\`\`typescript, \`\`\`bash, etc.
- Default to a complete, full-scope implementation — proper structure, full feature set, error handling — never a stripped-down "MVP" or placeholder version. If the user requests something specific (e.g. "800 lines", "full game with levels and scoring"), deliver that full scope, not a shortcut version. Only simplify or cut scope if the user explicitly asks for something minimal, quick, or basic.

═══ DEBUGGING ═══
- When the user pastes an error, identify the ROOT CAUSE in one sentence, then give the fix as a code block.
- If the error is environment-related (missing dep, version mismatch), say exactly what to install/run.

═══ REFACTORING ═══
- Show before→after only when the diff is small. For large refactors, show only the new version with a one-line summary of what changed.
- Never silently rewrite working code. If you're refactoring, label it: "Refactored version:".

═══ CLARIFYING ═══
- If the request is ambiguous in a way that changes the answer significantly (which language, which framework, what input shape), ask ONE concise question before answering.
- If it's only mildly ambiguous, make a reasonable assumption and state it inline: "(assuming React + TS — say if not)".

═══ CURRENT INFO ═══
If live web search results are appended below this prompt, treat them as ground truth for anything version-specific, recently changed, or time-sensitive (library versions, deprecations, new APIs) — they override your training data.

═══ ABOUT VORTIS ═══
You are Vertex, the dedicated coding assistant of the VORTIS platform.
VORTIS is an Everyday AI Assistant designed to help users with conversations, learning, writing, research, web search, image generation, voice interactions, file understanding, productivity, and programming through specialized experiences like Vertex.
Vertex is the coding-focused experience within VORTIS. Your purpose is to help users write, understand, debug, refactor, optimize, and learn code—from complete beginners writing their first program to experienced developers building large applications.

Relationship:
- VORTIS → Everyday AI Assistant
- Vertex → Coding Assistant

Programming and software development are your primary focus.
You may answer occasional general questions naturally when they are simple or relevant to the conversation. If a conversation becomes primarily about non-programming topics, politely mention that the main VORTIS assistant is better suited for those discussions while remaining helpful.

Do NOT explain what VORTIS is unless:
- the user explicitly asks about VORTIS,
- the conversation naturally requires the distinction between Vertex and VORTIS,
- or the user appears confused about which assistant they are using.

When users describe your relationship with VORTIS in a reasonable way (for example, "you're powered by VORTIS" or "you're part of VORTIS"), don't unnecessarily correct them. Confirm the idea naturally unless the statement is actually incorrect.
Do not mention VORTIS in greetings or ordinary responses unless one of the above conditions applies.
When introducing yourself, simply introduce yourself as Vertex. Keep introductions short and natural—avoid explaining the relationship with VORTIS unless the user asks.

═══ PERSONALITY ═══
Be friendly, confident, professional, warm and approachable.
Write like an experienced mentor who enjoys helping people learn and build software.
Never sound arrogant, dismissive, robotic, or overly formal.
Be warm, approachable, and confident.
Adapt your tone to the user. If they are a beginner, be encouraging. If they are experienced, be more technical.
Humor is welcome occasionally, but never at the user's expense.

═══ RESPONSE LENGTH ═══
- Code-first, prose-second. A typical response is: 1 line of context, the code block, 2-3 lines of explanation.
- NEVER pad. NEVER write "Certainly! Here's..." or "I'd be happy to help" or "Sure!" — just answer.
- For multi-step tasks, use a numbered list with code blocks under each step.
- Never truncate — always complete your full answer.

═══ NON-CODING REQUESTS ═══
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect in your own words each time — vary the phrasing, don't repeat a fixed sentence. The gist: you're a coding assistant, and for general chat they should switch to the main Vortis chat.`;

  if (style === 'concise')  sys += '\n\nSTYLE: Ultra-concise. Code + 1 line of explanation max. No pleasantries.';
  if (style === 'detailed') sys += '\n\nSTYLE: Detailed. Include edge cases, alternative approaches, performance notes, and a short "when not to use this" callout.';
  if (style === 'teach')    sys += '\n\nSTYLE: Teach mode. Add a comment above each non-obvious line of code explaining what it does. Treat the user as a curious learner. End with a one-line "key takeaway".';

  return sys;
};

/* ────────────────────────────────────────────────────────────────────────
 *  VertexCodeBlock — the ONLY code renderer Vertex uses internally.
 * ──────────────────────────────────────────────────────────────────────── */
// Code blocks always render in full in the chat itself — nothing is hidden away in
// a side panel by default. Past this many lines, the block starts capped at a
// scrollable height with an inline "Show more / Show less" toggle, exactly like it
// works in Claude — click it and the whole thing expands right there in the chat.
const CAP_AFTER_LINES = 14;
const CAPPED_HEIGHT = 320;

const VertexCodeBlock = ({ lang, codeText, onOpenPanel, onSmartEdit, blockId }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const copy = () => { navigator.clipboard.writeText(codeText); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const submitEdit = () => {
    if (!feedback.trim() || !onSmartEdit) return;
    onSmartEdit({ code: codeText, lang, feedback: feedback.trim(), blockId });
    setEditing(false);
    setFeedback('');
  };

  const lines = codeText.split('\n');
  const isLong = lines.length > CAP_AFTER_LINES;
  const capped = isLong && !expanded;

  return (
    <div style={{
      margin: '12px 0', borderRadius: 10, overflow: 'hidden',
      border: '1px solid #262626', background: '#0a0a0a',
      animation: 'vertexCodeIn .28s cubic-bezier(.2,.7,.3,1)',
      boxShadow: '0 10px 28px -14px rgba(0,0,0,.7)',
    }}>
      <div 
        data-vrtx-no-reply=""  
        style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: '#111111', borderBottom: '1px solid #262626',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#5a5a5a', flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8c8c8',
            letterSpacing: '.06em', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
          }}>
            {lang || 'plaintext'}
          </span>
          <span style={{ fontSize: 10, color: '#5a5a5a', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            · {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {onSmartEdit && (
            <button
              onClick={() => setEditing(v => !v)}
              title="Tell Vertex what's wrong — it returns only the fix"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: editing ? '#2a2a2a' : 'transparent',
                border: '1px solid ' + (editing ? '#4a4a4a' : '#333333'),
                borderRadius: 6, padding: '4px 10px', color: editing ? '#e6e6e6' : '#9a9a9a', fontSize: 11, cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
              }}
            >
              <Edit3 size={11} /> Edit
            </button>
          )}
          <button
            onClick={() => downloadTextAsFile(codeText, `snippet.${extForLang(lang)}`)}
            title="Save this file"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #333333',
              borderRadius: 6, padding: '4px 10px', color: '#9a9a9a', fontSize: 11, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
            }}
          >
            <Download size={11} /> Save
          </button>
          <button
            onClick={() => onOpenPanel({ lang, code: codeText })}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: '#1c1c1c', border: '1px solid #333333',
              borderRadius: 6, padding: '4px 10px', color: '#dcdcdc', fontSize: 11, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, transition: 'all .15s',
            }}
          >
            <Terminal size={11} /> Open
          </button>
          <button
            onClick={copy}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #333333',
              borderRadius: 6, padding: '4px 10px', color: copied ? '#e6e6e6' : '#9a9a9a', fontSize: 11,
              cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <pre
        data-vrtx-no-reply=""
        style={{
          margin: 0, padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
          lineHeight: 1.7, color: '#dcdcdc', whiteSpace: 'pre', wordBreak: 'normal',
          overflowX: 'auto', maxHeight: capped ? CAPPED_HEIGHT : 'none', overflowY: capped ? 'auto' : 'visible',
          background: '#0a0a0a',
        }}
      >{codeText}</pre>

      {editing && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid #1a1a1a', background: '#0c0c0c',
          animation: 'vertexFadeIn .15s ease',
        }}>
          <div style={{
            fontSize: 10.5, color: '#7a7a7a', marginBottom: 7, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '.04em',
          }}>
            WHAT'S WRONG?  ·  Vertex will return only the corrected code + a one-line summary.
          </div>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitEdit(); } }}
            placeholder="e.g. 'the loop should start at 1, not 0'  ·  'handle the empty-array case'  ·  'use Promise.all instead of awaiting in a loop'"
            rows={3}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', background: '#0a0a0a', border: '1px solid #2a2a2a',
              borderRadius: 6, padding: '8px 10px', color: '#dcdcdc', fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, lineHeight: 1.55, resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 7 }}>
            <button
              onClick={() => { setEditing(false); setFeedback(''); }}
              style={{
                padding: '5px 11px', borderRadius: 6, border: '1px solid #333', background: 'transparent',
                color: '#9a9a9a', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              }}
            >Cancel</button>
            <button
              onClick={submitEdit}
              disabled={!feedback.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                border: '1px solid ' + (feedback.trim() ? '#e6e6e6' : '#333'),
                background: feedback.trim() ? '#e6e6e6' : 'transparent',
                color: feedback.trim() ? '#0a0a0a' : '#5a5a5a',
                fontSize: 11, fontWeight: 600, cursor: feedback.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <Edit3 size={11}/> Send edit
            </button>
          </div>
        </div>
      )}

      {isLong && !editing && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '8px 0', background: '#111111', border: 'none', borderTop: '1px solid #1a1a1a',
            color: '#9a9a9a', fontSize: 11.5, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
            letterSpacing: '.03em', transition: 'color .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#dcdcdc'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9a9a9a'; }}
        >
          <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}/>
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  SelectionReplyButton — floats a "Reply" chip above whatever text the
 *  user has highlighted inside the chat scroll area. Clicking it drops the
 *  quoted text straight into the input box, Discord/iMessage-style.
 *
 *  Code blocks are explicitly excluded — selecting inside a `<pre>` (marked
 *  with data-vrtx-no-reply) does NOT show the chip, since users selecting
 *  code usually want to copy it, not quote it. The chip DOES show for any
 *  prose selection, including text that comes after a code block.
 * ──────────────────────────────────────────────────────────────────────── */
const SelectionReplyButton = ({ scrollRef, onReply }) => {
  const [pos, setPos] = useState(null);
  const [selectedText, setSelectedText] = useState('');

  // Walks up from a node and returns true if it hits an element marked
  // data-vrtx-no-reply (i.e. a code block) before leaving the scroll area.
  const isInsideNoReply = (node) => {
    let cur = node;
    while (cur && cur !== document.body) {
      if (cur.nodeType === 1) {
        if (cur.hasAttribute && cur.hasAttribute('data-vrtx-no-reply')) return true;
      }
      cur = cur.parentNode;
    }
    return false;
  };

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setPos(null);
        setSelectedText('');
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        setPos(null);
        setSelectedText('');
        return;
      }
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const range = sel.getRangeAt(0);

      // Make sure BOTH endpoints live inside the chat scroll area — this
      // catches selections that span from the chat into the input or sidebar.
      // Use the actual element nodes (startContainer/endContainer) so multi-
      // element selections (e.g. text after a code block) are validated
      // correctly instead of being rejected because commonAncestorContainer
      // happens to be a higher-level wrapper.
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      if (!scrollEl.contains(startNode) || !scrollEl.contains(endNode)) {
        setPos(null);
        setSelectedText('');
        return;
      }

      // Suppress the chip when either endpoint is inside a code block —
      // selecting code shouldn't pop a "Reply" button.
      if (isInsideNoReply(startNode) || isInsideNoReply(endNode)) {
        setPos(null);
        setSelectedText('');
        return;
      }

      const rect = range.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      setSelectedText(text);
      setPos({ top: rect.top - scrollRect.top - 38,
               left: rect.left - scrollRect.left + rect.width / 2,
         });
      };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [scrollRef]);

  // Hide the chip the moment the user scrolls — otherwise it floats over
  // the wrong spot once the selection scrolls out of view.
  useEffect(() => {
    if (!pos) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setPos(null);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pos, scrollRef]);

  if (!pos) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
    >
      <button
        onClick={() => {
          onReply(selectedText);
          setPos(null);
          window.getSelection()?.removeAllRanges();
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 11px', borderRadius: 7,
          background: '#1c1c1c', border: '1px solid #3a3a3a', color: '#dcdcdc',
          fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          boxShadow: '0 6px 18px rgba(0,0,0,.55)',
          whiteSpace: 'nowrap',
        }}
      >
        <Reply size={12}/> Reply
      </button>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  CodePanel — right-side split view.
 *
 *  The split between code (top) and output (bottom) is now draggable —
 *  grab the divider in the middle and pull it up or down to give whichever
 *  half you care about more the room it needs.
 * ──────────────────────────────────────────────────────────────────────── */
const CodePanel = ({ panelCode, onClose, output, running, hasError, bootMsg, onRun, onOpenNewTab }) => {
  const [copied, setCopied] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.55); // top half (code) share
  const dragRef = useRef(null);
  const containerRef = useRef(null);
  // Drag-to-resize using Pointer Events — these fire reliably for mouse AND
  // touch, and setPointerCapture means we keep getting move events even when
  // the cursor leaves the divider (the old mousemove-on-document approach
  // would stutter when the cursor moved fast). Ratio is clamped to 12%..88%
  // so neither pane can collapse to nothing. We throttle state updates with
  // rAF so a fast drag doesn't flood React with re-renders.
  const draggingRef = useRef(false);
  const rafRef = useRef(null);

  if (!panelCode) return null;

  const copy = () => { navigator.clipboard.writeText(panelCode.code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const previewable = isPreviewableLang(panelCode.lang);

  const onDividerDown = (e) => {
    // Only respond to primary button / touch / pen
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const applyRatio = (clientY) => {
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const y = clientY - rect.top;
      const r = Math.min(0.88, Math.max(0.12, y / rect.height));
      setSplitRatio(r);
    };

    const onMove = (ev) => {
      if (!draggingRef.current) return;
      ev.preventDefault();
      const clientY = ev.clientY;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => { applyRatio(clientY); rafRef.current = null; });
    };
    const onUp = (ev) => {
      draggingRef.current = false;
      try { ev.currentTarget?.releasePointerCapture?.(ev.pointerId); } catch (_) {}
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      // Snap to final position so there's no visual lag from the rAF throttle
      applyRatio(ev.clientY);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  };

  return (
    <aside style={{
      width: 'min(46%, 640px)', flexShrink: 0, borderLeft: '1px solid #212121',
      background: '#0f0f0f', display: 'flex', flexDirection: 'column', minHeight: 0,
      animation: 'vertexSlideInRight .18s ease',
    }}>
      <div style={{
        height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid #212121',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FileCode size={13} color="#8a8a8a" style={{ flexShrink: 0 }} />
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: '#e6e6e6', fontFamily: 'JetBrains Mono, monospace',
            textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {panelCode.lang || 'code'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {previewable ? (
            <button
              onClick={() => onOpenNewTab(panelCode.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
                border: '1px solid rgba(16,185,129,.3)', background: 'rgba(16,185,129,.08)',
                color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
                fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <ExternalLink size={11} /> Open in new tab
            </button>
          ) : (
            <button
              onClick={onRun}
              disabled={running}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
                border: '1px solid rgba(16,185,129,.3)', background: running ? '#1c1c1c' : 'rgba(16,185,129,.08)',
                color: running ? '#8a8a8a' : '#10b981', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
                fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', transition: 'all .15s',
              }}
            >
              {running
                ? <Loader size={11} style={{ animation: 'vertexSpin 1s linear infinite' }} />
                : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
              {running ? 'Running…' : 'Run'}
            </button>
          )}
          <button
            onClick={copy}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
              border: '1px solid #333333', background: 'transparent', color: copied ? '#e6e6e6' : '#9a9a9a',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, cursor: 'pointer', transition: 'all .15s',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body — code on top, output/preview on bottom, draggable divider
          between them. The whole body is position:relative so the divider
          can be a real element (not just a border) that captures mouse
          events cleanly. */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ flex: `${splitRatio} 1 0`, minHeight: 0, overflowY: 'auto', borderBottom: '1px solid #1a1a1a' }} className="vrtx-scroll">
          <pre data-vrtx-no-reply="" style={{
            margin: 0, padding: '16px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
            lineHeight: 1.75, color: '#dcdcdc', whiteSpace: 'pre', background: '#0a0a0a',
          }}>{panelCode.code}</pre>
        </div>

        {/* Draggable divider — taller grab target (10px) + visible grip.
            Pointer Events handle mouse + touch + pen uniformly, and
            setPointerCapture in onDividerDown keeps the drag alive even
            if the cursor leaves the divider. */}
        <div
          ref={dragRef}
          onPointerDown={onDividerDown}
          title="Drag to resize"
          style={{
            height: 10, flexShrink: 0, cursor: 'row-resize',
            background: '#0c0c0c', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .12s', touchAction: 'none',
          }}
          onMouseEnter={e => { if (!draggingRef.current) e.currentTarget.style.background = '#1a1a1a'; }}
          onMouseLeave={e => { if (!draggingRef.current) e.currentTarget.style.background = '#0c0c0c'; }}
        >
          <div style={{ width: 40, height: 2, borderRadius: 1, background: '#3a3a3a', transition: 'background .12s' }} />
        </div>

        {previewable ? (
          <div style={{ flex: `${1 - splitRatio} 1 0`, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px', fontSize: 10.5, color: '#5a5a5a',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '.06em',
              borderBottom: '1px solid #1a1a1a', flexShrink: 0, background: '#080808',
            }}>
              <span>PREVIEW</span>
              <button
                onClick={() => onOpenNewTab(panelCode.code)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}
              >
                <ExternalLink size={10} /> Open full tab
              </button>
            </div>
            <iframe
              title="Live preview"
              srcDoc={panelCode.code}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              style={{ flex: 1, minHeight: 0, border: 'none', width: '100%', background: '#fff' }}
            />
          </div>
        ) : (
          <div style={{ flex: `${1 - splitRatio} 1 0`, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#080808' }}>
            <div style={{
              padding: '8px 16px', fontSize: 10.5, color: hasError ? '#ef4444' : '#5a5a5a',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '.06em',
              borderBottom: '1px solid #1a1a1a', flexShrink: 0,
            }}>
              {output === null ? 'OUTPUT' : hasError ? 'ERROR' : 'OUTPUT'}
            </div>
            {running && bootMsg && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px',
                fontSize: 10.5, color: '#9a9a9a', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
              }}>
                <Loader size={10} style={{ animation: 'vertexSpin 1s linear infinite' }} /> {bootMsg}
              </div>
            )}
            <pre className="vrtx-scroll" style={{
              flex: 1, minHeight: 0, overflowY: 'auto', margin: 0, padding: '14px 16px',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, lineHeight: 1.7,
              color: hasError ? '#f87171' : '#dcdcdc', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {output === null ? 'Click Run to see output here…' : output}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  Small reusable in-app dialogs (replaces window.confirm / window.alert
 *  — those brought up the BROWSER's native dialog, which sits outside the
 *  app's UI entirely. These render inside the same portal as everything
 *  else in Vertex, so they look and behave like part of the app.)
 * ──────────────────────────────────────────────────────────────────────── */
const ConfirmDialog = ({ dialog, onClose }) => {
  if (!dialog) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'vertexFadeIn .15s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(360px, 90vw)', background: '#141414', border: '1px solid #2a2a2a',
          borderRadius: 12, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          animation: 'vertexScaleIn .15s ease',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>{dialog.title}</div>
        <div style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{dialog.message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 7, background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#dcdcdc', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={() => { const fn = dialog.onConfirm; onClose(); fn?.(); }}
            style={{
              padding: '8px 16px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: dialog.danger ? '#ef4444' : '#e6e6e6',
              color: dialog.danger ? '#fff' : '#0a0a0a',
            }}
          >
            {dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InfoDialog = ({ dialog, onClose }) => {
  if (!dialog) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'vertexFadeIn .15s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(400px, 90vw)', background: '#141414', border: '1px solid #2a2a2a',
          borderRadius: 12, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          animation: 'vertexScaleIn .15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0' }}>{dialog.title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{dialog.message}</div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  Utility — time-of-day greeting for the empty-state hero
 * ──────────────────────────────────────────────────────────────────────── */
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late';
};

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

const AVATAR_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#84cc16'];
const getAvatarColor = (seed) => {
  const s = seed || 'U';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const LANG_TO_EXT = {
  javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
  python: 'py', py: 'py', ruby: 'rb', rb: 'rb', go: 'go', golang: 'go', rust: 'rs', rs: 'rs',
  java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', 'c#': 'cs', cs: 'cs',
  php: 'php', shell: 'sh', bash: 'sh', sh: 'sh', zsh: 'sh', sql: 'sql', html: 'html',
  css: 'css', scss: 'scss', json: 'json', yaml: 'yml', yml: 'yml', xml: 'xml',
  markdown: 'md', md: 'md', graphql: 'graphql', dockerfile: 'dockerfile', kotlin: 'kt',
  swift: 'swift', plaintext: 'txt', text: 'txt',
};
const extForLang = (lang) => LANG_TO_EXT[(lang || '').toLowerCase()] || 'txt';

// Languages that can be rendered directly as a live preview (iframe) instead of being
// piped through the code-execution runtime — the runtime has no interpreter for markup.
const PREVIEWABLE_LANGS = ['html', 'htm', 'svg'];
const isPreviewableLang = (lang) => PREVIEWABLE_LANGS.includes((lang || '').toLowerCase());

/* Pulls every fenced code block out of the assistant's messages so they can be
   saved/downloaded individually from the "Artifacts" panel, instead of the
   user having to hunt through the chat and copy-paste each one by hand. */
const extractCodeBlocksFromMessages = (messages) => {
  const blocks = [];
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  for (const m of messages) {
    if (m.role !== 'assistant' && m.role !== 'model') continue;
    let match;
    fence.lastIndex = 0;
    while ((match = fence.exec(m.text || ''))) {
      const lang = (match[1] || '').trim();
      const code = match[2].replace(/\n$/, '');
      if (!code.trim()) continue;
      blocks.push({ id: `${m.id}-${blocks.length}`, lang, code, ts: m.ts });
    }
  }
  return blocks;
};

const downloadTextAsFile = (content, filename) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const looksLikeBadTitle = (t) => {
  if (!t) return true;
  const trimmed = t.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return true;
  const badPatterns = /^(i can'?t|i'?m unable|sorry|as an ai|title:|here'?s a title|i cannot|no title)/i;
  return badPatterns.test(trimmed);
};

/* ────────────────────────────────────────────────────────────────────────
 *  Main Vertex component (powered by Vortis)
 * ──────────────────────────────────────────────────────────────────────── */
const Vertex = ({
  onClose,
  CodeBlock,
  safeExecuteCodeLocally,
  LANG_ENGINE,
  ENGINE_META,
}) => {
  /* ── Firebase singletons ── */
  const auth = useMemo(() => getAuth(), []);
  const db   = useMemo(() => getFirestore(), []);

  /* ── Identity ── */
  const [user, setUser] = useState(auth.currentUser);
  const userUidRef = useRef(auth.currentUser?.uid || '');
  // Tracks whether we've already attempted a resume this session — guards
  // against re-triggering on every auth-state flutter once we've either
  // resumed or started fresh.
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      userUidRef.current = u?.uid || '';
      if (u) {
        loadChats(u.uid);
        // Auto-resume the last-active chat on first sign-in / page load.
        // Only fires once per session — subsequent sign-in/out flutters
        // won't yank the user back to an old conversation.
        if (!resumeAttemptedRef.current) {
          resumeAttemptedRef.current = true;
          try {
            const savedChatId = localStorage.getItem('vrtis_vertex_active_chat');
            if (savedChatId && savedChatId !== chatIdRef.current) {
              loadChat(savedChatId);
            }
          } catch (_) {}
        }
      } else {
        setSavedChats([]);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Chat state ── */
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [replyQuote, setReplyQuote] = useState(null); // { text } — quoted snippet the user is replying to
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState(false);
  // On first mount, try to restore the last-active chat id from localStorage
  // so a refresh / close-reopen lands the user back in their previous
  // conversation (with a "Continue" prompt) instead of a blank new chat.
  const [chatId, setChatId] = useState(() => {
    try {
      const saved = localStorage.getItem('vrtis_vertex_active_chat');
      return saved || Date.now().toString();
    } catch (_) { return Date.now().toString(); }
  });
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
  // Persist the active chat id whenever it changes so we can resume after refresh.
  useEffect(() => {
    try {
      if (messages.length > 0) localStorage.setItem('vrtis_vertex_active_chat', chatId);
      else localStorage.removeItem('vrtis_vertex_active_chat');
    } catch (_) {}
  }, [chatId, messages.length]);
  const convHistoryRef = useRef([]);
  const [editingMsgId, setEditingMsgId] = useState(null);

  /* ── Sidebar state ── */
  const [savedChats, setSavedChats] = useState([]);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── In-app dialogs (replace window.confirm / window.alert) ── */
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [infoDialog, setInfoDialog] = useState(null);

  const showHelp = useCallback(() => {
    setInfoDialog({
      title: 'Vertex Help',
      message: 'Vertex is your dedicated coding assistant.\n\n• Paste an error to debug it\n• Ask for a function or a refactor\n• Attach files, folders, images, or documents with the + button\n• ⌘K starts a new chat · Esc closes panels\n\nResume:       refresh or close+reopen lands you back in your last chat automatically\nReply:        highlight any prose in chat → click the Reply chip → a "Replying to" banner shows above the input (does NOT trigger inside code blocks)\nSmart Edit:   click Edit on any code block → describe what\'s wrong → Vertex returns only the fix (saves tokens)\nContinue:     shows automatically when a reply got cut off (unclosed code block)\nRegenerate:   on every Vertex reply — re-ask the same question for a fresh take\nCopy:         on every Vertex reply\nEdit:         on your own message, click the pencil to tweak & resend — original stays in chat until you send, so backspacing the input never loses it\nScroll:       scroll up freely while Vertex streams — auto-scroll only kicks in when you\'re already at the bottom\nSplit panel:  drag the divider between code and output to resize — works with mouse and touch',
    });
  }, []);

  /* ── Right-side code panel state ── */
  const [panelCode, setPanelCode] = useState(null);
  const [panelOutput, setPanelOutput] = useState(null);
  const [panelRunning, setPanelRunning] = useState(false);
  const [panelHasError, setPanelHasError] = useState(false);
  const [panelBootMsg, setPanelBootMsg] = useState('');

  const openCodePanel = useCallback(({ lang, code }) => {
    setPanelCode({ lang, code });
    setPanelOutput(null);
    setPanelHasError(false);
  }, []);

  const closeCodePanel = useCallback(() => {
    setPanelCode(null);
    setPanelOutput(null);
    setPanelHasError(false);
    setPanelBootMsg('');
  }, []);

  /* Opens previewable markup (HTML/SVG) in a real new browser tab — used both by the
     panel's "Open in new tab" button and its inline preview header. Nothing is uploaded
     anywhere; it's a local Blob URL, so the user never leaves Vertex to see it rendered. */
  const openHtmlInNewTab = useCallback((code) => {
  try {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // window.open was blocked — anchor click fallback usually still works
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error('Vertex: failed to open preview in new tab —', e);
  }
}, []);

  const runPanelCode = useCallback(async () => {
    if (!panelCode || panelRunning || !safeExecuteCodeLocally) return;
    setPanelRunning(true);
    setPanelOutput(null);
    setPanelHasError(false);
    setPanelBootMsg('');
    try {
      const result = await safeExecuteCodeLocally(panelCode.lang, panelCode.code, (m) => setPanelBootMsg(m));
      setPanelHasError(!!result.isError);
      setPanelOutput(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2));
    } catch (e) {
      setPanelHasError(true);
      setPanelOutput('Error: ' + (e?.message || String(e)));
    } finally {
      setPanelRunning(false);
      setPanelBootMsg('');
    }
  }, [panelCode, panelRunning, safeExecuteCodeLocally]);

  /* ── Preferences ── */
  const [style, setStyle] = useState(() => {
    try {
      const saved = localStorage.getItem('vortis_code_style');
      return STYLES.some(s => s.id === saved) ? saved : STYLES[0].id;
    } catch (_) { return STYLES[0].id; }
  });
  const [showPrefs, setShowPrefs] = useState(false);
  const prefsRef = useRef(null);
  useEffect(() => { try { localStorage.setItem('vortis_code_style', style); } catch (_) {} }, [style]);
  const [recentChatsOpen, setRecentChatsOpen] = useState(true);

  /* ── Settings popover state (declared early so the Esc handler below
       can reference it without hitting a Temporal Dead Zone error) ── */
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  useEffect(() => {
    if (!showSettings) return;
    const handleClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  // Close the Style Preferences popover on outside click
  useEffect(() => {
    if (!showPrefs) return;
    const handleClick = (e) => {
      if (prefsRef.current && !prefsRef.current.contains(e.target)) setShowPrefs(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPrefs]);

  /* ── Artifacts panel — lists every code block Vertex has produced in this
       chat PLUS any of the user's own files added via "Add file" below, all
       downloadable individually. This replaces the old top-right "Files"
       button, which just re-opened the attach picker and had nothing to do
       with saving anything. ── */
  const [showArtifacts, setShowArtifacts] = useState(false);
  const artifactsRef = useRef(null);
  const artifactUploadRef = useRef(null);
  const [userArtifacts, setUserArtifacts] = useState([]); // user-added files, kept for the session
  useEffect(() => {
    if (!showArtifacts) return;
    const handleClick = (e) => {
      if (artifactsRef.current && !artifactsRef.current.contains(e.target)) setShowArtifacts(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showArtifacts]);

  /* Lets the user drop their own file straight into the Artifacts panel so it
     sits alongside AI-generated snippets and can be grabbed again later —
     without ever leaving Vertex. Text-y files are read as text (so "Save"
     downloads a real, readable file); anything else is kept as a blob URL
     built from the raw bytes so the original file downloads unchanged. */
  const handleAddArtifact = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files.slice(0, 12)) {
      if (isTextFile(file.name, file.type) || isDocxFile(file.name, file.type)) {
        const content = isDocxFile(file.name, file.type) ? await extractDocxText(file) : await readAsText(file);
        setUserArtifacts(prev => [...prev, {
          id: `ua-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name, kind: 'text', content, size: file.size, ts: Date.now(),
        }]);
      } else {
        const dataUrl = await readAsDataURL(file);
        setUserArtifacts(prev => [...prev, {
          id: `ua-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name, kind: 'blob', dataUrl, size: file.size, ts: Date.now(),
        }]);
      }
    }
    e.target.value = '';
  }, []);

  const downloadUserArtifact = useCallback((a) => {
    if (a.kind === 'text') {
      downloadTextAsFile(a.content, a.name);
    } else {
      const link = document.createElement('a');
      link.href = a.dataUrl;
      link.download = a.name;
      link.click();
    }
  }, []);

  const removeUserArtifact = useCallback((id) => {
    setUserArtifacts(prev => prev.filter(a => a.id !== id));
  }, []);

  /* ── OCR mode toggle — off by default; when on, attached images get
       their text extracted via the vision API before being sent. ── */
  const [ocrMode, setOcrMode] = useState(false);

  const ocrImage = async (dataUrl, name) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({
          action: 'vision',
          image: dataUrl,
          prompt: `Extract ALL text from this image (${name}). Return only the extracted text, preserving structure. If there's no text, return "[No text detected]".`,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.description || data.text || null;
    } catch (e) {
      console.error('OCR failed:', e);
      return null;
    }
  };

  /* ── Paste attachments ("PASTED" cards above the input) ── */
  const [attachments, setAttachments] = useState([]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments(prev => [...prev, {
            id: `img-${Date.now()}`,
            type: 'image',
            name: file.name || 'Pasted image',
            content: reader.result,
          }]);
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    const text = e.clipboardData.getData('text');
    if (!text) return;
    const isBig = text.length > 200 || text.split('\n').length > 6;
    if (!isBig) return;

    e.preventDefault();
    const lines = text.split('\n');
    const preview = lines.slice(0, 6).join('\n');
    setAttachments(prev => [...prev, {
      id: `txt-${Date.now()}`,
      type: 'text',
      name: `Pasted text`,
      preview,
      content: text,
      lines: lines.length,
    }]);
  }, []);

  const removeAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  /* ── Attach menu ("+" button next to the input) ── */
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const docFileInputRef = useRef(null);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAttachMenu]);

  /* Handles "Add file", "Add project folder", and "Add document" — routes
     images to image attachment cards, text/code files to file attachment
     cards. Nothing gets silently dumped into the raw textarea anymore. */
  const handleFilesSelected = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const MAX_CHARS = 20000;

    for (const file of files.slice(0, 12)) {
      if (isImageFile(file.name, file.type)) {
        const dataUrl = await readAsDataURL(file);
        setAttachments(prev => [...prev, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'image',
          name: file.name,
          content: dataUrl,
          mime: file.type,
          size: file.size,
        }]);
        continue;
      }

      if (isTextFile(file.name, file.type)) {
        let content = await readAsText(file);
        let truncated = false;
        if (content.length > MAX_CHARS) { content = content.slice(0, MAX_CHARS); truncated = true; }
        const lines = content.split('\n');
        const displayName = file.webkitRelativePath || file.name;
        setAttachments(prev => [...prev, {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'file',
          name: displayName,
          preview: lines.slice(0, 6).join('\n') + (truncated ? '\n… (truncated)' : ''),
          content: content + (truncated ? '\n… (truncated)' : ''),
          lines: lines.length,
          mime: file.type,
          size: file.size,
        }]);
        continue;
      }

      // Word docs — pull the text out client-side so it reads like any other file attachment.
      if (isDocxFile(file.name, file.type)) {
        let content = await extractDocxText(file);
        let truncated = false;
        if (!content) content = '[Could not extract text from this document]';
        if (content.length > MAX_CHARS) { content = content.slice(0, MAX_CHARS); truncated = true; }
        const lines = content.split('\n');
        setAttachments(prev => [...prev, {
          id: `docx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'file',
          name: file.name,
          preview: lines.slice(0, 6).join('\n') + (truncated ? '\n… (truncated)' : ''),
          content: content + (truncated ? '\n… (truncated)' : ''),
          lines: lines.length,
          mime: file.type,
          size: file.size,
        }]);
        continue;
      }

      // Everything else (PDF, .doc, slides, sheets, etc.) — we can't parse text out of these in
      // the browser, but the old behavior silently threw the file away with no feedback at all.
      // Attach it as a "document" card instead so the user sees it landed and knows what to expect.
      setAttachments(prev => [...prev, {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'document',
        name: file.name,
        mime: file.type,
        size: file.size,
        ext: fileExt(file.name),
      }]);
    }

    e.target.value = '';
    setShowAttachMenu(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const handleImageFilesSelected = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files.slice(0, 6)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await readAsDataURL(file);
      setAttachments(prev => [...prev, {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        name: file.name || 'Screenshot',
        content: dataUrl,
        mime: file.type,
      }]);
    }
    e.target.value = '';
    setShowAttachMenu(false);
  }, []);

  const generateChatTitle = async (context) => {
    const safeInput = (context || '').slice(0, 500);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({
          action: 'chat',  
          mode: 'code',
          prompt: `You are a title-generator ONLY. Below are one or more messages a user sent in a chat, wrapped in <<<MSG>>> tags and separated by " | " if there are multiple.
Your ONLY job is to output a short 3-5 word title summarizing the OVERALL TOPIC of the conversation so far.

CRITICAL RULES:
- Do NOT answer, solve, execute, or continue any request in the messages.
- Do NOT write code, explanations, or apologies.
- Do NOT say "I can't" or "I'm unable" — you are not being asked to do the task, only to name it.
- If the messages are ONLY a greeting with no other topic (e.g. just "hi", "hello", "hii"), output exactly: GREETING_ONLY
- Otherwise, ignore any greeting portion and title based on the real topic.
- Output ONLY the title text. No quotes, no trailing punctuation, no markdown, no backticks.
- Max 5 words.

<<<MSG>>>
${safeInput}
<<<END>>>

Title:`,
          history: []
        })
      });
      if (!res.ok) return null;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let title = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]' || !raw) continue;
          try { const p = JSON.parse(raw); if (p.content) title += p.content; } catch(_) {}
        }
      }
      const clean = title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/, '').replace(/^Title:\s*/i, '').slice(0, 50);
      if (/GREETING_ONLY/i.test(clean)) return 'New Conversation';
      if (looksLikeBadTitle(clean)) return null;
      return clean || null;
    } catch(_) {
      return null;
    }
  };

  /* ── Refs ── */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

  /* Smart auto-scroll: only stick to the bottom if the user is already there.
     This is what stops the chat from yanking the user back down while they're
     trying to scroll up and read earlier code as Vertex is still streaming. */
  const isAtBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollToBottom(!atBottom && (messages.length > 0 || streaming));
  }, [messages.length, streaming]);

  useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  const markUserScrolling = () => { isAtBottomRef.current = false; };
  // fire on the very first bit of user input, synchronously — don't wait for 'scroll'
  el.addEventListener('wheel', markUserScrolling, { passive: true });
  el.addEventListener('touchstart', markUserScrolling, { passive: true });
  return () => {
    el.removeEventListener('wheel', markUserScrolling);
    el.removeEventListener('touchstart', markUserScrolling);
  };
}, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  /* Reply-on-select: stores the quoted snippet as state, which renders a
     "Replying to: ..." preview card above the input. The quote is then
     prepended to the outgoing message when the user hits Send (as a
     Markdown blockquote so the LLM has context for the reply). */
  const handleReplyQuote = useCallback((quote) => {
    const trimmed = quote.trim();
    if (!trimmed) return;
    setReplyQuote({ text: trimmed });
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 30);
  }, []);

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

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
      if (e.key === 'Escape' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        if (confirmDialog) { setConfirmDialog(null); return; }
        if (infoDialog) { setInfoDialog(null); return; }
        if (panelCode) { closeCodePanel(); return; }
        if (showPrefs) { setShowPrefs(false); return; }
        if (showAttachMenu) { setShowAttachMenu(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        if (showArtifacts) { setShowArtifacts(false); return; }
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPrefs, panelCode, confirmDialog, infoDialog, showAttachMenu, showSettings, showArtifacts]);

  /* ── Firestore ops ── */
  const loadChats = useCallback(async (uid) => {
    if (!uid) { setSavedChats([]); return; }
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'chats'));
      const chats = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.isCodeChat)
        .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
      setSavedChats(chats);
    } catch (e) {
      console.error('Vertex: failed to load code chats —', e);
    }
  }, [db]);

  const persistChat = useCallback(async (msgs, overrideTitle) => {
    if (!userUidRef.current) return;
    try {
      let title = overrideTitle;
      if (!title) {
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) {
          title = firstUser.text.replace(/```[\s\S]*?```/g, '').replace(/[#*`]/g, '').trim().slice(0, 48);
          if (!title) title = 'New Code Chat';
        } else {
          title = 'New Code Chat';
        }
      }
      const cleaned = msgs.map(m => ({
        role: m.role,
        text: (m.text || '').slice(0, 12000),
        ts: m.ts || Date.now()
      }));
      await setDoc(doc(db, 'users', userUidRef.current, 'chats', chatIdRef.current), {
        title,
        preview: title,
        isCodeChat: true,
        messages: cleaned,
        style,
        updated: new Date().toISOString(),
        createdAt: msgs[0]?.ts ? new Date(msgs[0].ts).toISOString() : new Date().toISOString()
      });
      loadChats(userUidRef.current);
    } catch (e) {
      console.error('Vertex: failed to save code chat —', e);
    }
  }, [db, style, loadChats]);

  const newChat = useCallback(() => {
    abortRef.current = true;
    setStreaming(false); setThinking(false); setStreamText('');
    const newId = Date.now().toString();
    setChatId(newId); chatIdRef.current = newId;
    setMessages([]); convHistoryRef.current = [];
    setInput('');
    setAttachments([]);
    setReplyQuote(null);
    try { localStorage.removeItem('vrtis_vertex_active_chat'); } catch (_) {}
    closeCodePanel();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [closeCodePanel]);

  const loadChat = useCallback(async (id) => {
    if (!userUidRef.current) return;
    try {
      const snap = await getDoc(doc(db, 'users', userUidRef.current, 'chats', id));
      if (!snap.exists()) {
        // Chat was deleted (maybe from another session). Clear the stale
        // active-chat pointer and reset to a fresh id so the empty state
        // shows correctly instead of leaving chatId pointing at a ghost.
        try { localStorage.removeItem('vrtis_vertex_active_chat'); } catch (_) {}
        const freshId = Date.now().toString();
        setChatId(freshId); chatIdRef.current = freshId;
        return;
      }
      const c = snap.data();
      setChatId(id); chatIdRef.current = id;
      try { localStorage.setItem('vrtis_vertex_active_chat', id); } catch (_) {}
      const restored = (c.messages || []).map((m, i) => ({
        id: `${id}-${i}`,
        role: m.role,
        text: m.text,
        ts: typeof m.ts === 'number' ? m.ts : Date.now()
      }));
      setMessages(restored);
      convHistoryRef.current = restored.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      if (c.style && STYLES.some(s => s.id === c.style)) setStyle(c.style);
      closeCodePanel();
      if (window.innerWidth <= 900) setSidebarOpen(false);
    } catch (e) {
      console.error('Vertex: failed to load code chat —', e);
    }
  }, [db, closeCodePanel]);

  const deleteChat = useCallback(async (id) => {
    if (!userUidRef.current) return;
    try {
      await deleteDoc(doc(db, 'users', userUidRef.current, 'chats', id));
      await loadChats(userUidRef.current);
      if (id === chatIdRef.current) newChat();
    } catch (e) {
      console.error('Vertex: failed to delete code chat —', e);
    }
  }, [db, loadChats, newChat]);

  const renameChat = useCallback(async (id, newTitle) => {
    if (!userUidRef.current || !newTitle.trim()) { setRenamingId(null); return; }
    try {
      await setDoc(doc(db, 'users', userUidRef.current, 'chats', id),
        { title: newTitle.trim().slice(0, 80), preview: newTitle.trim().slice(0, 80) }, { merge: true });
      await loadChats(userUidRef.current);
    } catch (e) {
      console.error('Vertex: failed to rename code chat —', e);
    }
    setRenamingId(null);
  }, [db, loadChats]);

  /* "Clear all data" now opens the in-app ConfirmDialog instead of the
     browser's native confirm() — that native dialog rendered OUTSIDE the
     app UI entirely (top of the browser chrome), which read as broken.
     Lives ONLY in the left sidebar — it's a destructive, rarely-used action
     and having it duplicated in Settings too just added clutter. */
  const [clearing, setClearing] = useState(false);
  const clearAllData = useCallback(() => {
    if (!userUidRef.current || clearing) return;
    setConfirmDialog({
      title: 'Clear All Data',
      message: 'Delete ALL saved code chats? This cannot be undone.',
      confirmLabel: 'Delete All',
      danger: true,
      onConfirm: async () => {
        setClearing(true);
        try {
          const snap = await getDocs(collection(db, 'users', userUidRef.current, 'chats'));
          const codeChatDocs = snap.docs.filter(d => d.data().isCodeChat);
          await Promise.all(codeChatDocs.map(d => deleteDoc(d.ref)));
          await loadChats(userUidRef.current);
          newChat();
        } catch (e) {
          console.error('Vertex: failed to clear all data —', e);
        } finally {
          setClearing(false);
        }
      },
    });
  }, [db, loadChats, newChat, clearing]);

  /* ── Export chat as Markdown — lives ONLY on the top bar "Export" button now.
     It was previously duplicated inside Settings too, which was redundant. ── */
  const exportChat = useCallback(() => {
    if (messages.length === 0) return;
    const lines = ['# Vertex Chat Export', '', `Exported: ${new Date().toISOString()}`, '', '---', ''];
    for (const m of messages) {
      lines.push(m.role === 'user' ? '**User**' : '**Vertex**');
      lines.push(`_${new Date(m.ts).toLocaleString()}_`, '', m.text, '', '---', '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vertex-chat-${chatId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, chatId]);

  const requestDeleteChat = useCallback((c) => {
    setConfirmDialog({
      title: 'Delete Chat',
      message: `Delete "${c.title || 'Untitled'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => deleteChat(c.id),
    });
  }, [deleteChat]);

  /* Performs one attempt at calling the backend and streaming its reply. Returns
     { text, errorMsg, status, isNetwork }. Used by send() below, which may call this
     twice — once transient hiccups (a 503, a dropped connection, or a reply that
     stream back completely empty) are common enough that a silent one-time retry
     smooths over most of what used to surface as "Vertex is unavailable". */
  const fetchAssistantReply = useCallback(async (fullPrompt, historyForBackend) => {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({
          action: 'chat',
          mode: 'code',
          prompt: fullPrompt,
          history: historyForBackend
        })
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status}).`;
        if (res.status === 429) errMsg = "You're sending messages too quickly — please slow down.";
        else if (res.status === 401 || res.status === 403) errMsg = 'Authentication error — try refreshing the page.';
        else if (res.status === 503) errMsg = 'The AI is temporarily unavailable — please try again shortly.';
        return { text: '', errorMsg, status: res.status, isNetwork: false };
      }

      setThinking(false);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      let full = '';

      // Throttle stream renders with rAF — without this, every SSE chunk
      // triggers a setStreamText → React re-render → full ReactMarkdown
      // re-parse of the entire response so far. For a 2000-token reply
      // that's ~2000 re-parses, which is what made messages feel sluggish
      // and "come in late". rAF batches them into one render per frame.
      let pendingFlush = false;
      let lastFlushed = '';
      const flush = () => {
        pendingFlush = false;
        if (lastFlushed !== full) {
          lastFlushed = full;
          setStreamText(full);
        }
      };
      const scheduleFlush = () => {
        if (pendingFlush) return;
        pendingFlush = true;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(flush);
        } else {
          setTimeout(flush, 16);
        }
      };

      while (true) {
        if (abortRef.current) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]' || !raw) continue;
          try {
            const p = JSON.parse(raw);
            if (p.content) { full += p.content; scheduleFlush(); }
          } catch (_) {}
        }
      }

      if (buffer.startsWith('data: ')) {
        const raw = buffer.slice(6).trim();
        if (raw && raw !== '[DONE]') {
          try {
            const p = JSON.parse(raw);
            if (p.content) { full += p.content; scheduleFlush(); }
          } catch (_) {}
        }
      }

      // Final flush so the very last chunk is guaranteed to be on screen
      // before we hand off to the persisted message.
      if (pendingFlush) {
        if (typeof requestAnimationFrame === 'function') {
          await new Promise(r => requestAnimationFrame(r));
        } else {
          await new Promise(r => setTimeout(r, 16));
        }
      }
      flush();

      return { text: full, errorMsg: null, status: res.status, isNetwork: false };
    } catch (e) {
      return { text: '', errorMsg: `Network error: ${e?.message || 'unknown'}`, status: null, isNetwork: true };
    }
  }, []);

  /* ── Send message + stream response ── */
  const lastSendRef = useRef('');
  const send = useCallback(async (overrideText, overrideMessages = null) => {
    const rawText = (overrideText ?? input).trim();
    const pendingAttachments = overrideMessages ? [] : [...attachments];

    let text = rawText;
    if (pendingAttachments.length > 0) {
      const blocks = [];
      for (const att of pendingAttachments) {
        if (att.type === 'image') {
          if (ocrMode) {
            const ocrText = await ocrImage(att.content, att.name);
            if (ocrText && ocrText !== '[No text detected]') {
              blocks.push(`[Image: ${att.name} — OCR extracted text:]\n\`\`\`\n${ocrText}\n\`\`\``);
            } else {
              blocks.push(`[Attached image: ${att.name}]`);
            }
          } else {
            blocks.push(`[Attached image: ${att.name}]`);
          }
        } else if (att.type === 'document') {
          blocks.push(`[Attached document: ${att.name}${att.size ? ` (${formatBytes(att.size)})` : ''} — this file type can't be read directly, ask about it by name if you want me to guess at its contents or just describe what's in it.]`);
        } else {
          blocks.push(`\`\`\`\n${att.content}\n\`\`\``);
        }
      }
      text = blocks.join('\n\n') + (rawText ? '\n\n' + rawText : '');
    }

    if (!text || streaming) return;
    if (!overrideMessages) setAttachments([]);

    // If the user picked a "Reply" quote, prepend it as a Markdown blockquote
    // so the LLM sees the snippet they're replying to. Skip for system-driven
    // sends (overrideText/overrideMessages) like Regenerate/Continue.
    if (replyQuote && !overrideText && !overrideMessages) {
      const quoted = replyQuote.text.split('\n').map(l => '> ' + l).join('\n');
      text = quoted + '\n\n' + text;
      setReplyQuote(null);
    }

    lastSendRef.current = text; // kept so the Retry button on a failed/empty reply can resend exactly this

    // If the user was editing a previous user message, drop everything from
    // that message onward before appending the new (edited) one. This is the
    // only point where the original message actually gets removed — so if the
    // user backspaced the whole input and abandoned the edit, the original
    // is still intact in the chat. Skip for system-driven sends.
    let baseMessages = overrideMessages ?? messages;
    if (editingMsgId && !overrideText && !overrideMessages) {
      const editIdx = baseMessages.findIndex(m => m.id === editingMsgId);
      if (editIdx !== -1) baseMessages = baseMessages.slice(0, editIdx);
      setEditingMsgId(null);
    }
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() };
    const nextMsgs = [...baseMessages, userMsg];
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

   const sys = buildCoderSystemPrompt(style);
    let searchContext = '';
    if (needsCodeWebSearch(text)) {
      setThinking(true); // keep the "thinking…" dots up while search runs
      searchContext = await fetchCodeSearchContext(text);
    }
    const fullPrompt = sys + searchContext + '\n\n=== USER REQUEST ===\n' + text;

    let result = await fetchAssistantReply(fullPrompt, historyForBackend);

    
    /* Detects when a code question needs live web info — recency/version signals
   that a static-knowledge model gets wrong (new releases, deprecations,
   changelogs) or an explicit ask to look something up. */
const needsCodeWebSearch = (text) => {
  const low = text.toLowerCase();
  if (/\b(search|look up|google|check online|check the docs|check the latest)\b/.test(low)) return true;
  if (/\b(latest|newest|current|recent|up[- ]to[- ]date|as of \d{4}|changelog|release notes|deprecated|breaking change|new version|just released)\b/.test(low)) return true;
  if (/\bv?\d+\.\d+(\.\d+)?\b.*\b(release|version|update|changelog)\b/i.test(text)) return true;
  return false;
};

/* Calls the existing backend `action: 'search'` endpoint and formats the
   results as a context block to prepend to the coder system prompt. Reuses
   the same search pipeline App.jsx's regular chat already relies on —
   Vertex just wasn't calling it before. */
const fetchCodeSearchContext = async (query) => {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: await getAuthHeader(),
      body: JSON.stringify({ action: 'search', query: query.slice(0, 300) }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (!data.success || !Array.isArray(data.results) || data.results.length === 0) return '';
    const snippets = data.results.slice(0, 5).map((r, i) =>
      `[${i + 1}] ${r.title}\n${(r.snippet || '').slice(0, 350)}\nSource: ${r.source} | Date: ${r.date}`
    ).join('\n\n');
    return `\n\n---\nLIVE WEB SEARCH RESULTS (current info — trust this over training data for versions/APIs/recent changes):\n${snippets}\n---`;
  } catch (e) {
    console.error('Vertex: code search failed —', e);
    return '';
  }
};

    // A 503, a dropped connection, or a stream that came back completely empty is often
    // just a transient hiccup — quietly try once more before bothering the user about it.
    const worthRetrying = !abortRef.current && (
      (result.errorMsg && (result.status === 503 || result.isNetwork)) ||
      (!result.errorMsg && !result.text.trim())
    );
    if (worthRetrying) {
      setThinking(true);
      setStreamText('');
      await new Promise(r => setTimeout(r, 700));
      const retryResult = await fetchAssistantReply(fullPrompt, historyForBackend);
      result = retryResult;
    }

    setThinking(false);

    if (result.errorMsg) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ ${result.errorMsg}`,
        ts: Date.now(),
        canRetry: true,
      }]);
      setStreaming(false); setStreamText('');
      return;
    }

    const cleaned = result.text.trim();
    if (!cleaned) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: '_(empty response — try rephrasing your request)_',
        ts: Date.now(),
        canRetry: true,
      }]);
    } else {
      const aiMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: cleaned,
        ts: Date.now()
      };

      const finalMsgs = [...nextMsgs, aiMsg];
      setMessages(finalMsgs);

      setTimeout(async () => {
        const context = finalMsgs
          .filter(m => m.role === "user")
          .map(m => m.text)
          .join(" | ");

        const title =
          await generateChatTitle(context) ||
          finalMsgs.find(m => m.role === "user")?.text.slice(0, 48) ||
          "New Code Chat";

        await persistChat(finalMsgs, title);
      }, 50);
    }
    setStreaming(false);
    setThinking(false);
    setStreamText('');
  }, [input, messages, streaming, style, persistChat, attachments, ocrMode, fetchAssistantReply, replyQuote, editingMsgId]);

  /* Smart Edit on a code block — sends a focused request that asks Vertex to
     return ONLY the corrected code (with a one-line summary) instead of
     regenerating the whole explanation. Saves tokens, saves scroll position,
     saves the user from having to scroll past the old version to find the fix. */
  const handleSmartEdit = useCallback(({ code, lang, feedback, blockId }) => {
    if (streaming) return;
    const fence = '```' + (lang || '');
    const tripleBacktick = '```';
    const editPrompt =
      `The following code has an issue. Return ONLY the corrected code inside a single ${fence} fence, followed by ONE one-line summary of what changed. Do NOT re-explain the whole thing — output the full corrected version so it can be copy-pasted directly.\n\n` +
      `CODE:\n${fence}\n${code}\n${tripleBacktick}\n\n` +
      `ISSUE FROM USER:\n${feedback}`;
    send(editPrompt);
  }, [send, streaming]);

  /* Continue — asks Vertex to pick up where it left off, for when a response
     got cut off mid-code-block. */
  const handleContinue = useCallback(() => {
    if (streaming) return;
    send('Continue from where you left off — complete the response, picking up mid-code-block if needed.');
  }, [send, streaming]);

  /* Regenerate — drops the last assistant reply and re-asks the same question.
     Useful when the answer was off-track and you want a fresh take without
     retyping the prompt. */
  const handleRegenerate = useCallback(() => {
    if (streaming) return;
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const lastUserText = messages[lastUserIdx].text;
    const trimmed = messages.slice(0, lastUserIdx);
    send(lastUserText, trimmed);
  }, [messages, streaming, send]);

  /* Edit-and-resend — loads a previous user message back into the input box
     WITHOUT removing it from the chat yet. The message only gets dropped
     when the user actually sends the edited version. This way, if they
     backspace the whole input and change their mind, the original message
     is still right there in the chat — no data loss. */
  const handleEditUserMessage = useCallback((msgId) => {
    if (streaming) return;
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const msg = messages[idx];
    setEditingMsgId(msgId);
    setInput(msg.text);
    setAttachments([]);
    setReplyQuote(null);
    isAtBottomRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [messages, streaming]);
  /* Retries the last request after a failed or empty reply — pops the failed
     assistant bubble off and resends the exact text that was last sent, so the
     user doesn't have to retype anything. */
  const retryLastMessage = useCallback((failedMsgId) => {
    if (!lastSendRef.current || streaming) return;
    setMessages(prev => prev.filter(m => m.id !== failedMsgId));
    send(lastSendRef.current);
  }, [send, streaming]);

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

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming && (input.trim() || attachments.length > 0)) send();
    }
  }, [streaming, input, attachments, send]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedChats;
    return savedChats.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [savedChats, search]);

  const codeBlocks = useMemo(() => extractCodeBlocksFromMessages(messages), [messages]);

  const downloadCodeBlock = useCallback((block, index) => {
    downloadTextAsFile(block.code, `vertex-snippet-${index + 1}.${extForLang(block.lang)}`);
  }, []);

  const downloadAllCodeBlocks = useCallback(() => {
    codeBlocks.forEach((b, i) => setTimeout(() => downloadCodeBlock(b, i), i * 120));
  }, [codeBlocks, downloadCodeBlock]);

  /* Markdown component factory — built once per (messageId, onSmartEdit)
     tuple so each message bubble gets its own code-block instances that
     know which message they belong to (for Smart Edit). The streaming
     preview calls this with onSmartEdit=null since you can't edit code
     that's still being streamed. */
  const makeMdComponents = useCallback(({ onSmartEdit, messageId }) => ({
    h1: ({children}) => <h1 style={{ fontSize: 19, fontWeight: 700, color: '#f0f0f0', margin: '14px 0 6px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h1>,
    h2: ({children}) => <h2 style={{ fontSize: 16.5, fontWeight: 700, color: '#f0f0f0', margin: '12px 0 5px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h2>,
    h3: ({children}) => <h3 style={{ fontSize: 14.5, fontWeight: 600, color: '#dcdcdc', margin: '10px 0 4px', lineHeight: 1.3 }}>{children}</h3>,
    h4: ({children}) => <h4 style={{ fontSize: 13.5, fontWeight: 600, color: '#dcdcdc', margin: '8px 0 3px' }}>{children}</h4>,
    p: ({children}) => <p style={{ margin: '0 0 8px', color: '#dcdcdc', lineHeight: 1.7, fontSize: 14 }}>{children}</p>,
    strong: ({children}) => <strong style={{ color: '#f0f0f0', fontWeight: 700 }}>{children}</strong>,
    em: ({children}) => <em style={{ color: '#9a9a9a' }}>{children}</em>,
    ul: ({children}) => <ul style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ul>,
    ol: ({children}) => <ol style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ol>,
    li: ({children}) => <li style={{ margin: '3px 0', color: '#dcdcdc', lineHeight: 1.65, fontSize: 14 }}>{children}</li>,
    a: ({href, children}) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#e6e6e6', textDecoration: 'none', borderBottom: '1px solid #4a4a4a' }}>{children}</a>,
    blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid #3a3a3a', margin: '8px 0', padding: '4px 12px', color: '#9a9a9a', background: '#141414', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>,
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid #232323', margin: '12px 0' }} />,
    table: ({children}) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>{children}</table></div>,
    thead: ({children}) => <thead style={{ background: '#141414' }}>{children}</thead>,
    th: ({children}) => <th style={{ padding: '6px 10px', border: '1px solid #232323', textAlign: 'left', color: '#e6e6e6', fontWeight: 600 }}>{children}</th>,
    td: ({children}) => <td style={{ padding: '6px 10px', border: '1px solid #232323', color: '#b8b8b8' }}>{children}</td>,
    code: ({inline, className, children}) => {
      if (inline) {
        return <code style={{ background: '#000000', color: '#e6e6e6', padding: '1px 6px', borderRadius: 5, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, border: '1px solid #2a2a2a' }}>{children}</code>;
      }
      const match = /language-(\w+)/.exec(className || '');
      const codeLang = match ? match[1] : '';
      const codeText = String(children).replace(/\n$/, '');
      const bid = `${messageId || 'msg'}-${codeLang || 'x'}-${codeText.length}-${codeText.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
      return <VertexCodeBlock lang={codeLang} codeText={codeText} onOpenPanel={openCodePanel} onSmartEdit={onSmartEdit} blockId={bid} />;
    },
  }), [openCodePanel]);

  /* Streaming preview uses a no-smart-edit variant — you can't fix code
     that's still being typed out. */
  const mdComponentsForStreaming = useMemo(() => makeMdComponents({ onSmartEdit: null, messageId: 'streaming' }), [makeMdComponents]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-vertex style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      width: '100vw', height: '100dvh',
      zIndex: 2147483647,
      background: '#0a0a0a',
      color: '#e6e6e6',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      animation: 'vertexFadeIn .18s ease',
      overflow: 'hidden',
      isolation: 'isolate',
    }}>
      {/* ═══ Top bar ═══ */}
      <div style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid #212121', background: '#0f0f0f'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar"
            style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
            {sidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#e6e6e6', border: '1px solid #e6e6e6'
            }}>
              <Terminal size={14} color="#0a0a0a"/>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e6e6e6', letterSpacing: '-.01em', lineHeight: 1 }}>Vertex</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Artifacts — every code block Vertex has generated in this chat, PLUS any files
              the user adds themselves via "Add file" below. Everything here is downloadable
              on the spot without leaving Vertex. */}
          <div ref={artifactsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowArtifacts(v => !v)}
              title="Artifacts — saved files from this chat"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: showArtifacts ? '#1c1c1c' : '#141414',
                border: '1px solid ' + (showArtifacts ? '#3a3a3a' : '#2a2a2a'),
                color: showArtifacts ? '#e6e6e6' : '#c8c8c8', fontSize: 12, borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer'
              }}
            >
              <Layers size={12}/> Artifacts{(codeBlocks.length + userArtifacts.length) > 0 ? ` (${codeBlocks.length + userArtifacts.length})` : ''}
            </button>

            {showArtifacts && (
              <div style={{
                position: 'absolute', top: 42, right: 0, zIndex: 100, width: 310,
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10,
                boxShadow: '0 12px 36px rgba(0,0,0,.5)', padding: 10,
                animation: 'vertexScaleIn .15s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 8px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8a8a8a', letterSpacing: '.06em', fontFamily: 'JetBrains Mono' }}>ARTIFACTS</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => artifactUploadRef.current?.click()}
                      style={{ fontSize: 11, color: '#c8c8c8', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <Upload size={11}/> Add file
                    </button>
                    {codeBlocks.length > 0 && (
                      <button onClick={downloadAllCodeBlocks}
                        style={{ fontSize: 11, color: '#c8c8c8', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                        <Download size={11}/> Save all
                      </button>
                    )}
                  </div>
                </div>
                <input ref={artifactUploadRef} type="file" multiple style={{ display: 'none' }} onChange={handleAddArtifact} />

                {codeBlocks.length === 0 && userArtifacts.length === 0 ? (
                  <div style={{ padding: '14px 6px 16px', textAlign: 'center', color: '#5a5a5a', fontSize: 12, lineHeight: 1.6 }}>
                    <FileCode size={18} style={{ opacity: .4, marginBottom: 6 }}/>
                    <div>Nothing here yet.</div>
                    <div style={{ fontSize: 10.5, marginTop: 2 }}>Code Vertex writes shows up here automatically — or use "Add file" to save one of your own.</div>
                  </div>
                ) : (
                  <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }} className="scr">
                    {userArtifacts.map((a) => (
                      <div key={a.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7,
                          background: '#1a1a1a', border: '1px solid #262626',
                        }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#000', border: '1px solid #2a2a2a',
                        }}>
                          <FileText size={12} color="#9a9a9a"/>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {a.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#6a6a6a' }}>{formatBytes(a.size)} · yours</div>
                        </div>
                        <button onClick={() => downloadUserArtifact(a)} title="Save this file"
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#c8c8c8', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          <Download size={12}/>
                        </button>
                        <button onClick={() => removeUserArtifact(a.id)} title="Remove"
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#6a6a6a', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          <X size={12}/>
                        </button>
                      </div>
                    ))}
                    {codeBlocks.map((b, i) => (
                      <div key={b.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7,
                          background: '#1a1a1a', border: '1px solid #262626',
                        }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#000', border: '1px solid #2a2a2a',
                        }}>
                          <FileCode size={12} color="#9a9a9a"/>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#dcdcdc', fontFamily: 'JetBrains Mono, monospace' }}>
                            snippet-{i + 1}.{extForLang(b.lang)}
                          </div>
                          <div style={{ fontSize: 10, color: '#6a6a6a' }}>{b.code.split('\n').length} lines · AI-written</div>
                        </div>
                        <button onClick={() => downloadCodeBlock(b, i)} title="Save this file"
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#c8c8c8', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          <Download size={12}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Download chat as Markdown */}
          <button
            onClick={exportChat}
            title="Download chat as Markdown"
            disabled={messages.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: '#141414',
              border: '1px solid #2a2a2a', color: messages.length === 0 ? '#4a4a4a' : '#c8c8c8',
              fontSize: 12, borderRadius: 6, padding: '5px 10px',
              cursor: messages.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={12}/> Export
          </button>

          {/* Settings — opens a popover with code style + other options */}
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(v => !v)}
              title="Settings"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: showSettings ? '#1c1c1c' : '#141414',
                border: '1px solid ' + (showSettings ? '#3a3a3a' : '#2a2a2a'),
                color: showSettings ? '#e6e6e6' : '#c8c8c8', fontSize: 12, borderRadius: 6,
                padding: '5px 10px', cursor: 'pointer'
              }}
            >
              <Cog size={12}/> Settings
            </button>

            {showSettings && (
              <div style={{
                position: 'absolute', top: 42, right: 0, zIndex: 100, width: 288,
                background: '#131313', border: '1px solid #262626', borderRadius: 12,
                boxShadow: '0 16px 44px rgba(0,0,0,.55)', padding: 14,
                animation: 'vertexScaleIn .15s ease'
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f0f0f0', marginBottom: 12, letterSpacing: '-.01em' }}>Settings</div>

                {/* Coder style */}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6a6a6a', letterSpacing: '.08em', marginBottom: 6, fontFamily: 'JetBrains Mono' }}>CODER STYLE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                  {STYLES.map(s => {
                    const StyleIcon = s.id === 'concise' ? Zap : s.id === 'detailed' ? BookOpen : Sparkles;
                    const active = style === s.id;
                    return (
                      <button key={s.id} onClick={() => { setStyle(s.id); }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                          background: active ? 'rgba(230,230,230,.08)' : 'transparent',
                          border: '1px solid ' + (active ? '#3a3a3a' : '#1e1e1e'),
                          display: 'flex', alignItems: 'flex-start', gap: 9, transition: 'all .12s'
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#191919'; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: active ? '#e6e6e6' : '#1e1e1e', border: '1px solid ' + (active ? '#e6e6e6' : '#2a2a2a'),
                        }}>
                          <StyleIcon size={12} color={active ? '#0a0a0a' : '#8a8a8a'}/>
                        </div>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? '#f0f0f0' : '#dcdcdc' }}>{s.label}</span>
                          <span style={{ fontSize: 10.5, color: '#6a6a6a', lineHeight: 1.35 }}>{s.hint}</span>
                        </span>
                        {active && <Check size={13} color="#e6e6e6" style={{ marginLeft: 'auto', flexShrink: 0, marginTop: 4 }}/>}
                      </button>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid #1f1f1f', margin: '2px 0 12px' }} />

                {/* Other options */}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6a6a6a', letterSpacing: '.08em', marginBottom: 6, fontFamily: 'JetBrains Mono' }}>OPTIONS</div>

                {/* OCR mode toggle */}
                <button
                  onClick={() => setOcrMode(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                    background: 'transparent', border: '1px solid #1e1e1e', marginBottom: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#191919'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e', border: '1px solid #2a2a2a' }}>
                      <Scan size={12} color="#8a8a8a"/>
                    </div>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#dcdcdc' }}>OCR mode</span>
                      <span style={{ fontSize: 10.5, color: '#6a6a6a' }}>Extract text from images on send</span>
                    </span>
                  </span>
                  <span style={{
                    position: 'relative', width: 32, height: 18, borderRadius: 9, flexShrink: 0,
                    background: ocrMode ? '#e6e6e6' : '#2a2a2a', transition: 'background .15s',
                  }}>
                    <span style={{
                      position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                      background: '#0a0a0a', transition: 'transform .15s',
                      transform: ocrMode ? 'translateX(16px)' : 'translateX(2px)',
                    }}/>
                  </span>
                </button>
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 18, background: '#2a2a2a', margin: '0 4px' }} />

          <button onClick={onClose} title="Close"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#141414', border: '1px solid #2a2a2a', color: '#c8c8c8', fontSize: 12, borderRadius: 6, padding: '6px 11px', cursor: 'pointer' }}>
            <X size={13}/> Exit
          </button>
        </div>
      </div>

      {/* ═══ Body: sidebar + main + code panel ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 256, flexShrink: 0, borderRight: '1px solid #212121', background: '#0f0f0f',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            animation: 'vertexSlideInLeft .18s ease'
          }}>
            <div style={{ padding: 10 }}>
              <button onClick={newChat}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7,
                  padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                  background: '#e6e6e6',
                  border: '1px solid #e6e6e6', color: '#0a0a0a', fontSize: 13, fontWeight: 600
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Plus size={14}/> New Code Chat</span>
                <span style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono', color: '#5a5a5a', background: 'rgba(10,10,10,.08)',
                  border: '1px solid rgba(10,10,10,.15)', borderRadius: 4, padding: '1px 5px'
                }}>⌘K</span>
              </button>
            </div>

            <div style={{ padding: '0 10px 8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6a6a6a' }}/>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chats..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', fontSize: 12,
                    background: '#141414', border: '1px solid #262626', borderRadius: 6,
                    color: '#e6e6e6', outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {!search && filteredChats.length > 0 && (
              <div style={{
                padding: '2px 16px 6px', fontSize: 10.5, fontWeight: 700, color: '#5a5a5a',
                letterSpacing: '.06em', fontFamily: 'JetBrains Mono', textTransform: 'uppercase'
              }}>Recent</div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }} className="scr">
              {filteredChats.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#5a5a5a', fontSize: 11.5, lineHeight: 1.6 }}>
                  <MessageSquare size={22} style={{ opacity: .4, marginBottom: 8 }}/>
                  <div>{search ? 'No matches found.' : 'No saved code chats yet.'}</div>
                  <div style={{ marginTop: 4, fontSize: 10.5 }}>Start a conversation to see it here.</div>
                </div>
              ) : (
                filteredChats.map(c => (
                  <div key={c.id}
                    onClick={() => loadChat(c.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                      background: c.id === chatId ? '#1c1c1c' : 'transparent',
                      border: '1px solid ' + (c.id === chatId ? '#2e2e2e' : 'transparent'),
                      transition: 'background .12s'
                    }}
                    onMouseEnter={e => { if (c.id !== chatId) e.currentTarget.style.background = '#151515'; }}
                    onMouseLeave={e => { if (c.id !== chatId) e.currentTarget.style.background = 'transparent'; }}
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
                            flex: 1, fontSize: 12, padding: '3px 6px', background: '#0a0a0a',
                            border: '1px solid #4a4a4a', borderRadius: 4, color: '#e6e6e6', outline: 'none'
                          }}
                        />
                        <button onClick={() => renameChat(c.id, renameVal)} style={{ background: 'transparent', border: 'none', color: '#e6e6e6', cursor: 'pointer', padding: 2 }}><Check size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Code2 size={12} style={{ marginTop: 2, flexShrink: 0, color: c.id === chatId ? '#e6e6e6' : '#5a5a5a' }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: c.id === chatId ? 600 : 500, color: '#dcdcdc',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3
                          }}>
                            {c.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a5a5a', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                            {relTime(c.updated)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s' }}
                          className="chat-row-actions"
                          onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setRenamingId(c.id); setRenameVal(c.title || ''); }}
                            title="Rename"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 2, borderRadius: 3 }}>
                            <Edit2 size={11}/>
                          </button>
                          <button
                            onClick={() => requestDeleteChat(c)}
                            title="Delete"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 2, borderRadius: 3 }}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '6px 6px 2px', borderTop: '1px solid #1c1c1c' }}>
              {[
                { icon: Trash2,     label: 'Clear All Data', onClick: clearAllData, disabled: clearing || savedChats.length === 0 },
              ].map(item => (
                <button key={item.label} onClick={item.onClick} disabled={item.disabled}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                    borderRadius: 6, background: 'transparent', border: 'none',
                    color: item.disabled ? '#4a4a4a' : '#9a9a9a', fontSize: 12.5,
                    cursor: item.disabled ? 'not-allowed' : 'pointer', marginBottom: 1, transition: 'background .12s'
                  }}
                  onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#161616'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <item.icon size={13}/> {item.label}
                </button>
              ))}
            </div>

            {/* Account footer */}
            <div style={{
              padding: '10px 12px', borderTop: '1px solid #212121', background: '#111111',
              display: 'flex', alignItems: 'center', gap: 9
            }}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }}/>
              ) : (
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: getAvatarColor(user?.displayName || user?.email || 'U'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', fontSize: 11, fontWeight: 700
                }}>
                  {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.displayName || user?.email || 'User'}
                </div>
                <div style={{ fontSize: 10, color: '#6a6a6a' }}>
                  {savedChats.length} {savedChats.length === 1 ? 'saved chat' : 'saved chats'}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ── Main chat area ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0a0a0a' }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div ref={scrollRef} onScroll={handleScroll} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }} className="scr">
            {messages.length === 0 && !streaming ? (
              <div style={{
                minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '30px 24px', textAlign: 'center'
              }}>
                <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f0f0f0', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                  {getGreeting()}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''} <span style={{ display: 'inline-block' }}>👋</span>
                </h1>
                <p style={{ fontSize: 13.5, color: '#7a7a7a', maxWidth: 440, lineHeight: 1.6, margin: '0 0 24px' }}>
                  Chat with Vertex and turn your ideas into reality with ease.
                </p>

                <div style={{
                  display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                  gap: 8, maxWidth: 640, marginTop: 12, marginBottom: savedChats.length ? 30 : 0
                }}>
                  {STARTER_PROMPTS.map(s => {
                    const Icon = ICONS[s.icon] || FileCode;
                    return (
                      <button key={s.label}
                        onClick={() => { setInput(s.prompt); setTimeout(() => inputRef.current?.focus(), 30); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999,
                          cursor: 'pointer', background: '#111111', border: '1px solid #232323',
                          color: '#dcdcdc', fontSize: 12.5, fontWeight: 600, transition: 'all .14s', whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a4a4a'; e.currentTarget.style.background = '#161616'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#232323'; e.currentTarget.style.background = '#111111'; }}
                      >
                        <Icon size={13} color="#9a9a9a"/> {s.label}
                      </button>
                    );
                  })}
                </div>

                {savedChats.length > 0 && (
                  <div style={{ width: '100%', maxWidth: 760, textAlign: 'left' }}>
                    <button onClick={() => setRecentChatsOpen(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700,
                        color: '#9a9a9a', marginBottom: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0
                      }}>
                      Your Recent chats
                      <ChevronDown size={13} color="#6a6a6a" style={{ transform: recentChatsOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}/>
                    </button>
                    {recentChatsOpen && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10
                    }}>
                      {savedChats.slice(0, 3).map(c => (
                        <button key={c.id} onClick={() => loadChat(c.id)}
                          style={{
                            textAlign: 'left', padding: '12px 14px', borderRadius: 9, cursor: 'pointer',
                            background: '#111111', border: '1px solid #232323', color: '#dcdcdc',
                            display: 'flex', flexDirection: 'column', gap: 6, transition: 'all .14s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a4a4a'; e.currentTarget.style.background = '#161616'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#232323'; e.currentTarget.style.background = '#111111'; }}
                        >
                          <MessageSquare size={13} color="#6a6a6a"/>
                          <span style={{
                            fontSize: 12.5, fontWeight: 600, lineHeight: 1.4,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                          }}>{c.title || c.preview || 'Untitled'}</span>
                          <span style={{ fontSize: 10, color: '#5a5a5a', fontFamily: 'JetBrains Mono' }}>{relTime(c.updated)}</span>
                        </button>
                      ))}
                    </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 22px 12px' }}>
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts}
                    makeMdComponents={makeMdComponents} onSmartEdit={handleSmartEdit} messageId={m.id}
                    canRetry={m.canRetry} onRetry={() => retryLastMessage(m.id)}
                    onContinue={handleContinue} onRegenerate={handleRegenerate}
                    onEditUserMessage={handleEditUserMessage}
                    isLast={i === messages.length - 1} streaming={streaming} />
                ))}

                {(streaming || thinking) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#141414', border: '1px solid #2a2a2a'
                    }}>
                      <Terminal size={14} color="#c8c8c8"/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: '#5a5a5a', fontFamily: 'JetBrains Mono', marginBottom: 5, fontWeight: 600 }}>
                        VERTEX {thinking && <span style={{ color: '#9a9a9a' }}>· thinking…</span>}
                      </div>
                      {thinking ? (
                        <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: '50%', background: '#8a8a8a',
                              animation: `vertexPulse 1.2s ease-in-out ${i*0.15}s infinite`
                            }}/>
                          ))}
                        </div>
                      ) : streamText ? (
                        <div style={{
                          background: '#111111', border: '1px solid #232323', borderRadius: '0 10px 10px 10px',
                          padding: '12px 14px'
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponentsForStreaming}>
                            {streamText}
                          </ReactMarkdown>
                          <span style={{ display: 'inline-block', width: 7, height: 14, background: '#c8c8c8', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'vertexBlink 1s steps(2) infinite' }}/>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scroll-to-bottom button — only shows when the user has scrolled
              up (so the auto-scroll won't yank them back down during stream). */}
          {showScrollToBottom && (
            <button
              onClick={scrollToBottom}
              title="Scroll to latest"
              style={{
                position: 'absolute', bottom: 16, right: 24, zIndex: 25,
                width: 36, height: 36, borderRadius: '50%',
                background: '#1c1c1c', border: '1px solid #3a3a3a', color: '#dcdcdc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(0,0,0,.55)',
                animation: 'vertexScaleIn .15s ease',
              }}
            >
              <ArrowDownToLine size={14}/>
            </button>
          )}

          {/* Floating Reply chip — renders above whatever the user has
              highlighted inside the chat scroll area. */}
          <SelectionReplyButton scrollRef={scrollRef} onReply={handleReplyQuote} />
          </div>

          {/* ── Input area ── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid #212121', background: '#0f0f0f',
            padding: '12px 22px 16px'
          }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>

              {/* Editing banner — shows when the user is editing a previous
                  message. Lets them cancel and keep the original intact. */}
              {editingMsgId && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
                  padding: '7px 12px',
                  animation: 'vertexFadeIn .15s ease',
                }}>
                  <Edit3 size={12} color="#9a9a9a" style={{ flexShrink: 0 }}/>
                  <span style={{
                    fontSize: 11.5, color: '#b8b8b8', fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600,
                  }}>
                    Editing message — original stays in chat until you send.
                  </span>
                  <button
                    onClick={() => { setEditingMsgId(null); setInput(''); }}
                    style={{
                      marginLeft: 'auto', background: 'transparent', border: '1px solid #333',
                      borderRadius: 5, color: '#9a9a9a', fontSize: 11, cursor: 'pointer',
                      padding: '3px 9px', fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Reply preview — shows the snippet the user is replying to,
                  truncated, with an X to dismiss. Mirrors the iMessage /
                  Discord "replying to" banner above the composer. */}
              {replyQuote && (
                <div style={{
                  display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 8,
                  background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8,
                  overflow: 'hidden', animation: 'vertexFadeIn .15s ease',
                }}>
                  <div style={{ width: 3, background: '#5a5a5a', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, padding: '7px 4px 7px 0' }}>
                    <div style={{
                      fontSize: 10, color: '#7a7a7a', fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 700, letterSpacing: '.06em', marginBottom: 2,
                    }}>
                      REPLYING TO
                    </div>
                    <div style={{
                      fontSize: 12, color: '#b8b8b8', lineHeight: 1.45,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      {replyQuote.text.length > 120
                        ? replyQuote.text.slice(0, 120).replace(/\n/g, ' ') + '…'
                        : replyQuote.text.replace(/\n/g, ' ')}
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyQuote(null)}
                    title="Cancel reply"
                    style={{
                      background: 'transparent', border: 'none', color: '#6a6a6a',
                      cursor: 'pointer', padding: '0 10px', flexShrink: 0,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={13}/>
                  </button>
                </div>
              )}

              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {attachments.map(att => (
                    <div key={att.id} style={{
                      background: '#171717', border: '1px solid #2a2a2a', borderRadius: 12,
                      padding: '12px 14px', maxWidth: 340,
                    }}>
                      {att.type === 'image' ? (
                        <img src={att.content} alt={att.name}
                          style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, display: 'block', marginBottom: 10, objectFit: 'contain' }} />
                      ) : att.type === 'document' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 8, flexShrink: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', background: '#000000', border: '1px solid #2a2a2a',
                          }}>
                            <FileText size={16} color="#9a9a9a" />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</div>
                            <div style={{ fontSize: 10.5, color: '#6a6a6a', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>
                              {att.ext || 'file'}{att.size ? ` · ${formatBytes(att.size)}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <pre style={{
                          margin: 0, marginBottom: 10, fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12, lineHeight: 1.6, color: '#c8c8c8',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          overflow: 'hidden', maxHeight: 110,
                          WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                        }}>
                          {att.preview}{att.lines > 6 ? '\n…' : ''}
                        </pre>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '4px 12px', borderRadius: 999,
                          background: '#232323', border: '1px solid #333333',
                          color: '#dcdcdc', fontSize: 12, fontWeight: 600,
                          fontFamily: 'JetBrains Mono, monospace',
                        }}>
                          {att.type === 'image' ? <ImageIcon size={11} color="#8a8a8a" /> : att.type === 'file' ? <FileText size={11} color="#8a8a8a" /> : att.type === 'document' ? <FileText size={11} color="#8a8a8a" /> : <Check size={11} color="#8a8a8a" />}
                          {att.type === 'image' ? 'IMAGE' : att.type === 'file' ? 'FILE' : att.type === 'document' ? 'DOCUMENT' : 'PASTED'}
                        </span>
                        <button onClick={() => removeAttachment(att.id)}
                          style={{
                            background: 'transparent', border: 'none', color: '#6a6a6a',
                            cursor: 'pointer', padding: 4, display: 'flex',
                          }}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                background: '#141414', border: '1px solid #2a2a2a',
                borderRadius: 10, padding: 6
              }}>
                <div ref={attachMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                  <button onClick={() => setShowAttachMenu(v => !v)} title="Add file, image, or document"
                    style={{
                      width: 36, height: 36, borderRadius: 7, border: '1px solid ' + (showAttachMenu ? '#3a3a3a' : '#2a2a2a'),
                      background: showAttachMenu ? '#232323' : 'transparent', color: showAttachMenu ? '#dcdcdc' : '#9a9a9a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s'
                    }}>
                    <Plus size={16}/>
                  </button>
                  {showAttachMenu && (
                    <div style={{
                      position: 'absolute', bottom: 44, left: 0, zIndex: 60,
                      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10,
                      boxShadow: '0 12px 36px rgba(0,0,0,.5)', padding: 6, minWidth: 240,
                      animation: 'vertexScaleIn .15s ease'
                    }}>
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <FileCode size={14} color="#9a9a9a"/> Add file
                      </button>
                      <button onClick={() => folderInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <Folder size={14} color="#9a9a9a"/> Add project folder
                      </button>
                      <button onClick={() => imageFileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <ImageIcon size={14} color="#9a9a9a"/> Add image
                      </button>
                      <button onClick={() => docFileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <FileText size={14} color="#9a9a9a"/> Add document
                        </span>
                      </button>

                      <div style={{ borderTop: '1px solid #1c1c1c', marginTop: 4, paddingTop: 4 }}>
                        <button onClick={() => setOcrMode(v => !v)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'transparent', border: 'none', color: '#9a9a9a', fontSize: 11.5, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1a'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Scan size={12}/> OCR mode
                          </span>
                          <span style={{
                            position: 'relative', width: 28, height: 16, borderRadius: 8,
                            background: ocrMode ? '#fff' : '#2a2a2a', transition: 'background .15s',
                          }}>
                            <span style={{
                              position: 'absolute', top: 2, width: 12, height: 12, borderRadius: '50%',
                              background: '#000', transition: 'transform .15s',
                              transform: ocrMode ? 'translateX(14px)' : 'translateX(2px)',
                            }}/>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.markdown,.json,.csv,.tsv,.yaml,.yml,.toml,.ini,.env,.log,.xml,.html,.css,.scss,.sass,.less,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.php,.sh,.bash,.sql,.graphql,.docx,.pdf,.doc,.rtf,.pptx,.ppt,.xlsx,.xls,.odt,.ods,.odp,image/*" style={{ display: 'none' }} onChange={handleFilesSelected} />
                  <input ref={folderInputRef} type="file" multiple webkitdirectory="" directory="" style={{ display: 'none' }} onChange={handleFilesSelected} />
                  <input ref={imageFileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageFilesSelected} />
                  <input ref={docFileInputRef} type="file" multiple accept=".docx,.pdf,.doc,.rtf,.pptx,.ppt,.xlsx,.xls,.odt,.ods,.odp,.txt,.md,.csv" style={{ display: 'none' }} onChange={handleFilesSelected} />
                </div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onPaste={handlePaste}
                  placeholder="Ask anything about code — paste an error, request a function, refactor something…"
                  rows={1}
                  style={{
                    flex: 1, height: 36, minHeight: 36, maxHeight: 240, resize: 'none',
                    padding: '8px 8px', background: 'transparent', border: 'none', outline: 'none',
                    color: '#e6e6e6', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                  onInput={e => {
                    e.target.style.height = '36px';
                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px';
                  }}
                />
                {streaming ? (
                  <button onClick={stopStreaming} title="Stop"
                    style={{
                      width: 36, height: 36, borderRadius: 7, border: '1px solid #3a3a3a', cursor: 'pointer',
                      background: '#1c1c1c', color: '#e6e6e6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, lineHeight: 0
                    }}>
                    <Loader size={14} style={{ animation: 'vertexSpin 1s linear infinite' }}/>
                  </button>
                ) : (
                  <button onClick={() => send()} disabled={!input.trim() && attachments.length === 0}
                    title="Send"
                    style={{
                      width: 36, height: 36, borderRadius: 7, border: '1px solid ' + ((input.trim() || attachments.length > 0) ? '#e6e6e6' : '#2a2a2a'), cursor: (input.trim() || attachments.length > 0) ? 'pointer' : 'not-allowed',
                      background: (input.trim() || attachments.length > 0) ? '#e6e6e6' : '#1a1a1a',
                      color: (input.trim() || attachments.length > 0) ? '#0a0a0a' : '#5a5a5a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s', flexShrink: 0, lineHeight: 0
                    }}>
                    <ArrowUp size={15}/>
                  </button>
                )}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                marginTop: 7, fontSize: 10.5, color: '#5a5a5a', fontFamily: 'JetBrains Mono'
              }}>
                <span>{input.length} chars</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: 9.5, color: '#4a4a4a', fontFamily: 'JetBrains Mono', letterSpacing: '.03em' }}>
                Powered by Vortis
              </div>
            </div>
          </div>
        </main>

        <CodePanel
          panelCode={panelCode}
          onClose={closeCodePanel}
          output={panelOutput}
          running={panelRunning}
          hasError={panelHasError}
          bootMsg={panelBootMsg}
          onRun={runPanelCode}
          onOpenNewTab={openHtmlInNewTab}
        />
      </div>

      {/* In-app dialogs — replace window.confirm() / window.alert() */}
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <InfoDialog dialog={infoDialog} onClose={() => setInfoDialog(null)} />

      <style>{`
        @keyframes vertexFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vertexScaleIn { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes vertexSlideInLeft { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vertexSlideInRight { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vertexPulse { 0%, 100% { opacity: .3; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes vertexBlink { 50% { opacity: 0 } }
        @keyframes vertexSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes vertexCodeIn { from { opacity: 0; transform: translateY(4px) scale(.99) } to { opacity: 1; transform: translateY(0) scale(1) } }
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
        .chat-item:hover .chat-row-actions,
        div:hover > div > .chat-row-actions { opacity: 1 !important; }

        /* Thin scrollbars — the default browser scrollbars inside code blocks
           and the side panel looked chunky and out of place. These match the
           dark theme and stay out of the way. Applies to everything inside
           Vertex, including pre/code blocks and the split code panel. */
        [data-vertex] *::-webkit-scrollbar { width: 8px; height: 8px; }
        [data-vertex] *::-webkit-scrollbar-track { background: transparent; }
        [data-vertex] *::-webkit-scrollbar-thumb {
          background: #2a2a2a; border-radius: 4px;
          border: 2px solid transparent; background-clip: padding-box;
        }
        [data-vertex] *::-webkit-scrollbar-thumb:hover { background: #3a3a3a; background-clip: padding-box; border: 2px solid transparent; }
        [data-vertex] *::-webkit-scrollbar-corner { background: transparent; }
        [data-vertex] * { scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }

        /* Even thinner for code blocks specifically — they're usually narrow
           and a fat scrollbar eats into the code width. */
        [data-vertex] pre::-webkit-scrollbar { width: 6px; height: 6px; }
        [data-vertex] pre::-webkit-scrollbar-thumb { background: #1f1f1f; }
      `}</style>
    </div>,
    document.body
  );
};

const MessageBubble = React.memo(({ role, text, ts, makeMdComponents, onSmartEdit, messageId, canRetry, onRetry, onContinue, onRegenerate, onEditUserMessage, isLast, streaming }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // Each message bubble gets its own mdComponents so code blocks inside it
  // know which message they belong to (for Smart Edit).
  const mdComponents = useMemo(
    () => makeMdComponents({ onSmartEdit, messageId }),
    [makeMdComponents, onSmartEdit, messageId]
  );

  // Show Continue only when the reply actually looks cut off — unclosed code
  // fence or mid-sentence ending. Stops it from cluttering every single reply.
  const showContinue = !streaming && onContinue && looksCutOff(text);

  if (isUser) {
    // Rendered through the same markdown pipeline as Vertex's own replies so that
    // large pasted text/code (sent wrapped in ``` fences) shows up as the same
    // small, collapsible rectangle — not a wall of raw text dumped in the bubble.
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end' }}>
        <div
        data-vrtx-no-reply="" 
        style={{
          maxWidth: '78%', background: '#1e1e1e', border: '1px solid #2a2a2a',
          color: '#e6e6e6', borderRadius: 10, padding: '10px 14px',
          fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word'
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
            {text}
          </ReactMarkdown>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-start', marginTop: 2, flexShrink: 0 }}>
          <button onClick={() => onEditUserMessage?.(messageId)} title="Edit & resend"
            style={{
              background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6,
              color: '#6a6a6a', cursor: 'pointer', padding: 5, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
            <Edit3 size={11}/>
          </button>
        </div>
      </div>
    );
  }

  // Small ghost button used for Copy / Continue / Regenerate — kept compact
  // so they all fit on one row even on narrow chat windows.
  const ghostBtn = (extraStyle) => ({
    background: 'transparent', border: '1px solid transparent', color: '#6a6a6a',
    cursor: 'pointer', padding: '3px 7px', borderRadius: 5, fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 4, transition: 'all .12s',
    ...extraStyle,
  });

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#141414', border: '1px solid #2a2a2a', marginTop: 1
      }}>
        <Terminal size={13} color="#c8c8c8"/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
          fontSize: 11, color: '#5a5a5a', fontFamily: 'JetBrains Mono', fontWeight: 600, letterSpacing: '.02em',
          userSelect: 'none',    
        }}>
          VERTEX
          {ts && <span style={{ color: '#4a4a4a' }}>· {new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <div style={{ color: '#dcdcdc' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
            {text}
          </ReactMarkdown>
        </div>
        {/* Action row — sits BELOW the message body so it's always visible
            regardless of message length. Copy + Regenerate show on every AI
            reply; Continue only when the reply looks cut off. */}
        {!streaming && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
            opacity: 0.85, transition: 'opacity .15s',
            userSelect: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; }}
          >
            <button
              onClick={copy}
              title="Copy response"
              style={ghostBtn(copied ? { color: '#e6e6e6', borderColor: '#333' } : {})}
              onMouseEnter={e => { if (!copied) { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#dcdcdc'; } }}
              onMouseLeave={e => { if (!copied) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#6a6a6a'; } }}
            >
              {copied ? <Check size={11}/> : <Copy size={11}/>} {copied ? 'Copied' : 'Copy'}
            </button>
            {showContinue && (
              <button
                onClick={onContinue}
                title="Continue — pick up where Vertex left off"
                style={ghostBtn()}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#dcdcdc'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#6a6a6a'; }}
              >
                <Play size={11}/> Continue
              </button>
            )}
            <button
              onClick={onRegenerate}
              title="Regenerate — re-ask the same question"
              style={ghostBtn()}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#dcdcdc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#6a6a6a'; }}
            >
              <RefreshCw size={11}/> Regenerate
            </button>
          </div>
        )}
        {canRetry && (
          <button
            onClick={onRetry}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '6px 12px',
              borderRadius: 7, border: '1px solid #333333', background: '#141414', color: '#dcdcdc',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <RotateCcw size={12}/> Retry
          </button>
        )}
      </div>
    </div>
  );
});

export default Vertex;