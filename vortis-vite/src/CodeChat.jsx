import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Layers, MessageSquare, FolderGit2, FileCode2, Eye,
  Settings, Plus, Search, GitBranch, Circle, Hash, Bell, Share2,
  Play, ChevronDown, ChevronRight, PanelLeft, Sparkles, Check,
  ArrowUp, ArrowDown, CornerDownLeft, Copy, RefreshCw, Pencil,
  Bug, Zap, FilePlus, FileInput, ThumbsUp, ThumbsDown, Paperclip,
  Folder, AtSign, Square, X, User, MoreHorizontal, History,
  Split, Maximize2, AlertCircle, Loader2, FileJson, FileText,
  FileType, PanelRightClose, FolderOpen, FolderTree, Files, Brain,
  ListChecks, MonitorPlay, ExternalLink, Clock, Filter, Trash2,
  Command, Keyboard, Palette, Cpu, HardDrive, Terminal,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════
//  TYPES (runtime-only — see comments above each section for shape)
// ═══════════════════════════════════════════════════════════════════════
// ChatMessage shape:
//   { id, role: 'user'|'assistant'|'output', content, ts, output?: { text, isError? } }
// FileNode shape:
//   { name, type: 'file'|'folder', path, children?, ext?, modified?, git? }

// ═══════════════════════════════════════════════════════════════════════
//  MOCK DATA — compact
// ═══════════════════════════════════════════════════════════════════════

const PROJECT_TREE = [
  { name: 'src', type: 'folder', path: 'src', children: [
    { name: 'server', type: 'folder', path: 'src/server', children: [
      { name: 'router.ts', type: 'file', path: 'src/server/router.ts', ext: 'ts', modified: true, git: 'M' },
      { name: 'context.ts', type: 'file', path: 'src/server/context.ts', ext: 'ts' },
      { name: 'trpc.ts', type: 'file', path: 'src/server/trpc.ts', ext: 'ts' },
    ]},
    { name: 'lib', type: 'folder', path: 'src/lib', children: [
      { name: 'auth.ts', type: 'file', path: 'src/lib/auth.ts', ext: 'ts', modified: true, git: 'M' },
      { name: 'db.ts', type: 'file', path: 'src/lib/db.ts', ext: 'ts' },
      { name: 'rate-limit.ts', type: 'file', path: 'src/lib/rate-limit.ts', ext: 'ts', git: 'U' },
    ]},
    { name: 'components', type: 'folder', path: 'src/components', children: [
      { name: 'Button.tsx', type: 'file', path: 'src/components/Button.tsx', ext: 'tsx' },
      { name: 'Modal.tsx', type: 'file', path: 'src/components/Modal.tsx', ext: 'tsx', git: 'A' },
    ]},
  ]},
  { name: 'package.json', type: 'file', path: 'package.json', ext: 'json' },
  { name: 'tsconfig.json', type: 'file', path: 'tsconfig.json', ext: 'json' },
  { name: 'README.md', type: 'file', path: 'README.md', ext: 'md' },
]

const FILES = {
  'src/server/router.ts': { lang: 'typescript', code: `import { initTRPC, TRPCError } from '@trpc/server'
import { verifyToken, signAccessToken } from '../lib/auth'
import { createContext } from './context'
import { db } from '../lib/db'
import { z } from 'zod'

const t = initTRPC.context<typeof createContext>().create()

export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(
  async ({ ctx, next }) => {
    const token = ctx.req?.headers.authorization?.replace('Bearer ', '')
    if (!token) throw new TRPCError({ code: 'UNAUTHORIZED' })
    try {
      const payload = await verifyToken(token)
      ctx.user = { id: payload.userId, email: payload.email, role: payload.role }
    } catch {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' })
    }
    return next({ ctx })
  }
)

export const authRouter = t.router({
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const payload = await verifyToken(input.refreshToken)
      return { accessToken: await signAccessToken({
        userId: payload.userId, email: payload.email, role: payload.role,
      })}
    }),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
})

export type AppRouter = typeof appRouter` },

  'src/lib/auth.ts': { lang: 'typescript', code: `import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET)
const ACCESS_TTL = '15m'
const REFRESH_TTL = '7d'

export interface VertexJWTPayload extends JWTPayload {
  userId
  email
  role: 'admin' | 'user' | 'service'
}

export async function signAccessToken(payload: Omit<VertexJWTPayload, 'iat' | 'exp'>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .setIssuer('atlas-engine')
    .sign(secret)
}

export async function verifyToken(token): Promise<VertexJWTPayload> {
  const { payload } = await jwtVerify(token, secret, { issuer: 'atlas-engine' })
  return payload as VertexJWTPayload
}` },

  'src/server/context.ts': { lang: 'typescript', code: `import { CreateNextContextOptions } from '@trpc/server/adapters/next'
import { db } from '../lib/db'

export interface VertexUser {
  id
  email
  role: 'admin' | 'user' | 'service'
}

export function createContext({ req, res }: CreateNextContextOptions) {
  return { req, res, user: null as VertexUser | null, db }
}

export type Context = ReturnType<typeof createContext>` },

  'src/server/trpc.ts': { lang: 'typescript', code: `import { initTRPC } from '@trpc/server'
import { Context } from './context'

const t = initTRPC.context<Context>().create()
export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new Error('Unauthorized')
  return next({ ctx })
})` },

  'src/lib/db.ts': { lang: 'typescript', code: `import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
})

export const db = {
  query: (text, params?: unknown[]) => pool.query(text, params),
}` },

  'src/lib/rate-limit.ts': { lang: 'typescript', code: `import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!)

export async function rateLimit(key, limit, window) {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, window)
  return { ok: count <= limit, remaining: Math.max(0, limit - count) }
}` },

  'src/components/Button.tsx': { lang: 'typescript', code: `import { forwardRef, type ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', ...props }, ref) => (
    <button ref={ref} data-variant={variant} data-size={size} {...props} />
  )
)` },

  'src/components/Modal.tsx': { lang: 'typescript', code: `import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ open, onClose, children }) {
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}` },

  'package.json': { lang: 'json', code: `{
  "name": "atlas-engine",
  "version": "2.4.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest"
  },
  "dependencies": {
    "@trpc/server": "^11.0.0",
    "jose": "^5.9.6",
    "next": "^16.1.1",
    "react": "^19.0.0",
    "zod": "^4.0.2"
  }
}` },

  'tsconfig.json': { lang: 'json', code: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve"
  },
  "include": ["**/*.ts", "**/*.tsx"]
}` },

  'README.md': { lang: 'markdown', code: `# atlas-engine

Multi-tenant SaaS engine with stateless JWT auth, edge-first deployment.

## Stack
- Next.js 16 + tRPC + Drizzle
- Postgres + Redis
- TypeScript end-to-end

## Dev
\`\`\`bash
bun install && bun run dev
\`\`\`` },
}

const SESSIONS = [
  { id: 's1', title: 'Refactor auth to JWT', time: '2m', msgs: 14 },
  { id: 's2', title: 'WebSocket reconnect', time: '1h', msgs: 8 },
  { id: 's3', title: 'Debug Postgres pool', time: '3h', msgs: 22 },
  { id: 's4', title: 'Migrate REST → tRPC', time: '1d', msgs: 31 },
  { id: 's5', title: 'Redis rate limiter', time: '2d', msgs: 18 },
]

const WORKSPACES = [
  { id: 'atlas', name: 'atlas-engine', path: '~/dev/atlas-engine', branch: 'main', dirty: 3 },
  { id: 'nebula', name: 'nebula-ui', path: '~/dev/nebula-ui', branch: 'feat/onb', dirty: 7 },
  { id: 'cosmos', name: 'cosmos-api', path: '~/dev/cosmos-api', branch: 'main', dirty: 0 },
]

const MODELS = [
  { id: 'vertex-4.5', name: 'Vertex 4.5', desc: 'Complex refactors', badge: 'Default' },
  { id: 'vertex-mini', name: 'Vertex Mini', desc: 'Fast & cheap' },
  { id: 'claude-4.5', name: 'Claude Sonnet 4.5', desc: 'Strong reasoning' },
  { id: 'gpt-5', name: 'GPT-5', desc: 'Broad knowledge' },
]

const NAV_ITEMS = [
  { id: 'workspaces', label: 'Workspaces', icon: Layers },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare, badge: 5 },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'files', label: 'Files', icon: FileCode2 },
  { id: 'github', label: 'GitHub', icon: GithubIcon, badge: 2 },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const RIGHT_TABS = [
  { id: 'explorer', label: 'Explorer', icon: FolderTree },
  { id: 'open', label: 'Open', icon: Files, badge: 2 },
  { id: 'memory', label: 'Memory', icon: Brain, badge: 4 },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, badge: 4 },
  { id: 'preview', label: 'Preview', icon: MonitorPlay },
]

const AI_MEMORY = [
  { id: 'm1', title: 'Stack', body: 'tRPC · Drizzle · Tailwind', time: '2h' },
  { id: 'm2', title: 'Style', body: 'No semicolons · Named exports', time: '1d' },
  { id: 'm3', title: 'Architecture', body: 'Stateless JWT · Edge-first', time: '3d' },
  { id: 'm4', title: 'Context', body: '12 microservices · ~180k LOC', time: '1w' },
]

const TASKS = [
  { id: 't1', name: 'Type check', status: 'running', progress: 67, detail: 'router.ts' },
  { id: 't2', name: 'Lint', status: 'done', progress: 100, detail: '12 files clean' },
  { id: 't3', name: 'Tests', status: 'queued', progress: 0, detail: 'Waiting' },
  { id: 't4', name: 'Deploy preview', status: 'pending', progress: 0, detail: 'feat/jwt-auth' },
]

const NOTIFICATIONS = [
  { id: 'n1', icon: GitBranch, text: 'PR #248 ready for review', time: '5m', color: 'text-vertex-blue-bright' },
  { id: 'n2', icon: AlertCircle, text: 'Build failed on feat/jwt-auth', time: '12m', color: 'text-red-400' },
  { id: 'n3', icon: Check, text: 'Type check passed', time: '1h', color: 'text-emerald-400' },
  { id: 'n4', icon: GithubIcon, text: 'New comment on PR #247', time: '3h', color: 'text-white/60' },
]

