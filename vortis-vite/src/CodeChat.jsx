import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  X, Plus, Search, Trash2, Edit2, Check, Copy, ArrowUp, Play,
  Loader, MessageSquare, Bug, BookOpen, RefreshCw, FileCode,
  PanelLeftClose, PanelLeftOpen, Terminal, Sparkles, Zap
} from 'lucide-react';
 
const API = 'https://vortis-backend.vercel.app/api/bytez';
 
// Fixed defaults — no picker UI, but the backend prompt still uses these.
const DEFAULT_LANG = 'auto';
const DEFAULT_STYLE = 'balanced';
 
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
 *  Starter prompts
 * ──────────────────────────────────────────────────────────────────────── */
const STARTER_PROMPTS = [
  { icon: 'bug',     label: 'Debug an error',   prompt: "I'm getting this error and need help fixing it:\n\n```\n\n```" },
  { icon: 'zap',     label: 'Optimize code',    prompt: 'Help me optimize this function for performance and readability:\n\n```\n\n```' },
  { icon: 'book',    label: 'Explain code',     prompt: 'Walk me through what this code does, step by step:\n\n```\n\n```' },
  { icon: 'file',    label: 'Write a function', prompt: 'Write me a function that …' },
  { icon: 'refresh', label: 'Refactor',         prompt: 'Refactor this code to be cleaner and more idiomatic:\n\n```\n\n```' },
  { icon: 'sparkles',label: 'Code review',      prompt: 'Review this code for bugs, security issues, and improvements:\n\n```\n\n```' },
];
const ICONS = { bug: Bug, zap: Zap, book: BookOpen, file: FileCode, refresh: RefreshCw, sparkles: Sparkles };
 
/* ────────────────────────────────────────────────────────────────────────
 *  Strong coder system prompt (fixed defaults, no user-facing toggles)
 * ──────────────────────────────────────────────────────────────────────── */
const buildCoderSystemPrompt = () => `You are Vertex — an elite senior software engineer pair-programmer, built by Vortis. You are NOT a general assistant; you live and breathe code.
 
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
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect: "I'm Vertex, your coding assistant — for general chat, switch to the main Vortis chat. For code, I'm here."`;
 
/* ────────────────────────────────────────────────────────────────────────
 *  Fallback CodeBlock — used only when parent doesn't pass a real one.
 *  Clean, minimal code card: language chip + copy button, no line numbers,
 *  no syntax color noise — just readable monospace on a slightly-raised
 *  dark surface so it separates from the page background.
 * ──────────────────────────────────────────────────────────────────────── */
const FallbackCodeBlock = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(codeText); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ margin: '12px 0', borderRadius: 10, overflow: 'hidden', border: '1px solid #262626', background: '#161616' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid #262626'
      }}>
        <span style={{ fontSize: 12, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', color: '#8a8a8a', letterSpacing: '.01em' }}>
          {lang || 'text'}
        </span>
        <button onClick={copy} style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none',
          color: copied ? '#e6e6e6' : '#8a8a8a', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px'
        }}>
          {copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '14px 16px', fontFamily: 'ui-monospace, "JetBrains Mono", monospace', fontSize: 13,
        lineHeight: 1.65, color: '#e2e2e2', whiteSpace: 'pre', overflowX: 'auto'
      }}><code>{codeText}</code></pre>
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
 *  Main Vertex component
 * ──────────────────────────────────────────────────────────────────────── */
