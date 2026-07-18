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
  Loader, MessageSquare, Sparkles,
  Zap, Bug, BookOpen, RefreshCw, FileCode,
  PanelLeftClose, PanelLeftOpen,
  Terminal, Cog, EraserIcon
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
 *  Style preferences — no language picker anymore; the AI just infers
 *  the language from the user's message/paste instead of a forced dropdown.
 * ──────────────────────────────────────────────────────────────────────── */
const STYLES = [
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
const buildCoderSystemPrompt = (style) => {
  let sys = `You are Vertex — an elite senior software engineer pair-programmer embedded inside the user's IDE, powered by Vortis. You are NOT a general assistant; you live and breathe code.

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
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect in your own words each time — vary the phrasing, don't repeat a fixed sentence. The gist: you're a coding assistant, and for general chat they should switch to the main Vortis chat.`;

  if (style === 'concise')  sys += '\n\nSTYLE: Ultra-concise. Code + 1 line of explanation max. No pleasantries.';
  if (style === 'detailed') sys += '\n\nSTYLE: Detailed. Include edge cases, alternative approaches, performance notes, and a short "when not to use this" callout.';
  if (style === 'teach')    sys += '\n\nSTYLE: Teach mode. Add a comment above each non-obvious line of code explaining what it does. Treat the user as a curious learner. End with a one-line "key takeaway".';

  return sys;
};

/* ────────────────────────────────────────────────────────────────────────
 *  Fallback CodeBlock — used only when parent doesn't pass a real one.
 *  Renders code with a language tag + copy button, a subtle language-accent
 *  color, and a soft entrance animation so it doesn't just pop into place.
 * ──────────────────────────────────────────────────────────────────────── */
const CODE_LANG_COLORS = {
  javascript: '#f59e0b', js: '#f59e0b', jsx: '#f59e0b',
  typescript: '#06b6d4', ts: '#06b6d4', tsx: '#06b6d4',
  python: '#3b82f6', py: '#3b82f6',
  react: '#22d3ee',
  rust: '#f97316', go: '#06b6d4',
  java: '#ef4444',
  cpp: '#a78bfa', c: '#a78bfa', 'c++': '#a78bfa',
  csharp: '#10b981', 'c#': '#10b981',
  sql: '#10b981', html: '#f97316', css: '#6366f1',
  bash: '#10b981', sh: '#10b981',
  php: '#8b5cf6', ruby: '#e11d48', rb: '#e11d48',
  json: '#84cc16',
};

const FallbackCodeBlock = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(codeText); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const lines = codeText.split('\n');
  const accent = CODE_LANG_COLORS[(lang || '').toLowerCase()] || '#8a8a8a';
  return (
    <div style={{
      margin: '10px 0', borderRadius: 10, overflow: 'hidden',
      border: '1px solid #2a2a2a', background: '#0d0d0d',
      animation: 'vertexCodeIn .28s cubic-bezier(.2,.7,.3,1)',
      boxShadow: `0 0 0 1px rgba(0,0,0,0), 0 8px 24px -12px ${accent}33`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', background: '#151515', borderBottom: `1px solid #2a2a2a`,
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent, opacity: .7 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}aa`, flexShrink: 0 }}/>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: accent, letterSpacing: '.06em', fontWeight: 700, textTransform: 'uppercase' }}>
            {lang || 'plaintext'}
          </span>
        </div>
        <button onClick={copy} style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #2f2f2f',
          borderRadius: 6, padding: '3px 9px', color: copied ? '#e6e6e6' : '#8a8a8a', fontSize: 10.5,
          cursor: 'pointer', fontFamily: 'JetBrains Mono', transition: 'all .15s'
        }}>
          {copied ? <Check size={10}/> : <Copy size={10}/>} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={{ display: 'flex', overflowX: 'auto' }}>
        <div style={{
          flexShrink: 0, padding: '12px 10px', textAlign: 'right', userSelect: 'none',
          color: '#4a4a4a', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.7,
          borderRight: '1px solid #202020', background: '#0a0a0a'
        }}>
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre style={{
          margin: 0, padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
          lineHeight: 1.7, color: '#dbeafe', whiteSpace: 'pre', wordBreak: 'normal', flex: 1
        }}>{codeText}</pre>
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
 *  FIX #1: this function was called in generateChatTitle but never
 *  defined anywhere — every call threw a ReferenceError, which was
 *  silently swallowed by the surrounding try/catch. That meant
 *  generateChatTitle ALWAYS returned null, and titles ALWAYS fell back
 *  to the raw truncated first user message. Defining it here actually
 *  lets AI-generated titles through.
 * ──────────────────────────────────────────────────────────────────────── */
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

  /* ── Preferences ──
   * Guard against stale saved values (e.g. an old 'auto' / 'balanced' from
   * before those options existed) — fall back to the first valid option
   * instead of silently rendering a blank label. */
  const [style, setStyle] = useState(() => {
    try {
      const saved = localStorage.getItem('vortis_code_style');
      return STYLES.some(s => s.id === saved) ? saved : STYLES[0].id;
    } catch (_) { return STYLES[0].id; }
  });
  const [showPrefs, setShowPrefs] = useState(false);
  useEffect(() => { try { localStorage.setItem('vortis_code_style', style); } catch (_) {} }, [style]);

  const generateChatTitle = async (context) => {
    const safeInput = (context || '').slice(0, 500);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({
          action: 'chat',
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
      if (looksLikeBadTitle(clean)) return null; // signal "couldn't get a good one" — caller decides fallback
      return clean || null;
    } catch(_) {
      return null;
    }
  };

  /* ── Refs ── */
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);

  /* ── Scroll to bottom on new content ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinking]);

  /* ── Lock body scroll while Vertex is mounted ──
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

  /* ── Keyboard shortcuts ──
   * Enter (in the textarea) sends the message; Shift+Enter makes a new line.
   * That's handled directly on the textarea's onKeyDown below.
   * Here we just keep the global "new chat" and "close" shortcuts. */
  useEffect(() => {
    const handler = (e) => {
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
  }, [showPrefs]);

  /* ──────────────────────────────────────────────────────────────────
   *  Firestore ops.
   *
   *  IMPORTANT FIX: this used to write to a separate 'code_chats'
   *  subcollection. Your Firestore security rules only grant access to
   *  'users/{uid}/chats' (that's the path your main app's saveChat()
   *  already uses successfully) — so every write to 'code_chats' was
   *  being silently rejected as permission-denied, and the old code
   *  swallowed that error with an empty catch, so nothing ever showed up.
   *
   *  Fix: write into the SAME 'chats' collection your rules already
   *  allow, tagged with `isCodeChat: true` so it doesn't get mixed up
   *  with regular chats when you load the sidebar list elsewhere.
   * ────────────────────────────────────────────────────────────────── */
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
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const loadChat = useCallback(async (id) => {
    if (!userUidRef.current) return;
    try {
      const snap = await getDoc(doc(db, 'users', userUidRef.current, 'chats', id));
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
      if (c.style && STYLES.some(s => s.id === c.style)) setStyle(c.style);
      if (window.innerWidth <= 900) setSidebarOpen(false);
    } catch (e) {
      console.error('Vertex: failed to load code chat —', e);
    }
  }, [db]);

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

  /* ────────────────────────────────────────────────────────────────────
   *  FIX #2: "clear all data" — deletes every saved code chat for this
   *  user from Firestore and resets local state. Wired to a button in
   *  the sidebar footer below.
   * ──────────────────────────────────────────────────────────────────── */
  const [clearing, setClearing] = useState(false);
  const clearAllData = useCallback(async () => {
    if (!userUidRef.current || clearing) return;
    if (!confirm('Delete ALL saved code chats? This cannot be undone.')) return;
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
  }, [db, loadChats, newChat, clearing]);

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

    const sys = buildCoderSystemPrompt(style);
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
  }, [input, messages, streaming, style, persistChat]);

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

  /* ── Enter sends, Shift+Enter makes a newline ── */
  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming && input.trim()) send();
    }
  }, [streaming, input, send]);

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
        return <code style={{ background: '#1c1c1c', color: '#e6e6e6', padding: '1px 6px', borderRadius: 5, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, border: '1px solid #2a2a2a' }}>{children}</code>;
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
      background: '#0a0a0a',
      color: '#e6e6e6',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      animation: 'vertexFadeIn .18s ease',
      // Lock the body so the main chat behind can't scroll
      overflow: 'hidden',
      isolation: 'isolate',                // new stacking context — nothing leaks in or out
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
          {/* Style picker */}
          <button
            onClick={() => setShowPrefs(s => !s)}
            title="Coder style preferences"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: showPrefs ? '#232323' : '#141414',
              border: '1px solid #2a2a2a', color: '#c8c8c8', fontSize: 12, borderRadius: 6,
              padding: '5px 10px', cursor: 'pointer', fontFamily: 'JetBrains Mono'
            }}
          >
            <Cog size={12}/> {(STYLES.find(s => s.id === style) || STYLES[0]).label}
          </button>

          <div style={{ width: 1, height: 18, background: '#2a2a2a', margin: '0 4px' }} />

          <button onClick={onClose} title="Close"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#141414', border: '1px solid #2a2a2a', color: '#c8c8c8', fontSize: 12, borderRadius: 6, padding: '6px 11px', cursor: 'pointer' }}>
            <X size={13}/> Exit
          </button>
        </div>
      </div>

      {/* ═══ Preferences popover ═══ */}
      {showPrefs && (
        <div style={{
          position: 'absolute', top: 56, right: 14, zIndex: 100,
          background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10,
          boxShadow: '0 12px 36px rgba(0,0,0,.5)', padding: 12, minWidth: 260,
          animation: 'vertexScaleIn .15s ease'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8a8a', letterSpacing: '.06em', marginBottom: 8, fontFamily: 'JetBrains Mono' }}>CODER STYLE</div>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => { setStyle(s.id); setShowPrefs(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                background: style === s.id ? '#232323' : 'transparent',
                border: '1px solid ' + (style === s.id ? '#3a3a3a' : 'transparent'),
                marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e6e6' }}>{s.label}</span>
              <span style={{ fontSize: 11, color: '#7a7a7a' }}>{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ Body: sidebar + main ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 256, flexShrink: 0, borderRight: '1px solid #212121', background: '#0f0f0f',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            animation: 'vertexSlideInLeft .18s ease'
          }}>
            {/* New chat — flat monochrome, Codex "New task" style */}
            <div style={{ padding: 10 }}>
              <button onClick={newChat}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                  background: '#e6e6e6',
                  border: '1px solid #e6e6e6', color: '#0a0a0a', fontSize: 13, fontWeight: 600
                }}>
                <Plus size={14}/> New Code Chat
              </button>
            </div>

            {/* Search */}
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

            {/* Chat list */}
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
                            onClick={() => { if (confirm('Delete this code chat?')) deleteChat(c.id); }}
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

            {/* Sidebar footer */}
            <div style={{
              padding: '9px 12px', borderTop: '1px solid #212121', background: '#111111',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8a8a8a'
            }}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: '50%', filter: 'grayscale(1)' }}/>
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2a2a', border: '1px solid #3a3a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e6e6e6', fontSize: 10, fontWeight: 700 }}>
                  {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.displayName || 'User'}
                </div>
                <div style={{ fontSize: 9.5, color: '#5a5a5a', fontFamily: 'JetBrains Mono' }}>
                  {savedChats.length} code {savedChats.length === 1 ? 'chat' : 'chats'}
                </div>
              </div>
              {/* FIX #2: clear-all-data button */}
              <button
                onClick={clearAllData}
                disabled={clearing || savedChats.length === 0}
                title="Clear all saved code chats"
                style={{
                  background: 'transparent', border: '1px solid #2a2a2a', color: clearing ? '#4a4a4a' : '#8a8a8a',
                  cursor: (clearing || savedChats.length === 0) ? 'not-allowed' : 'pointer',
                  padding: '4px 6px', borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center'
                }}>
                <Trash2 size={12}/>
              </button>
            </div>
          </aside>
        )}

        {/* ── Main chat area ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0a0a0a' }}>
          {/* Messages / empty state */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }} className="scr">
            {messages.length === 0 && !streaming ? (
              /* ── Empty state with suggestion chips ── */
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 30, textAlign: 'center'
              }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 12, marginBottom: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#141414',
                  border: '1px solid #2a2a2a'
                }}>
                  <Terminal size={28} color="#e6e6e6"/>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: '#e6e6e6', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                  What are we building today?
                </h1>
                <p style={{ fontSize: 13.5, color: '#7a7a7a', maxWidth: 440, lineHeight: 1.6, margin: '0 0 24px' }}>
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
                          textAlign: 'left', padding: '11px 13px', borderRadius: 8, cursor: 'pointer',
                          background: '#111111', border: '1px solid #232323',
                          color: '#dcdcdc', display: 'flex', flexDirection: 'column', gap: 5,
                          transition: 'all .14s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a4a4a'; e.currentTarget.style.background = '#161616'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#232323'; e.currentTarget.style.background = '#111111'; }}
                      >
                        <Icon size={15} color="#9a9a9a"/>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</span>
                      </button>
                    );
                  })}
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
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
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

          {/* ── Input area ── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid #212121', background: '#0f0f0f',
            padding: '12px 22px 16px'
          }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              {/* Flex row layout — textarea and send button sit side by side,
                  so the button never overlaps the text as the textarea grows. */}
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                background: '#141414', border: '1px solid #2a2a2a',
                borderRadius: 10, padding: 6
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ask anything about code — paste an error, request a function, refactor something…"
                  rows={1}
                  style={{
                    flex: 1, height: 36, minHeight: 36, maxHeight: 240, resize: 'none',
                    padding: '8px 8px', background: 'transparent', border: 'none', outline: 'none',
                    color: '#e6e6e6', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                  onInput={e => {
                    // auto-grow, capped at maxHeight, without ever shrinking the button row
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
                  <button onClick={() => send()} disabled={!input.trim()}
                    title="Send"
                    style={{
                      width: 36, height: 36, borderRadius: 7, border: '1px solid ' + (input.trim() ? '#e6e6e6' : '#2a2a2a'), cursor: input.trim() ? 'pointer' : 'not-allowed',
                      background: input.trim() ? '#e6e6e6' : '#1a1a1a',
                      color: input.trim() ? '#0a0a0a' : '#5a5a5a', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      </div>

      {/* Inline keyframes + reset */}
      <style>{`
        @keyframes vertexFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vertexScaleIn { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes vertexSlideInLeft { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vertexPulse { 0%, 100% { opacity: .3; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes vertexBlink { 50% { opacity: 0 } }
        @keyframes vertexSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes vertexCodeIn { from { opacity: 0; transform: translateY(4px) scale(.99) } to { opacity: 1; transform: translateY(0) scale(1) } }
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
        .chat-item:hover .chat-row-actions,
        div:hover > div > .chat-row-actions { opacity: 1 !important; }
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
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (isUser) {
    // Codex-style user turn: flat gray pill, right-aligned, no color accent
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '78%', background: '#1e1e1e', border: '1px solid #2a2a2a',
          color: '#e6e6e6', borderRadius: 10, padding: '10px 14px',
          fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {text}
        </div>
      </div>
    );
  }

  // Codex-style assistant turn: plain flow, outlined mark, no bubble background color
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
          fontSize: 11, color: '#5a5a5a', fontFamily: 'JetBrains Mono', fontWeight: 600, letterSpacing: '.02em'
        }}>
          VERTEX
          {ts && <span style={{ color: '#4a4a4a' }}>· {new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={copy} title="Copy response"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#5a5a5a', cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
            {copied ? <Check size={11} color="#e6e6e6"/> : <Copy size={11}/>} {copied ? 'Copied' : ''}
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

export default Vertex;