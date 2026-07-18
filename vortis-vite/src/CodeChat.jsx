/**
 * CodeChat.jsx — Full-screen coding chat interface for Vortis
 * ------------------------------------------------------------------
 * Drop-in replacement for the old CodeTerminal modal.
 *
 * When the user clicks the Code2 icon in the toolbar, this component
 * takes over the whole viewport with a dedicated coding chat:
 *   - Left sidebar: New chat, search, saved conversations (rename / delete)
 *   - Main area: streaming chat with a strong "senior engineer" persona,
 *     code-block execution via the parent's CodeBlock, suggestion chips,
 *     language picker, style preference, keyboard shortcuts.
 *
 * Backend: same https://vortis-backend.vercel.app/api/bytez endpoint as the
 * main chat (action: 'chat'), but conversations are persisted under a
 * SEPARATE Firestore subcollection: users/{uid}/code_chats/{chatId}
 * so coding history never pollutes the main chat list.
 *
 * Integration (3 small edits in your existing App.js):
 *   1. import CodeChat from './CodeChat';
 *   2. change the toolbar button:
 *        onClick={() => setShowCodeTerminal(true)}  →  onClick={() => setShowCodeChat(true)}
 *        title="Code Terminal"                       →  title="Code Chat"
 *   3. change the render at the bottom:
 *        {showCodeTerminal && <CodeTerminal onClose={...}/>}
 *        →  {showCodeChat && <CodeChat onClose={() => setShowCodeChat(false)} CodeBlock={CodeBlock} safeExecuteCodeLocally={safeExecuteCodeLocally} LANG_ENGINE={LANG_ENGINE} ENGINE_META={ENGINE_META} />}
 *
 * The CodeBlock / safeExecuteCodeLocally / LANG_ENGINE / ENGINE_META props
 * are OPTIONAL — if you pass them, every code block in AI responses gets a
 * working Run button (same as your main chat). If you don't, you still get
 * a beautiful coding chat with copy buttons only.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Terminal, Cog, Wand2
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
 *  Strong coder system prompt
 * ──────────────────────────────────────────────────────────────────────── */
const buildCoderSystemPrompt = (lang, style) => {
  let sys = `You are Vortis Code — an elite senior software engineer pair-programmer embedded inside the user's IDE. You are NOT a general assistant; you live and breathe code.

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
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect: "I'm your coding assistant — for general chat, switch to the main Vortis chat. For code, I'm here."`;

  if (style === 'concise')  sys += '\n\nSTYLE: Ultra-concise. Code + 1 line of explanation max. No pleasantries.';
  if (style === 'detailed') sys += '\n\nSTYLE: Detailed. Include edge cases, alternative approaches, performance notes, and a short "when not to use this" callout.';
  if (style === 'teach')    sys += '\n\nSTYLE: Teach mode. Add a comment above each non-obvious line of code explaining what it does. Treat the user as a curious learner. End with a one-line "key takeaway".';

  if (lang && lang !== 'auto') sys += `\n\nLANGUAGE FOCUS: The user has selected ${lang}. Default to ${lang} for all code examples unless they explicitly ask for another language.`;

  return sys;
};

/* ────────────────────────────────────────────────────────────────────────
 *  Fallback CodeBlock — used only when parent doesn't pass a real one.
 *  Renders code with a language tag + copy button. No execution.
 * ──────────────────────────────────────────────────────────────────────── */
