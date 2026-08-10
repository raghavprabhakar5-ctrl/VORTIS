import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mammoth from 'mammoth';
import {
  X, Code2, Plus, Search, Trash2, Edit2, Check, Copy, ArrowUp,
  Loader, MessageSquare, Sparkles,
  Zap, Bug, BookOpen, RefreshCw, FileCode, Folder, FolderOpen, FolderTree,
  PanelLeftClose, PanelLeftOpen,
  Terminal, Cog, EraserIcon,
  ChevronDown, ChevronRight, HelpCircle,
  Image as ImageIcon, FileText, Scan,
  Download, Layers, Upload, ExternalLink, RotateCcw,
  Reply, Edit3, Wand2, FlaskConical, ArrowDownToLine, Play,
  ListChecks, Circle, CheckCircle2, Send, FileArchive
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

═══ CLARIFYING — PROACTIVE FOR ANY PROJECT / FEATURE REQUEST ═══
You MUST emit a clarifying-question block BEFORE writing any code whenever the user's request involves building, creating, making, or implementing something non-trivial — even if you think you can guess. This includes:
- "Build a chat app" / "Make a counter" / "Create a form" / "Implement a dashboard"
- "Write me a [thing]" where [thing] has multiple valid shapes (web app, CLI, library, mobile)
- Any request that doesn't pin down framework, language, styling, or scope
- The user says "ask me my preferences" or "ask before you start" — always ask

DO NOT just start coding on assumptions. The user explicitly wants to be asked first.

The clarifying block uses this exact raw-text format (NO code fence, NO prose before it, NO markdown):

<<<ASK>>>
[{"question":"Which framework?","options":["Next.js","Vite + React","Plain HTML"]},{"question":"Styling?","options":["Tailwind","CSS Modules","Plain CSS"]},{"question":"Language?","options":["TypeScript","JavaScript"]},{"question":"Scope?","options":["Full clone","Core UI only","Minimal MVP"]},{"question":"Auth?","options":["None","Firebase Auth","NextAuth","Custom JWT"]}]
<<<END>>>

STRICT RULES:
- The FIRST thing in your reply must be the literal characters <<<ASK>>> on its own line. NO intro prose. NO "Sure, let me ask…". NO "I'll need a few details first.". Just the marker.
- The closing literal <<<END>>> on its own line is MANDATORY. Omitting it breaks the parser and the user sees raw JSON.
- Between them is a valid JSON array. Each object has question (string) and options (array of 2-4 short strings).
- 1-7 questions depending on complexity. Each question = one axis of genuine ambiguity (framework, styling, language, layout, scope, deployment, auth, database, etc.).
- DO NOT wrap in a markdown code fence. Raw text only.
- DO NOT include an "Other" option — the UI automatically adds an "Other" pill with a free-text input to every question, so the user can always type a custom answer that isn't in your option list.
- After <<<END>>>, you may add ONE short line like "I'll start once you pick." — nothing more. Then stop. The user's picks arrive as the next message; THEN you write the code.

When NOT to ask (rare):
- Quick syntax questions ("how do I use useEffect?")
- Bug fixes where the user pasted the broken code
- Casual conversation
- The user already specified everything (framework, language, scope) in their request

Example of a CORRECT proactive clarify reply (the WHOLE reply is just this):
<<<ASK>>>
[{"question":"Which framework?","options":["Next.js","Vite","Plain HTML"]},{"question":"Styling?","options":["Tailwind","CSS Modules","Plain CSS"]},{"question":"Language?","options":["TypeScript","JavaScript"]}]
<<<END>>>

═══ MULTI-FILE OUTPUT (STRICT — ALWAYS TAG EVERY FILE, USE REAL FOLDERS) ═══
EVERY fenced code block you emit — no exceptions — MUST start with a path comment marking the file's relative path. This is what makes the UI render the IDE-style file tree (with a Download .zip button for 2+ files) instead of a flat code wall.

When a request produces 2+ files, ALWAYS organize them into a real folder structure — NOT flat in the root. Use the conventional layout for the framework:
- Next.js: app/ (routes), components/, lib/ or utils/, public/, styles/
- Vite + React: src/components/, src/hooks/, src/lib/, src/App.tsx, src/main.tsx, public/
- Plain React: src/components/, src/hooks/, src/utils/, src/index.js
- Python: app/ or src/, tests/, scripts/, requirements.txt
- General web: index.html, css/, js/, assets/

Example of a CORRECT multi-file reply (real folders, every file tagged):
(fenced block, language tsx)
// file: src/components/ChatHeader.tsx
import React from 'react';
export default function ChatHeader() { ... }

(fenced block, language ts)
// file: src/hooks/useChat.ts
import { useState } from 'react';
export function useChat() { ... }

(fenced block, language json)
# file: package.json
{ "name": "chat-app", "dependencies": { ... } }

Path-comment syntax by language (the parser strips this line before display, so the file itself stays valid even for JSON/YAML):
- // file: for JS, TS, JSX, TSX, C, C++, Java, Rust, Go, Swift, Kotlin, Dart
- # file: for Python, Ruby, Shell, Bash, YAML, TOML, Makefile, Dockerfile, JSON, .gitignore
- <!-- file: --> for HTML, XML, SVG, Markdown
- /* file: */ for CSS, SCSS, LESS, C (block comment variant)
- -- file: for SQL, Haskell, Ada
- ; file: for Lisp, Clojure, INI, .env

RULES:
- Tag EVERY file, even when there's only one. A single tagged file still gets the IDE panel.
- NEVER merge multiple files into one fence. One file = one fence.
- NEVER skip the path comment on a code block.
- Use real, runnable relative paths with folders: src/App.tsx, app/api/route.ts, components/Chat.tsx, package.json.
- For substantial code blocks (6+ lines, not shell), the UI shows an "Open" button so the user can run/edit the code in a side panel. Keep this in mind: emit RUNNABLE code, not just snippets.

Download .zip note: the zip button only appears when 2+ files are tagged. For a single file, the user uses the "Save" button on the code block itself.

═══ TODOS / PROGRESS TRACKING (MANDATORY FOR ANY NON-TRIVIAL TASK) ═══
You MUST start your reply with a GFM task-list block whenever ANY of the following are true:
- The task involves 2+ files
- The task involves refactoring, restructuring, or rewriting existing code
- The task involves multiple logical steps (build X, then Y, then Z)
- The task is described as "complex", "hard", "big", "full", "complete", "from scratch"
- The user asks you to "do X then Y", "first A, then B", "step by step"
- The user explicitly says "in N steps" (e.g. "refactor this in 4 steps")
- The reply will take more than ~30 seconds for a user to read and apply
- You're fixing multiple bugs, building a feature, or implementing a UI

Format (literal characters, leading dashes, square brackets). Every todo that
produces a file MUST end with that file's exact path in backticks — this is
how the UI knows the step is actually done, so get the path exact and
matching the // file: path you use later in that code block:

- [ ] Extract the header component 
- [ ] Add the chat hook 
- [ ] Wire up shared types 
- [ ] Explain the data flow

Steps that don't produce a file (e.g. pure explanation) omit the backticked path.
The path in the todo line MUST exactly match the path comment in the corresponding
code block later in your reply — same string, same case, same slashes.

- [ ] Step 3 short description
- [ ] Step 4 short description

Then your intro prose (1-2 lines), then the code blocks.

Example of a CORRECT reply start:
- [ ] Extract the ChatHeader component
- [ ] Move hooks into a custom useChat hook
- [ ] Add shared type definitions
- [ ] Wrap with a ChatProvider context

Refactoring in 4 steps. Here's each file:

(fenced code block with language tsx)
// file: src/components/ChatHeader.tsx
...

STRICT RULES:
- Use the LITERAL characters - [ ] (open) or - [x] (done). NOT bold text. NOT "Step 1:". NOT a numbered list. NOT "1. ". The leading - [ ] is what the UI parser detects.
- Minimum 3 task lines for the checklist to render. If you have fewer than 3 steps, skip the checklist and just answer directly.
- Each task line ≤ 8 words. The body of the reply explains each step.
- Mark - [x] ONLY after that step's code has actually been delivered below.
- Task lines MUST be at the very top of the reply — no prose before them.
- These leading task lines are stripped from the rendered markdown and shown as a collapsible checklist with a progress bar above the reply body.

When NOT to use todos (rare):
- Quick one-line answers ("what's the syntax for X?")
- Single-file single-function fixes that take 1-2 lines
- Casual conversation / greetings
- Pure explanations with no code changes

═══ CURRENT INFO ═══
If live web search results are appended below this prompt, treat them as ground truth for anything version-specific, recently changed, or time-sensitive (library versions, deprecations, new APIs) — they override your training data.
STRICT SOURCING RULE: only state a specific fact (model name, version number, endpoint, pricing) as confirmed if it is literally present in the search snippets. If a detail isn't in the snippets, either omit it or say "not confirmed by search." Never invent a supporting source (a forum post, username, repo, article) to make an unconfirmed claim sound more credible. Never blend or guess at version numbers (e.g. don't write "5.1/5.2" unless that exact string appears in a snippet).
Never say you lack real-time or internet access — Vertex has live web search built in via the backend. If no search results were appended below for this message, answer from your best knowledge and flag anything that may be outdated, rather than denying the capability.

CITATION FORMAT — this is strict, not a suggestion:
- NEVER write bare bracket markers like [1], [2], (source [4]) anywhere in your answer. They render as dead text with no link — useless to the user.
- If a search snippet includes a URL, cite it as an inline markdown link right where the claim is made: "[Short link text](https://actual-url.com)" — the link text should describe the source, not just repeat a number.
- If you don't have an actual URL for a claim, don't cite it at all — just state the fact plainly (still following the STRICT SOURCING RULE above).
- Never produce a numbered reference list style unless every single number in it has a real corresponding markdown link.

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

═══ YOUR ABILITIES (PROFESSIONAL CAPABILITIES) ═══
You are a professional coding assistant with these built-in capabilities — use them confidently:
1. CLARIFYING PREFERENCES: Before any non-trivial build/create request, you proactively ask the user's preferences (framework, language, styling) via the <<<ASK>>> card. You don't just guess — you ask first.
2. MULTI-FILE PROJECTS: When a request needs multiple files, you emit each file with a // file: path/to/x marker on the first line and a real folder structure (src/components/, app/api/, etc.). The UI renders an IDE-style file tree with a Download .zip button.
3. RUNNABLE CODE: For substantial code (6+ lines, not shell), the UI shows an Open button that opens a side panel where the user can run the code. For multi-file projects, the UI bundles all files together (HTML gets CSS+JS inlined; JS/Python get concatenated) so clicking Run on ANY file runs the WHOLE project. KEEP THIS IN MIND: emit code that works when bundled. For multi-file JS/Python, avoid cross-file imports that can't be resolved by concatenation — use plain function declarations, not ES modules with import/export between files in the same project. For HTML projects, put the main logic in the HTML file and use simple script tags or inline the JS directly.
4. PROGRESS TRACKING: For 3+ step tasks, you start your reply with a GFM task list (- [ ] step) that the UI renders as a collapsible checklist with a progress bar.
5. CLARIFYING CARDS: For ambiguous requests, you emit a <<<ASK>>> block with tappable option pills. The user can also type custom answers via an Other pill and an Anything else? textarea.

When you build a project, always make the code RUNNABLE in the browser. For web projects, prefer a single HTML file with inline CSS+JS, OR a multi-file structure where the HTML entry file references the other files via standard link/script tags (the UI inlines them at run time). For Python, emit self-contained scripts or simple multi-file layouts where the entry file can concatenate with the others without import errors.