const STARTER_PROMPTS = ['Debug an error', 'Optimize code', 'Explain code', 'Write a function', 'Refactor', 'Code review']

const INITIAL_MESSAGES = [
  { id: 'm1', role: 'user', ts: '14:32', content: "Refactor `src/lib/auth.ts` to use stateless JWT instead of session cookies. Walk me through the approach." },
  { id: 'm2', role: 'assistant', ts: '14:32', content: `Here's the strategy:

**1. Tokens** — Short-lived access (15m) + long-lived refresh (7d).

**2. Signing** — \`HS256\` in dev, \`RS256\` in prod.

**3. Verification** — A single \`verifyToken()\` that:
- Extracts bearer from \`Authorization\` header
- Verifies signature + expiry
- Loads user from Redis cache

Using \`jose\` (edge-compatible):

\`\`\`typescript
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .setIssuer('atlas-engine')
    .sign(secret)
}
\`\`\`

Want me to update the tRPC context next?` },
]

// ═══════════════════════════════════════════════════════════════════════
//  TOKENIZER + CODE VIEW
// ═══════════════════════════════════════════════════════════════════════

const KEYWORDS = new Set([
  'import','export','from','default','const','let','var','function','return',
  'if','else','for','while','do','switch','case','break','continue','class',
  'extends','implements','interface','type','enum','async','await','try',
  'catch','finally','throw','new','delete','typeof','instanceof','in','of',
  'this','super','static','public','private','protected','readonly','abstract',
  'as','is','namespace','declare','module','require','yield','void','null',
  'undefined','true','false','boolean','string','number','any','unknown','never',
])
const BUILTINS = new Set([
  'console','process','window','document','Math','JSON','Promise','Array',
  'Object','String','Number','Boolean','Map','Set','Date','Error','RegExp',
  'Buffer','fetch','setTimeout','setInterval',
])

function tokenize(line) {
  const tokens = []
  let i = 0, n = line.length
  while (i < n) {
    const ch = line[i]
    if (ch === ' ' || ch === '\t') {
      let j = i; while (j < n && (line[j] === ' ' || line[j] === '\t')) j++
      tokens.push({ text: line.slice(i, j), cls: '' }); i = j; continue
    }
    if (ch === '/' && line[i + 1] === '/') { tokens.push({ text: line.slice(i), cls: 'text-white/35 italic' }); i = n; continue }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < n) { if (line[j] === '\\') { j += 2; continue } if (line[j] === ch) { j++; break } j++ }
      tokens.push({ text: line.slice(i, j), cls: 'text-emerald-300' }); i = j; continue
    }
    if (/\d/.test(ch)) {
      let j = i; while (j < n && /[\d._a-fxA-FX]/.test(line[j])) j++
      tokens.push({ text: line.slice(i, j), cls: 'text-pink-300' }); i = j; continue
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i; while (j < n && /[a-zA-Z0-9_$]/.test(line[j])) j++
      const w = line.slice(i, j)
      let cls = 'text-white/80'
      if (KEYWORDS.has(w)) cls = 'text-vertex-blue-bright font-medium'
      else if (BUILTINS.has(w)) cls = 'text-amber-300'
      else if (/^[A-Z]/.test(w)) cls = 'text-amber-300'
      else if (line[j] === '(') cls = 'text-yellow-200'
      tokens.push({ text: w, cls }); i = j; continue
    }
    if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
      let j = i; while (j < n && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++
      tokens.push({ text: line.slice(i, j), cls: 'text-sky-300' }); i = j; continue
    }
    tokens.push({ text: ch, cls: 'text-white/50' }); i++
  }
  return tokens
}

function CodeView({ code, showLineNumbers = true }) {
  const lines = code.split('\n')
  return (
    <pre className="py-2.5 text-[12px] leading-[1.65] font-mono overflow-x-auto">
      {lines.map((line, idx) => (
        <div key={idx} className="flex px-3 hover:bg-white/[0.02]" style={{ minHeight: '19px' }}>
          {showLineNumbers && <span className="select-none text-white/20 pr-3 text-right" style={{ minWidth: 28 }}>{idx + 1}</span>}
          <code className="flex-1 whitespace-pre">
            {tokenize(line).map((t, i) => <span key={i} className={t.cls}>{t.text}</span>)}
          </code>
        </div>
      ))}
    </pre>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  MARKDOWN
// ═══════════════════════════════════════════════════════════════════════

function renderInline(text) {
  const parts = []
  let rem = text
  while (rem.length) {
    const m1 = rem.match(/^`([^`]+)`/); if (m1) { parts.push({ text: m1[1], kind: 'code' }); rem = rem.slice(m1[0].length); continue }
    const m2 = rem.match(/^\*\*([^*]+)\*\*/); if (m2) { parts.push({ text: m2[1], kind: 'bold' }); rem = rem.slice(m2[0].length); continue }
    const m3 = rem.match(/^\*([^*]+)\*/); if (m3) { parts.push({ text: m3[1], kind: 'italic' }); rem = rem.slice(m3[0].length); continue }
    const m4 = rem.match(/^\[([^\]]+)\]\(([^)]+)\)/); if (m4) { parts.push({ text: m4[1], kind: 'link' }); rem = rem.slice(m4[0].length); continue }
    const next = rem.search(/[`*\[]/)
    if (next === -1) { parts.push({ text: rem, kind: 'plain' }); break }
    parts.push({ text: rem.slice(0, next), kind: 'plain' }); rem = rem.slice(next)
  }
  return parts.map((p, i) => {
    if (p.kind === 'code') return <code key={i} className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[11.5px] font-mono text-vertex-blue-bright">{p.text}</code>
    if (p.kind === 'bold') return <strong key={i} className="font-semibold text-white">{p.text}</strong>
    if (p.kind === 'italic') return <em key={i} className="italic text-white/85">{p.text}</em>
    if (p.kind === 'link') return <span key={i} className="text-vertex-blue-bright underline underline-offset-2 cursor-pointer">{p.text}</span>
    return <span key={i}>{p.text}</span>
  })
}

// MDSection shape (returned by parseMD):
//   { type: 'h1'|'h2'|'h3', text }
//   { type: 'p', text }
//   { type: 'ul'|'ol', items }
//   { type: 'code', code, lang }

function parseMD(md) {
  const lines = md.split('\n')
  const segs = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      i++
      segs.push({ type: 'code', code: code.join('\n'), lang }); continue
    }
    if (line.startsWith('### ')) { segs.push({ type: 'h3', text: line.slice(4) }); i++; continue }
    if (line.startsWith('## ')) { segs.push({ type: 'h2', text: line.slice(3) }); i++; continue }
    if (line.startsWith('# ')) { segs.push({ type: 'h1', text: line.slice(2) }); i++; continue }
    if (/^\s*[-*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s/, '')); i++ }
      segs.push({ type: 'ul', items }); continue
    }
    if (/^\s*\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s/, '')); i++ }
      segs.push({ type: 'ol', items }); continue
    }
    if (line.trim() === '') { i++; continue }
    const para = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^\s*[-*]\s/.test(lines[i])) {
      para.push(lines[i]); i++
    }
    if (para.length) segs.push({ type: 'p', text: para.join(' ') })
  }
  return segs
}