const FallbackCodeBlock = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(codeText); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ margin: '10px 0', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)', background: '#0b0b14' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid var(--border2)' }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text4)', letterSpacing: '.06em', fontWeight: 700 }}>{lang || 'code'}</span>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: copied ? '#10b981' : 'var(--text3)', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono' }}>
          {copied ? <Check size={11}/> : <Copy size={11}/>} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, lineHeight: 1.7, color: '#a5f3fc', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto' }}>{codeText}</pre>
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
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('vortis_code_lang') || 'auto'; } catch (_) { return 'auto'; } });
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('vortis_code_style') || 'balanced'; } catch (_) { return 'balanced'; } });
  const [showPrefs, setShowPrefs] = useState(false);
  useEffect(() => { try { localStorage.setItem('vortis_code_lang', lang); } catch (_) {} }, [lang]);
  useEffect(() => { try { localStorage.setItem('vortis_code_style', style); } catch (_) {} }, [style]);

  /* ── Refs ── */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

  /* ── Scroll to bottom on new content ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinking]);

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
  const RendererCodeBlock = CodeBlock || FallbackCodeBlock;

  /* ── Markdown components (match App.js styling) ── */
  const mdComponents = useMemo(() => ({
    h1: ({children}) => <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text1)', margin: '14px 0 6px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h1>,
    h2: ({children}) => <h2 style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text1)', margin: '12px 0 5px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h2>,
    h3: ({children}) => <h3 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text2)', margin: '10px 0 4px', lineHeight: 1.3 }}>{children}</h3>,
    h4: ({children}) => <h4 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', margin: '8px 0 3px' }}>{children}</h4>,
    p: ({children}) => <p style={{ margin: '0 0 8px', color: 'var(--text1)', lineHeight: 1.7, fontSize: 14 }}>{children}</p>,
    strong: ({children}) => <strong style={{ color: 'var(--text1)', fontWeight: 700 }}>{children}</strong>,
    em: ({children}) => <em style={{ color: 'var(--text3)' }}>{children}</em>,
    ul: ({children}) => <ul style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ul>,
    ol: ({children}) => <ol style={{ margin: '6px 0 10px', paddingLeft: 20 }}>{children}</ol>,
    li: ({children}) => <li style={{ margin: '3px 0', color: 'var(--text1)', lineHeight: 1.65, fontSize: 14 }}>{children}</li>,
    a: ({href, children}) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo)', textDecoration: 'none', borderBottom: '1px solid rgba(99,102,241,.3)' }}>{children}</a>,
    blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid var(--indigo)', margin: '8px 0', padding: '4px 12px', color: 'var(--text3)', background: 'rgba(99,102,241,.05)', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>,
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border2)', margin: '12px 0' }} />,
    table: ({children}) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>{children}</table></div>,
    thead: ({children}) => <thead style={{ background: 'var(--bg3)' }}>{children}</thead>,
    th: ({children}) => <th style={{ padding: '6px 10px', border: '1px solid var(--border2)', textAlign: 'left', color: 'var(--text1)', fontWeight: 600 }}>{children}</th>,
    td: ({children}) => <td style={{ padding: '6px 10px', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{children}</td>,
    code: ({inline, className, children}) => {
      if (inline) {
        return <code style={{ background: 'rgba(99,102,241,.12)', color: 'var(--indigo)', padding: '1px 6px', borderRadius: 5, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>{children}</code>;
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
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg1)', color: 'var(--text1)',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Geist Sans", -apple-system, system-ui, sans-serif',
      animation: 'fadeIn .18s ease',
    }}>
      {/* ═══ Top bar ═══ */}
      <div style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid var(--border2)', background: 'var(--bg2)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar (Cmd/Ctrl+B)"
            style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
            {sidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(16,185,129,.15))',
              border: '1px solid rgba(99,102,241,.3)'
            }}>
              <Code2 size={16} color="var(--indigo)"/>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text1)', letterSpacing: '-.01em', lineHeight: 1 }}>Vortis Code</div>
              <div style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                {LANGUAGES.find(l => l.id === lang)?.label || 'Auto'} · {STYLES.find(s => s.id === style)?.label || 'Balanced'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Language picker */}
          <div style={{ position: 'relative' }}>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text1)',
                fontSize: 12, borderRadius: 7, padding: '5px 26px 5px 10px', cursor: 'pointer',
                fontFamily: 'JetBrains Mono', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"10\\" height=\\"10\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"%23888\\" stroke-width=\\"3\\"><polyline points=\\"6 9 12 15 18 9\\"/></svg>")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center'
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
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: showPrefs ? 'rgba(99,102,241,.12)' : 'var(--bg3)',
              border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12, borderRadius: 7,
              padding: '5px 10px', cursor: 'pointer', fontFamily: 'JetBrains Mono'
            }}
          >
            <Cog size={12}/> {STYLES.find(s => s.id === style)?.label || 'Balanced'}
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border2)', margin: '0 4px' }} />

          <button onClick={onClose} title="Close (Esc)"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12, borderRadius: 7, padding: '6px 11px', cursor: 'pointer' }}>
            <X size={13}/> Exit
          </button>
        </div>
      </div>

      {/* ═══ Preferences popover ═══ */}
      {showPrefs && (
        <div style={{
          position: 'absolute', top: 56, right: 14, zIndex: 100,
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,.4)', padding: 12, minWidth: 260,
          animation: 'scaleIn .15s ease'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '.06em', marginBottom: 8, fontFamily: 'JetBrains Mono' }}>CODER STYLE</div>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => { setStyle(s.id); setShowPrefs(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: style === s.id ? 'rgba(99,102,241,.12)' : 'transparent',
                border: '1px solid ' + (style === s.id ? 'rgba(99,102,241,.3)' : 'transparent'),
                marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{s.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text4)' }}>{s.hint}</span>
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border2)', marginTop: 8, paddingTop: 8, fontSize: 10.5, color: 'var(--text4)', fontFamily: 'JetBrains Mono', lineHeight: 1.5 }}>
            ⌘/Ctrl + Enter → send<br/>
            ⌘/Ctrl + K → new chat<br/>
            Esc → close
          </div>
        </div>
      )}

      {/* ═══ Body: sidebar + main ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 256, flexShrink: 0, borderRight: '1px solid var(--border2)', background: 'var(--bg2)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            animation: 'slideInLeft .18s ease'
          }}>
            {/* New chat */}
            <div style={{ padding: 10 }}>
              <button onClick={newChat}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--indigo), #7c3aed)',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(99,102,241,.3)'
                }}>
                <Plus size={14}/> New Code Chat
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0 10px 8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text4)' }}/>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chats..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', fontSize: 12,
                    background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7,
                    color: 'var(--text1)', outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {/* Chat list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }} className="scr">
              {filteredChats.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text4)', fontSize: 11.5, lineHeight: 1.6 }}>
                  <MessageSquare size={22} style={{ opacity: .4, marginBottom: 8 }}/>
                  <div>{search ? 'No matches found.' : 'No saved code chats yet.'}</div>
                  <div style={{ marginTop: 4, fontSize: 10.5 }}>Start a conversation to see it here.</div>
                </div>
              ) : (
                filteredChats.map(c => (
                  <div key={c.id}
                    onClick={() => loadChat(c.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 2,
                      background: c.id === chatId ? 'rgba(99,102,241,.12)' : 'transparent',
                      border: '1px solid ' + (c.id === chatId ? 'rgba(99,102,241,.25)' : 'transparent'),
                      transition: 'background .12s'
                    }}
                    onMouseEnter={e => { if (c.id !== chatId) e.currentTarget.style.background = 'var(--bg3)'; }}
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
                            flex: 1, fontSize: 12, padding: '3px 6px', background: 'var(--bg1)',
                            border: '1px solid var(--indigo)', borderRadius: 4, color: 'var(--text1)', outline: 'none'
                          }}
                        />
                        <button onClick={() => renameChat(c.id, renameVal)} style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', padding: 2 }}><Check size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Code2 size={12} style={{ marginTop: 2, flexShrink: 0, color: c.id === chatId ? 'var(--indigo)' : 'var(--text4)' }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: c.id === chatId ? 600 : 500, color: 'var(--text1)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3
                          }}>
                            {c.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                            {relTime(c.updated)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s' }}
                          className="chat-row-actions"
                          onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setRenamingId(c.id); setRenameVal(c.title || ''); }}
                            title="Rename"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text4)', cursor: 'pointer', padding: 2, borderRadius: 3 }}>
                            <Edit2 size={11}/>
                          </button>
                          <button
                            onClick={() => { if (confirm('Delete this code chat?')) deleteChat(c.id); }}
                            title="Delete"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text4)', cursor: 'pointer', padding: 2, borderRadius: 3 }}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Sidebar footer */}
            <div style={{
              padding: '9px 12px', borderTop: '1px solid var(--border2)', background: 'var(--bg3)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text3)'
            }}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }}/>
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                  {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.displayName || 'User'}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text4)', fontFamily: 'JetBrains Mono' }}>
                  {savedChats.length} code {savedChats.length === 1 ? 'chat' : 'chats'}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ── Main chat area ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg1)' }}>
          {/* Messages / empty state */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }} className="scr">
            {messages.length === 0 && !streaming ? (
              /* ── Empty state with suggestion chips ── */
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 30, textAlign: 'center'
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, marginBottom: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(99,102,241,.18), rgba(16,185,129,.12))',
                  border: '1px solid rgba(99,102,241,.3)',
                  boxShadow: '0 8px 24px rgba(99,102,241,.15)'
                }}>
                  <Terminal size={30} color="var(--indigo)"/>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                  What are we building today?
                </h1>
                <p style={{ fontSize: 13.5, color: 'var(--text3)', maxWidth: 440, lineHeight: 1.6, margin: '0 0 24px' }}>
                  I'm your dedicated coding assistant — debug errors, refactor messy code, ship features, or learn a new pattern. Code-first, no fluff.
                </p>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 10, maxWidth: 620, width: '100%'
                }}>
                  {STARTER_PROMPTS.map(s => {
                    const Icon = ICONS[s.icon] || FileCode;
                    return (
                      <button key={s.label}
                        onClick={() => { setInput(s.prompt); setTimeout(() => inputRef.current?.focus(), 30); }}
                        style={{
                          textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                          background: 'var(--bg2)', border: '1px solid var(--border2)',
                          color: 'var(--text1)', display: 'flex', flexDirection: 'column', gap: 5,
                          transition: 'all .14s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.transform = 'none'; }}
                      >
                        <Icon size={15} color="var(--indigo)"/>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 26, fontSize: 10.5, color: 'var(--text4)', fontFamily: 'JetBrains Mono', letterSpacing: '.04em' }}>
                  ⌘/Ctrl + Enter to send  ·  ⌘/Ctrl + K for new chat  ·  Esc to exit
                </div>
              </div>
            ) : (
              /* ── Messages list ── */
              <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 22px 12px' }}>
                {messages.map(m => (
                  <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts}
                    mdComponents={mdComponents} />
                ))}

                {/* Streaming bubble */}
                {(streaming || thinking) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(16,185,129,.15))', border: '1px solid rgba(99,102,241,.3)'
                    }}>
                      <Code2 size={15} color="var(--indigo)"/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text4)', fontFamily: 'JetBrains Mono', marginBottom: 5, fontWeight: 600 }}>
                        VORTIS CODE {thinking && <span style={{ color: 'var(--indigo)' }}>· thinking…</span>}
                      </div>
                      {thinking ? (
                        <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: '50%', background: 'var(--indigo)',
                              animation: `pulse 1.2s ease-in-out ${i*0.15}s infinite`
                            }}/>
                          ))}
                        </div>
                      ) : streamText ? (
                        <div style={{
                          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: '0 12px 12px 12px',
                          padding: '12px 14px'
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
                            {streamText}
                          </ReactMarkdown>
                          <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--indigo)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 1s steps(2) infinite' }}/>
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
            flexShrink: 0, borderTop: '1px solid var(--border2)', background: 'var(--bg2)',
            padding: '12px 22px 16px'
          }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              <div style={{
                position: 'relative', background: 'var(--bg3)', border: '1px solid var(--border2)',
                borderRadius: 12, transition: 'border-color .15s',
                boxShadow: '0 2px 12px rgba(0,0,0,.12)'
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
                  }}
                  placeholder={lang === 'auto'
                    ? 'Ask anything about code — paste an error, request a function, refactor something…'
                    : `Ask for ${LANGUAGES.find(l => l.id === lang)?.label} code — paste an error, request a function, refactor something…`
                  }
                  rows={1}
                  style={{
                    width: '100%', minHeight: 52, maxHeight: 240, resize: 'none',
                    padding: '13px 56px 13px 14px', background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text1)', fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 4 }}>
                  {streaming ? (
                    <button onClick={stopStreaming} title="Stop"
                      style={{
                        width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/>
                    </button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()}
                      title="Send (⌘/Ctrl + Enter)"
                      style={{
                        width: 34, height: 34, borderRadius: 8, border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
                        background: input.trim() ? 'linear-gradient(135deg, var(--indigo), #7c3aed)' : 'var(--bg2)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: input.trim() ? 1 : 0.4, transition: 'opacity .15s'
                      }}>
                      <ArrowUp size={15}/>
                    </button>
                  )}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 7, fontSize: 10.5, color: 'var(--text4)', fontFamily: 'JetBrains Mono'
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

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes slideInLeft { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes pulse { 0%, 100% { opacity: .3; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .chat-item:hover .chat-row-actions,
        div:hover > div > .chat-row-actions { opacity: 1 !important; }
      `}</style>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  Single message bubble
 * ──────────────────────────────────────────────────────────────────────── */
const MessageBubble = React.memo(({ role, text, ts, mdComponents }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '78%', background: 'linear-gradient(135deg, var(--indigo), #7c3aed)',
          color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '10px 14px',
          fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxShadow: '0 2px 8px rgba(99,102,241,.18)'
        }}>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(16,185,129,.15))', border: '1px solid rgba(99,102,241,.3)'
      }}>
        <Code2 size={15} color="var(--indigo)"/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5,
          fontSize: 11, color: 'var(--text4)', fontFamily: 'JetBrains Mono', fontWeight: 600
        }}>
          VORTIS CODE
          {ts && <span style={{ color: 'var(--text4)', opacity: .7 }}>· {new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={copy} title="Copy response"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: copied ? '#10b981' : 'var(--text4)', cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
            {copied ? <Check size={11}/> : <Copy size={11}/>} {copied ? 'Copied' : ''}
          </button>
        </div>
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: '0 12px 12px 12px',
          padding: '12px 14px'
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

export default CodeChat;