═══ NON-CODING REQUESTS ═══
- You are NOT a general assistant. If the user asks a non-coding question, briefly redirect in your own words each time — vary the phrasing, don't repeat a fixed sentence. The gist: you're a coding assistant, and for general chat they should switch to the main Vortis chat.`;

  if (style === 'concise')  sys += '\n\nSTYLE: Ultra-concise. Code + 1 line of explanation max. No pleasantries.';
  if (style === 'detailed') sys += '\n\nSTYLE: Detailed. Include edge cases, alternative approaches, performance notes, and a short "when not to use this" callout.';
  if (style === 'teach')    sys += '\n\nSTYLE: Teach mode. Add a comment above each non-obvious line of code explaining what it does. Treat the user as a curious learner. End with a one-line "key takeaway".';

  return sys;
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyIncludesAny(text, keywords, maxDist = 1) {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return keywords.some(kw =>
    words.some(w => Math.abs(w.length - kw.length) <= maxDist && levenshtein(w, kw) <= maxDist)
  );
}

function needsCodeWebSearch(text) {
  const searchWords = ['search', 'google', 'lookup', 'latest', 'current', 'recent', 'newest', 'changelog', 'deprecated', 'version'];
  if (fuzzyIncludesAny(text, searchWords)) return true;
  if (/\bv?\d+\.\d+(\.\d+)?\b.*\b(release|version|update|changelog)\b/i.test(text)) return true;
  return false;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Multi-file project detection — when the model emits 2+ fenced blocks
 *  tagged with a "// file: path/to/x" first line, strip them out of the
 *  markdown and render them as a single FileTreePanel instead of N flat
 *  VertexCodeBlocks. The first-line path comment is recognized in any
 *  language's comment syntax (//, #, --, ;;, ;, <!--).
 * ──────────────────────────────────────────────────────────────────────── */
const FILE_PATH_LINE = /^(?:\/\/|#|--|;;|;|<!--|\/\*)\s*\*?\s*(?:file|path|filename)\s*[:=]\s*([^\n\r]+?)\s*(?:-->\s*?)?(?:\*\/\s*?)?$/i;

const extractFilePath = (code, lang) => {
  if (!code) return null;
  const nl = code.indexOf('\n');
  const firstLine = (nl === -1 ? code : code.slice(0, nl)).trim();
  const m = firstLine.match(FILE_PATH_LINE);
  if (!m) return null;
  let path = m[1].trim().replace(/^['"`]|['"`]$/g, '');
  // reject obvious false positives — paths with spaces/commas or suspiciously long
  if (!path || /[\s,]/.test(path) || path.length > 200) return null;
  // strip leading ./
  path = path.replace(/^\.\//, '');
  const rest = nl === -1 ? '' : code.slice(nl + 1).replace(/^\n+/, '');
  return { path, code: rest };
};

/* Scans a message for ALL fenced code blocks with a `// file:` first line.
   If 1+ are found, they're returned as a project; the matching fences are
   stripped from the markdown so ReactMarkdown doesn't render them a second
   time. Even a single tagged file goes through the FileTreePanel so the
   user gets the IDE layout + Download .zip button. Untagged fences (rare
   since the system prompt mandates tagging) fall through to plain
   VertexCodeBlock rendering.

   During streaming, a fence may be unclosed (the model hasn't emitted the
   closing ``` yet). We accept that case too — match an open fence ending
   at end-of-text — so the FileTreePanel renders progressively instead of
   flashing flat code blocks mid-stream. */
/* `isActiveStream` controls whether an unclosed (open) trailing code fence
   tags the extracted file with `streaming: true`. Only the actively-streaming
   message should pass true — for committed/aborted messages, an unclosed
   fence just means the model was interrupted mid-file; it is NOT still being
   written, so we must NOT show the pulsing green dot forever on that file. */
const extractProjectFromMessage = (text, isActiveStream = false) => {
  if (!text || !text.includes('```')) return { project: null, text: text || '' };
  // Closed fences: ```lang\n...```
  const closedFence = /```(\w*)\n([\s\S]*?)```/g;
  // Open fence (streaming): ```lang\n... until end of text (no closing ```)
  // Only matched if not preceded by another closing fence.
  const files = [];
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = closedFence.exec(text))) {
    const lang = m[1] || '';
    const code = m[2] || '';
    const extracted = extractFilePath(code, lang);
    if (extracted) {
      out += text.slice(lastIdx, m.index);
      lastIdx = m.index + m[0].length;
      files.push({ path: extracted.path, lang, code: extracted.code });
    }
  }
  // After processing all closed fences, check if there's an OPEN fence
  // (streaming mid-file) between lastIdx and end of text.
  const tail = text.slice(lastIdx);
  const openMatch = tail.match(/```(\w*)\n([\s\S]*)$/);
  if (openMatch) {
    const lang = openMatch[1] || '';
    const code = openMatch[2] || '';
    const extracted = extractFilePath(code, lang);
    if (extracted) {
      // Strip the open fence from `out` by advancing lastIdx past it.
      // The tail before the open fence is preserved.
      out += tail.slice(0, openMatch.index);
      lastIdx += openMatch.index + openMatch[0].length;
      files.push({ path: extracted.path, lang, code: extracted.code, streaming: isActiveStream });
    }
  }
  out += text.slice(lastIdx);
  if (files.length === 0) return { project: null, text };
  // collapse the gap left by stripping (avoid triple blank lines)
  const cleanedText = out.replace(/\n{3,}/g, '\n\n');
  return { project: files, text: cleanedText };
};

/* Build a nested tree from a flat list of {path, lang, code}.
   Folders sort first, then files; both alphabetical. */
const buildFileTree = (files) => {
  const root = { name: '', path: '', children: {}, files: [] };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop();
    let node = root;
    for (const p of parts) {
      if (!node.children[p]) {
        node.children[p] = { name: p, path: (node.path ? node.path + '/' : '') + p, children: {}, files: [] };
      }
      node = node.children[p];
    }
    node.files.push({ ...f, name: fileName });
  }
  const finalize = (node) => {
    const folders = Object.values(node.children).map(finalize);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) => a.name.localeCompare(b.name));
    node.folders = folders;
    return node;
  };
  return finalize(root);
};

/* Inline store-only ZIP writer — no external dependency. Creates a valid
   .zip file with all files stored (no compression). Works in every browser
   with Uint8Array. CRC32 is computed per-file for integrity. */
const _zipCRC32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
const _zipCRC32 = (bytes) => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = _zipCRC32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};
const _zipStrToBytes = (str) => new TextEncoder().encode(str);

const downloadProjectAsZip = (files, zipName = 'vertex-project.zip') => {
  try {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.path);
      const dataBytes = enc.encode(f.code);
      const crc = _zipCRC32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + name)
      const localHdr = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(localHdr.buffer);
      dv.setUint32(0, 0x04034b50, true);   // local file header signature
      dv.setUint16(4, 20, true);           // version needed
      dv.setUint16(6, 0, true);            // flags
      dv.setUint16(8, 0, true);            // compression: store
      dv.setUint16(10, 0, true);           // mod time
      dv.setUint16(12, 0, true);           // mod date
      dv.setUint32(14, crc, true);         // CRC-32
      dv.setUint32(18, size, true);        // compressed size
      dv.setUint32(22, size, true);        // uncompressed size
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);           // extra field length
      localHdr.set(nameBytes, 30);
      localParts.push(localHdr, dataBytes);

      // Central directory record (46 bytes + name)
      const centralHdr = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHdr.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central file header signature
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0, true);            // flags
      cv.setUint16(10, 0, true);           // compression: store
      cv.setUint16(12, 0, true);           // mod time
      cv.setUint16(14, 0, true);           // mod date
      cv.setUint32(16, crc, true);         // CRC-32
      cv.setUint32(20, size, true);        // compressed size
      cv.setUint32(24, size, true);        // uncompressed size
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);           // extra field length
      cv.setUint16(32, 0, true);           // comment length
      cv.setUint16(34, 0, true);           // disk number
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offset, true);      // offset of local header
      centralHdr.set(nameBytes, 46);
      centralParts.push(centralHdr);

      offset += localHdr.length + dataBytes.length;
    }

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);     // EOCD signature
    ev.setUint16(4, 0, true);              // disk number
    ev.setUint16(6, 0, true);              // disk with central dir
    ev.setUint16(8, files.length, true);   // entries on this disk
    ev.setUint16(10, files.length, true);  // total entries
    ev.setUint32(12, centralParts.reduce((n, p) => n + p.length, 0), true); // central dir size
    ev.setUint32(16, offset, true);        // offset of central dir
    ev.setUint16(20, 0, true);             // comment length

    // Combine all parts
    const totalLen = localParts.reduce((n, p) => n + p.length, 0)
                    + centralParts.reduce((n, p) => n + p.length, 0)
                    + eocd.length;
    const blob = new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    // Last-resort fallback: download files individually
    files.forEach((f, i) => setTimeout(
      () => downloadTextAsFile(f.code, f.path.split('/').pop() || `file-${i + 1}.txt`),
      i * 140
    ));
  }
};

/* ────────────────────────────────────────────────────────────────────────
 *  Tappable clarifying-question extraction — when the model emits a
 *  <<<ASK>>>[{"question":...,"options":[...]}]<<<END>>> block, strip it
 *  out of the markdown and render it as a ClarifyCard with pill buttons.
 *
 *  Lenient: also accepts a missing <<<END>>> (treats end-of-message as
 *  the close), optional whitespace inside the markers (<<< ASK >>>),
 *  and ASK blocks wrapped in a code fence (```…```) — the model
 *  occasionally does all three.
 * ──────────────────────────────────────────────────────────────────────── */
const ASK_BLOCK_STRICT = /<<<\s*ASK\s*>>>\s*([\s\S]*?)(?:<<<\s*END\s*>>>|$)/;
const ASK_BLOCK_FENCE = /```[a-z]*\s*\n([\s\S]*?<<<\s*ASK\s*>>>\s*[\s\S]*?(?:<<<\s*END\s*>>>|```))[\s\S]*?```/i;

const parseAskJson = (raw) => {
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw.trim()); } catch (e) {
    // Try to extract the first JSON array inside the raw text — sometimes
    // the model wraps it in extra prose or stray backticks.
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { parsed = JSON.parse(arrMatch[0]); } catch (e2) { return null; }
    } else {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const valid = parsed.filter(q =>
    q && typeof q.question === 'string' && q.question.trim() &&
    Array.isArray(q.options) && q.options.length >= 2 &&
    q.options.every(o => typeof o === 'string')
  );
  return valid.length > 0 ? valid : null;
};

const extractClarify = (text) => {
  if (!text) return { clarify: null, text: '' };
  // Fast-path: no marker anywhere → nothing to do.
  if (!/<<<\s*ASK\s*>>>/.test(text)) return { clarify: null, text };

  // Try the fenced-wrapped version FIRST — if the ASK block is inside a
  // code fence, we want to strip the whole fence (including the ``` lines),
  // not just the inner ASK...END block (which would leave orphan fences).
  let m = text.match(ASK_BLOCK_FENCE);
  let matchedBlock = null;
  let parsed = null;
  if (m) {
    const innerM = m[1].match(ASK_BLOCK_STRICT);
    if (innerM) {
      parsed = parseAskJson(innerM[1]);
      if (parsed) matchedBlock = m[0];
    }
  }

  // Fall back to the plain inline match (no fence wrapper).
  if (!parsed) {
    const im = text.match(ASK_BLOCK_STRICT);
    if (im) {
      parsed = parseAskJson(im[1]);
      if (parsed) matchedBlock = im[0];
    }
  }

  if (!parsed) return { clarify: null, text };

  // Strip the matched block (and any trailing blank line) from the text.
  let cleaned = text.replace(matchedBlock, '');
  // If the only thing left after stripping is whitespace, return empty text
  // so the ClarifyCard stands alone without an empty markdown body.
  cleaned = cleaned.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  return { clarify: parsed, text: cleaned };
};

/* ────────────────────────────────────────────────────────────────────────
 *  Leading Todos extraction — when the model starts its reply with 2+
 *  GFM task-list lines (- [x] ... / - [ ] ...), strip them and render
 *  them as a collapsible TodosPanel above the markdown body. Stray
 *  checkbox lines elsewhere still render as plain GFM.
 *
 *  AUTO-TICK: the model rarely flips - [ ] to - [x] after delivering
 *  each step. To make the progress bar actually move, we count how
 *  many `// file:`-tagged blocks (or substantial code blocks) appear
 *  in the body and auto-tick the first N todos. The model's own - [x]
 *  markings are always respected.
 * ──────────────────────────────────────────────────────────────────────── */
const TODO_LINE = /^\s*[-*]\s+\[(?:x|X|\s|[-])\]\s+.+$/;
const TODO_PATH = /`([^`]+)`\s*$/;

const extractLeadingTodos = (text, deliveredFiles = []) => {
  if (!text) return { todos: null, text: '' };
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const todoLines = [];
  while (i < lines.length && TODO_LINE.test(lines[i])) {
    todoLines.push(lines[i]);
    i++;
  }
  if (todoLines.length < 3) return { todos: null, text };
  if (i < lines.length && lines[i].trim() === '') i++;
  const body = lines.slice(i).join('\n');

  // Ground truth: paths that have actually landed in this message so far.
  // Works identically mid-stream and after streaming ends — no force-complete.
  const deliveredPaths = new Set(deliveredFiles.map(f => f.path));

  const todos = todoLines.map(l => {
    const m = l.match(/^\s*[-*]\s+\[([xX\s-])\]\s+(.+)$/);
    const raw = m ? m[2] : l;
    const modelSaysDone = !!(m && (m[1] === 'x' || m[1] === 'X'));
    const pathMatch = raw.match(TODO_PATH);
    const boundPath = pathMatch ? pathMatch[1].trim() : null;
    const pathDone = boundPath ? deliveredPaths.has(boundPath) : false;
    return {
      done: modelSaysDone || pathDone,
      text: raw.replace(TODO_PATH, '').trim(), // strip trailing `path` from the visible label
    };
  });
  return { todos, text: body };
};

/* ────────────────────────────────────────────────────────────────────────
 *  TodosPanel — collapsible checklist with a done/total badge and a
 *  thin progress bar. Rendered above the markdown body when the message
 *  starts with 2+ GFM task lines.
 * ──────────────────────────────────────────────────────────────────────── */
const TodosPanel = ({ todos }) => {
  const [collapsed, setCollapsed] = useState(false);
  const done = todos.filter(t => t.done).length;
  const total = todos.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div style={{
      margin: '10px 0 12px', borderRadius: 0, overflow: 'hidden',
      border: '1px solid #232323', background: '#101010',
      animation: 'vertexCodeIn .25s ease',
    }} data-vrtx-no-reply="">
      <button onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', background: '#141414', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid #1f1f1f',
        }}>
        <ListChecks size={13} color="#c8c8c8" style={{ flexShrink: 0 }}/>
        <span style={{
          fontSize: 11.5, fontFamily: 'JetBrains Mono, monospace', color: '#dcdcdc',
          fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
        }}>Todos</span>
        <span style={{
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#8a8a8a',
          marginLeft: 2,
        }}>{done} / {total}</span>
        <div style={{
          flex: 1, height: 4, background: '#1f1f1f', borderRadius: 0,
          marginLeft: 6, marginRight: 6, overflow: 'hidden',
        }}>
          <div style={{
            width: pct + '%', height: '100%', background: '#e6e6e6',
            transition: 'width .25s ease',
          }}/>
        </div>
        <ChevronDown size={13} color="#7a7a7a" style={{
          transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s',
          flexShrink: 0,
        }}/>
      </button>
      {!collapsed && (
        <div style={{ padding: '6px 6px 8px' }}>
          {todos.map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 9,
              padding: '5px 10px', fontSize: 13, lineHeight: 1.55,
              color: t.done ? '#6a6a6a' : '#dcdcdc',
              textDecoration: t.done ? 'line-through' : 'none',
            }}>
              {t.done ? (
                <CheckCircle2 size={14} style={{ marginTop: 2, flexShrink: 0, color: '#8a8a8a' }}/>
              ) : (
                <Circle size={14} style={{ marginTop: 2, flexShrink: 0, color: '#5a5a5a' }}/>
              )}
              <span style={{ flex: 1 }}>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  ClarifyCard — tappable question card with pill buttons. Each option
 *  is a toggle; when the user has answered every question, the "Send
 *  answers" button calls onAnswer(composedString), which sends the
 *  answers as the next user message. Once sent, the parent freezes the
 *  card (grayed out, non-interactive) so it can't be re-clicked.
 *
 *  Each question automatically gets an "Other" pill at the end — clicking
 *  it reveals a free-text input so the user can type an answer that
 *  wasn't in the model's option list. The composed answer then uses the
 *  custom text instead of one of the canned options.
 * ──────────────────────────────────────────────────────────────────────── */
const ClarifyCard = ({ questions, onAnswer, frozen }) => {
  // selected[qi] = { type: 'option', idx } | { type: 'other', text: '...' }
  const [selected, setSelected] = useState({});
  const [skipped, setSkipped] = useState({});
  const [extraNotes, setExtraNotes] = useState('');
  const otherInputRef = useRef(null);

  const toggle = (qIdx, optIdx) => {
    if (frozen) return;
    // Un-skip if the user picks an answer for a previously skipped question
    setSkipped(prev => {
      const next = { ...prev };
      delete next[qIdx];
      return next;
    });
    setSelected(prev => {
      const next = { ...prev };
      const cur = next[qIdx];
      if (cur && cur.type === 'option' && cur.idx === optIdx) delete next[qIdx];
      else next[qIdx] = { type: 'option', idx: optIdx };
      return next;
    });
  };

  const selectOther = (qIdx) => {
    if (frozen) return;
    setSkipped(prev => {
      const next = { ...prev };
      delete next[qIdx];
      return next;
    });
    setSelected(prev => ({
      ...prev,
      [qIdx]: { type: 'other', text: prev[qIdx]?.type === 'other' ? prev[qIdx].text : '' },
    }));
    setTimeout(() => otherInputRef.current?.focus(), 30);
  };

  const setOtherText = (qIdx, text) => {
    if (frozen) return;
    setSelected(prev => ({ ...prev, [qIdx]: { type: 'other', text } }));
  };

  const skipQuestion = (qIdx) => {
    if (frozen) return;
    setSkipped(prev => ({ ...prev, [qIdx]: true }));
    setSelected(prev => {
      const next = { ...prev };
      delete next[qIdx];
      return next;
    });
  };

  const unskipQuestion = (qIdx) => {
    if (frozen) return;
    setSkipped(prev => {
      const next = { ...prev };
      delete next[qIdx];
      return next;
    });
  };

  const isAnswered = (qi) => {
    if (skipped[qi]) return true; // skipped counts as "answered" for progress
    const s = selected[qi];
    if (!s) return false;
    if (s.type === 'option') return true;
    if (s.type === 'other') return s.text.trim().length > 0;
    return false;
  };

  const answeredCount = questions.filter((_, i) => isAnswered(i)).length;
  const hasAtLeastOne = Object.keys(selected).length > 0 || extraNotes.trim().length > 0;

  const submit = () => {
  if (!hasAtLeastOne || frozen || !onAnswer) return;
  const parts = questions.map((q, i) => {
    if (skipped[i]) return null;
    const s = selected[i];
    if (!s) return null;
    const val = s.type === 'option' ? q.options[s.idx] : s.text.trim();
    const qLabel = q.question.replace(/\?+\s*$/, '').trim();
    return `${qLabel}: ${val}`;
  }).filter(Boolean);
  const notes = extraNotes.trim();
  if (notes) parts.push(`Additional notes: ${notes}`);
  onAnswer(parts.join('  ·  '));
};

 return (
    <div style={{
      margin: '16px 0', borderRadius: 14, overflow: 'hidden',
      border: '1px solid #2a2a2a', background: '#111111',
      animation: 'vertexCodeIn .28s cubic-bezier(.2,.7,.3,1)',
      boxShadow: '0 14px 34px -16px rgba(0,0,0,.75)',
      opacity: frozen ? 0.55 : 1,
      pointerEvents: frozen ? 'none' : 'auto',
      transition: 'opacity .2s',
    }} data-vrtx-no-reply="">
      <div style={{
        padding: '14px 18px', background: '#161616', borderBottom: '1px solid #262626',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: '#1f1f1f', border: '1px solid #2f2f2f',
          }}>
            <HelpCircle size={13} color="#b8b8b8"/>
          </div>
          <span style={{
            fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace', color: '#d8d8d8',
            fontWeight: 700, letterSpacing: '.03em',
          }}>
            {frozen ? 'Clarifying · Answered' : 'A few quick questions'}
          </span>
        </div>
        {!frozen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {questions.map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: skipped[i] ? '#a3672a' : isAnswered(i) ? '#8b8bf0' : '#3a3a3a',
                transition: 'background .2s',
              }}/>
            ))}
            <span style={{ fontSize: 10.5, color: '#6a6a6a', marginLeft: 5, fontFamily: 'JetBrains Mono, monospace' }}>
              {answeredCount}/{questions.length}
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '18px 18px 16px' }}>
        {questions.map((q, qi) => {
          const sel = selected[qi];
          const otherActive = sel?.type === 'other';
          const isSkipped = !!skipped[qi];
          return (
          <div key={qi} style={{
            marginTop: qi === 0 ? 0 : 22,
            paddingTop: qi === 0 ? 0 : 18,
            borderTop: qi === 0 ? 'none' : '1px solid #1c1c1c',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11,
            }}>
              <div style={{
                fontSize: 14, color: isSkipped ? '#5a5a5a' : '#eaeaea',
                fontWeight: 600, lineHeight: 1.4,
                textDecoration: isSkipped ? 'line-through' : 'none',
              }}>
                {q.question}
              </div>
              {!frozen && (
                <button
                  onClick={() => isSkipped ? unskipQuestion(qi) : skipQuestion(qi)}
                  title={isSkipped ? 'Undo skip' : 'Skip this question'}
                  style={{
                    background: 'transparent', border: '1px solid ' + (isSkipped ? '#5a5a5a' : '#2a2a2a'),
                    borderRadius: 7, color: isSkipped ? '#9a9a9a' : '#5a5a5a',
                    cursor: 'pointer', padding: '4px 10px', fontSize: 10.5,
                    fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                    letterSpacing: '.03em', transition: 'all .15s',
                    flexShrink: 0, marginLeft: 12,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#5a5a5a'; e.currentTarget.style.color = '#c8c8c8'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isSkipped ? '#5a5a5a' : '#2a2a2a'; e.currentTarget.style.color = isSkipped ? '#9a9a9a' : '#5a5a5a'; }}
                >
                  {isSkipped ? 'Undo' : 'Skip'}
                </button>
              )}
            </div>
            {!isSkipped && (
              <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {q.options.map((opt, oi) => {
                const isSel = sel?.type === 'option' && sel.idx === oi;
                return (
                  <button key={oi}
                    onClick={() => toggle(qi, oi)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 15px', borderRadius: 9,
                      background: isSel ? '#eaeaea' : '#1a1a1a',
                      border: '1px solid ' + (isSel ? '#eaeaea' : '#2f2f2f'),
                      color: isSel ? '#0a0a0a' : '#dcdcdc',
                      fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                      cursor: 'pointer', transition: 'background .12s, border-color .12s, color .12s, transform .1s',
                    }}
                    onMouseEnter={e => { if (!isSel && !frozen) { e.currentTarget.style.borderColor = '#5a5a5a'; e.currentTarget.style.background = '#242424'; } }}
                    onMouseLeave={e => { if (!isSel && !frozen) { e.currentTarget.style.borderColor = '#2f2f2f'; e.currentTarget.style.background = '#1a1a1a'; } }}
                  >
                    {isSel && <Check size={11}/>}
                    {opt}
                  </button>
                );
              })}
              <button
                onClick={() => selectOther(qi)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 15px', borderRadius: 9,
                  background: otherActive ? '#2a2a2a' : 'transparent',
                  border: '1px dashed ' + (otherActive ? '#6a6a6a' : '#3a3a3a'),
                  color: otherActive ? '#e6e6e6' : '#7a7a7a',
                  fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                  cursor: 'pointer', transition: 'all .12s',
                }}
              >
                <Plus size={11}/> Other
              </button>
            </div>
            {otherActive && (
              <input
                ref={otherInputRef}
                type="text"
                value={sel.text || ''}
                onChange={e => setOtherText(qi, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); } }}
                placeholder="Type your own answer…"
                style={{
                  marginTop: 10, width: '100%', boxSizing: 'border-box',
                  background: '#0a0a0a', border: '1px solid #333333',
                  borderRadius: 8, padding: '9px 12px',
                  color: '#e6e6e6', fontSize: 12.5,
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                }}
              />
            )}
            </>
           )}
          </div>
          );
        })}
        {!frozen && (
          <>
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #1c1c1c' }}>
            <div style={{
              fontSize: 11, color: '#7a7a7a', fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700, letterSpacing: '.04em', marginBottom: 8,
            }}>
              Anything else?
            </div>
            <textarea
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="Extra details, constraints, or preferences not covered above (optional)…"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0a0a0a', border: '1px solid #2f2f2f',
                borderRadius: 9, padding: '10px 12px',
                color: '#e6e6e6', fontSize: 12.5,
                fontFamily: 'inherit', lineHeight: 1.5,
                resize: 'vertical', outline: 'none',
                minHeight: 46,
              }}
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <button onClick={submit} disabled={!hasAtLeastOne}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '13px 20px', borderRadius: 10,
                background: hasAtLeastOne ? '#eaeaea' : '#1a1a1a',
                border: '1px solid ' + (hasAtLeastOne ? '#eaeaea' : '#2f2f2f'),
                color: hasAtLeastOne ? '#0a0a0a' : '#555',
                fontSize: 14, fontWeight: 700,
                cursor: hasAtLeastOne ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                letterSpacing: '.02em',
                transition: 'background .15s, color .15s, border-color .15s',
              }}>
              <Sparkles size={16}/>
              {hasAtLeastOne ? 'Start Building' : 'Answer to continue'}
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
 *  FileTreePanel — left: folder/file tree, right: selected file's
 *  VertexCodeBlock. Used when a single message produces 2+ files with
 *  `// file:` markers. The "Download .zip" button uses a dynamic JSZip
 *  import (lazy-loaded on first click) and falls back to per-file
 *  downloads if the CDN is unreachable.
 * ──────────────────────────────────────────────────────────────────────── */