function Markdown({ content, onRunCode }) {
  const segs = useMemo(() => parseMD(content), [content])
  return (
    <div className="space-y-2">
      {segs.map((seg, i) => {
        switch (seg.type) {
          case 'h1': return <h1 key={i} className="text-[16px] font-semibold text-white mt-2">{seg.text}</h1>
          case 'h2': return <h2 key={i} className="text-[14px] font-semibold text-white mt-1.5">{seg.text}</h2>
          case 'h3': return <h3 key={i} className="text-[13px] font-semibold text-white/95 mt-1">{seg.text}</h3>
          case 'p': return <p key={i} className="text-white/80">{renderInline(seg.text)}</p>
          case 'ul': return (
            <ul key={i} className="space-y-1 pl-1">
              {seg.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-white/80">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/40" />
                  <span>{renderInline(it)}</span>
                </li>
              ))}
            </ul>
          )
          case 'ol': return (
            <ol key={i} className="space-y-1">
              {seg.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-white/80">
                  <span className="font-mono text-[10.5px] text-vertex-blue-bright mt-0.5">{j + 1}.</span>
                  <span>{renderInline(it)}</span>
                </li>
              ))}
            </ol>
          )
          case 'code': return <CodeBlock key={i} lang={seg.lang} code={seg.code} onRun={onRunCode} />
        }
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  CODE BLOCK (in chat) — with Run button that shows output inline
// ═══════════════════════════════════════════════════════════════════════

function CodeBlock({ lang, code, onRun }) {
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState(null)
  const lines = code.split('\n')
  const isLong = lines.length > 12
  const [expanded, setExpanded] = useState(!isLong)

  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const run = () => {
    if (running) return
    setRunning(true)
    setOutput(null)
    setTimeout(() => {
      setRunning(false)
      // Mock output based on language
      let result = ''
      let isError = false
      if (lang === 'typescript' || lang === 'javascript' || lang === 'ts' || lang === 'js') {
        if (code.includes('signAccessToken')) result = `✓ Token signed (HS256)\n  iss: atlas-engine\n  exp: 15m\n  alg: HS256`
        else if (code.includes('verifyToken')) result = `✓ Token verified\n  userId: usr_2k4j9f\n  role: admin\n  iat: ${new Date().toISOString()}`
        else result = `✓ Executed in 12ms\n  no output`
      } else if (lang === 'bash' || lang === 'sh') {
        result = `$ ${code.split('\n')[0]}\n✓ done in 240ms`
      } else if (lang === 'diff') {
        result = `✓ Patch applied\n  2 files modified\n  1 file added`
        isError = false
      } else if (lang === 'json') {
        result = `✓ Valid JSON\n  ${code.split('\n').length} lines parsed`
      } else {
        result = `✓ Executed in 8ms`
      }
      setOutput({ text: result, isError })
      onRun?.(lang, code)
    }, 1100)
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10.5px]">
          <span className="font-mono text-white/55 uppercase tracking-wider">{lang || 'code'}</span>
          <span className="text-white/20">·</span>
          <span className="font-mono text-white/40">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          {onRun && (
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              {running ? <Loader2 size={10} className="animate-spin" /> : <Play size={9} className="fill-current" />}
              {running ? 'Running' : 'Run'}
            </button>
          )}
          <button onClick={copy} className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)} className="rounded-md px-1.5 py-0.5 text-[10.5px] text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
              {expanded ? 'Collapse' : `+${lines.length - 12} more`}
            </button>
          )}
        </div>
      </div>
      {/* Code */}
      <div className="overflow-x-auto">
        <CodeView code={expanded ? code : lines.slice(0, 12).join('\n')} showLineNumbers={false} />
      </div>
      {/* Inline output (no terminal — just appears under the code) */}
      <AnimatePresence>
        {output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06] bg-[#080808] overflow-hidden"
          >
            <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${output.isError ? 'text-red-400' : 'text-emerald-400'}`}>
              {output.isError ? 'Error' : 'Output'}
            </div>
            <pre className="px-3 pb-2.5 pt-0.5 font-mono text-[11.5px] leading-[1.6] text-white/80 whitespace-pre-wrap">
              {output.text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  LOGO
// ═══════════════════════════════════════════════════════════════════════

function Logo({ size = 26, showText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        className="relative shrink-0 rounded-[9px] bg-white shadow-[0_4px_24px_-4px_rgba(255,255,255,0.25)]"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
            <path d="M5 7L9 12L5 17" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 17H19" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </motion.div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-semibold tracking-tight text-white" style={{ fontSize: 13.5 }}>Vertex</span>
          <span className="text-[9px] text-white/40 mt-0.5 font-medium tracking-wider uppercase">Workspace</span>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN HOME COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function Home({ onClose }) {
  // Layout state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeNav, setActiveNav] = useState('sessions')
  const [activeRightTab, setActiveRightTab] = useState('explorer')
  const [cmdOpen, setCmdOpen] = useState(false)
  const [focusMode, setFocusMode] = useState('balanced')

  // Workspace / model
  const [currentWs, setCurrentWs] = useState(WORKSPACES[0])
  const [model, setModel] = useState('vertex-4.5')
  const [mode, setMode] = useState('agent')

  // Editor
  const [activeFile, setActiveFile] = useState('src/server/router.ts')
  const [openTabs, setOpenTabs] = useState(['src/server/router.ts', 'src/lib/auth.ts'])
  const [expandedFolders, setExpandedFolders] = useState(new Set(['src', 'src/server', 'src/lib']))
  const [suggestionVisible, setSuggestionVisible] = useState(true)

  // Chat
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [attachments, setAttachments] = useState([])

  // Overlays
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [toast, setToast] = useState(null)

  // Refs
  const chatRef = useRef(null)
  const editorRef = useRef(null)
  const chatScrollRef = useRef(null)
  const inputRef = useRef(null)

  // Toast helper
  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 2000)
  }, [])

  // Lock body scroll while Vertex is mounted (portal escapes parent,
  // but we also need to stop the main app behind from scrolling)
  useEffect(() => {
    if (typeof document === 'undefined') return

    // ── Inject Tailwind Play CDN if the host app doesn't have Tailwind ──
    // This makes all the className utilities in this file actually work,
    // regardless of whether VORTIS uses Tailwind or not.
    if (!window.__vertexTailwindLoaded) {
      window.__vertexTailwindLoaded = true
      const script = document.createElement('script')
      script.src = 'https://cdn.tailwindcss.com/3.4.16'
      script.id = 'vertex-tailwind-cdn'
      script.onload = () => {
        // Configure custom colors after Tailwind loads
        if (window.tailwind) {
          window.tailwind.config = {
            theme: {
              extend: {
                colors: {
                  'vertex-blue': '#3b82f6',
                  'vertex-blue-bright': '#60a5fa',
                  'vertex-blue-dim': '#2563eb',
                },
              },
            },
          }
        }
      }
      document.head.appendChild(script)
    }

    const body = document.body
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    const scrollY = window.scrollY
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      body.style.overflow = prev.overflow
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      if (prev.position !== 'fixed') window.scrollTo(0, scrollY)
    }
  }, [])

  // Effects
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [messages, streaming])

  useEffect(() => {
    const chatTarget = focusMode === 'chat' ? 22 : focusMode === 'editor' ? 48 : 38
    const editorTarget = focusMode === 'chat' ? 68 : focusMode === 'editor' ? 42 : 52
    chatRef.current?.resize(chatTarget)
    editorRef.current?.resize(editorTarget)
  }, [focusMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const meta = e.metaKey || e.ctrlKey
      const inField = document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT'
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(v => !v) }
      if (meta && e.key.toLowerCase() === 'p') { e.preventDefault(); setCmdOpen(true) }
      if (meta && e.key.toLowerCase() === 'b') { e.preventDefault(); setSidebarCollapsed(v => !v) }
      if (meta && e.key.toLowerCase() === 'j') { e.preventDefault(); setRightCollapsed(v => !v) }
      if (meta && e.key === ',') { e.preventDefault(); setShowSettings(true) }
      if (e.key === 'Escape') {
        if (cmdOpen) { setCmdOpen(false); return }
        if (showNotifs) { setShowNotifs(false); return }
        if (showSettings) { setShowSettings(false); return }
        if (showShortcuts) { setShowShortcuts(false); return }
        if (showModelMenu) { setShowModelMenu(false); return }
        if (showProfileMenu) { setShowProfileMenu(false); return }
        if (suggestionVisible) { setSuggestionVisible(false); return }
        // Last resort — close the whole Vertex overlay
        if (onClose && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') onClose()
      }
      if (e.key === '?' && !inField) setShowShortcuts(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cmdOpen, showNotifs, showSettings, showShortcuts, showModelMenu, showProfileMenu, suggestionVisible, onClose])

  // Actions
  const openFile = useCallback((path) => {
    setActiveFile(path)
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path])
    showToast('Opened ' + path.split('/').pop())
  }, [showToast])

  const closeTab = useCallback((path, e) => {
    e?.stopPropagation()
    setOpenTabs(prev => {
      const idx = prev.indexOf(path)
      const next = prev.filter(t => t !== path)
      if (activeFile === path && next.length) setActiveFile(next[Math.min(idx, next.length - 1)])
      return next
    })
  }, [activeFile])

  const toggleFolder = useCallback((path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }, [])

  const sendMessage = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    const userMsg = { id: 'u-' + Date.now(), role: 'user', content: text, ts: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, userMsg])
    setInput(''); setAttachments([])
    setStreaming(true)
    setTimeout(() => {
      setStreaming(false)
      setMessages(prev => [...prev, {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: "Here's the diff for `src/server/router.ts` — replacing session middleware with JWT verifier:\n\n```diff\n- import { sessionMiddleware } from './middleware/session'\n+ import { verifyToken, signAccessToken } from '../lib/auth'\n+ import { TRPCError } from '@trpc/server'\n\n  export const protectedProcedure = t.procedure\n-   .use(sessionMiddleware)\n+   .use(async ({ ctx, next }) => {\n+     const token = ctx.req?.headers.authorization?.replace('Bearer ', '')\n+     if (!token) throw new TRPCError({ code: 'UNAUTHORIZED' })\n+     try {\n+       const payload = await verifyToken(token)\n+       ctx.user = { id: payload.userId, email: payload.email, role: payload.role }\n+     } catch {\n+       throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' })\n+     }\n+     return next({ ctx })\n+   })\n```\n\n**Modified:** `src/lib/auth.ts`, `src/server/router.ts`\n\nWant me to run the test suite?",
        ts: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }])
    }, 1500)
  }, [input, streaming])

  const stopStreaming = useCallback(() => { setStreaming(false); showToast('Stopped') }, [showToast])

  const handleInputKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }, [sendMessage])

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }, [])

  // Run code → output appears as an "output" chat message
  const runCodeInline = useCallback((lang, code) => {
    let result = ''
    if (lang === 'typescript' || lang === 'javascript' || lang === 'ts' || lang === 'js') {
      if (code.includes('signAccessToken')) result = 'Token signed (HS256)\niss: atlas-engine\nexp: 15m\nalg: HS256'
      else if (code.includes('verifyToken')) result = 'Token verified\nuserId: usr_2k4j9f\nrole: admin'
      else result = 'Executed in 12ms — no output'
    } else if (lang === 'bash' || lang === 'sh') {
      result = '$ ' + code.split('\n')[0] + '\ndone in 240ms'
    } else if (lang === 'diff') {
      result = 'Patch applied\n2 files modified\n1 file added'
    } else if (lang === 'json') {
      result = 'Valid JSON — ' + code.split('\n').length + ' lines parsed'
    } else {
      result = 'Executed in 8ms'
    }
    setMessages(prev => [...prev, {
      id: 'out-' + Date.now(),
      role: 'output',
      content: '',
      ts: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      output: { text: result },
    }])
    showToast('Output shown in chat')
  }, [showToast])

  const acceptSuggestion = useCallback(() => { setSuggestionVisible(false); showToast('Inserted — press ⌘S to save') }, [showToast])
  const copyMessage = useCallback((text) => { navigator.clipboard.writeText(text); showToast('Copied') }, [showToast])

  const fileMeta = FILES[activeFile] ?? { lang: 'typescript', code: '// File not found' }
  const ws = currentWs

  // ═══════════ RENDER ═══════════
  // CRITICAL: render through a portal into document.body so the overlay
  // escapes any ancestor that has transform / filter / will-change / contain
  // set — those properties create a new containing block and break
  // position:fixed, which was causing Vertex to render inside the parent
  // app's narrow column instead of taking over the full viewport.
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      data-vertex
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 2147483647,
        background: '#0a0a0a',
        color: '#ededed',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        isolation: 'isolate',
        fontFamily: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
      className="vertex-root"
    >
      {/* Inline scoped reset — everything inside [data-vertex] is immune
          to global stylesheets from the parent VORTIS app. */}
      <style>{`
        [data-vertex], [data-vertex] *, [data-vertex] *::before, [data-vertex] *::after {
          box-sizing: border-box;
        }
        [data-vertex] button { cursor: pointer; }
        [data-vertex] input, [data-vertex] textarea, [data-vertex] select {
          font: inherit; color: inherit; background: transparent; border: none; outline: none;
        }
        [data-vertex] img { max-width: 100%; display: block; }
        [data-vertex] pre, [data-vertex] code { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        [data-vertex] ::-webkit-scrollbar { width: 8px; height: 8px; }
        [data-vertex] ::-webkit-scrollbar-track { background: transparent; }
        [data-vertex] ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        [data-vertex] ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
      {/* ═══ TOP NAV ═══ */}
      <header className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0a]/95 px-3 backdrop-blur-xl">
        <button onClick={() => setSidebarCollapsed(v => !v)} className="grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors" title="Toggle sidebar (⌘B)">
          <PanelLeft size={14} />
        </button>

        <div className="flex items-center gap-2 text-[12px]">
          <button onClick={() => showToast('Workspace: ' + ws.name)} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-white/85 hover:bg-white/[0.05] transition-colors">
            <span className="font-medium">{ws.name}</span>
            <span className="text-white/25">/</span>
            <span className="text-white/50 font-mono">{ws.branch}</span>
          </button>
          {ws.dirty > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              <Circle size={4} className="fill-amber-400" /> {ws.dirty}
            </span>
          )}
        </div>

        <button onClick={() => setCmdOpen(true)} className="mx-auto group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11.5px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/10 transition-all">
          <Search size={12} />
          <span className="w-40 text-left">Search or run command...</span>
          <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-white/45 group-hover:text-white/65">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1">
          {/* Model selector */}
          <div className="relative">
            <button onClick={() => setShowModelMenu(v => !v)} className="group flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11.5px] hover:bg-white/[0.05] hover:border-white/10 transition-all">
              <Sparkles size={11} className="text-vertex-blue" />
              <span className="font-medium text-white/85">{MODELS.find(m => m.id === model)?.name}</span>
              <ChevronDown size={11} className={'text-white/45 transition-transform ' + (showModelMenu ? 'rotate-180' : '')} />
            </button>
            <AnimatePresence>
              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }} className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl shadow-black/40">
                    <div className="px-3 pt-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/40">Models</div>
                    <div className="px-1.5 pb-1.5 space-y-0.5">
                      {MODELS.map(m => {
                        const active = m.id === model
                        return (
                          <button key={m.id} onClick={() => { setModel(m.id); setShowModelMenu(false); showToast('Switched to ' + m.name) }} className={'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ' + (active ? 'bg-vertex-blue/10 ring-1 ring-vertex-blue/30' : 'hover:bg-white/[0.05]')}>
                            <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.06]">
                              {active ? <Check size={11} className="text-vertex-blue" /> : <Sparkles size={11} className="text-white/45" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[12px] font-medium text-white">{m.name}</span>
                                {'badge' in m && m.badge && <span className="rounded bg-vertex-blue/20 px-1 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-vertex-blue-bright">{m.badge}</span>}
                              </div>
                              <div className="text-[10.5px] text-white/50 mt-0.5 leading-snug">{m.desc}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="mx-1 h-5 w-px bg-white/[0.06]" />

          <button onClick={() => showToast('Branch: ' + ws.branch)} className="group relative grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors" title="Branch">
            <GitBranch size={13} />
            <span className="absolute -bottom-0.5 -right-0.5 rounded bg-vertex-blue px-1 text-[7.5px] font-bold text-white">{ws.branch.length > 4 ? ws.branch.slice(0, 3) + '…' : ws.branch}</span>
          </button>
          <button onClick={() => showToast('GitHub sync — 0 conflicts')} className="group relative grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors" title="GitHub sync">
            <GithubIcon size={13} />
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-vertex-blue ring-2 ring-[#0a0a0a]" />
          </button>
          <button onClick={() => showToast('Share link copied')} className="grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors" title="Share">
            <Share2 size={13} />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button onClick={() => setShowNotifs(v => !v)} className="group relative grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors" title="Notifications">
              <Bell size={13} />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-vertex-blue ring-2 ring-[#0a0a0a]" />
            </button>
            <AnimatePresence>
              {showNotifs && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }} className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl shadow-black/40">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                      <span className="text-[12px] font-semibold text-white">Notifications</span>
                      <button onClick={() => { setShowNotifs(false); showToast('All marked read') }} className="text-[10.5px] text-vertex-blue-bright hover:underline">Mark all read</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1.5">
                      {NOTIFICATIONS.map(n => (
                        <div key={n.id} className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors">
                          <div className={'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.06] ' + n.color}><n.icon size={11} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11.5px] text-white/85">{n.text}</div>
                            <div className="text-[10px] text-white/40 mt-0.5">{n.time} ago</div>
                          </div>
                          <button className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white"><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Profile */}
          <div className="relative">
            <button onClick={() => setShowProfileMenu(v => !v)} className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 ring-offset-2 ring-offset-background hover:ring-2 ring-white/20 transition-all">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-vertex-blue to-vertex-blue-dim text-[10.5px] font-semibold text-white border border-white/10">AK</div>
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }} className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl shadow-black/40">
                    <div className="px-3 py-2.5 border-b border-white/[0.06]">
                      <div className="text-[12.5px] font-medium text-white">Arjun Kapoor</div>
                      <div className="text-[10.5px] text-white/45">arjun@vertex.dev</div>
                    </div>
                    <div className="p-1.5">
                      <button onClick={() => { setShowProfileMenu(false); setShowSettings(true) }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors"><Settings size={12} /> Settings</button>
                      <button onClick={() => { setShowProfileMenu(false); setShowShortcuts(true) }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors"><Keyboard size={12} /> Shortcuts</button>
                      <button onClick={() => { setShowProfileMenu(false); showToast('Pro plan active') }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-vertex-blue-bright hover:bg-vertex-blue/10 transition-colors"><Sparkles size={12} /> Upgrade</button>
                      {onClose && (
                        <button onClick={() => { setShowProfileMenu(false); onClose() }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/[0.06] mt-1 pt-2"><X size={12} /> Exit Vertex</button>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Exit button — always visible in top-right */}
          {onClose && (
            <button
              onClick={onClose}
              title="Exit Vertex (Esc)"
              className="ml-1 grid h-7 w-7 place-items-center rounded-md text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          activeNav={activeNav}
          setActiveNav={(n) => {
            setActiveNav(n)
            if (n === 'settings') setShowSettings(true)
            else if (n === 'preview') { setActiveRightTab('preview'); setRightCollapsed(false) }
            else showToast('Viewing ' + n)
          }}
          onToggle={() => setSidebarCollapsed(v => !v)}
          currentWs={ws}
          onSwitchWs={(w) => { setCurrentWs(w); showToast('Switched to ' + w.name) }}
        />

        {/* Center column — chat + editor, NO terminal */}
        <div className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">
          <PanelGroup direction="horizontal" autoSaveId="vertex-main">
            <Panel ref={chatRef} id="chat" order={1} defaultSize={38} minSize={22} maxSize={75} className="min-w-0 overflow-hidden">
              <ChatPanel
                messages={messages}
                streaming={streaming}
                input={input}
                onInputChange={handleInputChange}
                onInputKey={handleInputKey}
                onSend={sendMessage}
                onStop={stopStreaming}
                model={model}
                mode={mode}
                setMode={setMode}
                attachments={attachments}
                setAttachments={setAttachments}
                onCopy={copyMessage}
                onAction={(a) => showToast(a)}
                onRunCode={runCodeInline}
                chatScrollRef={chatScrollRef}
                inputRef={inputRef}
                onExpand={() => setFocusMode('chat')}
                onNewSession={() => { setMessages([]); showToast('New session') }}
                onRegenerate={() => { showToast('Regenerating...'); setStreaming(true); setTimeout(() => { setStreaming(false); showToast('Done') }, 1200) }}
              />
            </Panel>
            <PanelResizeHandle className="group relative w-px bg-white/[0.06] hover:bg-vertex-blue/40 transition-colors data-[resize-handle-active]:bg-vertex-blue">
              <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
            </PanelResizeHandle>
            <Panel ref={editorRef} id="editor" order={2} defaultSize={62} minSize={25} className="min-w-0 overflow-hidden">
              <EditorPanel
                activeFile={activeFile}
                openTabs={openTabs}
                onSelect={openFile}
                onCloseTab={closeTab}
                fileMeta={fileMeta}
                suggestionVisible={suggestionVisible}
                onAcceptSuggestion={acceptSuggestion}
                onDismissSuggestion={() => setSuggestionVisible(false)}
                onExpand={() => setFocusMode('editor')}
                onSplit={() => showToast('Split editor')}
                onRun={() => showToast('Run from editor — output in chat')}
              />
            </Panel>
          </PanelGroup>
        </div>

        <RightPanel
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed(v => !v)}
          activeTab={activeRightTab}
          setActiveTab={setActiveRightTab}
          projectTree={PROJECT_TREE}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          activeFile={activeFile}
          onOpenFile={openFile}
          openTabs={openTabs}
          onCopyPath={(p) => { navigator.clipboard.writeText(p); showToast('Path copied') }}
        />
      </div>

      {/* ═══ OVERLAYS ═══ */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onAction={(action) => {
          setCmdOpen(false)
          switch (action.type) {
            case 'toggle-sidebar': setSidebarCollapsed(v => !v); break
            case 'toggle-right': setRightCollapsed(v => !v); break
            case 'open-file': if (action.path) openFile(action.path); break
            case 'switch-mode': if (action.mode) setMode(action.mode); break
            case 'show-settings': setShowSettings(true); break
            case 'show-shortcuts': setShowShortcuts(true); break
            case 'focus-chat': setFocusMode('chat'); break
            case 'focus-editor': setFocusMode('editor'); break
            case 'focus-balanced': setFocusMode('balanced'); break
            case 'new-session': setMessages([]); showToast('New session'); break
            default: showToast('Command executed')
          }
        }}
      />

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} showToast={showToast} />
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-lg border border-white/10 bg-[#1a1a1a]/95 backdrop-blur-md px-4 py-2 text-[12px] text-white shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <Check size={11} className="text-emerald-400" />
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}

export default Home;

// ═══════════════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════════════

function Sidebar({
  collapsed, activeNav, setActiveNav, onToggle, currentWs, onSwitchWs,
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 52 : 232 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-20 flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0a] overflow-hidden"
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-3 border-b border-white/[0.04]">
        {collapsed ? (
          <div className="flex w-full justify-center"><Logo size={22} showText={false} /></div>
        ) : <Logo size={22} />}
      </div>

      {!collapsed && (
        <div className="px-2.5 pt-2.5">
          <button onClick={onToggle} className="group flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left text-[11.5px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 transition-colors">
            <Search size={11} />
            <span className="flex-1">Search...</span>
            <kbd className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-mono text-white/45">⌘K</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {NAV_ITEMS.map(item => {
              const active = activeNav === item.id
              return (
                <button key={item.id} onClick={() => setActiveNav(item.id)} className={'group relative grid h-8 w-8 place-items-center rounded-lg transition-all ' + (active ? 'bg-white/[0.06] text-vertex-blue' : 'text-white/45 hover:text-white hover:bg-white/[0.03]')} title={item.label}>
                  <item.icon size={13} />
                  {'badge' in item && item.badge && <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-vertex-blue px-1 text-[8px] font-bold text-white">{item.badge}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            {NAV_ITEMS.map(item => {
              const active = activeNav === item.id
              return (
                <div key={item.id}>
                  <button onClick={() => setActiveNav(item.id)} className={'group relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] transition-all ' + (active ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.03]')}>
                    <item.icon size={13} className={'shrink-0 transition-colors ' + (active ? 'text-vertex-blue' : 'text-white/50 group-hover:text-white/80')} />
                    <span className="flex-1 text-left font-medium">{item.label}</span>
                    {'badge' in item && item.badge && <span className={'rounded-full px-1.5 py-0.5 text-[9px] font-medium ' + (active ? 'bg-vertex-blue/20 text-vertex-blue-bright' : 'bg-white/[0.06] text-white/50')}>{item.badge}</span>}
                  </button>
                  {item.id === 'sessions' && active && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-0.5 ml-5 mr-1 space-y-0.5 border-l border-white/[0.06] pl-2.5">
                      {SESSIONS.slice(0, 4).map(s => (
                        <button key={s.id} onClick={() => setActiveNav('sessions')} className="group flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-[11px] text-white/45 hover:bg-white/[0.03] hover:text-white/80 transition-colors">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/20 group-hover:bg-vertex-blue" />
                          <span className="flex-1 truncate">{s.title}</span>
                          <span className="text-white/30 text-[9.5px]">{s.time}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                  {item.id === 'workspaces' && active && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-0.5 ml-5 mr-1 space-y-0.5 border-l border-white/[0.06] pl-2.5">
                      {WORKSPACES.map(w => (
                        <button key={w.id} onClick={() => onSwitchWs(w)} className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-white/45 hover:bg-white/[0.03] hover:text-white/80 transition-colors">
                          <Hash size={9} className="shrink-0 text-white/30 group-hover:text-vertex-blue" />
                          <span className="flex-1 truncate font-mono">{w.name}</span>
                          {w.dirty > 0 && <span className="rounded bg-amber-500/15 px-1 text-[8.5px] text-amber-400">{w.dirty}</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </nav>

      {!collapsed ? (
        <div className="border-t border-white/[0.04] p-2.5 space-y-2">
          <WorkspaceSwitcher current={currentWs} onSwitch={onSwitchWs} />
          <div className="flex items-center justify-between text-[10px] text-white/35">
            <div className="flex items-center gap-1.5"><GitBranch size={9} /><span className="font-mono">{currentWs.branch}</span></div>
            <span className="flex items-center gap-1"><Circle size={4} className="fill-emerald-500 text-emerald-500" /> Synced</span>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/[0.04] p-2.5 flex justify-center">
          <button onClick={() => onSwitchWs(WORKSPACES[(WORKSPACES.findIndex(w => w.id === currentWs.id) + 1) % WORKSPACES.length])} title="Switch workspace" className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] text-[9.5px] font-bold text-vertex-blue-bright hover:bg-white/[0.1]">{currentWs.name[0].toUpperCase()}</button>
        </div>
      )}
    </motion.aside>
  )
}

function WorkspaceSwitcher({ current, onSwitch }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="group flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
        <div className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-vertex-blue/30 to-vertex-blue/10 text-[9.5px] font-bold text-vertex-blue-bright">{current.name[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[11px] font-medium text-white/90">{current.name}</div>
          <div className="truncate text-[9px] text-white/40 font-mono">{current.path}</div>
        </div>
        <Plus size={10} className="text-white/30 group-hover:text-white/70" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 right-0 mb-1 z-50 overflow-hidden rounded-lg border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl">
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">Workspaces</div>
              {WORKSPACES.map(w => (
                <button key={w.id} onClick={() => { onSwitch(w); setOpen(false) }} className={'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11.5px] transition-colors ' + (w.id === current.id ? 'bg-vertex-blue/10 text-vertex-blue-bright' : 'text-white/75 hover:bg-white/[0.05]')}>
                  <div className="grid h-5 w-5 place-items-center rounded bg-white/[0.06] text-[8.5px] font-bold">{w.name[0].toUpperCase()}</div>
                  <span className="flex-1 truncate font-mono">{w.name}</span>
                  {w.dirty > 0 && <span className="text-[9px] text-amber-400">{w.dirty}</span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAT PANEL — messages + composer (NO terminal below)
// ═══════════════════════════════════════════════════════════════════════

function ChatPanel({
  messages, streaming, input, onInputChange, onInputKey, onSend, onStop,
  model, mode, setMode, attachments, setAttachments, onCopy, onAction,
  onRunCode, chatScrollRef, inputRef, onExpand, onNewSession, onRegenerate,
}) {
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const MODES = [
    { id: 'ask', label: 'Ask', icon: Search },
    { id: 'edit', label: 'Edit', icon: Pencil },
    { id: 'build', label: 'Build', icon: FileCode2 },
    { id: 'agent', label: 'Agent', icon: Sparkles },
  ]
  const ACTIONS = [
    { id: 'Copy', icon: Copy },
    { id: 'Edit', icon: Pencil },
    { id: 'Regenerate', icon: RefreshCw },
    { id: 'Explain', icon: Sparkles },
    { id: 'Debug', icon: Bug },
    { id: 'Optimize', icon: Zap },
    { id: 'New file', icon: FilePlus },
    { id: 'Insert', icon: FileInput },
  ]

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-2">
          <Sparkles size={11} className="text-vertex-blue" />
          <span className="text-[11.5px] font-medium text-white/90">Chat</span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/50">{messages.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onExpand} title="Expand chat" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><Maximize2 size={11} /></button>
          <button onClick={onRegenerate} title="Regenerate" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-vertex-blue hover:bg-vertex-blue/10 transition-colors"><RefreshCw size={11} /></button>
          <button onClick={onNewSession} title="New session" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-vertex-blue hover:bg-vertex-blue/10 transition-colors"><Plus size={12} /></button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-[0_4px_16px_-4px_rgba(255,255,255,0.3)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 7L9 12L5 17" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 17H19" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-[14px] font-semibold text-white">Start a session</h2>
            <p className="text-[11px] text-white/45 mt-0.5">Ask Vertex to build, debug, or refactor.</p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center max-w-md">
              {STARTER_PROMPTS.map(p => (
                <button key={p} onClick={() => { if (inputRef.current) { inputRef.current.value = p + ' '; onInputChange({ target: inputRef.current }); inputRef.current?.focus() } }} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10.5px] text-white/65 hover:bg-white/[0.05] hover:text-white hover:border-white/15 transition-all">{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            onHoverStart={() => setHoveredMsg(m.id)}
            onHoverEnd={() => setHoveredMsg(null)}
            className="group/msg relative pl-6"
          >
            <div className="absolute left-0 top-0">
              {m.role === 'user' ? (
                <div className="grid h-5 w-5 place-items-center rounded-md bg-white/[0.08]"><User size={10} className="text-white/70" /></div>
              ) : m.role === 'output' ? (
                <div className="grid h-5 w-5 place-items-center rounded-md bg-emerald-500/15"><Terminal size={10} className="text-emerald-400" /></div>
              ) : (
                <div className="grid h-5 w-5 place-items-center rounded-md bg-white shadow-[0_2px_8px_-2px_rgba(255,255,255,0.3)]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M5 7L9 12L5 17" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 17H19" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-[11.5px] font-semibold text-white">{m.role === 'user' ? 'You' : m.role === 'output' ? 'Output' : 'Vertex'}</span>
              {m.role === 'assistant' && <span className="rounded bg-vertex-blue/15 px-1.5 py-0.5 text-[9px] font-medium text-vertex-blue-bright">{MODELS.find(x => x.id === model)?.name}</span>}
              <span className="text-[9.5px] text-white/30">{m.ts}</span>
            </div>

            {/* OUTPUT message (from clicking Run) — renders as an output card */}
            {m.role === 'output' && m.output ? (
              <div className="overflow-hidden rounded-lg border border-emerald-500/20 bg-[#080808]">
                <div className={'px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wider ' + (m.output.isError ? 'text-red-400' : 'text-emerald-400')}>{m.output.isError ? 'Error' : 'Output'}</div>
                <pre className="px-2.5 pb-2 font-mono text-[11px] leading-[1.6] text-white/80 whitespace-pre-wrap">{m.output.text}</pre>
              </div>
            ) : (
              <div className="text-[12.5px] leading-[1.6] text-white/85">
                {m.role === 'user' ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown content={m.content} onRunCode={onRunCode} />}
              </div>
            )}

            {/* Action bar */}
            {m.role === 'assistant' && hoveredMsg === m.id && (
              <motion.div initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 flex flex-wrap items-center gap-0.5">
                {ACTIONS.map(a => (
                  <button key={a.id} onClick={() => a.id === 'Copy' ? onCopy(m.content) : a.id === 'Regenerate' ? onRegenerate() : onAction(a.id)} title={a.id} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-white/50 hover:bg-white/[0.06] hover:text-white transition-colors">
                    <a.icon size={10} />
                    <span className="hidden xl:inline">{a.id}</span>
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-0.5">
                  <button className="grid h-5 w-5 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"><ThumbsUp size={9} /></button>
                  <button className="grid h-5 w-5 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"><ThumbsDown size={9} /></button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <div className="pl-6">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-[11.5px] font-semibold text-white">Vertex</span>
              <span className="rounded bg-vertex-blue/15 px-1.5 py-0.5 text-[9px] font-medium text-vertex-blue-bright">{MODELS.find(x => x.id === model)?.name}</span>
              <span className="text-[9.5px] text-white/30">thinking…</span>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => <div key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-vertex-blue" style={{ animationDelay: (i * 0.15) + 's' }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.06] px-3 pb-2 pt-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#111] transition-colors focus-within:border-white/15 focus-within:bg-[#131313]">
          {/* Mode pills */}
          <div className="flex items-center gap-0.5 border-b border-white/[0.04] px-2 pt-1.5 pb-1">
            {MODES.map(m => {
              const active = mode === m.id
              return (
                <button key={m.id} onClick={() => setMode(m.id)} title={m.label} className={'group flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all ' + (active ? 'bg-vertex-blue/15 text-vertex-blue-bright' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]')}>
                  <m.icon size={10} className={active ? 'text-vertex-blue' : 'text-white/40 group-hover:text-white/70'} />
                  {m.label}
                </button>
              )
            })}
            <div className="ml-auto flex items-center gap-1 text-[10px] text-white/40">
              <AtSign size={9} className="text-vertex-blue" />
              <span className="font-mono">atlas</span>
            </div>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
              {attachments.map((a, i) => (
                <div key={i} className="group flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] py-1 pl-2 pr-1 text-[10px]">
                  <Paperclip size={8} className="text-vertex-blue" />
                  <span className="font-mono text-white/70">{a.name}</span>
                  <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="grid h-3.5 w-3.5 place-items-center rounded text-white/30 hover:bg-white/10 hover:text-white"><X size={8} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="flex items-end gap-2 px-2.5 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={onInputKey}
              rows={1}
              placeholder="Ask Vertex to build, debug, refactor..."
              className="flex-1 resize-none bg-transparent text-[12.5px] leading-[1.5] text-white placeholder:text-white/30 focus:outline-none"
              style={{ maxHeight: 180 }}
            />
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-0.5 border-t border-white/[0.04] px-1.5 py-1.5">
            <button onClick={() => setAttachments([...attachments, { name: 'file-' + (attachments.length + 1) + '.ts', type: 'ts' }])} title="Attach file" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><Paperclip size={12} /></button>
            <button onClick={() => setAttachments([...attachments, { name: 'src/components/', type: 'folder' }])} title="Attach folder" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><Folder size={12} /></button>
            <button onClick={() => setAttachments([...attachments, { name: '@workspace', type: 'context' }])} title="Mention context" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><AtSign size={12} /></button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-white/35 hidden sm:block">{input.length} chars</span>
              {streaming ? (
                <button onClick={onStop} className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-white/70 hover:bg-white/15"><Square size={9} className="fill-current" /></button>
              ) : (
                <button onClick={onSend} disabled={!input.trim() && attachments.length === 0} className={'grid h-7 w-7 place-items-center rounded-lg transition-all ' + (input.trim() || attachments.length ? 'bg-vertex-blue text-white shadow-[0_2px_12px_-2px_rgba(59,130,246,0.6)] hover:bg-vertex-blue-bright' : 'bg-white/[0.04] text-white/30')}>
                  <ArrowUp size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[9.5px] text-white/30">
          <span className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-500" /> 24 files · 47K tokens</span>
          <span>·</span>
          <span>Vertex can make mistakes.</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  EDITOR PANEL — code + tabs + AI suggestion (NO terminal)
// ═══════════════════════════════════════════════════════════════════════

const TAB_ICONS = {
  ts: FileCode2, tsx: FileCode2, js: FileCode2, jsx: FileCode2,
  json: FileJson, md: FileText, env: FileType,
}

function EditorPanel({
  activeFile, openTabs, onSelect, onCloseTab, fileMeta,
  suggestionVisible, onAcceptSuggestion, onDismissSuggestion,
  onExpand, onSplit, onRun,
}) {
  const [showOutline, setShowOutline] = useState(false)

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Tab strip */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.06] bg-[#0c0c0c]">
        <div className="flex flex-1 items-stretch overflow-x-auto">
          {openTabs.length === 0 && <div className="flex items-center px-3 text-[11px] text-white/30">No open files</div>}
          {openTabs.map(tab => {
            const ext = tab.split('.').pop() ?? ''
            const Icon = TAB_ICONS[ext] ?? FileCode2
            const active = tab === activeFile
            const isModified = PROJECT_TREE.flatMap(n => n.children ?? [n]).flatMap(c => c.children ?? [c]).some(n => n.path === tab && n.modified)
            return (
              <div key={tab} onClick={() => onSelect(tab)} className={'group relative flex cursor-pointer items-center gap-1.5 border-r border-white/[0.04] px-3 text-[11.5px] transition-colors ' + (active ? 'bg-[#0a0a0a] text-white' : 'bg-transparent text-white/55 hover:bg-white/[0.02] hover:text-white/80')}>
                {active && <motion.div layoutId="active-tab" className="absolute top-0 left-0 right-0 h-px bg-vertex-blue" />}
                <Icon size={11} className={active ? 'text-vertex-blue' : 'text-white/40 group-hover:text-white/70'} />
                <span className="font-medium">{tab.split('/').pop()}</span>
                {isModified && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                <button onClick={(e) => onCloseTab(tab, e)} className="grid h-3.5 w-3.5 place-items-center rounded text-white/30 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><X size={9} /></button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-0.5 border-l border-white/[0.04] px-1.5">
          <button onClick={onRun} title="Run (output in chat)" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"><Play size={11} className="fill-current" /></button>
          <button onClick={onSplit} title="Split editor" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><Split size={11} /></button>
          <button onClick={onExpand} title="Expand editor" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"><Maximize2 size={11} /></button>
          <button onClick={() => setShowOutline(v => !v)} title="Outline" className={'grid h-6 w-6 place-items-center rounded-md transition-colors ' + (showOutline ? 'text-vertex-blue bg-vertex-blue/10' : 'text-white/40 hover:text-white hover:bg-white/[0.06]')}><ListChecks size={11} /></button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex h-6 shrink-0 items-center gap-1 border-b border-white/[0.04] bg-[#0a0a0a] px-3 text-[10.5px] text-white/40">
        <span className="font-mono">atlas</span>
        {activeFile.split('/').map((part, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={9} />
            <span className={'font-mono ' + (i === arr.length - 1 ? 'text-white/80' : '')}>{part}</span>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 2 modified</span>
          <span className="flex items-center gap-1 text-white/30"><GitBranch size={8} /> feat/jwt-auth</span>
        </div>
      </div>

      {/* Outline (collapsible) */}
      <AnimatePresence>
        {showOutline && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-white/[0.04] bg-[#0c0c0c] px-3 py-2 overflow-hidden">
            <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">Outline</div>
            <div className="flex flex-wrap gap-1.5 text-[10.5px]">
              {['publicProcedure', 'protectedProcedure', 'authRouter', 'AppRouter'].map(fn => (
                <span key={fn} className="rounded bg-white/[0.04] px-2 py-0.5 text-white/65 font-mono">{fn}</span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-auto vertex-code">
          <CodeView code={fileMeta.code} />
        </div>

        {/* AI suggestion popup */}
        <AnimatePresence>
          {suggestionVisible && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-xl border border-vertex-blue/30 bg-[#0f0f0f]/95 backdrop-blur-md px-3 py-2 shadow-2xl shadow-vertex-blue/20">
              <div className="grid h-5 w-5 place-items-center rounded-md bg-vertex-blue/20"><Sparkles size={10} className="text-vertex-blue-bright" /></div>
              <div className="flex flex-col">
                <span className="text-[10.5px] font-medium text-white">AI suggestion ready</span>
                <span className="text-[9px] text-white/50"><kbd className="rounded border border-white/10 bg-white/[0.05] px-1 text-[8px] font-mono">Tab</kbd> accept · <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 text-[8px] font-mono">Esc</kbd> dismiss</span>
              </div>
              <button onClick={onAcceptSuggestion} className="ml-2 rounded-md bg-vertex-blue/20 px-2 py-1 text-[9.5px] font-medium text-vertex-blue-bright hover:bg-vertex-blue/30">Accept</button>
              <button onClick={onDismissSuggestion} className="grid h-5 w-5 place-items-center rounded text-white/40 hover:text-white hover:bg-white/10"><X size={9} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="flex h-5 shrink-0 items-center justify-between border-t border-white/[0.06] bg-[#0c0c0c] px-3 text-[10px] text-white/40">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-vertex-blue-bright"><Check size={8} /> No issues</span>
          <span className="flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> TS checking</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono">Ln 1, Col 1</span>
          <span className="font-mono">UTF-8</span>
          <span className="font-mono">LF</span>
          <span className="font-mono text-vertex-blue-bright capitalize">{fileMeta.lang}</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  RIGHT PANEL — Explorer, Open, Memory, Tasks, Preview (NO terminal)
// ═══════════════════════════════════════════════════════════════════════

function RightPanel({
  collapsed, onToggle, activeTab, setActiveTab, projectTree, expandedFolders,
  onToggleFolder, activeFile, onOpenFile, openTabs, onCopyPath,
}) {
  if (collapsed) {
    return (
      <div className="flex h-full w-11 shrink-0 flex-col items-center border-l border-white/[0.06] bg-[#0a0a0a] py-2 gap-1">
        <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]" title="Expand panel"><PanelRightClose size={13} className="rotate-180" /></button>
        <div className="my-1 h-px w-5 bg-white/[0.06]" />
        {RIGHT_TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); onToggle() }} title={tab.label} className={'group relative grid h-8 w-8 place-items-center rounded-lg transition-all ' + (active ? 'bg-white/[0.06] text-vertex-blue' : 'text-white/45 hover:text-white hover:bg-white/[0.03]')}>
              <tab.icon size={13} />
              {'badge' in tab && tab.badge && <span className="absolute -right-0.5 -top-0.5 grid h-3 min-w-3 place-items-center rounded-full bg-vertex-blue px-1 text-[8px] font-bold text-white">{tab.badge}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <span className="text-[11.5px] font-medium text-white/90">{RIGHT_TABS.find(t => t.id === activeTab)?.label}</span>
        <div className="flex items-center gap-0.5">
          <button className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"><Plus size={11} /></button>
          <button className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"><MoreHorizontal size={11} /></button>
          <button onClick={onToggle} title="Collapse panel" className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06]"><PanelRightClose size={12} /></button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-b border-white/[0.06] px-1.5 py-1.5 overflow-x-auto">
        {RIGHT_TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={tab.label} className={'relative grid h-6 w-6 shrink-0 place-items-center rounded-md transition-all ' + (active ? 'bg-white/[0.06] text-vertex-blue' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.03]')}>
              <tab.icon size={11} />
              {'badge' in tab && tab.badge && <span className="absolute -right-0.5 -top-0.5 grid h-3 min-w-3 place-items-center rounded-full bg-vertex-blue px-1 text-[8px] font-bold text-white">{tab.badge}</span>}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, x: 3 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -3 }} transition={{ duration: 0.12 }} className="h-full">
            {activeTab === 'explorer' && (
              <div className="py-1.5">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Atlas-engine</span>
                  <div className="flex items-center gap-0.5">
                    <button className="grid h-4 w-4 place-items-center rounded text-white/30 hover:text-white hover:bg-white/[0.06]"><Search size={9} /></button>
                    <button className="grid h-4 w-4 place-items-center rounded text-white/30 hover:text-white hover:bg-white/[0.06]"><Filter size={9} /></button>
                  </div>
                </div>
                <div className="px-1">
                  {projectTree.map(node => <FileTreeNode key={node.path} node={node} depth={0} expanded={expandedFolders} onToggle={onToggleFolder} activeFile={activeFile} onOpen={onOpenFile} onCopyPath={onCopyPath} />)}
                </div>
              </div>
            )}
            {activeTab === 'open' && (
              <div className="py-1.5">
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/35">Open editors</div>
                <div className="px-1 space-y-0.5">
                  {openTabs.length === 0 && <div className="px-2 py-3 text-[10.5px] text-white/30">No open files</div>}
                  {openTabs.map(p => {
                    const ext = p.split('.').pop() ?? ''
                    const Icon = TAB_ICONS[ext] ?? FileCode2
                    const active = p === activeFile
                    return (
                       <button key={p} onClick={() => onOpenFile(p)} className={'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ' + (active ? 'bg-vertex-blue/10 text-white' : 'text-white/65 hover:bg-white/[0.03] hover:text-white/90')}>
                        <Icon size={11} className={active ? 'text-vertex-blue' : 'text-white/40'} />
                        <span className="flex-1 truncate font-mono text-[10.5px]">{p}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {activeTab === 'memory' && (
              <div className="py-1.5">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">AI Memory</span>
                  <button className="grid h-4 w-4 place-items-center rounded text-white/30 hover:text-white hover:bg-white/[0.06]"><Plus size={9} /></button>
                </div>
                <div className="px-2 space-y-1.5">
                  {AI_MEMORY.map(m => (
                    <div key={m.id} className="group rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 hover:border-white/10 hover:bg-white/[0.04] transition-all cursor-pointer">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-1.5"><Brain size={9} className="text-vertex-blue" /><span className="text-[11px] font-medium text-white/90">{m.title}</span></div>
                        <span className="text-[9px] text-white/30">{m.time}</span>
                      </div>
                      <p className="text-[10.5px] leading-[1.5] text-white/55">{m.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'tasks' && (
              <div className="py-1.5">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Tasks</span>
                  <button className="grid h-4 w-4 place-items-center rounded text-white/30 hover:text-white hover:bg-white/[0.06]"><Plus size={9} /></button>
                </div>
                <div className="px-2 space-y-1.5">
                  {TASKS.map(t => (
                    <div key={t.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {t.status === 'running' && <Loader2 size={9} className="animate-spin text-vertex-blue-bright" />}
                          {t.status === 'done' && <Check size={9} className="text-emerald-400" />}
                          {t.status === 'queued' && <Clock size={9} className="text-white/40" />}
                          {t.status === 'pending' && <Circle size={9} className="text-white/30" />}
                          <span className="text-[11px] font-medium text-white/90">{t.name}</span>
                        </div>
                        <span className={'text-[9px] font-medium uppercase tracking-wider ' + (t.status === 'done' ? 'text-emerald-400' : t.status === 'running' ? 'text-vertex-blue-bright' : 'text-white/40')}>{t.status}</span>
                      </div>
                      <div className="mb-1 text-[9.5px] text-white/40 font-mono">{t.detail}</div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div className={'h-full rounded-full ' + (t.status === 'done' ? 'bg-emerald-500' : t.status === 'running' ? 'bg-vertex-blue' : 'bg-white/10')} initial={{ width: 0 }} animate={{ width: t.progress + '%' }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'preview' && (
              <div className="py-1.5">
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/35">Live preview</div>
                <div className="px-2 space-y-2">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-2">
                    <div className="flex items-center gap-2">
                      <Circle size={4} className="fill-emerald-500 text-emerald-500" />
                      <span className="text-[11px] font-medium text-emerald-400">Ready</span>
                      <span className="ml-auto text-[9.5px] text-white/40">2m ago</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[9.5px] text-white/40"><GitBranch size={8} /><span className="font-mono">feat/jwt-auth</span></div>
                    <div className="font-mono text-[10.5px] text-vertex-blue-bright break-all">https://atlas.preview.dev</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-2 text-[9.5px]">
                      <div><div className="text-white/40">Build</div><div className="text-white/85 font-mono">4.2s</div></div>
                      <div><div className="text-white/40">Size</div><div className="text-white/85 font-mono">247 KB</div></div>
                    </div>
                  </div>
                  <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 text-[11px] text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"><ExternalLink size={10} /> Open in new tab</button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  )
}

function FileTreeNode({
  node, depth, expanded, onToggle, activeFile, onOpen, onCopyPath,
}) {
  const isOpen = expanded.has(node.path)
  if (node.type === 'folder') {
    return (
      <div>
        <button onClick={() => onToggle(node.path)} className="group flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-[11.5px] text-white/65 hover:bg-white/[0.03] hover:text-white/90 transition-colors" style={{ paddingLeft: depth * 12 + 4 }}>
          {isOpen ? <ChevronDown size={10} className="text-white/40" /> : <ChevronRight size={10} className="text-white/40" />}
          {isOpen ? <FolderOpen size={11} className="text-vertex-blue/80" /> : <Folder size={11} className="text-white/40" />}
          <span className="flex-1 truncate font-medium">{node.name}</span>
        </button>
        <AnimatePresence>
          {isOpen && node.children && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              {node.children.map(c => <FileTreeNode key={c.path} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} activeFile={activeFile} onOpen={onOpen} onCopyPath={onCopyPath} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
  const ext = node.ext ?? ''
  const Icon = ext === 'json' ? FileJson : ext === 'md' ? FileText : ext === 'env' ? FileType : FileCode2
  const gitColor = { M: 'text-amber-400', A: 'text-emerald-400', D: 'text-red-400', U: 'text-vertex-blue-bright', C: 'text-white/40' }[node.git ?? 'C']
  const isActive = node.path === activeFile
  return (
    <div onClick={() => onOpen(node.path)} onContextMenu={(e) => { e.preventDefault(); onCopyPath(node.path) }} className={'group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-[11.5px] transition-colors ' + (isActive ? 'bg-vertex-blue/10 text-white' : 'text-white/65 hover:bg-white/[0.03] hover:text-white/90')} style={{ paddingLeft: depth * 12 + 20 }}>
      <Icon size={11} className={isActive ? 'text-vertex-blue' : 'text-white/40 group-hover:text-white/70'} />
      <span className={'flex-1 truncate ' + (node.modified ? 'font-medium' : '')}>{node.name}</span>
      {node.modified && <span className="h-1 w-1 rounded-full bg-amber-400" />}
      {node.git && <span className={'text-[8.5px] font-bold ' + gitColor}>{node.git}</span>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  COMMAND PALETTE
// ═══════════════════════════════════════════════════════════════════════

function CommandPalette({
  open, onClose, onAction,
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const ALL_COMMANDS = useMemo(() => [
    { id: 'a1', label: 'New session', icon: Plus, group: 'Actions', shortcut: '⌘N', action: { type: 'new-session' } },
    { id: 'a2', label: 'Toggle sidebar', icon: PanelLeft, group: 'Actions', shortcut: '⌘B', action: { type: 'toggle-sidebar' } },
    { id: 'a3', label: 'Toggle right panel', icon: PanelRightClose, group: 'Actions', shortcut: '⌘J', action: { type: 'toggle-right' } },
    { id: 'a4', label: 'Settings', icon: Settings, group: 'Actions', shortcut: '⌘,', action: { type: 'show-settings' } },
    { id: 'a5', label: 'Keyboard shortcuts', icon: Keyboard, group: 'Actions', shortcut: '?', action: { type: 'show-shortcuts' } },
    { id: 'a6', label: 'Focus chat', icon: Maximize2, group: 'Layout', action: { type: 'focus-chat' } },
    { id: 'a7', label: 'Focus editor', icon: Maximize2, group: 'Layout', action: { type: 'focus-editor' } },
    { id: 'a8', label: 'Balanced layout', icon: Maximize2, group: 'Layout', action: { type: 'focus-balanced' } },
    { id: 'a9', label: 'Mode: Ask', icon: Search, group: 'Modes', action: { type: 'switch-mode', mode: 'ask' } },
    { id: 'a10', label: 'Mode: Edit', icon: Pencil, group: 'Modes', action: { type: 'switch-mode', mode: 'edit' } },
    { id: 'a11', label: 'Mode: Build', icon: FileCode2, group: 'Modes', action: { type: 'switch-mode', mode: 'build' } },
    { id: 'a12', label: 'Mode: Agent', icon: Sparkles, group: 'Modes', action: { type: 'switch-mode', mode: 'agent' } },
    ...SESSIONS.map(s => ({ id: 's-' + s.id, label: s.title, hint: s.msgs + ' msgs · ' + s.time, icon: MessageSquare, group: 'Sessions', action: { type: 'open-session' } })),
    ...PROJECT_TREE.flatMap(n => n.children ?? [n]).filter(n => n.type === 'file').map(f => ({ id: 'f-' + f.path, label: f.name, hint: f.path, icon: FileCode2, group: 'Files', action: { type: 'open-file', path: f.path } })),
  ], [])

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_COMMANDS
    const q = query.toLowerCase()
    return ALL_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
  }, [query, ALL_COMMANDS])

  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach(c => { g[c.group] = g[c.group] ?? []; g[c.group].push(c) })
    return g
  }, [filtered])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); const item = filtered[selected]; if (item) onAction(item.action) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, selected, onAction])

  useEffect(() => { if (open) { setQuery(''); setSelected(0) } }, [open])

  const flat = []
  Object.entries(grouped).forEach(([, items]) => flat.push(...items))
  let runningIdx = -1

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[12vh]" onClick={onClose}>
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} onClick={e => e.stopPropagation()} className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e]/95 backdrop-blur-2xl shadow-2xl shadow-black/60">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <Search size={13} className="text-white/40" />
              <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelected(0) }} placeholder="Type a command or search..." className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/30 focus:outline-none" />
              <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-white/40">ESC</kbd>
            </div>
            <div className="max-h-[440px] overflow-y-auto p-2">
              {flat.length === 0 && <div className="px-3 py-8 text-center text-[12px] text-white/40">No results for "{query}"</div>}
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="mb-1">
                  <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">{group}</div>
                  {items.map(item => {
                    runningIdx++
                    const idx = runningIdx
                    const active = idx === selected
                    return (
                      <button key={item.id} onMouseEnter={() => setSelected(idx)} onClick={() => onAction(item.action)} className={'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ' + (active ? 'bg-vertex-blue/10 ring-1 ring-vertex-blue/30' : 'hover:bg-white/[0.03]')}>
                        <div className={'grid h-5 w-5 shrink-0 place-items-center rounded-md ' + (active ? 'bg-vertex-blue/20 text-vertex-blue-bright' : 'bg-white/[0.04] text-white/50')}><item.icon size={10} /></div>
                        <div className="flex-1 min-w-0">
                          <span className={'text-[12px] font-medium ' + (active ? 'text-white' : 'text-white/80')}>{item.label}</span>
                          {item.hint && <div className="truncate text-[10px] text-white/40 mt-0.5">{item.hint}</div>}
                        </div>
                        {item.shortcut && <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-white/40">{item.shortcut}</kbd>}
                        {active && <CornerDownLeft size={10} className="text-vertex-blue-bright" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-white/40">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><ArrowUp size={8} /><ArrowDown size={8} /> navigate</span>
                <span className="flex items-center gap-1"><CornerDownLeft size={8} /> select</span>
              </div>
              <div className="flex items-center gap-1.5"><Sparkles size={8} className="text-vertex-blue" /><span>Vertex</span></div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════════════

function SettingsModal({ open, onClose, showToast }) {
  const [section, setSection] = useState('general')
  const SECTIONS = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'editor', label: 'Editor', icon: FileCode2 },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'github', label: 'GitHub', icon: GithubIcon },
  ]
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} onClick={e => e.stopPropagation()} className="w-[680px] max-w-[92vw] max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-2xl">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="text-[13px] font-semibold text-white">Settings</span>
              <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06]"><X size={13} /></button>
            </div>
            <div className="flex min-h-0 max-h-[calc(80vh-44px)]">
              <div className="w-44 shrink-0 border-r border-white/[0.06] p-2">
                {SECTIONS.map(s => (
                  <button key={s.id} onClick={() => setSection(s.id)} className={'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11.5px] transition-colors ' + (section === s.id ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.03]')}>
                    <s.icon size={12} className={section === s.id ? 'text-vertex-blue' : 'text-white/45 group-hover:text-white/75'} />
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {section === 'general' && (
                  <div className="space-y-3">
                    <SettingRow label="Workspace name" desc="Shown in the top bar"><input defaultValue="atlas-engine" className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white focus:border-vertex-blue/40 focus:outline-none" /></SettingRow>
                    <SettingRow label="Auto-save" desc="Save files automatically"><ToggleSwitch initial={true} onChange={() => showToast('Auto-save toggled')} /></SettingRow>
                    <SettingRow label="Telemetry" desc="Send anonymous usage data"><ToggleSwitch initial={false} onChange={() => showToast('Telemetry toggled')} /></SettingRow>
                  </div>
                )}
                {section === 'editor' && (
                  <div className="space-y-3">
                    <SettingRow label="Font size" desc="In pixels"><input type="number" defaultValue={12} className="w-14 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11.5px] text-white focus:border-vertex-blue/40 focus:outline-none" /></SettingRow>
                    <SettingRow label="Tab size" desc="Spaces per indent"><select className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11.5px] text-white focus:outline-none"><option>2</option><option>4</option><option>8</option></select></SettingRow>
                    <SettingRow label="Word wrap" desc="Wrap long lines"><ToggleSwitch initial={true} onChange={() => showToast('Word wrap toggled')} /></SettingRow>
                  </div>
                )}
                {section === 'appearance' && (
                  <div className="space-y-3">
                    <SettingRow label="Theme" desc="Vertex is dark-only by design"><div className="flex items-center gap-2 text-[11px] text-white/50"><PanelLeft size={11} /> Dark (locked)</div></SettingRow>
                    <SettingRow label="Accent" desc="Used for active states">
                      <div className="flex gap-2">
                        {['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'].map(c => (
                          <button key={c} onClick={() => showToast('Accent: ' + c)} style={{ background: c }} className={'h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-[#0e0e0e] transition-all ' + (c === '#3b82f6' ? 'ring-white/40' : 'ring-transparent hover:ring-white/20')} />
                        ))}
                      </div>
                    </SettingRow>
                  </div>
                )}
                {section === 'shortcuts' && <ShortcutsList />}
                {section === 'ai' && (
                  <div className="space-y-3">
                    <SettingRow label="Default model" desc="Used for new chats"><select className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11.5px] text-white focus:outline-none">{MODELS.map(m => <option key={m.id}>{m.name}</option>)}</select></SettingRow>
                    <SettingRow label="Streaming" desc="Stream responses as they generate"><ToggleSwitch initial={true} onChange={() => showToast('Streaming toggled')} /></SettingRow>
                  </div>
                )}
                {section === 'github' && (
                  <div className="space-y-3">
                    <SettingRow label="Connected account" desc="@arjun-kapoor"><button onClick={() => showToast('Disconnecting...')} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.05]">Disconnect</button></SettingRow>
                    <SettingRow label="Auto-sync" desc="Push on every commit"><ToggleSwitch initial={true} onChange={() => showToast('Auto-sync toggled')} /></SettingRow>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Add this near your other small components, e.g. near Logo()
function GithubIcon({ size = 13, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.27 5.69.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .3.2.66.79.55A10.51 10.51 0 0023.5 12C23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-white">{label}</div>
        <div className="text-[10.5px] text-white/45 mt-0.5">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ToggleSwitch({ initial, onChange }) {
  const [on, setOn] = useState(initial)
  return (
    <button onClick={() => { setOn(!on); onChange(!on) }} className={'relative h-4.5 w-8 rounded-full transition-colors ' + (on ? 'bg-vertex-blue' : 'bg-white/[0.1]')} style={{ height: 18, width: 32 }}>
      <motion.div layout transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className={'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white ' + (on ? 'right-0.5' : 'left-0.5')} />
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  SHORTCUTS MODAL
// ═══════════════════════════════════════════════════════════════════════

function ShortcutsModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} onClick={e => e.stopPropagation()} className="w-[440px] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-2xl">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="text-[13px] font-semibold text-white flex items-center gap-2"><Keyboard size={13} /> Keyboard Shortcuts</span>
              <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06]"><X size={13} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <ShortcutsList />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShortcutsList() {
  const GROUPS = [
    {
      group: 'Global', items: [
        { keys: '⌘ K', label: 'Command palette' },
        { keys: '⌘ B', label: 'Toggle sidebar' },
        { keys: '⌘ J', label: 'Toggle right panel' },
        { keys: '⌘ ,', label: 'Settings' },
        { keys: '?', label: 'Show shortcuts' },
        { keys: 'Esc', label: 'Close / dismiss' },
      ]
    },
    {
      group: 'Chat', items: [
        { keys: '↵', label: 'Send message' },
        { keys: '⇧ ↵', label: 'New line' },
        { keys: '⌘ N', label: 'New session' },
      ]
    },
    {
      group: 'Editor', items: [
        { keys: '⌘ P', label: 'Quick open file' },
        { keys: '⌘ S', label: 'Save (auto-on)' },
        { keys: 'Tab', label: 'Accept AI suggestion' },
      ]
    },
  ]
  return (
    <div className="space-y-4">
      {GROUPS.map(g => (
        <div key={g.group}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">{g.group}</div>
          <div className="space-y-0.5">
            {g.items.map(item => (
              <div key={item.label} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                <span className="text-[11.5px] text-white/75">{item.label}</span>
                <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono text-white/65">{item.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