const Vertex = ({
  onClose,
  CodeBlock,
  safeExecuteCodeLocally,
  LANG_ENGINE,
  ENGINE_META,
}) => {
  const auth = useMemo(() => getAuth(), []);
  const db   = useMemo(() => getFirestore(), []);
 
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
 
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatId, setChatId] = useState(() => Date.now().toString());
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
 
  const [savedChats, setSavedChats] = useState([]);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
 
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);
 
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, thinking]);
 
  /* Lock body scroll while Vertex is mounted */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow, position: body.style.position,
      top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width,
    };
    const scrollY = window.scrollY;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0'; body.style.right = '0'; body.style.width = '100%';
    return () => {
      body.style.overflow = prev.overflow; body.style.position = prev.position;
      body.style.top = prev.top; body.style.left = prev.left; body.style.right = prev.right; body.style.width = prev.width;
      if (prev.position !== 'fixed') window.scrollTo(0, scrollY);
    };
  }, []);
 
  /* Keyboard shortcuts: Esc to close, Cmd/Ctrl+K for new chat */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
      if (e.key === 'Escape' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);
 
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
      let title = overrideTitle;
      if (!title) {
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) {
          title = firstUser.text.replace(/```[\s\S]*?```/g, '').replace(/[#*`]/g, '').trim().slice(0, 48);
          if (!title) title = 'New chat';
        } else {
          title = 'New chat';
        }
      }
      const cleaned = msgs.map(m => ({ role: m.role, text: (m.text || '').slice(0, 12000), ts: m.ts || Date.now() }));
      await setDoc(doc(db, 'users', userUidRef.current, 'code_chats', chatIdRef.current), {
        title, messages: cleaned, lang: DEFAULT_LANG, style: DEFAULT_STYLE,
        updated: new Date().toISOString(),
        createdAt: msgs[0]?.ts ? new Date(msgs[0].ts).toISOString() : new Date().toISOString()
      });
      loadChats(userUidRef.current);
    } catch (_) {}
  }, [db, loadChats]);
 
  const newChat = useCallback(() => {
    abortRef.current = true;
    setStreaming(false); setThinking(false); setStreamText('');
    const newId = Date.now().toString();
    setChatId(newId); chatIdRef.current = newId;
    setMessages([]);
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
        id: `${id}-${i}`, role: m.role, text: m.text, ts: typeof m.ts === 'number' ? m.ts : Date.now()
      }));
      setMessages(restored);
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
      await setDoc(doc(db, 'users', userUidRef.current, 'code_chats', id), { title: newTitle.trim().slice(0, 80) }, { merge: true });
      await loadChats(userUidRef.current);
    } catch (_) {}
    setRenamingId(null);
  }, [db, loadChats]);
 
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
 
    const historyForBackend = nextMsgs.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    const fullPrompt = buildCoderSystemPrompt() + '\n\n=== USER REQUEST ===\n' + text;
 
    let full = '';
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: JSON.stringify({ action: 'chat', mode: 'code', prompt: fullPrompt, history: historyForBackend })
      });
 
      if (!res.ok) {
        let errMsg = `Request failed (${res.status}).`;
        if (res.status === 429) errMsg = "You're sending messages too quickly — please slow down.";
        else if (res.status === 401 || res.status === 403) errMsg = 'Authentication error — try refreshing the page.';
        else if (res.status === 503) errMsg = 'Vertex is temporarily unavailable — please try again shortly.';
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: `⚠️ ${errMsg}`, ts: Date.now() }]);
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
        id: `a-${Date.now()}`, role: 'assistant',
        text: `⚠️ Network error: ${e?.message || 'unknown'}\n\nPlease check your connection and try again.`, ts: Date.now()
      }]);
      setStreaming(false); setStreamText('');
      return;
    }
 
    const cleaned = full.trim();
    if (!cleaned) {
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: '_(empty response — try rephrasing your request)_', ts: Date.now() }]);
    } else {
      const aiMsg = { id: `a-${Date.now()}`, role: 'assistant', text: cleaned, ts: Date.now() };
      const finalMsgs = [...nextMsgs, aiMsg];
      setMessages(finalMsgs);
      setTimeout(() => persistChat(finalMsgs), 50);
    }
    setStreaming(false);
    setThinking(false);
    setStreamText('');
  }, [input, messages, streaming, persistChat]);
 
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
 
  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedChats;
    return savedChats.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [savedChats, search]);
 
  const RendererCodeBlock = CodeBlock || FallbackCodeBlock;
 
  const mdComponents = useMemo(() => ({
    h1: ({children}) => <h1 style={{ fontSize: 19, fontWeight: 700, color: '#f0f0f0', margin: '14px 0 6px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h1>,
    h2: ({children}) => <h2 style={{ fontSize: 16.5, fontWeight: 700, color: '#f0f0f0', margin: '12px 0 5px', letterSpacing: '-.02em', lineHeight: 1.3 }}>{children}</h2>,
    h3: ({children}) => <h3 style={{ fontSize: 14.5, fontWeight: 600, color: '#dcdcdc', margin: '10px 0 4px', lineHeight: 1.3 }}>{children}</h3>,
    h4: ({children}) => <h4 style={{ fontSize: 13.5, fontWeight: 600, color: '#dcdcdc', margin: '8px 0 3px' }}>{children}</h4>,
    p: ({children}) => <p style={{ margin: '0 0 10px', color: '#dcdcdc', lineHeight: 1.7, fontSize: 14.5 }}>{children}</p>,
    strong: ({children}) => <strong style={{ color: '#f0f0f0', fontWeight: 700 }}>{children}</strong>,
    em: ({children}) => <em style={{ color: '#9a9a9a' }}>{children}</em>,
    ul: ({children}) => <ul style={{ margin: '6px 0 12px', paddingLeft: 20 }}>{children}</ul>,
    ol: ({children}) => <ol style={{ margin: '6px 0 12px', paddingLeft: 20 }}>{children}</ol>,
    li: ({children}) => <li style={{ margin: '4px 0', color: '#dcdcdc', lineHeight: 1.65, fontSize: 14.5 }}>{children}</li>,
    a: ({href, children}) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#e6e6e6', textDecoration: 'none', borderBottom: '1px solid #4a4a4a' }}>{children}</a>,
    blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid #3a3a3a', margin: '8px 0', padding: '4px 12px', color: '#9a9a9a', background: '#161616', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>,
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid #232323', margin: '14px 0' }} />,
    table: ({children}) => <div style={{ overflowX: 'auto', margin: '10px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>{children}</table></div>,
    thead: ({children}) => <thead style={{ background: '#161616' }}>{children}</thead>,
    th: ({children}) => <th style={{ padding: '7px 11px', border: '1px solid #262626', textAlign: 'left', color: '#e6e6e6', fontWeight: 600 }}>{children}</th>,
    td: ({children}) => <td style={{ padding: '7px 11px', border: '1px solid #262626', color: '#b8b8b8' }}>{children}</td>,
    code: ({inline, className, children}) => {
      if (inline) {
        return <code style={{ background: '#1e1e1e', color: '#e6e6e6', padding: '2px 6px', borderRadius: 5, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', fontSize: 13, border: '1px solid #2a2a2a' }}>{children}</code>;
      }
      const match = /language-(\w+)/.exec(className || '');
      const codeLang = match ? match[1] : '';
      const codeText = String(children).replace(/\n$/, '');
      return <RendererCodeBlock lang={codeLang} codeText={codeText} safeExecuteCodeLocally={safeExecuteCodeLocally} LANG_ENGINE={LANG_ENGINE} ENGINE_META={ENGINE_META} />;
    },
  }), [RendererCodeBlock, safeExecuteCodeLocally, LANG_ENGINE, ENGINE_META]);
 
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-vertex style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      width: '100vw', height: '100vh', height: '100dvh',
      zIndex: 2147483647,
      background: '#0a0a0a', color: '#e6e6e6',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      animation: 'vertexFadeIn .18s ease',
      overflow: 'hidden', isolation: 'isolate',
    }}>
      {/* ═══ Top bar — minimal: sidebar toggle, wordmark, close ═══ */}
      <div style={{
        height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid #1c1c1c', background: '#0a0a0a'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar"
            style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
            {sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
          </button>
        </div>
 
        <button onClick={onClose} title="Close (Esc)"
          style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
          <X size={17}/>
        </button>
      </div>
 
      {/* ═══ Body: sidebar + main ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 264, flexShrink: 0, borderRight: '1px solid #1c1c1c', background: '#0d0d0d',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            animation: 'vertexSlideInLeft .18s ease'
          }}>
            {/* Wordmark */}
            <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#e6e6e6'
              }}>
                <Terminal size={16} color="#0a0a0a"/>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', letterSpacing: '-.01em', lineHeight: 1.1 }}>Vertex</div>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: '.02em', marginTop: 1 }}>Powered by Vortis</div>
              </div>
            </div>
 
            {/* New chat — plain, minimal, like a list item, not a loud button */}
            <div style={{ padding: '4px 10px 8px' }}>
              <button onClick={newChat}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                  background: 'transparent', border: '1px solid #262626', color: '#e6e6e6', fontSize: 13, fontWeight: 500
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#161616'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Plus size={15}/> New chat
              </button>
            </div>
 
            {/* Search */}
            <div style={{ padding: '0 10px 8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#5a5a5a' }}/>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chats..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', fontSize: 12,
                    background: '#141414', border: '1px solid #232323', borderRadius: 6,
                    color: '#e6e6e6', outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>
 
            {/* Chat list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }} className="scr">
              {filteredChats.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#5a5a5a', fontSize: 11.5, lineHeight: 1.6 }}>
                  <MessageSquare size={20} style={{ opacity: .4, marginBottom: 8 }}/>
                  <div>{search ? 'No matches found.' : 'No saved chats yet.'}</div>
                </div>
              ) : (
                filteredChats.map(c => (
                  <div key={c.id}
                    onClick={() => loadChat(c.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 1,
                      background: c.id === chatId ? '#1a1a1a' : 'transparent'
                    }}
                    onMouseEnter={e => { if (c.id !== chatId) e.currentTarget.style.background = '#141414'; }}
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
                          style={{ flex: 1, fontSize: 12, padding: '3px 6px', background: '#0a0a0a', border: '1px solid #4a4a4a', borderRadius: 4, color: '#e6e6e6', outline: 'none' }}
                        />
                        <button onClick={() => renameChat(c.id, renameVal)} style={{ background: 'transparent', border: 'none', color: '#e6e6e6', cursor: 'pointer', padding: 2 }}><Check size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: c.id === chatId ? 600 : 500, color: '#dcdcdc',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3
                          }}>
                            {c.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a5a5a', marginTop: 2 }}>{relTime(c.updated)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s' }}
                          className="chat-row-actions" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setRenamingId(c.id); setRenameVal(c.title || ''); }} title="Rename"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 2, borderRadius: 3 }}>
                            <Edit2 size={11}/>
                          </button>
                          <button onClick={() => { if (confirm('Delete this chat?')) deleteChat(c.id); }} title="Delete"
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
            <div style={{ padding: '10px 14px', borderTop: '1px solid #1c1c1c', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8a8a8a' }}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: '50%', filter: 'grayscale(1)' }}/>
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#232323', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e6e6e6', fontSize: 10, fontWeight: 700 }}>
                  {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: '#dcdcdc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.displayName || 'User'}
              </div>
            </div>
          </aside>
        )}
 
        {/* ── Main chat area ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0a0a0a' }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }} className="scr">
            {messages.length === 0 && !streaming ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141414', border: '1px solid #262626' }}>
                  <Terminal size={26} color="#e6e6e6"/>
                </div>
                <h1 style={{ fontSize: 23, fontWeight: 600, color: '#f0f0f0', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                  What are we building today?
                </h1>
                <p style={{ fontSize: 14, color: '#7a7a7a', maxWidth: 440, lineHeight: 1.6, margin: '0 0 26px' }}>
                  I'm Vertex — debug errors, refactor messy code, ship features, or learn a new pattern. Code-first, no fluff.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, maxWidth: 620, width: '100%' }}>
                  {STARTER_PROMPTS.map(s => {
                    const Icon = ICONS[s.icon] || FileCode;
                    return (
                      <button key={s.label}
                        onClick={() => { setInput(s.prompt); setTimeout(() => inputRef.current?.focus(), 30); }}
                        style={{
                          textAlign: 'left', padding: '12px 14px', borderRadius: 9, cursor: 'pointer',
                          background: '#121212', border: '1px solid #232323', color: '#dcdcdc',
                          display: 'flex', flexDirection: 'column', gap: 6, transition: 'all .14s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3f3f3f'; e.currentTarget.style.background = '#171717'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#232323'; e.currentTarget.style.background = '#121212'; }}
                      >
                        <Icon size={15} color="#9a9a9a"/>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 26, fontSize: 11, color: '#4a4a4a' }}>
                  Enter to send · Shift+Enter for a new line · Esc to exit
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 22px 12px' }}>
                {messages.map(m => (
                  <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts} mdComponents={mdComponents} />
                ))}
 
                {(streaming || thinking) && (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 11, color: '#5a5a5a', fontWeight: 600, letterSpacing: '.02em', marginBottom: 8 }}>
                      VERTEX {thinking && <span style={{ color: '#9a9a9a' }}>· thinking…</span>}
                    </div>
                    {thinking ? (
                      <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                        {[0,1,2].map(i => (
                          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#8a8a8a', animation: `vertexPulse 1.2s ease-in-out ${i*0.15}s infinite` }}/>
                        ))}
                      </div>
                    ) : streamText ? (
                      <div style={{ color: '#dcdcdc' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
                          {streamText}
                        </ReactMarkdown>
                        <span style={{ display: 'inline-block', width: 7, height: 14, background: '#c8c8c8', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'vertexBlink 1s steps(2) infinite' }}/>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
 
          {/* ── Input area — rounded pill composer, Enter sends ── */}
          <div style={{ flexShrink: 0, padding: '10px 22px 20px' }}>
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
              <div style={{
                position: 'relative', background: '#141414', border: '1px solid #2a2a2a',
                borderRadius: 26, transition: 'border-color .15s'
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!streaming && input.trim()) send();
                    }
                  }}
                  placeholder="Ask anything about code — paste an error, request a function, refactor something…"
                  rows={1}
                  style={{
                    width: '100%', minHeight: 48, maxHeight: 200, resize: 'none',
                    padding: '13px 56px 13px 20px', background: 'transparent', border: 'none', outline: 'none',
                    color: '#e6e6e6', fontSize: 14.5, lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box'
                  }}
                />
                <div style={{ position: 'absolute', right: 7, bottom: 7, display: 'flex', gap: 4 }}>
                  {streaming ? (
                    <button onClick={stopStreaming} title="Stop"
                      style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #3a3a3a', cursor: 'pointer', background: '#1c1c1c', color: '#e6e6e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Loader size={14} style={{ animation: 'vertexSpin 1s linear infinite' }}/>
                    </button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()} title="Send (Enter)"
                      style={{
                        width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
                        background: input.trim() ? '#e6e6e6' : '#232323', color: input.trim() ? '#0a0a0a' : '#5a5a5a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s'
                      }}>
                      <ArrowUp size={16}/>
                    </button>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10.5, color: '#4a4a4a' }}>
                Vertex can make mistakes. Check important code before running it.
              </div>
            </div>
          </div>
        </main>
      </div>
 
      <style>{`
        @keyframes vertexFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vertexSlideInLeft { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes vertexPulse { 0%, 100% { opacity: .3; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes vertexBlink { 50% { opacity: 0 } }
        @keyframes vertexSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        [data-vertex], [data-vertex] *, [data-vertex] *::before, [data-vertex] *::after {
          box-sizing: border-box; margin: 0; padding: 0; border: 0; font: inherit; font-size: inherit;
          color: inherit; background: transparent; list-style: none; text-decoration: none; vertical-align: baseline;
        }
        [data-vertex] button { cursor: pointer; background: transparent; border: none; color: inherit; font: inherit; }
        [data-vertex] input, [data-vertex] textarea, [data-vertex] select { font: inherit; color: inherit; background: transparent; border: none; outline: none; }
        [data-vertex] img { max-width: 100%; display: block; }
        div:hover > div > .chat-row-actions { opacity: 1 !important; }
        .scr::-webkit-scrollbar { width: 8px; }
        .scr::-webkit-scrollbar-thumb { background: #262626; border-radius: 4px; }
      `}</style>
    </div>,
    document.body
  );
};
 
/* ────────────────────────────────────────────────────────────────────────
 *  Single message — user turns as a flat gray pill, assistant turns as
 *  plain text flow (no bubble, no avatar) — closest to how modern
 *  ChatGPT/Codex-style chats present a conversation.
 * ──────────────────────────────────────────────────────────────────────── */
const MessageBubble = React.memo(({ role, text, ts, mdComponents }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
 
  if (isUser) {
    return (
      <div style={{ display: 'flex', marginBottom: 22, justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '80%', background: '#1e1e1e', color: '#f0f0f0', borderRadius: 16,
          padding: '11px 16px', fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {text}
        </div>
      </div>
    );
  }
 
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11, color: '#5a5a5a', fontWeight: 600, letterSpacing: '.02em' }}>
        VERTEX
        {ts && <span style={{ color: '#4a4a4a' }}>· {new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
        <button onClick={copy} title="Copy response"
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#5a5a5a', cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
          {copied ? <Check size={12} color="#e6e6e6"/> : <Copy size={12}/>} {copied ? 'Copied' : ''}
        </button>
      </div>
      <div style={{ color: '#dcdcdc' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
});
 
export default Vertex;