const FileTreePanel = ({ files, onOpenPanel, onSmartEdit, messageId, streaming }) => {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [activePath, setActivePath] = useState(() => files[0]?.path || '');
  const [collapsed, setCollapsed] = useState({});
  const [zipping, setZipping] = useState(false);

  // If the active file disappears from the list (e.g. during streaming
  // when the model rewrites the project), fall back to the first file.
  useEffect(() => {
    if (!files.find(f => f.path === activePath) && files[0]) {
      setActivePath(files[0].path);
      userPinnedRef.current = false; // list changed — allow auto-follow again
    }
  }, [files, activePath]);

  /* During streaming, auto-follow the file currently being written so the
     user sees the code appear in real time — BUT respect a manual click:
     once the user picks a file in this panel, we stop yanking them back to
     the streaming file. The pin resets when streaming stops, so the next
     stream starts fresh. This fixes the bug where clicking `index.html`
     while Vertex was writing `watch.html` immediately snapped back. */
  const userPinnedRef = useRef(false);
  useEffect(() => {
    if (!streaming) {
      // Stream ended — clear the pin so the next stream can auto-follow.
      userPinnedRef.current = false;
      return;
    }
    if (userPinnedRef.current) return; // user picked a file; don't override
    const streamingFile = files.find(f => f.streaming);
    if (streamingFile && streamingFile.path !== activePath) {
      setActivePath(streamingFile.path);
    }
  }, [files, streaming, activePath]);

  const handleFileClick = (path) => {
    userPinnedRef.current = true; // mark as manually selected
    setActivePath(path);
  };

  const activeFile = files.find(f => f.path === activePath) || files[0];

  const handleZip = () => {
    if (zipping || streaming) return;
    setZipping(true);
    try { downloadProjectAsZip(files); }
    finally { setTimeout(() => setZipping(false), 500); }
  };

  const renderNode = (node, depth = 0) => {
    const items = [];
    for (const folder of (node.folders || [])) {
      const key = folder.path;
      const isCollapsed = collapsed[key];
      items.push(
        <button key={`f-${key}`}
          onClick={() => setCollapsed(p => ({ ...p, [key]: !p[key] }))}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            padding: '5px 8px 5px ' + (8 + depth * 14) + 'px',
            background: 'transparent', border: 'none', color: '#c8c8c8',
            fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer', textAlign: 'left', borderRadius: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1a'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={11} style={{
            transform: isCollapsed ? 'none' : 'rotate(90deg)',
            transition: 'transform .12s', color: '#5a5a5a', flexShrink: 0,
          }}/>
          {isCollapsed
            ? <Folder size={12} color="#8a8a8a" style={{ flexShrink: 0 }}/>
            : <FolderOpen size={12} color="#8a8a8a" style={{ flexShrink: 0 }}/>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
        </button>
      );
      if (!isCollapsed) items.push(...renderNode(folder, depth + 1));
    }
    for (const file of node.files) {
      const isActive = activeFile && file.path === activeFile.path;
      const isStreaming = file.streaming === true;
      items.push(
        <button key={`file-${file.path}`}
          onClick={() => handleFileClick(file.path)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            padding: '5px 8px 5px ' + (8 + depth * 14 + 18) + 'px',
            background: isActive ? '#232323' : 'transparent',
            border: 'none', color: isActive ? '#f0f0f0' : '#b8b8b8',
            fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer', textAlign: 'left', borderRadius: 0,
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1a1a1a'; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <FileCode size={12} color={isActive ? '#e6e6e6' : '#7a7a7a'} style={{ flexShrink: 0 }}/>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>{file.name}</span>
          {isStreaming && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#10b981',
              flexShrink: 0, animation: 'vertexPulse 1.2s ease-in-out infinite',
              boxShadow: '0 0 6px rgba(16,185,129,.6)',
            }} title="Writing…"/>
          )}
        </button>
      );
    }
    return items;
  };

  return (
    <div style={{
      margin: '12px 0', borderRadius: 0, overflow: 'hidden',
      border: '1px solid #262626', background: '#0a0a0a',
      animation: 'vertexCodeIn .28s cubic-bezier(.2,.7,.3,1)',
      boxShadow: '0 10px 28px -14px rgba(0,0,0,.7)',
    }} data-vrtx-no-reply="">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: '#111111', borderBottom: '1px solid #262626',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FolderTree size={13} color="#8a8a8a" style={{ flexShrink: 0 }}/>
          <span style={{
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8c8c8',
            letterSpacing: '.06em', fontWeight: 700, textTransform: 'uppercase',
          }}>
            Project · {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {!streaming && files.length > 1 && (
          <button onClick={handleZip} disabled={zipping}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: '1px solid #333333',
              borderRadius: 0, padding: '4px 10px',
              color: '#dcdcdc', fontSize: 11, cursor: zipping ? 'wait' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
              opacity: zipping ? 0.7 : 1,
            }}>
            {zipping
              ? <Loader size={11} style={{ animation: 'vertexSpin 1s linear infinite' }}/>
              : <FileArchive size={11}/>}
            {zipping ? 'Zipping…' : 'Download .zip'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', minHeight: 240, maxHeight: 520 }}>
        {files.length > 1 && (
          <div style={{
            width: 220, flexShrink: 0, borderRight: '1px solid #1a1a1a',
            background: '#0c0c0c', overflowY: 'auto', padding: '6px 0',
          }}>
            {renderNode(tree)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {activeFile && (
            <VertexCodeBlock
              lang={activeFile.lang}
              codeText={activeFile.code}
              filePath={activeFile.path}
              onOpenPanel={(payload) => onOpenPanel({
                ...payload,
                filePath: activeFile.path,
                projectFiles: files,
              })}
              onSmartEdit={onSmartEdit}
              blockId={`${messageId || 'msg'}-tree-${activeFile.path.replace(/[^a-z0-9]/gi, '-')}`}
              embedded
            />
          )}
        </div>
      </div>
    </div>
  );
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

/* Simple code block for user messages — just a <pre> with a copy button.
   No header, no Open/Run/Save buttons. Used for pasted code and OCR-wrapped
   image text the user sent. */
const UserCodeBlock = ({ codeText }) => {
  const [copied, setCopied] = useState(false);
  const copyCode = () => { navigator.clipboard.writeText(codeText); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: 0, border: '1px solid #262626', background: '#0a0a0a' }}>
      <pre style={{ margin: 0, padding: '12px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, lineHeight: 1.7, color: '#dcdcdc', whiteSpace: 'pre', overflowX: 'auto', background: 'transparent' }}>{codeText}</pre>
      <button onClick={copyCode} title="Copy" data-vrtx-no-reply="" style={{ position: 'absolute', top: 6, right: 8, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 0, color: copied ? '#e6e6e6' : '#6a6a6a', cursor: 'pointer', padding: '3px 8px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
        {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

const VertexCodeBlock = ({ lang, codeText, onOpenPanel, onSmartEdit, blockId, filePath, embedded }) => {
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
  const downloadName = filePath ? filePath.split('/').pop() : `snippet.${extForLang(lang)}`;
  // "Open" panel button only makes sense for substantial code the user can
  // run or edit meaningfully — NOT for 1-3 line shell commands like `npm run
  // dev`, `pip install x`, `mkdir foo`, etc. Skip it for short blocks and
  // for shell/bash languages regardless of length (those are almost always
  // commands). It DOES show on big code blocks inside FileTreePanel
  // (embedded) — the user needs to run/edit those just as much as standalone
  // blocks.
  const langLower = (lang || '').toLowerCase();
  const isShellLang = ['sh', 'bash', 'shell', 'zsh', 'powershell', 'ps1', 'cmd', 'bat'].includes(langLower);
  const canOpenInPanel = !isShellLang && lines.length >= 6;

  return (
    <div style={{
      margin: embedded ? 0 : '12px 0', borderRadius: 0, overflow: 'hidden',
      border: embedded ? 'none' : '1px solid #262626', background: '#0a0a0a',
      animation: embedded ? 'none' : 'vertexCodeIn .28s cubic-bezier(.2,.7,.3,1)',
      boxShadow: embedded ? 'none' : '0 10px 28px -14px rgba(0,0,0,.7)',
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
          {filePath ? (
            <>
              <span style={{ color: '#3a3a3a', flexShrink: 0 }}>·</span>
              <span title={filePath} style={{
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#9a9a9a',
                fontWeight: 500, textTransform: 'none', letterSpacing: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360,
              }}>
                {filePath}
              </span>
            </>
          ) : null}
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
                borderRadius: 0, padding: '4px 10px', color: editing ? '#e6e6e6' : '#9a9a9a', fontSize: 11, cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
              }}
            >
              <Edit3 size={11} /> Edit
            </button>
          )}
          <button
            onClick={() => downloadTextAsFile(codeText, downloadName)}
            title="Save this file"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #333333',
              borderRadius: 0, padding: '4px 10px', color: '#9a9a9a', fontSize: 11, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
            }}
          >
            <Download size={11} /> Save
          </button>
          {canOpenInPanel && (
            <button
              onClick={() => onOpenPanel({ lang, code: codeText })}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: '#1c1c1c', border: '1px solid #333333',
                borderRadius: 0, padding: '4px 10px', color: '#dcdcdc', fontSize: 11, cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, transition: 'all .15s',
              }}
            >
              <Terminal size={11} /> Open
            </button>
          )}
          <button
            onClick={copy}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #333333',
              borderRadius: 0, padding: '4px 10px', color: copied ? '#e6e6e6' : '#9a9a9a', fontSize: 11,
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
              borderRadius: 0, padding: '8px 10px', color: '#dcdcdc', fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, lineHeight: 1.55, resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 7 }}>
            <button
              onClick={() => { setEditing(false); setFeedback(''); }}
              style={{
                padding: '5px 11px', borderRadius: 0, border: '1px solid #333', background: 'transparent',
                color: '#9a9a9a', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              }}
            >Cancel</button>
            <button
              onClick={submitEdit}
              disabled={!feedback.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 0,
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
          padding: '5px 11px', borderRadius: 0,
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
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 0,
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
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 0,
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
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 0,
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
          <div style={{ width: 40, height: 2, borderRadius: 0, background: '#3a3a3a', transition: 'background .12s' }} />
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
          borderRadius: 0, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          animation: 'vertexScaleIn .15s ease',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>{dialog.title}</div>
        <div style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{dialog.message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 0, background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#dcdcdc', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={() => { const fn = dialog.onConfirm; onClose(); fn?.(); }}
            style={{
              padding: '8px 16px', borderRadius: 0, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
          borderRadius: 0, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
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

// Minimum size for a code block to count as a real, reusable "artifact" —
// small inline examples (a single curl command, a 3-line import, a short
// config snippet) aren't worth saving as a downloadable file and just
// clutter the Artifacts panel. Only real, substantial code blocks qualify.
const MIN_ARTIFACT_LINES = 15;
const MIN_ARTIFACT_CHARS = 300;

const extractCodeBlocksFromMessages = (messages) => {
  const out = [];
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  for (const m of messages) {
    if (m.role !== 'assistant' && m.role !== 'model') continue;
    // Collect every fenced block in this message, splitting out the ones
    // that carry a "// file:" path marker (project files) from plain
    // snippets. 2+ file-bearing blocks collapse into a single "project"
    // entry so the artifacts panel doesn't show 5 separate snippet-N
    // rows for one multi-file reply.
    const allBlocks = [];
    let match;
    fence.lastIndex = 0;
    while ((match = fence.exec(m.text || ''))) {
      const lang = (match[1] || '').trim();
      const rawCode = match[2].replace(/\n$/, '');
      const trimmed = rawCode.trim();
      if (!trimmed) continue;
      const extracted = extractFilePath(rawCode, lang);
      allBlocks.push({
        lang,
        code: extracted ? extracted.code : rawCode,
        filePath: extracted ? extracted.path : null,
      });
    }
    if (allBlocks.length === 0) continue;

    const fileBlocks = allBlocks.filter(b => b.filePath);
    const plainBlocks = allBlocks.filter(b => !b.filePath);

    if (fileBlocks.length >= 1) {
      // Tagged-file project: one expandable entry for the whole project
      // (works for 1 file too — user gets the IDE panel + zip download).
      out.push({
        type: 'project',
        id: `${m.id}-proj`,
        ts: m.ts,
        files: fileBlocks.map(b => ({ path: b.filePath, lang: b.lang, code: b.code })),
      });
      // Any non-file snippets in the same message still get their own rows
      for (const b of plainBlocks) {
        const lineCount = b.code.trim().split('\n').length;
        if (lineCount < MIN_ARTIFACT_LINES && b.code.trim().length < MIN_ARTIFACT_CHARS) continue;
        out.push({ type: 'file', id: `${m.id}-${out.length}`, lang: b.lang, code: b.code, ts: m.ts });
      }
    } else {
      // No tagged files — flat list, same as before
      for (const b of allBlocks) {
        const trimmed = b.code.trim();
        const lineCount = trimmed.split('\n').length;
        if (lineCount < MIN_ARTIFACT_LINES && trimmed.length < MIN_ARTIFACT_CHARS) continue;
        out.push({
          type: 'file',
          id: `${m.id}-${out.length}`,
          lang: b.lang,
          code: b.code,
          ts: m.ts,
          filePath: b.filePath,
        });
      }
    }
  }
  return out;
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
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      userUidRef.current = u?.uid || '';
      if (u) {
        loadChats(u.uid);
        // NOTE: We deliberately do NOT auto-resume the last chat here.
        // Earlier code tried to restore `chatId` from localStorage on
        // refresh, but never actually loaded the matching messages — so
        // the user saw what looked like a blank new chat while `chatId`
        // still pointed at the previous conversation. The next sent
        // message then `setDoc`-overwrote the old chat in Firestore,
        // destroying it. Every page load now starts with a fresh chatId;
        // users who want their old conversation back can click it in the
        // sidebar.
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
  const [searching, setSearching] = useState(false);
  // Always start with a brand-new chatId on mount. We deliberately do
  // NOT restore the previous chatId from localStorage — doing so caused
  // a destructive overwrite bug (see the comment in the auth effect
  // above). A refresh / close-reopen now lands the user on a clean,
  // empty chat; the previous conversation is still listed in the sidebar
  // and can be reopened explicitly by clicking it.
  const [chatId, setChatId] = useState(() => Date.now().toString());
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
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
      message: 'Vertex is your dedicated coding assistant.\n\n• Paste an error to debug it\n• Ask for a function or a refactor\n• Attach files, folders, images, or documents with the + button\n• ⌘K starts a new chat · Esc closes panels\n\nResume:       click any chat in the left sidebar to reopen it\nReply:        highlight any prose in chat → click the Reply chip → a "Replying to" banner shows above the input (does NOT trigger inside code blocks)\nSmart Edit:   click Edit on any code block → describe what\'s wrong → Vertex returns only the fix (saves tokens)\nContinue:     shows automatically when a reply got cut off (unclosed code block)\nRegenerate:   on every Vertex reply — re-ask the same question for a fresh take\nCopy:         on every Vertex reply\nEdit:         on your own message, click the pencil to tweak & resend — original stays in chat until you send, so backspacing the input never loses it\nScroll:       scroll up freely while Vertex streams — auto-scroll only kicks in when you\'re already at the bottom\nSplit panel:  drag the divider between code and output to resize — works with mouse and touch',
    });
  }, []);

  /* ── Right-side code panel state ── */
  const [panelCode, setPanelCode] = useState(null);
  const [panelOutput, setPanelOutput] = useState(null);
  const [panelRunning, setPanelRunning] = useState(false);
  const [panelHasError, setPanelHasError] = useState(false);
  const [panelBootMsg, setPanelBootMsg] = useState('');

  const openCodePanel = useCallback(({ lang, code, filePath, projectFiles }) => {
    setPanelCode({ lang, code, filePath, projectFiles: projectFiles || null });
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

  /* Bundles a multi-file project into a single runnable blob.
     - HTML entry: inlines all CSS files as <style> and all JS files as
       <script> tags so the iframe preview works without a server.
     - JS/TS entry: concatenates all JS/TS files with comment separators
       so imports resolve to the concatenated code (works for simple cases).
     - Python entry: concatenates all .py files so multi-module scripts run.
     - Other: just returns the selected file's code. */
  const bundleProjectForRun = useCallback((entryFile, projectFiles) => {
    if (!projectFiles || projectFiles.length <= 1) return entryFile.code;
    const entryLang = (entryFile.lang || '').toLowerCase();
    const entryPath = entryFile.filePath || entryFile.path || '';
    const entryExt = entryPath.split('.').pop().toLowerCase();

    // HTML entry — inline CSS + JS
    if (entryLang === 'html' || entryExt === 'html' || entryLang === 'htm' || entryExt === 'htm') {
      let html = entryFile.code;
      const cssFiles = projectFiles.filter(f =>
        f !== entryFile && /\.(css|scss|less)$/i.test(f.path || '')
      );
      const jsFiles = projectFiles.filter(f =>
        f !== entryFile && /\.(js|jsx|mjs|ts|tsx)$/i.test(f.path || '')
      );
      // Inline CSS before </head>
      if (cssFiles.length) {
        const styles = cssFiles.map(f => `<style data-file="${f.path}">\n${f.code}\n</style>`).join('\n');
        if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${styles}\n</head>`);
        else html = styles + '\n' + html;
      }
      // Inline JS before </body>
      if (jsFiles.length) {
        const scripts = jsFiles.map(f => `<script data-file="${f.path}">\n${f.code}\n</script>`).join('\n');
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${scripts}\n</body>`);
        else html = html + '\n' + scripts;
      }
      return html;
    }

    // JS/TS entry — concatenate all JS/TS files
    if (['js', 'jsx', 'mjs', 'ts', 'tsx', 'javascript', 'typescript'].includes(entryLang) ||
        ['js', 'jsx', 'mjs', 'ts', 'tsx'].includes(entryExt)) {
      const jsFiles = projectFiles.filter(f => /\.(js|jsx|mjs|ts|tsx)$/i.test(f.path || ''));
      // Sort so the entry file is last (its code runs after dependencies)
      const sorted = jsFiles.sort((a, b) => {
        if (a === entryFile) return 1;
        if (b === entryFile) return -1;
        return 0;
      });
      return sorted.map(f => `// === ${f.path} ===\n${f.code}`).join('\n\n');
    }

    // Python entry — concatenate all .py files
    if (entryLang === 'python' || entryExt === 'py') {
      const pyFiles = projectFiles.filter(f => /\.py$/i.test(f.path || ''));
      const sorted = pyFiles.sort((a, b) => {
        if (a === entryFile) return 1;
        if (b === entryFile) return -1;
        return 0;
      });
      return sorted.map(f => `# === ${f.path} ===\n${f.code}`).join('\n\n');
    }

    return entryFile.code;
  }, []);

  const runPanelCode = useCallback(async () => {
    if (!panelCode || panelRunning || !safeExecuteCodeLocally) return;
    setPanelRunning(true);
    setPanelOutput(null);
    setPanelHasError(false);
    setPanelBootMsg('');
    try {
      // If the panel was opened from a multi-file project, bundle all files
      // together so imports/dependencies resolve. For HTML, this inlines
      // CSS + JS. For JS/Python, it concatenates the files.
      const runCode = panelCode.projectFiles
        ? bundleProjectForRun(panelCode, panelCode.projectFiles)
        : panelCode.code;
      const result = await safeExecuteCodeLocally(panelCode.lang, runCode, (m) => setPanelBootMsg(m));
      setPanelHasError(!!result.isError);
      setPanelOutput(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2));
    } catch (e) {
      setPanelHasError(true);
      setPanelOutput('Error: ' + (e?.message || String(e)));
    } finally {
      setPanelRunning(false);
      setPanelBootMsg('');
    }
  }, [panelCode, panelRunning, safeExecuteCodeLocally, bundleProjectForRun]);

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
  const [incognito, setIncognito] = useState(
  () => new URLSearchParams(window.location.search).get('incognito') === 'true'
); 


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

 const describeImage = async (dataUrl, name, mode = 'describe') => {
  const prompt = mode === 'ocr'
    ? `Extract ALL text from this image (${name}). Return only the extracted text, preserving structure. If there's no text, return "[No text detected]".`
    : `You're looking at an image attached to a coding chat (${name}). Describe it precisely — if it's a code screenshot, transcribe the code exactly; if it's an error message, transcribe the error text exactly; if it's a UI/design mockup, describe layout, colors and elements; if it's a diagram, describe its structure. This description is the ONLY way the assistant can "see" the image, so be thorough.`;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: await getAuthHeader(),
      body: JSON.stringify({ action: 'vision', image: dataUrl, prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.description || data.text || null;
  } catch (e) {
    console.error('Vision request failed:', e);
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
          action: 'title',
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
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.title || '';
      const clean = raw.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/, '').replace(/^Title:\s*/i, '').slice(0, 50);
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

  // Load Playfair Display for the incognito empty-state heading
  useEffect(() => {
    if (document.querySelector('link[href*="Playfair+Display"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital@1&display=swap';
    document.head.appendChild(link);
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
    if (!uid || incognito) { setSavedChats([]); return; } 
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
  }, [db, incognito]);

  useEffect(() => {
  if (incognito) {
    setSavedChats([]);
  } else if (userUidRef.current) {
    loadChats(userUidRef.current);
  }
}, [incognito, loadChats]);

  const persistChat = useCallback(async (msgs, overrideTitle) => {
    if (!userUidRef.current) return;
    if (incognito) return;
    try {
      let title = overrideTitle;
      if (!title) {
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) {
          title = firstUser.text.replace(/```[\s\S]*?```/g, '').replace(/[#*`]/g, '').trim().slice(0, 48);
          if (!title) title = 'New Chat';
        } else {
          title = 'New Chat';
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
  }, [db, style, loadChats, incognito]);  

  const newChat = useCallback(() => {
    abortRef.current = true;
    setStreaming(false); setThinking(false); setStreamText('');
    const newId = Date.now().toString();
    setChatId(newId); chatIdRef.current = newId;
    setMessages([]); convHistoryRef.current = [];
    setInput('');
    setAttachments([]);
    setReplyQuote(null);
    // No localStorage cleanup needed — we no longer persist the active
    // chat id anywhere (see the auth effect comment for why).
    closeCodePanel();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [closeCodePanel]);

  useEffect(() => {
  const handler = (e) => {
    const next = e.detail.incognito;
    setIncognito(next);
    newChat();
    if (next) setSavedChats([]);
    else if (userUidRef.current) loadChats(userUidRef.current);
  };
  window.addEventListener('vortis-incognito-toggle', handler);
  return () => window.removeEventListener('vortis-incognito-toggle', handler);
}, [newChat, loadChats]);

 const toggleIncognito = useCallback(() => {
  setIncognito(v => {
    const next = !v;
    if (next) {
      newChat();
      setSavedChats([]);              // ← hide history immediately on entering incognito
    } else if (userUidRef.current) {
      loadChats(userUidRef.current);  // ← restore real history on exiting incognito
    }

    const params = new URLSearchParams(window.location.search);
    if (next) params.set('incognito', 'true');
    else params.delete('incognito');
    window.history.replaceState(
      {}, '',
      window.location.pathname + (params.toString() ? '?' + params.toString() : '')
    );

    window.dispatchEvent(new CustomEvent('vortis-incognito-toggle', { detail: { incognito: next } }));
    return next;
  });
}, [newChat, loadChats]);

  const loadChat = useCallback(async (id) => {
    // If a stream is in progress, abort it immediately so the view switches
    // to the selected chat right away — without this, the streaming preview
    // keeps rendering the new chat's reply over whatever the user just
    // clicked, making it look like the click was ignored.
    if (abortRef.current !== null && typeof abortRef.current === 'boolean') {
      abortRef.current = true;
    }
    setStreaming(false);
    setThinking(false);
    setSearching(false);
    setStreamText('');
    setReplyQuote(null);
    setEditingMsgId(null);

    if (!userUidRef.current) return;
    try {
      const snap = await getDoc(doc(db, 'users', userUidRef.current, 'chats', id));
      if (!snap.exists()) {
        // Chat was deleted (maybe from another session). Reset to a fresh
        // id so the empty state shows correctly instead of leaving chatId
        // pointing at a ghost.
        const freshId = Date.now().toString();
        setChatId(freshId); chatIdRef.current = freshId;
        setMessages([]);
        convHistoryRef.current = [];
        return;
      }

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
  let backendMsg = null;
  try {
    const errBody = await res.json();
    backendMsg = errBody?.error || null;
  } catch (_) {}

  if (res.status === 429) {
    errMsg = backendMsg?.toLowerCase().includes('daily')
      ? backendMsg + ' (resets tomorrow, or upgrade your plan for more messages.)'
      : "You're sending messages too quickly — please slow down a few seconds and try again.";
  } else if (res.status === 401 || res.status === 403) {
    errMsg = 'Authentication error — try refreshing the page.';
  } else if (res.status === 503) {
    errMsg = 'The AI is temporarily unavailable — please try again shortly.';
  } else if (backendMsg) {
    errMsg = backendMsg;
  }
  return { text: '', errorMsg: errMsg, status: res.status, isNetwork: false };
}

      setThinking(false);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      let full = '';

      // SMOOTH DRIP RENDERER — solves the "sometimes fast, sometimes slow"
      // streaming problem. SSE tokens arrive in bursts (10 tokens in 5ms,
      // then nothing for 200ms). The drip renderer decouples DISPLAY SPEED
      // from ARRIVAL SPEED:
      //   - `full` accumulates everything the server has sent.
      //   - `shown` is what's actually rendered to the DOM.
      //   - Every ~33ms (30fps), we move a slice from `full` to `shown`.
      //   - If we're falling far behind (big code block just landed), we
      //     take a much bigger slice so the display catches up fast.
      //   - On stream end, forceFlush() renders everything remaining.
      //   - A watchdog re-schedules the drip every 500ms if it somehow
      //     stalls (defensive — shouldn't happen but cheap insurance).
      let shown = '';
      let dripTimer = null;
      let watchdogTimer = null;
      const DRIP_MS = 33;
      const DRIP_CHARS = 60;
      const dripStep = () => {
        dripTimer = null;
        if (shown.length >= full.length) return;
        // Move a slice from `full` to `shown`. Take a bigger slice if
        // we're falling far behind (e.g. a huge code block just landed)
        // so the user doesn't wait forever for the display to catch up.
        const behind = full.length - shown.length;
        // Acceleration: if behind by 200 chars, take 25; if behind by 2000,
        // take 250; if behind by 10000, take 1250. Capped at behind.
        const take = Math.min(behind, Math.max(DRIP_CHARS, Math.ceil(behind / 8)));
        shown = full.slice(0, shown.length + take);
        setStreamText(shown);
        if (shown.length < full.length) {
          dripTimer = setTimeout(dripStep, DRIP_MS);
        }
      };
      const scheduleDrip = () => {
        if (dripTimer !== null) return; // already scheduled
        dripTimer = setTimeout(dripStep, DRIP_MS);
      };
      // Watchdog: every 500ms, if there's unflushed text and no drip
      // scheduled, kick one off. This handles edge cases where a token
      // arrived but scheduleDrip's no-op guard prevented a re-schedule.
      const watchdog = () => {
        watchdogTimer = null;
        if (shown.length < full.length && dripTimer === null) {
          dripTimer = setTimeout(dripStep, 0);
        }
        if (shown.length < full.length) {
          watchdogTimer = setTimeout(watchdog, 500);
        }
      };
      watchdogTimer = setTimeout(watchdog, 500);
      const forceFlush = () => {
        if (dripTimer !== null) { clearTimeout(dripTimer); dripTimer = null; }
        if (watchdogTimer !== null) { clearTimeout(watchdogTimer); watchdogTimer = null; }
        shown = full;
        setStreamText(shown);
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
            if (p.content) { full += p.content; scheduleDrip(); }
          } catch (_) {}
        }
      }

      if (buffer.startsWith('data: ')) {
        const raw = buffer.slice(6).trim();
        if (raw && raw !== '[DONE]') {
          try {
            const p = JSON.parse(raw);
            if (p.content) { full += p.content; scheduleDrip(); }
          } catch (_) {}
        }
      }

      // Force-flush any remaining buffered text so the full reply is on
      // screen before we hand off to the persisted message.
      forceFlush();

      return { text: full, errorMsg: null, status: res.status, isNetwork: false };
    } catch (e) {
      return { text: '', errorMsg: `Network error: ${e?.message || 'unknown'}`, status: null, isNetwork: true };
    }
  }, []);

  /* ── Send message + stream response ── */
  const lastSendRef = useRef('');
  const send = useCallback(async (overrideText, overrideMessages = null, skipSearch = false, compact = false) => {
    const rawText = (overrideText ?? input).trim();
    const pendingAttachments = overrideMessages ? [] : [...attachments];

    let text = rawText;
    if (pendingAttachments.length > 0) {
      const blocks = [];
      for (const att of pendingAttachments) {
        if (att.type === 'image') {
          const mode = ocrMode ? 'ocr' : 'describe';
          const visionText = await describeImage(att.content, att.name, mode);
          if (visionText && visionText !== '[No text detected]') {
            const label = ocrMode ? 'OCR extracted text' : 'Image description';
            blocks.push(`[Image: ${att.name} — ${label}:]\n\`\`\`\n${visionText}\n\`\`\``);
          } else {
            blocks.push(`[Attached image: ${att.name} — could not be analyzed]`);
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
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now(), _compact: compact || false };
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

    const willSearch = !skipSearch && needsCodeWebSearch(text);
    if (willSearch) {
      setThinking(false);
      setSearching(true);
    }

    const fullPrompt = sys + '\n\n=== USER REQUEST ===\n' + text;
    let result = await fetchAssistantReply(fullPrompt, historyForBackend);
    if (willSearch) { setSearching(false); setThinking(true); }

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
          "New Chat";

        await persistChat(finalMsgs, title);
      }, 50);
    }
    setStreaming(false);
    setThinking(false);
    setStreamText('');
  }, [input, messages, streaming, style, persistChat, attachments, ocrMode, fetchAssistantReply, replyQuote, editingMsgId]);

const [frozenClarifyIds, setFrozenClarifyIds] = useState(() => new Set());
const handleClarifyAnswer = useCallback((messageId, answer) => {
  setFrozenClarifyIds(prev => {
    const next = new Set(prev);
    next.add(messageId);
    return next;
  });
  setTimeout(() => send(answer, null, true, true), 30);
}, [send]);

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
    send(editPrompt, null, true, true);
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
    const name = block.filePath
      ? block.filePath.split('/').pop()
      : `vertex-snippet-${index + 1}.${extForLang(block.lang)}`;
    downloadTextAsFile(block.code, name);
  }, []);

  const downloadAllCodeBlocks = useCallback(() => {
    codeBlocks.forEach((b, i) => setTimeout(() => downloadCodeBlock(b, i), i * 120));
  }, [codeBlocks, downloadCodeBlock]);

  /* Markdown component factory — built once per (messageId, onSmartEdit)
     tuple so each message bubble gets its own code-block instances that
     know which message they belong to (for Smart Edit). The streaming
     preview calls this with onSmartEdit=null since you can't edit code
     that's still being streamed. */
  const makeMdComponents = useCallback(({ onSmartEdit, messageId, isUserMessage }) => ({
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
    blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid #3a3a3a', margin: '8px 0', padding: '4px 12px', color: '#9a9a9a', background: '#141414', borderRadius: 0 }}>{children}</blockquote>,
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid #232323', margin: '12px 0' }} />,
    img: ({src, alt}) => (
      <img src={src} alt={alt || ''} loading="lazy" style={{
        maxWidth: '100%', borderRadius: 6, margin: '8px 0',
        border: '1px solid #232323',
      }} onError={(e) => { e.currentTarget.style.display = 'none'; }}/>
    ),
    table: ({children}) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>{children}</table></div>,
    thead: ({children}) => <thead style={{ background: '#141414' }}>{children}</thead>,
    th: ({children}) => <th style={{ padding: '6px 10px', border: '1px solid #232323', textAlign: 'left', color: '#e6e6e6', fontWeight: 600 }}>{children}</th>,
    td: ({children}) => <td style={{ padding: '6px 10px', border: '1px solid #232323', color: '#b8b8b8' }}>{children}</td>,
    code: ({ className, children }) => {
  const rawCodeText = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const codeLang = match ? match[1] : '';
  const codeLines = rawCodeText.split('\n');

  // No language + no newline = inline code (e.g. `nvidia/nemotron-3-ultra`)
  const isInline = !className && !rawCodeText.includes('\n');

  if (isInline) {
    return (
      <code style={{ background: '#000000', color: '#e6e6e6', padding: '1px 6px', borderRadius: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, border: '1px solid #2a2a2a' }}>
        {children}
      </code>
    );
  }

  // ── User-message code blocks: simple <pre> with a tiny copy button ──
  // No VertexCodeBlock header, no Open/Run/Save buttons. This covers
  // pasted code AND OCR-wrapped image text the user sent.
  if (isUserMessage) {
    return <UserCodeBlock codeText={rawCodeText} />;
  }

  // ── Short code blocks (1-3 lines) in assistant replies: compact block ──
  // Things like `npm run dev`, `pip install x`, `mkdir foo` — no need for the
  // full VertexCodeBlock header with language badge, line count, file path, etc.
  if (codeLines.length <= 3 && rawCodeText.length < 120) {
    return (
      <code style={{ background: '#000000', color: '#e6e6e6', padding: '3px 8px', borderRadius: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, border: '1px solid #2a2a2a', display: 'inline-block', lineHeight: 1.6, whiteSpace: 'pre' }}>
        {children}
      </code>
    );
  }

  // Single-file case: pull a `// file: path/to/x` first-line marker out so
  // the VertexCodeBlock header can show the path. Multi-file groups are
  // handled at the MessageContent level (stripped before reaching here).
  const extracted = extractFilePath(rawCodeText, codeLang);
  const codeText = extracted ? extracted.code : rawCodeText;
  const filePath = extracted ? extracted.path : null;

  const panel = openCodePanel;
  const smartEdit = onSmartEdit;

  const bid = `${messageId || 'msg'}-${filePath || (codeLang || 'x')}-${codeText.length}-${codeText.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  return <VertexCodeBlock lang={codeLang} codeText={codeText} filePath={filePath} onOpenPanel={panel} onSmartEdit={smartEdit} blockId={bid} />;
  }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#e6e6e6', border: '1px solid #e6e6e6'
            }}>
              <Terminal size={17} color="#0a0a0a"/>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#f0f0f0', letterSpacing: '-.015em', lineHeight: 1 }}>Vertex</div>
          </div>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar"
            style={{ background: 'transparent', border: 'none', color: '#8a8a8a', cursor: 'pointer', padding: 6, borderRadius: 0, display: 'flex' }}>
            {sidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}
          </button>
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
                color: showArtifacts ? '#e6e6e6' : '#c8c8c8', fontSize: 12, borderRadius: 0,
                padding: '5px 10px', cursor: 'pointer'
              }}
            >
              <Layers size={12}/> Artifacts{(codeBlocks.length + userArtifacts.length) > 0 ? ` (${codeBlocks.length + userArtifacts.length})` : ''}
            </button>

            {showArtifacts && (
              <div style={{
                position: 'absolute', top: 42, right: 0, zIndex: 100, width: 310,
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 0,
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
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 0,
                          background: '#1a1a1a', border: '1px solid #262626',
                        }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 0, color: '#c8c8c8', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          <Download size={12}/>
                        </button>
                        <button onClick={() => removeUserArtifact(a.id)} title="Remove"
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 0, color: '#6a6a6a', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          <X size={12}/>
                        </button>
                      </div>
                    ))}
                    {codeBlocks.map((b, i) => {
                      const isProject = b.type === 'project';
                      const label = isProject
                        ? `project · ${b.files.length} files`
                        : (b.filePath ? b.filePath.split('/').pop() : `snippet-${i + 1}.${extForLang(b.lang)}`);
                      const sub = isProject
                        ? `${b.files.reduce((n, f) => n + f.code.split('\n').length, 0)} lines · ${b.files.length} files`
                        : `${b.code.split('\n').length} lines · AI-written`;
                      return (
                      <div key={b.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 0,
                          background: '#1a1a1a', border: '1px solid #262626',
                        }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#000', border: '1px solid #2a2a2a',
                        }}>
                          {isProject
                            ? <FolderTree size={12} color="#9a9a9a"/>
                            : <FileCode size={12} color="#9a9a9a"/>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#dcdcdc', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 10, color: '#6a6a6a' }}>{sub}</div>
                        </div>
                        <button
                          onClick={() => isProject ? downloadProjectAsZip(b.files) : downloadCodeBlock(b, i)}
                          title={isProject ? 'Save project as .zip' : 'Save this file'}
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: 0, color: '#c8c8c8', cursor: 'pointer', padding: 5, display: 'flex' }}>
                          {isProject ? <FileArchive size={12}/> : <Download size={12}/>}
                        </button>
                      </div>
                      );
                    })}
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
              fontSize: 12, borderRadius: 0, padding: '5px 10px',
              cursor: messages.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={12}/> Export
          </button>


          <button
            onClick={toggleIncognito}
            title={incognito ? 'Exit incognito' : "Incognito mode — don't save this chat"}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: incognito ? '#fff' : '#141414',
              border: '1px solid ' + (incognito ? '#fff' : '#2a2a2a'),
              color: incognito ? '#0a0a0a' : '#c8c8c8',
              fontSize: 12, borderRadius: 0, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9v8l-2 2v1h18v-1l-2-2V9c0-3.87-3.13-7-7-7z" fill="currentColor"/>
              <circle cx="9" cy="10" r="1.5" fill={incognito ? '#fff' : '#0a0a0a'}/>
              <circle cx="15" cy="10" r="1.5" fill={incognito ? '#fff' : '#0a0a0a'}/>
            </svg>
            Incognito
          </button>

          {/* Settings — opens a popover with code style + other options */}
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(v => !v)}
              title="Settings"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: showSettings ? '#1c1c1c' : '#141414',
                border: '1px solid ' + (showSettings ? '#3a3a3a' : '#2a2a2a'),
                color: showSettings ? '#e6e6e6' : '#c8c8c8', fontSize: 12, borderRadius: 0,
                padding: '5px 10px', cursor: 'pointer'
              }}
            >
              <Cog size={12}/> Settings
            </button>

            {showSettings && (
              <div style={{
                position: 'absolute', top: 42, right: 0, zIndex: 100, width: 288,
                background: '#131313', border: '1px solid #262626', borderRadius: 0,
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
                          width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 0, cursor: 'pointer',
                          background: active ? 'rgba(230,230,230,.08)' : 'transparent',
                          border: '1px solid ' + (active ? '#3a3a3a' : '#1e1e1e'),
                          display: 'flex', alignItems: 'flex-start', gap: 9, transition: 'all .12s'
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#191919'; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 0, flexShrink: 0, marginTop: 1, display: 'flex',
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
                    padding: '9px 10px', borderRadius: 0, cursor: 'pointer',
                    background: 'transparent', border: '1px solid #1e1e1e', marginBottom: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#191919'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e', border: '1px solid #2a2a2a' }}>
                      <Scan size={12} color="#8a8a8a"/>
                    </div>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#dcdcdc' }}>OCR mode</span>
                      <span style={{ fontSize: 10.5, color: '#6a6a6a' }}>Extract text from images on send</span>
                    </span>
                  </span>
                  <span style={{
                    position: 'relative', width: 32, height: 18, borderRadius: 0, flexShrink: 0,
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
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#141414', border: '1px solid #2a2a2a', color: '#c8c8c8', fontSize: 12, borderRadius: 0, padding: '6px 11px', cursor: 'pointer' }}>
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
                  padding: '9px 12px', borderRadius: 0, cursor: 'pointer',
                  background: '#e6e6e6',
                  border: '1px solid #e6e6e6', color: '#0a0a0a', fontSize: 13, fontWeight: 600
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Plus size={14}/> New Chat</span>
                <span style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono', color: '#5a5a5a', background: 'rgba(10,10,10,.08)',
                  border: '1px solid rgba(10,10,10,.15)', borderRadius: 0, padding: '1px 5px'
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
                    background: '#141414', border: '1px solid #262626', borderRadius: 0,
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
                  {incognito ? (
                 <div>No history in incognito mode.</div>
               ) : (
                <>
                <div>{search ? 'No matches found.' : 'No saved code chats yet.'}</div>
             <div style={{ marginTop: 4, fontSize: 10.5 }}>Start a conversation to see it here.</div>
               </>
           )}
         </div>
              ) : (
                filteredChats.map(c => (
                  <div key={c.id}
                    onClick={() => loadChat(c.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 0, cursor: 'pointer', marginBottom: 2,
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
                            border: '1px solid #4a4a4a', borderRadius: 0, color: '#e6e6e6', outline: 'none'
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
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 2, borderRadius: 0 }}>
                            <Edit2 size={11}/>
                          </button>
                          <button
                            onClick={() => requestDeleteChat(c)}
                            title="Delete"
                            style={{ background: 'transparent', border: 'none', color: '#6a6a6a', cursor: 'pointer', padding: 2, borderRadius: 0 }}>
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
                    borderRadius: 0, background: 'transparent', border: 'none',
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
          <div ref={scrollRef} onScroll={handleScroll} style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="scr">
            {messages.length === 0 && !streaming ? (
  incognito ? (
    <div style={{
  height: '100%', width: '100%', boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '24px', textAlign: 'center',
}}>
  <div style={{
  width: 40, height: 40, borderRadius: 0,
  background: 'rgba(230,230,230,.08)', border: '1px solid #2a2a2a',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
}}>
  
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M12 2C8.13 2 5 5.13 5 9v8l-2 2v1h18v-1l-2-2V9c0-3.87-3.13-7-7-7z" fill="#e6e6e6"/>
    <circle cx="9" cy="10" r="1.5" fill="#0a0a0a"/>
    <circle cx="15" cy="10" r="1.5" fill="#0a0a0a"/>
  </svg>
</div>

      <div style={{
        fontSize: 'clamp(26px,4.5vw,40px)', fontWeight: 700, color: '#f0f0f0',
        letterSpacing: '-.02em', marginBottom: 10,
        fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic',
      }}>
        You're incognito
      </div>

      <p style={{ fontSize: 13.5, color: '#8a8a8a', maxWidth: 420, lineHeight: 1.6, marginBottom: 30 }}>
        This chat won't be saved to your history or added to Vertex's saved chats.
      </p>

    </div>
  ) : (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '30px 24px', textAlign: 'center'
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f5f5f5', margin: '0 0 8px', letterSpacing: '-.02em' }}>
        {getGreeting()}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''} <span style={{ display: 'inline-block', filter: 'brightness(0) invert(1)' }}>👋</span>
      </h1>
      <p style={{ fontSize: 14.5, color: '#8a8a8a', maxWidth: 460, lineHeight: 1.6, margin: '0 0 24px' }}>
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
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 0,
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
                  textAlign: 'left', padding: '12px 14px', borderRadius: 0, cursor: 'pointer',
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
  )
) : (
  <div style={{ maxWidth: sidebarOpen ? 680 : 820, width: '100%', boxSizing: 'border-box', padding: '20px 22px 12px', margin: '0 auto', transition: 'max-width .25s ease' }}>
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts}
                    makeMdComponents={makeMdComponents} onSmartEdit={handleSmartEdit} messageId={m.id}
                    canRetry={m.canRetry} onRetry={() => retryLastMessage(m.id)}
                    onContinue={handleContinue} onRegenerate={handleRegenerate}
                    onEditUserMessage={handleEditUserMessage}
                    isLast={i === messages.length - 1} streaming={false}
                    onOpenPanel={openCodePanel}
                    onAnswerClarify={(answer) => handleClarifyAnswer(m.id, answer)}
                    frozenClarify={frozenClarifyIds.has(m.id)} compact={m._compact} />
                ))}

                {(streaming || thinking || searching) && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#141414', border: '1px solid #2a2a2a'
                    }}>
                      <Terminal size={14} color="#c8c8c8"/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: '#5a5a5a', fontFamily: 'JetBrains Mono', marginBottom: 5, fontWeight: 600 }}>
                        VERTEX{' '}
                        {searching && (
                          <span style={{ color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            · <Search size={10} style={{ display: 'inline' }}/> searching the web…
                          </span>
                        )}
                        {thinking && !searching && <span style={{ color: '#9a9a9a' }}>· thinking…</span>}
                      </div>
                      {(thinking || searching) ? (
                        <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: searching ? '#9ca3af' : '#8a8a8a',
                              animation: `vertexPulse 1.2s ease-in-out ${i*0.15}s infinite`
                            }}/>
                          ))}
                        </div>
                      ) : streamText ? (
                        <div style={{
                          background: '#111111', border: '1px solid #232323', borderRadius: 0,
                          padding: '12px 14px'
                        }}>
                          <MessageContent
                            text={cleanStream(streamText)}
                            mdComponents={mdComponentsForStreaming}
                            onOpenPanel={openCodePanel}
                            onSmartEdit={null}
                            messageId="streaming"
                            streaming
                          />
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
              highlighted inside the chat scroll area. Only shown when there
              are actual messages to reply to — without this guard, selecting
              any text on the empty-state hero (the "Good morning" greeting,
              the starter-prompt pills, the recent-chats cards) would pop a
              stray "Reply" button with nothing to reply to, which read as a
              bug. */}
          {messages.length > 0 && (
            <SelectionReplyButton scrollRef={scrollRef} onReply={handleReplyQuote} />
          )}
          </div>

          {/* ── Input area ── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid #212121', background: '#0f0f0f',
            padding: '12px 22px 16px'
          }}>
            <div style={{ maxWidth: sidebarOpen ? 680 : 820, width: '100%', boxSizing: 'border-box', margin: '0 auto', transition: 'max-width .25s ease' }}>

              {/* Editing banner — shows when the user is editing a previous
                  message. Lets them cancel and keep the original intact. */}
              {editingMsgId && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 0,
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
                      borderRadius: 0, color: '#9a9a9a', fontSize: 11, cursor: 'pointer',
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
                  background: '#161616', border: '1px solid #2a2a2a', borderRadius: 0,
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
                      background: '#171717', border: '1px solid #2a2a2a', borderRadius: 0,
                      padding: '12px 14px', maxWidth: 340,
                    }}>
                      {att.type === 'image' ? (
                        <img src={att.content} alt={att.name}
                          style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 0, display: 'block', marginBottom: 10, objectFit: 'contain' }} />
                      ) : att.type === 'document' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 0, flexShrink: 0, display: 'flex',
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
                          padding: '4px 12px', borderRadius: 0,
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
                borderRadius: 0, padding: 6
              }}>
                <div ref={attachMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                  <button onClick={() => setShowAttachMenu(v => !v)} title="Add file, image, or document"
                    style={{
                      width: 36, height: 36, borderRadius: 0, border: '1px solid ' + (showAttachMenu ? '#3a3a3a' : '#2a2a2a'),
                      background: showAttachMenu ? '#232323' : 'transparent', color: showAttachMenu ? '#dcdcdc' : '#9a9a9a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s'
                    }}>
                    <Plus size={16}/>
                  </button>
                  {showAttachMenu && (
                    <div style={{
                      position: 'absolute', bottom: 44, left: 0, zIndex: 60,
                      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 0,
                      boxShadow: '0 12px 36px rgba(0,0,0,.5)', padding: 6, minWidth: 240,
                      animation: 'vertexScaleIn .15s ease'
                    }}>
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 0, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <FileCode size={14} color="#9a9a9a"/> Add file
                      </button>
                      <button onClick={() => folderInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 0, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <Folder size={14} color="#9a9a9a"/> Add project folder
                      </button>
                      <button onClick={() => imageFileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 0, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <ImageIcon size={14} color="#9a9a9a"/> Add image
                      </button>
                      <button onClick={() => docFileInputRef.current?.click()}
                        style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '8px 10px', borderRadius: 0, background: 'transparent', border: 'none', color: '#dcdcdc', fontSize: 13, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e1e1e'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <FileText size={14} color="#9a9a9a"/> Add document
                        </span>
                      </button>

                      <div style={{ borderTop: '1px solid #1c1c1c', marginTop: 4, paddingTop: 4 }}>
                        <button onClick={() => setOcrMode(v => !v)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 0, background: 'transparent', border: 'none', color: '#9a9a9a', fontSize: 11.5, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1a'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Scan size={12}/> OCR mode
                          </span>
                          <span style={{
                            position: 'relative', width: 28, height: 16, borderRadius: 0,
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
                      width: 36, height: 36, borderRadius: 0, border: '1px solid #3a3a3a', cursor: 'pointer',
                      background: '#1c1c1c', color: '#e6e6e6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, lineHeight: 0
                    }}>
                    <Loader size={14} style={{ animation: 'vertexSpin 1s linear infinite' }}/>
                  </button>
                ) : (
                  <button onClick={() => send()} disabled={!input.trim() && attachments.length === 0}
                    title="Send"
                    style={{
                      width: 36, height: 36, borderRadius: 0, border: '1px solid ' + ((input.trim() || attachments.length > 0) ? '#e6e6e6' : '#2a2a2a'), cursor: (input.trim() || attachments.length > 0) ? 'pointer' : 'not-allowed',
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

/* ────────────────────────────────────────────────────────────────────────
 *  MessageContent — the unified pipeline that wraps every ReactMarkdown
 *  call site. It strips three structured blocks out of the raw text:
 *    1. <<<ASK>>>...<<<END>>>   → ClarifyCard (tappable option pills)
 *    2. leading GFM task list   → TodosPanel (collapsible checklist)
 *    3. 2+ `// file:`-tagged fences → FileTreePanel (folder/file tree)
 *  Then renders the cleaned markdown with whatever's left. Parsing is
 *  memoized so the wrapper adds negligible overhead during streaming.
 * ──────────────────────────────────────────────────────────────────────── */
/* ── Stream text cleaner — strips incomplete control tokens,
 *  think tags, and excessive whitespace that cause layout flicker
 *  during streaming. Mirrors the cleanStream from App.jsx. ── */
const cleanStream = (text) => {
  if (!text) return '';
  return text
    .replace(/\[THINKING\][\s\S]*?<\/THINKING>/gi, '')
    .replace(/\[THINKING\][\s\S]*$/gi, '')
    .replace(/^GENERATE_IMAGE:.*$/gim, '')
    .replace(/^WEB_SEARCH:.*$/gim, '')
    .replace(/^CURRENT_TIME\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const MessageContent = React.memo(({
  text,
  mdComponents,
  onOpenPanel,
  onSmartEdit,
  messageId,
  onAnswerClarify,
  frozenClarify,
  streaming,
  // When true, only todos + project extraction run (no ClarifyCard).
  // Used for the user-message bubble so a pasted <<<ASK>>> block doesn't
  // render as an interactive card on the user's own message.
  skipClarify = false,
}) => {
  // Use cleanStream to strip control tokens from raw text
  const cleaned = useMemo(() => cleanStream(text || ''), [text]);

  const parsed = useMemo(() => {
  let t = cleaned;

  const clarifyRes = skipClarify ? { clarify: null, text: t } : extractClarify(t);
  t = clarifyRes.text;

  // Extract files FIRST — todos need the real delivered paths to check against.
  const projectRes = extractProjectFromMessage(t, streaming);
  t = projectRes.text;

  const todosRes = extractLeadingTodos(t, projectRes.project || []);
  t = todosRes.text;

  return {
    todos: todosRes.todos,
    clarify: clarifyRes.clarify,
    project: projectRes.project,
    cleanedText: t,
  };
}, [cleaned, skipClarify, streaming]);

  return (
    <>
      {parsed.clarify && (
        <ClarifyCard
          questions={parsed.clarify}
          onAnswer={onAnswerClarify}
          frozen={frozenClarify}
        />
      )}
      {parsed.todos && <TodosPanel todos={parsed.todos} />}
      {parsed.project && (
        <FileTreePanel
          files={parsed.project}
          onOpenPanel={onOpenPanel}
          onSmartEdit={onSmartEdit}
          messageId={messageId}
          streaming={streaming}
        />
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]} components={mdComponents}>
        {parsed.cleanedText}
      </ReactMarkdown>
    </>
  );
});

const MessageBubble = React.memo(({ role, text, ts, makeMdComponents, onSmartEdit, messageId, canRetry, onRetry, onContinue, onRegenerate, onEditUserMessage, isLast, streaming, onOpenPanel, onAnswerClarify, frozenClarify, compact }) => {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // Each message bubble gets its own mdComponents so code blocks inside it
  // know which message they belong to (for Smart Edit). User messages pass
  // isUserMessage=true so code blocks inside don't get Open/Run/Smart-Edit
  // buttons — those are only for code Vertex generates.
  const mdComponents = useMemo(
    () => makeMdComponents({ onSmartEdit, messageId, isUserMessage: isUser }),
    [makeMdComponents, onSmartEdit, messageId, isUser]
  );

  // Show Continue only when the reply actually looks cut off — unclosed code
  // fence or mid-sentence ending. Stops it from cluttering every single reply.
  const showContinue = !streaming && onContinue && looksCutOff(text);

  if (isUser) {
    // Compact messages (ClarifyCard answers, Smart Edit prompts) show as a
    // tiny chip instead of the full text dump — the text is still in the chat
    // history for the LLM's context, just not visually expanded.
    if (compact) {
      return (
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end' }}>
          <div
            data-vrtx-no-reply=""
            style={{
              background: '#141414', border: '1px solid #2a2a2a',
              color: '#5a5a5a', borderRadius: 0, padding: '5px 12px',
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600, letterSpacing: '.04em',
            }}>
            preferences sent
          </div>
        </div>
      );
    }
    // Rendered through the same markdown pipeline as Vertex's own replies so that
    // large pasted text/code (sent wrapped in ``` fences) shows up as the same
    // small, collapsible rectangle — not a wall of raw text dumped in the bubble.
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'flex-end' }}>
        <div
        data-vrtx-no-reply="" 
        style={{
          maxWidth: '78%', background: '#1e1e1e', border: '1px solid #2a2a2a',
          color: '#e6e6e6', borderRadius: 0, padding: '10px 14px',
          fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word'
        }}>
          <MessageContent
            text={text}
            mdComponents={mdComponents}
            onOpenPanel={onOpenPanel}
            onSmartEdit={onSmartEdit}
            messageId={messageId}
            streaming={streaming}
            skipClarify
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-start', marginTop: 2, flexShrink: 0 }}>
          <button onClick={() => onEditUserMessage?.(messageId)} title="Edit & resend"
            style={{
              background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 0,
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
    cursor: 'pointer', padding: '3px 7px', borderRadius: 0, fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 4, transition: 'all .12s',
    ...extraStyle,
  });

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          <MessageContent
            text={text}
            mdComponents={mdComponents}
            onOpenPanel={onOpenPanel}
            onSmartEdit={onSmartEdit}
            messageId={messageId}
            onAnswerClarify={onAnswerClarify}
            frozenClarify={frozenClarify || !isLast}
            streaming={streaming}
          />
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
              borderRadius: 0, border: '1px solid #333333', background: '#141414', color: '#dcdcdc',
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