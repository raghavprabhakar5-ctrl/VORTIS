import 'dotenv/config';
import express from 'express';
import admin from 'firebase-admin';
import Groq from 'groq-sdk';

// ── FIREBASE INIT ─────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// ── MODEL CONFIG ──────────────────────────────────────────────
// Groq free-tier TPD (tokens per day) limits:
//   qwen/qwen3.6-27b    → 200,000 TPD  (primary chat)
//   openai/gpt-oss-20b  → 200,000 TPD  (classifier / title)
//   openai/gpt-oss-120b → 100,000 TPD  (heavy fallback)
//
// Multi-key rotation (below) multiplies the effective TPD by the number
// of keys configured.
const GROQ_CHAT_PRIMARY = 'qwen/qwen3.6-27b';
const GROQ_CHAT_QUALITY = GROQ_CHAT_PRIMARY;
const GROQ_CHAT_FALLBACK = 'openai/gpt-oss-120b';
const GROQ_CLASSIFIER_MODEL = 'openai/gpt-oss-20b';

// Models that accept the `reasoning_effort` parameter. Passing it to
// other models returns HTTP 400.
const GROQ_REASONING_CAPABLE_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
]);

// ── GROQ MULTI-KEY ROTATION ───────────────────────────────────
// Collects GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, ... into an array.
// Each request round-robins to the next key, multiplying effective TPD
// by the number of keys. If a key returns 429 with TPD exhausted, we mark
// it as "dead for the day" and skip it until midnight UTC.
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
].filter(Boolean);

if (GROQ_API_KEYS.length === 0) {
  console.error('No GROQ_API_KEY set — chat will fail.');
} else {
  console.log(`Groq: ${GROQ_API_KEYS.length} key(s) loaded`);
}

// Round-robin counter + per-key "TPD exhausted" flag.
let groqKeyIndex = 0;
const groqKeyDeadUntil = new Map();  // key -> timestamp when safe to retry

function pickGroqKey() {
  if (GROQ_API_KEYS.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < GROQ_API_KEYS.length; i++) {
    const idx = (groqKeyIndex + i) % GROQ_API_KEYS.length;
    const key = GROQ_API_KEYS[idx];
    const deadUntil = groqKeyDeadUntil.get(key) || 0;
    if (now >= deadUntil) {
      groqKeyIndex = (idx + 1) % GROQ_API_KEYS.length;
      return key;
    }
  }
  return GROQ_API_KEYS[groqKeyIndex];
}

function markGroqKeyTpdExhausted(key, retryAfterMs) {
  if (!key) return;
  const wait = Math.min(retryAfterMs || (24 * 60 * 60 * 1000), 24 * 60 * 60 * 1000);
  groqKeyDeadUntil.set(key, Date.now() + wait);
  console.warn(`Groq key ${key.slice(0, 10)}... marked TPD-exhausted for ${Math.round(wait / 1000 / 60)}min — ${GROQ_API_KEYS.length - 1} key(s) still active`);
}

function makeGroqClient(key) {
  if (!key) return null;
  return new Groq({ apiKey: key });
}

const NVIDIA_BASE_URL     = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_CHAT_FAST    = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const NVIDIA_CHAT_QUALITY = 'moonshotai/kimi-k3';
const NVIDIA_CHAT_CODE    = 'nvidia/nemotron-3-ultra-550b-a55b';

const NVIDIA_VISION_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

const NVIDIA_VISION_CHAIN = [
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'meta/llama-3.2-11b-vision-instruct',
];

const NVIDIA_VISION_CF_FALLBACK = [
  ['@cf/llava-hf/llava-1.5-7b-hf', true],
];

const NVIDIA_CODE_MODEL_HEAVY    = NVIDIA_CHAT_CODE;
const NVIDIA_CODE_MODEL_FAST     = NVIDIA_CHAT_FAST;
const NVIDIA_CHAT_MODEL_QUALITY  = NVIDIA_CHAT_QUALITY;

const NVIDIA_CODE_CHAINS = {
  heavy:    [NVIDIA_CODE_MODEL_HEAVY, NVIDIA_CHAT_MODEL_QUALITY, NVIDIA_CODE_MODEL_FAST],
  standard: [NVIDIA_CODE_MODEL_FAST,  NVIDIA_CHAT_MODEL_QUALITY],
  trivial:  [NVIDIA_CODE_MODEL_FAST,  NVIDIA_CHAT_MODEL_QUALITY],
};

function pickHeavyChain() {
  const heavyValid   = !isNvidiaModelInvalid(NVIDIA_CODE_MODEL_HEAVY);
  const qualityValid = !isNvidiaModelInvalid(NVIDIA_CHAT_MODEL_QUALITY);
  const fastValid    = !isNvidiaModelInvalid(NVIDIA_CODE_MODEL_FAST);

  const order = [];
  if (heavyValid) order.push(NVIDIA_CODE_MODEL_HEAVY);

  if (!order.includes(NVIDIA_CHAT_MODEL_QUALITY)) order.push(NVIDIA_CHAT_MODEL_QUALITY);
  if (fastValid && !order.includes(NVIDIA_CODE_MODEL_FAST)) order.push(NVIDIA_CODE_MODEL_FAST);

  if (order.length === 0) {
    console.error('pickHeavyChain: heavy, quality, and fast models are all currently invalid — request will fail');
  } else if (!heavyValid) {
    console.warn(`pickHeavyChain: heavy model ${NVIDIA_CODE_MODEL_HEAVY} is currently invalid (TTL ${nvidiaModelInvalidRemainingSec(NVIDIA_CODE_MODEL_HEAVY)}s remaining) — heavy requests now run on [${order.join(', ')}]`);
  } else if (!qualityValid) {
    console.warn(`pickHeavyChain: quality model ${NVIDIA_CHAT_MODEL_QUALITY} is marked invalid but WILL still be tried once per heavy request (TTL ${nvidiaModelInvalidRemainingSec(NVIDIA_CHAT_MODEL_QUALITY)}s remaining)`);
  }
  return order;
}

// Coding verbs and their common typos.
const CODING_VERBS_EXACT = [
  'make', 'build', 'create', 'generate', 'develop', 'implement',
  'code', 'write', 'debug', 'refactor', 'fix', 'optimi', 'optimize',
  'optimise', 'compile', 'deploy',
];
const CODING_VERBS_TYPOS = [
  'amke', 'mkae', 'maek', 'mak', 'makke', 'mke',
  'bulid', 'biuld', 'buidl', 'buld', 'bild', 'builld',
  'craete', 'cretae', 'cerate', 'creat', 'creatte', 'crteate',
  'genrate', 'generat', 'generete', 'genrate', 'genertae',
  'wrtie', 'wirte', 'wrie', 'writ', 'writte',
  'deubg', 'debg', 'dbgug', 'deugg',
  'fxi', 'fx', 'fixx',
  'refacter', 'refacotr', 'refacter', 'rfactor',
  'implment', 'implement', 'implemnt', 'impliment',
  'cdoe', 'ocde', 'cde',
  'develp', 'develoop', 'develope', 'dvlp',
  'optimze', 'optmize', 'optmize',
  'depoy', 'delpoy', 'deply',
];

function containsCodingVerb(text) {
  if (!text) return false;
  const low = text.toLowerCase();
  for (const v of CODING_VERBS_EXACT) {
    if (new RegExp(`\\b${v}\\b`).test(low)) return true;
  }
  for (const v of CODING_VERBS_TYPOS) {
    if (new RegExp(`\\b${v}\\b`).test(low)) return true;
  }
  try {
    const words = low.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    for (const w of words) {
      for (const v of CODING_VERBS_EXACT) {
        if (Math.abs(w.length - v.length) <= 2 && levenshtein(w, v) <= 2) return true;
      }
    }
  } catch (_) {}
  return false;
}

function isActualCodingTask(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase();
  if (/```/.test(text)) return true;
  if (containsCodingVerb(text) && /\b(me|a|an|the|some|this|that)\b/i.test(text)) return true;
  if (containsCodingVerb(text) && low.trim().length < 100) return true;
  if (/\b(stack trace|exception|compile|syntax error|unit test|integration test)\b/i.test(text)) return true;
  if (/\b(def |function\s*\(|class\s+\w+|import\s|from\s+\w+\s+import|const\s|let\s|var\s|=>|public\s+class|<\?php|#include|console\.log|print\(|async\s+function|await\s|return\s|if\s*\(|for\s*\(|while\s*\()\b/.test(text)) return true;
  if (text.length > 200 && /\b(code|function|api|endpoint|database|query|algorithm|architecture|design pattern|class|method|variable|array|object|loop|recursion|complexity|game|app|website|script|program)\b/i.test(low)) return true;
  return false;
}

function isTrivialCodeMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase().trim();
  if (containsCodingVerb(text)) return false;
  if (low.length < 15) return true;
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|cool|nice|great|awesome)\b/.test(low)) return true;
  if (/^(what (is|s) your name|who are you|how are you|good morning|good evening)\b/.test(low)) return true;
  return false;
}

function pickCodeChatChain(text) {
  if (isImageGenerationRequest(text))   return 'trivial';
  if (isVisionDescribedImageMessage(text)) return 'trivial';
  if (isActualCodingTask(text))   return 'heavy';
  if (isTrivialCodeMessage(text)) return 'trivial';
  return 'standard';
}

function isVisionDescribedImageMessage(text) {
  if (!text || typeof text !== 'string') return false;
  if (/\[Image:[^\]]*—\s*(Image description|OCR extracted text):\]/.test(text)) return true;
  if (/\[Attached image:[^\]]*\]/.test(text)) return true;
  if (/^\s*\[Image:[^\]]*—/m.test(text)) return true;
  return false;
}

function isImageGenerationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase();

  const hasGenVerb = /\b(generate|genrate|generat|draw|paint|create|cretae|creat|make|render|produce|design|sketch|illustrate)\b/i.test(low);
  const hasImageNoun = /\b(image|images|picture|pictures|photo|photos|artwork|art|drawing|painting|illustration|wallpaper|logo|icon)\b/i.test(low);
  if (!hasGenVerb || !hasImageNoun) return false;

  const looksLikeCodingTask = /\b(debug|refactor|optimi[sz]e|fix|code|function|class|component|api|endpoint|bug|error|stack trace|unit test|compile)\b/i.test(low);
  if (looksLikeCodingTask) {
    const firstChars = low.slice(0, 150);
    const isPureImageRequest = !/\b(function|code|class|script|method|api|component|endpoint|bug|error|compile|debug)\b/.test(firstChars);
    if (!isPureImageRequest) return false;
  }

  return true;
}

// ── NVIDIA CIRCUIT BREAKER ────────────────────────────────────
const NVIDIA_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const NVIDIA_FAILURE_THRESHOLD   = 2;
const nvidiaFailureTracker = new Map();

const NVIDIA_WARM_LATENCY_THRESHOLD_MS = {
  [NVIDIA_CODE_MODEL_HEAVY]: 30000,
  [NVIDIA_CHAT_MODEL_QUALITY]: 5000,
  [NVIDIA_CODE_MODEL_FAST]: 15000,
  _default: 10000,
};
const NVIDIA_WARM_TTL_MS = 90 * 1000;
const nvidiaWarmState = new Map();

// ── FIX 2: track consecutive "slow" pings per model so we stop calling
// sustained degradation "warming up" after the first few cycles. A model
// that is slow on ping #20 in a row isn't cold-starting — it's throttled
// or overloaded upstream, and should be flagged distinctly (and treated
// as NOT warm) rather than logged the same generic way forever.
const nvidiaConsecutiveSlow = new Map(); // model -> count

function recordNvidiaLatency(model, latencyMs) {
  const threshold = NVIDIA_WARM_LATENCY_THRESHOLD_MS[model] ?? NVIDIA_WARM_LATENCY_THRESHOLD_MS._default;
  nvidiaWarmState.set(model, { warm: latencyMs <= threshold, lastCheck: Date.now() });
}

function isNvidiaModelWarm(model) {
  const entry = nvidiaWarmState.get(model);
  if (!entry) return false;
  if (Date.now() - entry.lastCheck > NVIDIA_WARM_TTL_MS) return false;
  return entry.warm;
}

const NVIDIA_INVALID_TTL_MS = 30 * 60 * 1000;
const nvidiaEolModels = new Map();

function markNvidiaModelInvalid(model, reason) {
  const prev = nvidiaEolModels.get(model);
  nvidiaEolModels.set(model, {
    expiresAt: Date.now() + NVIDIA_INVALID_TTL_MS,
    reason,
    since: Date.now(),
  });
  if (!prev) {
    console.error(`NVIDIA model ${model} marked INVALID for ${NVIDIA_INVALID_TTL_MS / 60000}min — ${reason}. Will auto-retry after TTL expires.`);
  }
}

function isNvidiaModelInvalid(model) {
  const entry = nvidiaEolModels.get(model);
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt) {
    nvidiaEolModels.delete(model);
    console.log(`NVIDIA model ${model} invalid TTL expired — will retry on next request`);
    return false;
  }
  return true;
}

function nvidiaModelInvalidRemainingSec(model) {
  const entry = nvidiaEolModels.get(model);
  if (!entry) return -1;
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}

function isNvidiaModelBlocked(model) {
  if (isNvidiaModelInvalid(model)) return true;
  const entry = nvidiaFailureTracker.get(model);
  if (!entry) return false;
  if (entry.count < NVIDIA_FAILURE_THRESHOLD) return false;
  const elapsed = Date.now() - entry.lastFailTime;
  if (elapsed >= NVIDIA_FAILURE_COOLDOWN_MS) {
    nvidiaFailureTracker.delete(model);
    return false;
  }
  return true;
}

function recordNvidiaFailure(model) {
  if (nvidiaEolModels.has(model)) return;
  const entry = nvidiaFailureTracker.get(model) || { count: 0, lastFailTime: 0 };
  entry.count += 1;
  entry.lastFailTime = Date.now();
  nvidiaFailureTracker.set(model, entry);
  console.warn(`NVIDIA circuit breaker: ${model} failed ${entry.count}/${NVIDIA_FAILURE_THRESHOLD} (cooldown ${Math.round((NVIDIA_FAILURE_COOLDOWN_MS - (Date.now() - entry.lastFailTime)) / 1000)}s remaining if threshold hit)`);
}

function recordNvidiaSuccess(model) {
  if (nvidiaFailureTracker.has(model)) {
    nvidiaFailureTracker.delete(model);
    console.log(`NVIDIA circuit breaker: ${model} recovered, counter reset`);
  }
}

const CF_CHAT_MODELS = [
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
];

// ── GROQ TPM BUDGET + COOLDOWN TRACKING ─────────────────────────
// TPM (tokens-per-minute) is a rolling combined-token budget we track
// ourselves as a soft guard. It is SEPARATE from Groq's hard per-request
// OTPM (output-tokens-per-minute) ceiling below — TPM being "available"
// does NOT mean a single request's max_tokens is allowed; see
// GROQ_OTPM_CAPS / groqOtpmCapFor for the hard ceiling fix.
const GROQ_TPM_CAPS = {
  'qwen/qwen3.6-27b':         process.env.GROQ_TPM_QWEN ? Number(process.env.GROQ_TPM_QWEN) : 7000,
  'openai/gpt-oss-20b':       process.env.GROQ_TPM_20B  ? Number(process.env.GROQ_TPM_20B)  : 7000,
  'openai/gpt-oss-120b':      process.env.GROQ_TPM_120B ? Number(process.env.GROQ_TPM_120B) : 4000,
  _default: 6000,
};

function groqTpmCapFor(model) {
  return GROQ_TPM_CAPS[model] ?? GROQ_TPM_CAPS._default;
}

// ── FIX 1: Groq's real, hard, per-REQUEST output-token ceiling (OTPM).
// This is NOT the same thing as GROQ_TPM_CAPS above (which is a rolling
// budget we invented client-side). OTPM is enforced by Groq itself and a
// SINGLE request whose max_tokens exceeds this value gets an immediate
// 429 — no amount of "budget available" bookkeeping helps, because the
// violation is on the request itself, not accumulated usage.
//
// Verify these numbers against your actual Groq console limits page —
// the values below reflect what production logs showed for qwen
// (Limit 1000, Requested 1024 → 429). Don't assume 20b/120b share the
// same ceiling; check each model's real OTPM in your account.
const GROQ_OTPM_CAPS = {
  'qwen/qwen3.6-27b':    process.env.GROQ_OTPM_QWEN ? Number(process.env.GROQ_OTPM_QWEN) : 1000,
  'openai/gpt-oss-20b':  process.env.GROQ_OTPM_20B  ? Number(process.env.GROQ_OTPM_20B)  : 1000,
  'openai/gpt-oss-120b': process.env.GROQ_OTPM_120B ? Number(process.env.GROQ_OTPM_120B) : 1000,
  _default: 1000,
};
function groqOtpmCapFor(model) {
  return GROQ_OTPM_CAPS[model] ?? GROQ_OTPM_CAPS._default;
}

const groqTpmTracker = new Map();
const groqCooldowns  = new Map();

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function groqTpmAvailable(model, estimatedTokens) {
  const capTpm = groqTpmCapFor(model);
  const now = Date.now();
  const windowMs = 60000;
  const entries = (groqTpmTracker.get(model) || []).filter(e => now - e.time < windowMs);
  groqTpmTracker.set(model, entries);
  const used = entries.reduce((sum, e) => sum + e.tokens, 0);
  return (used + estimatedTokens) <= capTpm;
}

function recordGroqTpm(model, tokens) {
  const entries = groqTpmTracker.get(model) || [];
  entries.push({ tokens, time: Date.now() });
  groqTpmTracker.set(model, entries);
}

function isGroqCoolingDown(model) {
  const until = groqCooldowns.get(model);
  return until && Date.now() < until;
}

function setGroqCooldown(model, retryAfterSec = 30, isRealRateLimit = false) {
  const capped = isRealRateLimit
    ? Math.min(retryAfterSec, 30)
    : Math.min(retryAfterSec, 5);
  groqCooldowns.set(model, Date.now() + capped * 1000);
  console.log(`Cooling down ${model} for ${capped}s (realRateLimit=${isRealRateLimit})`);
}

function parseRetryAfterSec(errMessage) {
  const match = errMessage?.match(/try again in ([\d.]+)s/i);
  return match ? parseFloat(match[1]) : 30;
}

// ── RATE LIMITER ──────────────────────────────────────────────
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:    { window: 60000, max: 30 },
  image:   { window: 60000, max: 5 },
  search:  { window: 60000, max: 20 },
  vision:  { window: 60000, max: 15 },
  tts:     { window: 60000, max: 20 },
  execute: { window: 60000, max: 15 },
  transcribe: { window: 60000, max: 40 },
  nvidia_global: { window: 60000, max: 35 },
  memory: { window: 60000, max: 20 },
  title:   { window: 60000, max: 20 },
};

setInterval(() => {
  const now = Date.now();
  const maxWindow = Math.max(...Object.values(RATE_LIMITS).map(r => r.window));
  for (const [key, requests] of rateLimiter.entries()) {
    const recent = requests.filter(t => now - t < maxWindow);
    if (recent.length === 0) rateLimiter.delete(key);
    else rateLimiter.set(key, recent);
  }
}, 10 * 60 * 1000);

function checkRateLimit(ip, action) {
  const limit    = RATE_LIMITS[action] || RATE_LIMITS.chat;
  const key      = `${ip}_${action}`;
  const now      = Date.now();
  const requests = rateLimiter.get(key) || [];
  const recent   = requests.filter(t => now - t < limit.window);
  if (recent.length >= limit.max) return false;
  recent.push(now);
  rateLimiter.set(key, recent);
  return true;
}

function checkGlobalLimit(action) {
  const limit    = RATE_LIMITS[action];
  if (!limit) return true;
  const key      = `__global__${action}`;
  const now      = Date.now();
  const requests = rateLimiter.get(key) || [];
  const recent   = requests.filter(t => now - t < limit.window);
  if (recent.length >= limit.max) return false;
  recent.push(now);
  rateLimiter.set(key, recent);
  return true;
}

// ── SANITIZATION ──────────────────────────────────────────────
function sanitizeString(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '');
}

function sanitizeHistory(history, maxMessages = 30) {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxMessages)
    .filter(m => m && typeof m === 'object' && m.role && m.content)
    .map(m => ({
      role:    ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user',
      content: sanitizeString(String(m.content), 8000),
    }));
}

function isValidBase64Image(str) {
  if (!str || typeof str !== 'string') return false;
  const validPrefixes = [
    'data:image/jpeg;base64,', 'data:image/jpg;base64,',
    'data:image/png;base64,',  'data:image/gif;base64,',
    'data:image/webp;base64,',
  ];
  const hasPrefix = validPrefixes.some(p => str.startsWith(p));
  if (!hasPrefix && str.length > 10) return /^[A-Za-z0-9+/=]+$/.test(str.slice(0, 100));
  return hasPrefix;
}

function isImageTooLarge(base64str) {
  const raw = base64str.startsWith('data:') ? base64str.split(',')[1] : base64str;
  return (raw.length * 3) / 4 > 5 * 1024 * 1024;
}

// ── HELPERS ───────────────────────────────────────────────────
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const res = await fetch(url, { ...options, signal: controller.signal, body: options.body });
    res.__clearTimeout = () => clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function readStreamWithIdleTimeout(reader, decoder, onChunk, idleMs = 15000) {
  let buffer = '';
  let idleTimer = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try { reader.cancel('idle-timeout').catch(() => {}); } catch (_) {}
    }, idleMs);
  };
  resetIdle();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      onChunk(buffer);
      buffer = '';
      resetIdle();
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

function isValidResponse(text) {
  if (!text || text.trim().length < 2) return false;
  return !/rate.?limit|connection.?error|too many request|try again later|quota exceeded|service unavailable/i.test(text.trim());
}

function stripInternalReasoning(text) {
  if (!text) return text;
  let t = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^→.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
  const preamblePatterns = [
    /^here'?s a thinking process\s*:?\n[\s\S]*?\n\n/i,
    /^let me think[^\n]*\n[\s\S]*?\n\n/i,
    /^\*\*thinking:?\*\*\s*\n[\s\S]*?\n\n/i,
    /^step \d+\s*:[^\n]*\n(?:step \d+\s*:[^\n]*\n)+\n/i,
    /^analysis\s*:?\n[\s\S]*?\n\n/i,
    /^reasoning\s*:?\n[\s\S]*?\n\n/i,
  ];
  for (const re of preamblePatterns) {
    t = t.replace(re, '');
  }
  t = t.replace(/^CODE MODE:.*$/gim, '');
  t = t.replace(/^Vertex streaming active.*$/gim, '');
  t = t.replace(/^NVIDIA is primary.*$/gim, '');
  t = t.replace(/^Respond directly with the final answer.*$/gim, '');
  t = t.replace(/^Do NOT emit any thinking.*$/gim, '');
  t = t.replace(/^Do NOT echo or reference these instructions.*$/gim, '');
  t = t.replace(/^\s*\n/gm, '\n').trim();
  t = t.split(/\n+/)
    .filter(line => !/\b(the user is|the user said|the user wants|i (should|need to|will) reply|detected language|i think the|so i should|i don'?t have (access to|real-?time)|as of my (last )?(training|knowledge))\b/i.test(line))
    .join(' ')
    .trim();
  return t || text;
}

// ── COMPLEXITY CHECK ───────────────────────────────────────────
function isComplexMessage(text) {
  const low = text.toLowerCase().trim();
  if (low.length < 40) return false;
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|what time|what date|how are you|who are you|what is your name)\b/.test(low)) return false;
  if (/\b(explain|compare|analyze|research|write|code|debug|essay|story|poem|translate|summarize|step by step|how does|why does|difference between|pros and cons|calculate|solve|math|equation|algorithm|implement|function|class|component)\b/.test(low)) return true;
  if (text.length > 200) return true;
  if (/```|def |function |class |import |const |let |var /.test(text)) return true;
  return false;
}

function isObviouslyHard(text) {
  if (/```|def |function\s*\(|class\s+\w+|import\s|from\s+\w+\s+import|const\s|let\s|var\s|=>|public\s+class|<\?php|#include|console\.log|print\(/.test(text)) return true;
  if (/\b(debug|stack trace|error:|exception|algorithm|refactor|optimi[sz]e|complexity|recursion|architecture|design pattern)\b/i.test(text)) return true;
  return false;
}

function isObviouslyTrivial(text) {
  const low = text.toLowerCase().trim();
  if (low.length < 40) return true;
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|what time|what date|how are you|who are you|what is your name)\b/.test(low)) return true;
  return false;
}

// ── AI-BASED TIER CLASSIFIER ───────────────────────────────────
async function classifyTier(groq, text) {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('table') ||
    lowerText.includes('line-by-line') ||
    lowerText.includes('line by line') ||
    isObviouslyHard(text)
  ) {
    return 'hard';
  }

  if (isObviouslyTrivial(text)) {
    return 'medium';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const result = await groq.chat.completions.create({
      model: GROQ_CLASSIFIER_MODEL,
      messages: [
        {
          role: 'system',
          content: `Classify the user's message into exactly one difficulty tier.
"medium" = casual conversation, simple greetings, simple Q&A, short explanations, opinions.
"hard" = coding, debugging, formatting requests (like markdown tables), math, line-by-line breakdowns, multi-step reasoning, long-form writing.
Respond ONLY with the word "medium" or "hard". Do not use JSON or punctuation.`,
        },
        { role: 'user', content: text.slice(0, 1000) },
      ],
      max_tokens: 10,
      temperature: 0,
    }, { signal: controller.signal });

    const raw = result.choices?.[0]?.message?.content?.toLowerCase() || '';
    return raw.includes('hard') ? 'hard' : 'medium';
  } catch (e) {
    console.warn('Tier classifier failed, falling back to heuristic:', e.message);
    return isComplexMessage(text) ? 'hard' : 'medium';
  } finally {
    clearTimeout(timer);
  }
}

// ── NVIDIA NIM CHAT FALLBACK ────────────────────────────────────
async function tryNvidiaChat(modelId, messages, maxTokens, clientSignal, timeoutMs = 60000) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  if (isNvidiaModelBlocked(modelId)) {
    console.log(`NVIDIA model ${modelId} skipped — circuit breaker open`);
    return null;
  }
  try {
    const res = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:       modelId,
          messages,
          max_tokens:  maxTokens,
          temperature: 0.7,
          stream:      false,
        }),
        signal: clientSignal,
      },
      timeoutMs
    );
    if (!res.ok) {
      console.log(`NVIDIA model ${modelId} HTTP ${res.status}`);
      if (res.status === 404 || res.status === 401 || res.status === 410) {
        markNvidiaModelInvalid(modelId, `HTTP ${res.status}`);
        return null;
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        recordNvidiaFailure(modelId);
        recordNvidiaFailure(modelId);
        console.warn(`NVIDIA model ${modelId} HTTP ${res.status} — instant circuit breaker trip — unavailable (2 min cooldown)`);
        return null;
      }
      recordNvidiaFailure(modelId);
      return null;
    }
    if (res.__clearTimeout) res.__clearTimeout();
    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content ?? null;
    if (typeof rawText !== 'string') {
      recordNvidiaFailure(modelId);
      return null;
    }
    const text = stripInternalReasoning(rawText);
    if (isValidResponse(text)) {
      recordNvidiaSuccess(modelId);
      return text;
    }
    recordNvidiaFailure(modelId);
    return null;
  } catch (e) {
    console.log(`NVIDIA model error (${modelId}):`, e.message);
    if (e.name !== 'AbortError' && !clientSignal?.aborted) {
      recordNvidiaFailure(modelId);
    }
    return null;
  }
}

// ── STREAMING callAI ───────────────────────────────────────────
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, preferQuality = false, skipNvidia = false }) {
  const currentKey = pickGroqKey();
  if (!currentKey) {
    console.error('streamAI: no Groq key available — skipping Groq entirely');
    return streamAIFallbackChain(messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, skipNvidia });
  }
  const groqClient = makeGroqClient(currentKey);

  const systemPrompt = messages.find(m => m.role === 'system');
  const recentConversations = messages.filter(m => m.role !== 'system').slice(-12);
  const optimizedMessages = systemPrompt ? [systemPrompt, ...recentConversations] : [...recentConversations];
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  const hasCodeFence = /```/.test(lastMsg);
  const looksLikeCodeRequest = isObviouslyHard(lastMsg);
  const isHard = hasCodeFence || looksLikeCodeRequest;

  const bufferMode = looksLikeTableRequest(lastMsg);

  const trivialTier = isObviouslyTrivial(lastMsg);

  // ── FIX 1: lowered trivial-tier default from 1024 → 900. Groq enforces
  // a hard per-request OTPM (output-tokens-per-minute) ceiling of ~1000
  // for these models — a request asking for 1024 output tokens will 429
  // EVERY time regardless of "budget available" bookkeeping, because the
  // violation is on the single request, not accumulated usage. Hard
  // requests (6000) still exceed OTPM and get clamped per-model below
  // via groqOtpmCapFor() right before each attempt.
  const maxTokens = isHard ? 6000 : (trivialTier ? 900 : 2048);

  const modelChain = [GROQ_CHAT_PRIMARY, GROQ_CHAT_FALLBACK];

  console.log(`Routing: hard=${isHard} bufferMode=${bufferMode} trivial=${trivialTier} → primary: ${modelChain[0]} → maxTokens: ${maxTokens}`);

  const MAX_CONTINUATIONS = 3;

  for (const modelToTry of modelChain) {
    const estTokens = estimateTokens(JSON.stringify(optimizedMessages)) + maxTokens;
    if (isGroqCoolingDown(modelToTry)) { console.log(`Skipping ${modelToTry} — cooling down`); continue; }

    let effectiveMaxTokens = maxTokens;

    // ── FIX 1: HARD ceiling clamp — Groq will 429 any single request
    // whose max_tokens exceeds this model's OTPM cap, no matter how much
    // rolling TPM "budget" the soft tracker below thinks is available.
    // This must run BEFORE the soft-budget check so hard requests (which
    // ask for 6000) get clamped down to something Groq will actually
    // accept in one call. Long answers are still completed via the
    // existing MAX_CONTINUATIONS loop further down.
    const otpmCap = groqOtpmCapFor(modelToTry);
    if (effectiveMaxTokens > otpmCap) {
      const clamped = Math.max(otpmCap - 50, 200);
      console.log(`Routing: ${modelToTry} OTPM cap is ${otpmCap} — clamping max_tokens ${effectiveMaxTokens} → ${clamped}`);
      effectiveMaxTokens = clamped;
    }

    if (!groqTpmAvailable(modelToTry, estTokens)) {
      const cap = groqTpmCapFor(modelToTry);
      const promptTokens = estTokens - maxTokens;
      const remainingBudget = cap - promptTokens;
      if (remainingBudget >= 500) {
        // Use Math.min against the ALREADY-clamped effectiveMaxTokens so
        // the OTPM clamp above can never be widened back out here.
        effectiveMaxTokens = Math.min(remainingBudget, effectiveMaxTokens);
        console.log(`Routing: ${modelToTry} TPM tight — reducing max_tokens to ${effectiveMaxTokens} (prompt=${promptTokens}, cap=${cap})`);
      } else {
        console.log(`Skipping ${modelToTry} — TPM budget exhausted (prompt=${promptTokens}, cap=${cap}, remaining=${remainingBudget})`);
        continue;
      }
    }
    if (clientSignal?.aborted) { console.log('Client disconnected before model call'); return false; }

    const supportsReasoning = GROQ_REASONING_CAPABLE_MODELS.has(modelToTry);
    const reasoningEffort = supportsReasoning ? 'none' : null;

    try {
      let convoMessages = [...optimizedMessages];
      let fullBuffer = '';
      let continuations = 0;
      let streamedAnything = false;

      while (true) {
        const requestParams = {
          model: modelToTry,
          messages: convoMessages,
          max_tokens: effectiveMaxTokens,
          temperature: 0.7,
          stream: true,
        };
        if (reasoningEffort !== null) {
          requestParams.reasoning_effort = reasoningEffort;
        }
        const stream = await groqClient.chat.completions.create(requestParams, { signal: clientSignal });
        recordGroqTpm(modelToTry, (estTokens - maxTokens) + effectiveMaxTokens);

        let buffer = '';
        let finishReason = null;
        let inThink = false;
        let pending = '';
        let groqFirstByteMs = 0;
        const __t0 = Date.now();

        const GROQ_FIRST_BYTE_MS = 9000;
        const GROQ_IDLE_MS = 15000;
        let groqIdleTimer = null;
        const armGroqTimer = (ms, why) => {
          if (groqIdleTimer) clearTimeout(groqIdleTimer);
          groqIdleTimer = setTimeout(() => {
            try { stream.controller?.abort?.(why); } catch(_) {}
            try { (stream.abort || (() => {}))(why); } catch(_) {}
          }, ms);
        };
        armGroqTimer(GROQ_FIRST_BYTE_MS, 'groq-first-byte-timeout');

        let groqStreamError = null;
        try {
          for await (const chunk of stream) {
            if (clientSignal?.aborted) break;
            if (!groqFirstByteMs) {
              groqFirstByteMs = Date.now() - __t0;
              console.log(`Groq ${modelToTry}: first byte in ${groqFirstByteMs}ms`);
            }
            armGroqTimer(GROQ_IDLE_MS, 'groq-idle-timeout');
            const token = chunk.choices?.[0]?.delta?.content;
            finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
            if (!token) continue;

            buffer += token;
            pending += token;

            let safe = '';
            while (true) {
              if (!inThink) {
                const openIdx = pending.indexOf('<think>');
                if (openIdx === -1) {
                  const holdBack = Math.min(pending.length, 8);
                  safe += pending.slice(0, pending.length - holdBack);
                  pending = pending.slice(pending.length - holdBack);
                  break;
                } else {
                  safe += pending.slice(0, openIdx);
                  pending = pending.slice(openIdx + '<think>'.length);
                  inThink = true;
                }
              } else {
                const closeIdx = pending.indexOf('</think>');
                if (closeIdx === -1) {
                  const holdBack = Math.min(pending.length, 9);
                  pending = pending.slice(pending.length - holdBack);
                  break;
                } else {
                  pending = pending.slice(closeIdx + '</think>'.length);
                  inThink = false;
                }
              }
            }

            if (safe) {
              streamedAnything = true;
              if (!bufferMode) {
                res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
                if (res.flush) res.flush();
              }
            }
          }
        } catch (eg) {
          if (groqIdleTimer) clearTimeout(groqIdleTimer);
          const elapsed = Date.now() - __t0;
          const isTimeout = /timeout|aborted/i.test(eg?.message || eg?.name || '');
          console.error(`Groq stream failed (${modelToTry}) after ${elapsed}ms${isTimeout ? ' [timeout - falling through]' : ''}:`, eg?.message || eg);

        if (isTimeout) {
        try { setGroqCooldown(modelToTry, 5, false); } catch(_) {}
    }
        if (eg?.status === 429 || /rate_limit_exceeded|tokens per day|TPD/i.test(eg?.message || '')) {
        const waitSec = parseRetryAfterSec(eg.message);
        setGroqCooldown(modelToTry, waitSec, true);
        if (/tokens per day|TPD/i.test(eg?.message || '')) {
          markGroqKeyTpdExhausted(currentKey, waitSec * 1000);
        }
    }
          groqStreamError = eg;
        } finally {
          if (groqIdleTimer) clearTimeout(groqIdleTimer);
        }

        if (groqStreamError) {
          console.warn(`Model ${modelToTry} aborted/error - trying fallback`);
          break;
        }

        if (!inThink && pending) {
          streamedAnything = true;
          if (!bufferMode) {
            res.write(`data: ${JSON.stringify({ content: pending })}\n\n`);
          }
          pending = '';
        }

        fullBuffer += buffer;
        const gotRealContent = stripInternalReasoning(buffer).trim().length > 0;

        if (finishReason === 'length' && continuations < MAX_CONTINUATIONS) {
          continuations++;
          convoMessages = [
            ...convoMessages,
            { role: 'assistant', content: buffer },
            { role: 'user', content: 'Continue exactly where you left off. Do not repeat any earlier text, do not restart, do not add any preamble.' },
          ];
          continue;
        }

        if (gotRealContent || streamedAnything) {
          if (bufferMode) {
            const repaired = repairGluedTableRows(stripInternalReasoning(fullBuffer));
            res.write(`data: ${JSON.stringify({ content: repaired })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return true;
        }

        console.warn(`Model ${modelToTry} returned empty - trying fallback`);
        break;
      }
    } catch (e) {
      console.error(`Groq stream failed (${modelToTry}):`, e.message);
      if (e.status === 429 || e.message?.includes('rate_limit_exceeded') || /tokens per day|TPD/i.test(e.message || '')) {
        const waitSec = parseRetryAfterSec(e.message);
        setGroqCooldown(modelToTry, waitSec);
        if (/tokens per day|TPD/i.test(e.message || '')) {
          markGroqKeyTpdExhausted(currentKey, waitSec * 1000);
        }
        continue;
      }
    }
  }

  return streamAIFallbackChain(messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, skipNvidia, optimizedMessages, maxTokens, isHard });
}

// NVIDIA → Cloudflare fallback chain (used by Vortis chat after Groq fails).
async function streamAIFallbackChain(messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, skipNvidia = false, optimizedMessages, maxTokens, isHard }) {
  if (!optimizedMessages) {
    const systemPrompt = messages.find(m => m.role === 'system');
    const recentConversations = messages.filter(m => m.role !== 'system').slice(-12);
    optimizedMessages = systemPrompt ? [systemPrompt, ...recentConversations] : [...recentConversations];
  }
  if (!maxTokens) maxTokens = 2048;
  if (isHard === undefined) isHard = false;

  if (!skipNvidia && checkGlobalLimit('nvidia_global')) {
  const nvidiaModelsToTry = isHard
    ? [NVIDIA_CHAT_CODE, NVIDIA_CHAT_QUALITY, NVIDIA_CHAT_FAST]
    : [NVIDIA_CHAT_FAST, NVIDIA_CHAT_QUALITY];

const FALLBACK_TIMEOUT_MS = 7000;

for (const nvModel of nvidiaModelsToTry) {
  if (clientSignal?.aborted) { console.log('Client disconnected — skipping NVIDIA'); break; }
  const text = await tryNvidiaChat(nvModel, optimizedMessages, maxTokens, clientSignal, FALLBACK_TIMEOUT_MS);
    if (text) {
      console.log(`NVIDIA fallback succeeded: ${nvModel}`);
      res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return true;
    }
    console.warn(`NVIDIA model ${nvModel} returned empty — trying next`);
  }
}
 else if (!skipNvidia) {
    console.warn('NVIDIA global rate limit reached — skipping straight to Cloudflare');
  }

  for (const cfModel of CF_CHAT_MODELS) {
    if (clientSignal?.aborted) { console.log('Client disconnected — skipping CF'); break; }
    try {
     const cfRes = await fetchWithTimeout(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: optimizedMessages, stream: false, max_tokens: 1200 }),
    signal: clientSignal,
  },
  10000
);

      if (!cfRes.ok) { console.log(`CF model ${cfModel} HTTP ${cfRes.status}`); continue; }

      if (cfRes.__clearTimeout) cfRes.__clearTimeout();
      const data = await cfRes.json();

      let rawText = data?.result?.response;
      if (typeof rawText !== 'string') {
        rawText = data?.result?.output_text ?? data?.result?.choices?.[0]?.message?.content ?? null;
      }
      if (typeof rawText !== 'string') {
        console.log(`CF model ${cfModel} unexpected response shape:`, JSON.stringify(data).slice(0, 300));
        continue;
      }

      const text = stripInternalReasoning(rawText);
      if (isValidResponse(text)) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
    } catch (e) {
      console.log(`CF model error (${cfModel}):`, e.message);
    }
  }

  return false;
}

// ── TABLE REPAIR — fixes markdown tables where the model glued
// rows together with no real newlines ("| Header | | Header | ...")
function repairGluedTableRows(text) {
  if (!text || !text.includes('|')) return text;
  let fixed = text;

  fixed = fixed.replace(
    /^([^\n|][^\n]*?)[ \t](\|[^\n|]+\|[^\n|]+\|[^\n]*\|)/gm,
    (m, before, tableStart) => `${before}\n\n${tableStart}`
  );

  fixed = fixed.replace(/\|\s*\|\s*(?=---|:|[\s]*\|)/g, '|\n|');

  fixed = fixed.replace(
    /(\|[^\n|]+(?:\|[^\n|]+)+\|)[ \t]*(\|(?:[\s:|-]*\|)+)/g,
    (m, headerRow, sepRow) => `${headerRow}\n${sepRow}`
  );

  fixed = fixed.replace(
    /^(\|[\s:|-]+)$/gm,
    (line) => /\|$/.test(line) ? line : (line + '|')
  );

  fixed = fixed.replace(
    /^(\|[^\n]+\|)\n(\|[\s:|-]+\|?)$/gm,
    (match, headerLine, sepLine) => {
      const headerCellCount = Math.max(0, (headerLine.match(/\|/g) || []).length - 1);
      const sepDashRuns = (sepLine.match(/-{2,}/g) || []).length;
      const sepPipeCount = Math.max(0, (sepLine.match(/\|/g) || []).length - 1);
      const sepCellCount = Math.max(sepPipeCount, sepDashRuns);
      if (sepCellCount >= headerCellCount) return match;
      const missing = headerCellCount - sepCellCount;
      const newSep = '|' + '---|'.repeat(headerCellCount);
      return headerLine + '\n' + newSep;
    }
  );

  return fixed;
}

function looksLikeTableRequest(text) {
  const low = (text || '').toLowerCase();
  return /\b(table|compare|comparison|vs\.?|versus|pros and cons|side.by.side)\b/.test(low);
}

// ── Code-chat streaming (NVIDIA primary, with Groq+CF fallback) ─
async function streamNvidiaGLMOnly(messages, res, maxTokens = 8000, clientSignal, chainName = 'standard') {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    console.error('Code-chat stream: NVIDIA_API_KEY missing');
    return false;
  }

  if (!checkGlobalLimit('nvidia_global')) {
    console.warn('Code-chat stream: NVIDIA global rate limit reached');
    return false;
  }

  const MAX_CONTINUATIONS = 4;

function headersTimeoutFor(model) {
  if (model === NVIDIA_CODE_MODEL_HEAVY) return 30000;
  if (model === NVIDIA_CHAT_MODEL_QUALITY) return 12000;
  return 10000;
}

function firstByteTimeoutFor(model) {
  if (model === NVIDIA_CODE_MODEL_HEAVY) return 25000;
  if (model === NVIDIA_CHAT_MODEL_QUALITY) return 12000;
  return 10000;
}

const IDLE_TIMEOUT_MS = 20000;

  const safeWrite = (chunk) => {
    if (res.writableEnded || clientSignal?.aborted) return false;
    try {
      res.write(chunk);
      if (res.flush) res.flush();
      return true;
    } catch (_) {
      return false;
    }
  };

  const chain = chainName === 'heavy' ? pickHeavyChain() : (NVIDIA_CODE_CHAINS[chainName] || NVIDIA_CODE_CHAINS.standard);
const dropped = [];
const alwaysRetryInHeavy = chainName === 'heavy' ? NVIDIA_CHAT_MODEL_QUALITY : null;
const modelsToTry = chain.filter(m => {
  if (m === alwaysRetryInHeavy) return true;
  const blocked = isNvidiaModelBlocked(m);
  if (blocked) {
    const reason = isNvidiaModelInvalid(m) ? 'PERMANENTLY INVALID' : 'circuit-breaker cooldown';
    dropped.push(`${m} (${reason})`);
  }
  return !blocked;
});
if (dropped.length > 0) {
  console.warn(`Code-chat stream: chain=${chainName} dropped [${dropped.join(', ')}] before dispatch`);
}
if (modelsToTry.length === 0) {
  console.warn(`Code-chat stream: all NVIDIA code models blocked (chain=${chainName}) — skipping to Groq+CF`);
  return false;
}
console.log(`Code-chat stream: chain=${chainName} will try [${modelsToTry.join(', ')}]`);

const chainDeadline = Date.now() + 75000;

let attemptIdx = 0;
for (const nvidiaModel of modelsToTry) {
  attemptIdx++;
  if (clientSignal?.aborted) {
    console.log('Code-chat: client disconnected before model', nvidiaModel);
    return false;
  }
  if (Date.now() > chainDeadline) {
    console.warn(`Code-chat stream: chain deadline exceeded before trying ${nvidiaModel} — bailing to Groq/CF fallback`);
    break;
  }

    console.log(`Code-chat: trying ${nvidiaModel} (attempt ${attemptIdx}/${modelsToTry.length}, warm=${isNvidiaModelWarm(nvidiaModel)}, blocked=${isNvidiaModelBlocked(nvidiaModel)})`);

    let written = 0;
    let convoMessages = [...messages];
    let continuations = 0;
    let fullRawBuffer = '';
    let attemptFailed = false;
    let failureWasTimeout = false;
    let idleTimer = null;
    let headersTimerCleared = false;
    let finishReason = null;

    try {
      while (true) {
        if (clientSignal?.aborted) break;

        const nvRes = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/chat/completions`,
          {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              model:           nvidiaModel,
              messages:        convoMessages,
              max_tokens:      maxTokens,
              temperature:     0.5,
              top_p:           0.9,
              stream:          true,
            }),
            signal: clientSignal,
          },
          headersTimeoutFor(nvidiaModel)
        );

        if (!nvRes.ok) {
          let errBody = '';
          try { errBody = await nvRes.text(); } catch (_) {}
          console.error(`Code-chat stream: ${nvidiaModel} HTTP ${nvRes.status} - ${errBody.slice(0, 300)}`);
          if (nvRes.status === 404 || nvRes.status === 401 || nvRes.status === 410) {
            markNvidiaModelInvalid(nvidiaModel, `HTTP ${nvRes.status}`);
            attemptFailed = true;
            break;
          }
          if (nvRes.status === 429) {
            recordNvidiaFailure(nvidiaModel);
            console.warn(`Code-chat: ${nvidiaModel} HTTP 429 (rate limited) — circuit breaker strike 1/2 (cooldown only if hit again)`);
            attemptFailed = true;
            break;
          }
          if (nvRes.status === 502 || nvRes.status === 503 || nvRes.status === 504) {
            recordNvidiaFailure(nvidiaModel);
            recordNvidiaFailure(nvidiaModel);
            console.warn(`Code-chat: ${nvidiaModel} HTTP ${nvRes.status} — instant circuit breaker trip — unavailable (2 min cooldown)`);
          }
          attemptFailed = true;
          break;
        }

        if (nvRes.__clearTimeout) { nvRes.__clearTimeout(); headersTimerCleared = true; }

        const reader  = nvRes.body.getReader();
        const fbTimeout = firstByteTimeoutFor(nvidiaModel);
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          failureWasTimeout = true;
          console.warn(`Code-chat stream: first-byte timeout (${fbTimeout}ms) on ${nvidiaModel}, cancelling reader`);
          try { reader.cancel('first-byte-timeout').catch(() => {}); } catch (_) {}
        }, fbTimeout);

        const decoder = new TextDecoder();
        let buffer    = '';
        let inThink   = false;
        let pending   = '';
        let turnBuffer = '';
        let clientGone = false;

        try {
          while (true) {
            if (clientSignal?.aborted) { clientGone = true; break; }

            const { done, value } = await reader.read();
            if (done) break;

            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              failureWasTimeout = true;
              console.warn(`Code-chat stream: idle timeout (${IDLE_TIMEOUT_MS}ms) on ${nvidiaModel}, cancelling reader`);
              try { reader.cancel('idle-timeout').catch(() => {}); } catch (_) {}
            }, IDLE_TIMEOUT_MS);

            buffer += decoder.decode(value, { stream: true });

            let nlIdx;
            while ((nlIdx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, nlIdx).trim();
              buffer = buffer.slice(nlIdx + 1);

              if (!line || !line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;

              let payload;
              try { payload = JSON.parse(raw); } catch (_) { continue; }

              finishReason = payload?.choices?.[0]?.finish_reason || finishReason;
              const reasoningToken = payload?.choices?.[0]?.delta?.reasoning_content;
              if (reasoningToken) continue;

              const token = payload?.choices?.[0]?.delta?.content;
              if (!token) continue;

              turnBuffer += token;
              fullRawBuffer += token;
              pending += token;
              let safe = '';
              while (true) {
                if (!inThink) {
                  const openIdx = pending.indexOf('<think>');
                  if (openIdx === -1) {
                    const holdBack = Math.min(pending.length, 8);
                    safe += pending.slice(0, pending.length - holdBack);
                    pending = pending.slice(pending.length - holdBack);
                    break;
                  } else {
                    safe += pending.slice(0, openIdx);
                    pending = pending.slice(openIdx + '<think>'.length);
                    inThink = true;
                  }
                } else {
                  const closeIdx = pending.indexOf('</think>');
                  if (closeIdx === -1) {
                    const holdBack = Math.min(pending.length, 9);
                    pending = pending.slice(pending.length - holdBack);
                    break;
                  } else {
                    pending = pending.slice(closeIdx + '</think>'.length);
                    inThink = false;
                  }
                }
              }

              if (safe) {
                written += safe.length;
                if (!safeWrite(`data: ${JSON.stringify({ content: safe })}\n\n`)) {
                  clientGone = true;
                  break;
                }
              }
            }
            if (clientGone) break;
          }
        } finally {
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          try { reader.cancel('cleanup').catch(() => {}); } catch (_) {}
          if (!headersTimerCleared && nvRes.__clearTimeout) { nvRes.__clearTimeout(); }
        }

        if (clientGone || clientSignal?.aborted) {
          console.log(`Code-chat: client disconnected mid-stream (${nvidiaModel}, ${written} chars written)`);
          if (!res.writableEnded) { try { res.end(); } catch (_) {} }
          return written > 0;
        }

        if (!inThink && pending) {
          written += pending.length;
          safeWrite(`data: ${JSON.stringify({ content: pending })}\n\n`);
          pending = '';
        }

        if (finishReason === 'length' && continuations < MAX_CONTINUATIONS) {
          continuations++;
          console.warn(`Code-chat truncated by max_tokens — auto-continuing (${continuations}/${MAX_CONTINUATIONS}) on ${nvidiaModel}`);
          const trimmedPrior = turnBuffer.length > 12000
            ? turnBuffer.slice(-12000)
            : turnBuffer;
          const lastChar = trimmedPrior.slice(-1);
          const endsMidWord = /[A-Za-z0-9_]/.test(lastChar)
            && !/```\s*$/.test(trimmedPrior)
            && !/[.!?:;\n]\s*$/.test(trimmedPrior);
          let resumeFromHint;
          if (endsMidWord) {
            const boundaryMatch = trimmedPrior.match(/[.!?:\n][^.!?:\n]*$/);
            const lastBoundary = boundaryMatch ? boundaryMatch.index + 1 : 0;
            const brokenSentence = trimmedPrior.slice(lastBoundary).trim();
            resumeFromHint = `You were cut off MID-SENTENCE. The last incomplete sentence was:\n\n<incomplete_sentence>\n${brokenSentence}\n</incomplete_sentence>\n\nRESTART that exact sentence from its beginning and continue from there. Do NOT pick up mid-word. Do NOT repeat any text from before this sentence.`;
          } else {
            resumeFromHint = `You were cut off mid-output. Here is the last part of what you produced:\n\n<previous_output_tail>\n${trimmedPrior}\n</previous_output_tail>\n\nContinue EXACTLY where you left off. Rules:\n- Do NOT repeat any text from above.\n- Do NOT add any preamble, explanation, or apology.\n- Do NOT restart the file or wrap in a new code fence if you were inside one.\n- Just output the next characters that would naturally follow the last character above.`;
          }
          convoMessages = [
            ...convoMessages,
            { role: 'assistant', content: turnBuffer },
            { role: 'user', content: resumeFromHint },
          ];
          turnBuffer = '';
          continue;
        }

        break;
      }
    } catch (e) {
      console.error(`Code-chat stream error on ${nvidiaModel}:`, e.message);
      attemptFailed = true;
      if (e.name === 'AbortError' || /aborted/i.test(e.message) || clientSignal?.aborted) {
        failureWasTimeout = true;
      }
    } finally {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    }

    if (written > 0) {
      if (!res.writableEnded) {
        try { res.write('data: [DONE]\n\n'); res.end(); } catch (_) {}
      }
      console.log(`Code-chat stream OK (${nvidiaModel}) - ${written} chars written`);
      recordNvidiaSuccess(nvidiaModel);
      return true;
    }

    console.warn(`Code-chat: ${nvidiaModel} produced 0 visible chars — rawBuffer=${fullRawBuffer.length} attemptFailed=${attemptFailed} wasTimeout=${failureWasTimeout} finishReason=${finishReason || 'null'}${fullRawBuffer.length > 0 ? ` rawTail="${fullRawBuffer.slice(-200).replace(/\n/g, '\\n')}"` : ''}`);

    if (!attemptFailed && !clientSignal?.aborted) {
      const salvaged = fullRawBuffer
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')
        .trim();
      if (salvaged.length > 0) {
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ content: salvaged })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (_) {}
        }
        console.log(`Code-chat stream: salvaged ${salvaged.length} chars from ${nvidiaModel}`);
        recordNvidiaSuccess(nvidiaModel);
        return true;
      }
      if (fullRawBuffer.length > 0) {
        console.warn(`Code-chat: ${nvidiaModel} returned ${fullRawBuffer.length} chars but all were <think> content (no visible answer) — trying next model`);
      }
    }

    if (!clientSignal?.aborted) {
      if (!failureWasTimeout) {
        recordNvidiaFailure(nvidiaModel);
        console.warn(`Code-chat: ${nvidiaModel} produced nothing (real error) — trying next model`);
      } else {
        console.warn(`Code-chat: ${nvidiaModel} timed out (cold/slow, not broken) — trying next model, circuit breaker NOT tripped`);
      }
    }
  }

  console.error('Code-chat stream: all NVIDIA models failed — caller should try Groq/CF fallback');
  return false;
}

// ── Code-chat Groq fallback ─────────────────────────────────────
async function streamCodeChatFallback(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, chainName = 'standard' }) {
  const preferQuality = chainName !== 'trivial';
  return streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, preferQuality, skipNvidia: true });
}

// ── SERPER (primary search provider — Google results, fast) ────
async function fetchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout(
      'https://google.serper.dev/search',
      {
        method:  'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ q: query, num: 10, hl: 'en', gl: 'us' }),
      },
      12000
    );
    if (!res.ok) {
      console.log(`Serper HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const organic = (data.organic || []).map(r => ({
      title:   r.title   || '',
      snippet: r.snippet || '',
      link:    r.link    || '#',
      source:  (() => { try { return new URL(r.link).hostname.replace('www.', ''); } catch { return 'Web'; } })(),
      date:    r.date    || new Date().toISOString().split('T')[0],
    }));
    const news = (data.news || []).map(r => ({
      title:   r.title   || '',
      snippet: r.snippet || '',
      link:    r.link    || '#',
      source:  r.source  || 'News',
      date:    r.date    || new Date().toISOString().split('T')[0],
    }));
    return [...news, ...organic].filter(r => r.title.length > 3).slice(0, 10);
  } catch (e) {
    console.error('Serper failed:', e.message);
    return [];
  }
}

// ── TAVILY (fallback search provider) ────────────────────────────
async function fetchTavily(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          api_key:         key,
          query,
          search_depth:    'advanced',
          max_results:     10,
          include_answer:  true,
          include_images:  false,
        }),
      },
      20000
    );
    if (!res.ok) {
      console.log(`Tavily HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      title:   r.title   || '',
      snippet: r.content || '',
      link:    r.url     || '#',
      source:  (() => { try { return new URL(r.url).hostname.replace('www.', ''); } catch { return 'Web'; } })(),
      date:    r.published_date ? r.published_date.split('T')[0] : new Date().toISOString().split('T')[0],
    }));
    return results.filter(r => r.title.length > 3).slice(0, 10);
  } catch (e) {
    console.error('Tavily failed:', e.message);
    return [];
  }
}

async function fetchWebResults(query) {
  try {
    const s = await fetchSerper(query);
    if (s && s.length > 0) return s;
    console.log('Serper returned 0 results — falling back to Tavily for:', query.slice(0, 80));
    const t = await fetchTavily(query);
    if (t && t.length > 0) return t;
    console.log('Tavily also returned 0 results for query:', query.slice(0, 80));
    return [];
  } catch (e) {
    console.log('Search failed:', e.message);
    return [];
  }
}

async function fetchESPN(query) {
  const low     = query.toLowerCase();
  const today   = new Date().toISOString().split('T')[0];
  const results = [];
  const sportMap = [
    { keys: ['nba', 'basketball'],        sport: 'basketball', league: 'nba',            label: 'NBA'        },
    { keys: ['nfl', 'american football'], sport: 'football',   league: 'nfl',            label: 'NFL'        },
    { keys: ['mlb', 'baseball'],          sport: 'baseball',   league: 'mlb',            label: 'MLB'        },
    { keys: ['nhl', 'hockey'],            sport: 'hockey',     league: 'nhl',            label: 'NHL'        },
    { keys: ['epl', 'premier league'],    sport: 'soccer',     league: 'eng.1',          label: 'EPL'        },
    { keys: ['la liga', 'laliga'],        sport: 'soccer',     league: 'esp.1',          label: 'La Liga'    },
    { keys: ['champions league', 'ucl'],  sport: 'soccer',     league: 'uefa.champions', label: 'UCL'        },
    { keys: ['serie a'],                  sport: 'soccer',     league: 'ita.1',          label: 'Serie A'    },
    { keys: ['bundesliga'],               sport: 'soccer',     league: 'ger.1',          label: 'Bundesliga' },
    { keys: ['mls'],                      sport: 'soccer',     league: 'usa.1',          label: 'MLS'        },
    { keys: ['football', 'soccer'],       sport: 'soccer',     league: 'eng.1',          label: 'Soccer'     },
  ];
  const matched = sportMap.find(s => s.keys.some(k => low.includes(k)));
  if (!matched) return [];
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${matched.sport}/${matched.league}/scoreboard`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' } }, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    for (const event of (data.events || []).slice(0, 5)) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find(c => c.homeAway === 'home');
      const away = comp.competitors?.find(c => c.homeAway === 'away');
      if (!home || !away) continue;
      const homeName  = home.team?.displayName || 'Home';
      const awayName  = away.team?.displayName || 'Away';
      const homeScore = home.score ?? '0';
      const awayScore = away.score ?? '0';
      const isLive    = comp.status?.type?.state === 'in';
      const isFinal   = comp.status?.type?.completed === true;
      let title, snippet;
      if (isLive)       { title = `🔴 LIVE: ${awayName} ${awayScore} - ${homeScore} ${homeName}`; snippet = `${matched.label} live | ${comp.status?.displayClock || ''} | ${comp.venue?.fullName || ''}`; }
      else if (isFinal) { title = `${awayName} ${awayScore} - ${homeScore} ${homeName} (Final)`;  snippet = `${matched.label} result | ${comp.venue?.fullName || ''}`; }
      else              { title = `${awayName} vs ${homeName} — Upcoming`;                        snippet = `${matched.label} | ${comp.status?.type?.shortDetail || ''} | ${comp.venue?.fullName || ''}`; }
      results.push({ title, snippet, link: `https://www.espn.com/${matched.sport}/game/_/gameId/${event.id}`, source: `ESPN ${matched.label}`, date: today });
    }
  } catch (e) { console.log('ESPN error:', e.message); }
  return results;
}

// ── SPAM / RELEVANCE / DEDUP / SORT ──────────────────────────
const SPAM_DOMAINS = ['bestproductsreviews', 'top10supplements', 'supplementreviews', 'healthwebmagazine', 'globenewswire', 'prnewswire', 'businesswire', 'einpresswire', 'geekshealth', 'nutralegacy', 'theislandnow'];
const SPAM_TITLE_PATTERNS = [
  /\b(buy now|order now|get \d+% off|discount|promo code|coupon|limited offer|shop now)\b/i,
  /\b(supplement|capsule|pill|weight loss|fat burn|keto|detox|testosterone booster|male enhancement)\b/i,
  /\b(dream11|fantasy team|fantasy xi|who will win prediction|pitch report prediction)\b/i,
  /\b(stream(ing)? free|watch online free|full movie online|download free)\b/i,
  /\b(casino|betting|odds|gambling|forex|crypto investment)\b/i,
];

function isSpam(r) {
  const link = (r.link || '').toLowerCase();
  if (SPAM_DOMAINS.some(d => link.includes(d))) return true;
  if (SPAM_TITLE_PATTERNS.some(p => p.test(r.title || ''))) return true;
  return false;
}

function isRelevant(result, query) {
  if (!query || query.trim().length < 4) return true;
  const combined  = `${result.title} ${result.snippet}`.toLowerCase();
  const STOPWORDS = new Set(['what', 'when', 'where', 'which', 'that', 'this', 'with', 'from', 'have', 'will', 'been', 'about', 'does', 'into', 'more', 'than', 'some', 'then', 'them', 'they', 'were', 'also', 'just', 'over', 'latest', 'tell', 'give', 'show', 'find']);
  const words     = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w));
  if (words.length === 0) return true;
  return words.filter(w => combined.includes(w)).length >= Math.ceil(words.length / 2);
}

function deduplicate(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = r.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreAndSort(results, query) {
  const words     = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return results.map(r => {
    let score = 0;
    words.forEach(w => { if (r.title.toLowerCase().includes(w)) score += 3; if (r.snippet.toLowerCase().includes(w)) score += 1; });
    if (r.title.includes('🔴 LIVE'))                                                          score += 80;
    if (/\b(\d+\/\d+|\d+ runs?|wickets?|overs?|chasing|target|all out)\b/i.test(r.snippet)) score += 40;
    if (/\b(\d+\/\d+|\d+ runs?|wickets?|overs?)\b/i.test(r.title))                          score += 30;
    if (/\b(score|result|won|win|beats|beat|defeat|victory|final score)\b/i.test(r.title))   score += 25;
    if (/espn/i.test(r.source))                                                               score += 15;
    if (/\b(streaming|where to watch|preview|pitch report|fantasy|dream11)\b/i.test(r.title)) score -= 40;
    if (/\b(buy|price|review|discount|offer|deal)\b/i.test(r.title))                          score -= 50;
    if (r.date === today)          score += 15;
    else if (r.date === yesterday) score += 8;
    return { ...r, _score: score };
  }).sort((a, b) => b._score - a._score).map(({ _score, ...r }) => r);
}

function cleanResults(results, query) {
  const nonEnglishDomains = ['ilpost.it', 'corriere.it', 'lemonde.fr', 'lefigaro.fr', 'spiegel.de', 'bild.de', 'elpais.com', 'marca.com', 'globo.com', 'sina.com.cn', 'yomiuri.co.jp'];
  return results
    .filter(r => !isSpam(r))
    .filter(r => isRelevant(r, query))
    .filter(r => !nonEnglishDomains.some(d => (r.link || '').toLowerCase().includes(d)))
    .filter(r => (r.snippet || '').trim().length >= 20)
    .filter(r => { const t = (r.title || '').trim(); return t.length >= 5 && !/^(home|index|page \d+|untitled)$/i.test(t); });
}

function cleanCodeResults(results, query) {
  return results
    .filter(r => !isSpam(r))
    .filter(r => (r.snippet || '').trim().length >= 15)
    .filter(r => { const t = (r.title || '').trim(); return t.length >= 3 && !/^(home|index|page \d+|untitled)$/i.test(t); });
}

function stripCodeFences(text) {
  return (text || '').replace(/```[\s\S]*?```/g, ' ');
}

// ── AI-BASED SEARCH DECISION ────────────────────────────────────
async function aiNeedsSearch(groq, text, { isCode = false, clientSignal } = {}) {
  const _lowExplicit = (text || '').toLowerCase();
  const EXPLICIT_SEARCH_PHRASES = [
    /\bsearch\s+(the\s+)?(web|internet|online)\b/,
    /\bgoogle\s+(it|this|that|for)\b/,
    /\bsearch\s+and\s+(tell|show|give|find)\b/,
    /\blook\s+this\s+up\b/,
    /\bfind\s+(online|on\s+the\s+web)\b/,
    /\bweb\s*search\b/,
    /\bdo\s+a\s+search\b/,
    /\bsearch\s+up\b/,
  ];
  if (EXPLICIT_SEARCH_PHRASES.some(re => re.test(_lowExplicit))) return true;

  const searchableText = isCode ? stripCodeFences(text) : text;
  const heuristicFallback = isCode ? needsCodeWebSearchHeuristic(searchableText) : needsWebSearchHeuristic(searchableText);
  if (heuristicFallback) return true;

  if (isCode) return false;

  const controller = new AbortController();
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), isCode ? 1500 : 700);
  try {
    const result = await groq.chat.completions.create({
      model: GROQ_CLASSIFIER_MODEL,
      messages: [
        {
          role: 'system',
          content: `Decide if answering this message correctly REQUIRES current/live information from the internet (things that change over time: news, scores, prices, versions, releases, current events, "latest"/"today"/"right now" type facts, current status of something).
Say "NO" for anything answerable from general/stable knowledge (explanations, how-to, math, writing, opinions, code logic not tied to a specific library version).
The user's message may contain typos or misspellings (e.g. "serch" means "search", "lattest" means "latest") — interpret their intent despite spelling errors.
Respond ONLY with YES or NO. Nothing else.`,
        },
        { role: 'user', content: searchableText.slice(0, 500) },
      ],
      max_tokens: 5,
      temperature: 0,
    }, { signal: controller.signal });

    const raw = result.choices?.[0]?.message?.content?.toLowerCase() || '';
    return raw.includes('yes');
  } catch (e) {
    console.warn('Search-decision classifier failed:', e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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

function needsWebSearchHeuristic(text) {
  const low = text.toLowerCase();
  if (/\b(score|live score|who won|who is winning|current price|right now|today's|tonight's)\b/.test(low)) return true;
  if (/\b(ipl|cricket|rcb|csk|kkr|srh|pbks|\bgt\b|lsg)\b/.test(low)) return true;
  if (/\b(nba|nfl|mlb|nhl|epl|la liga|bundesliga|champions league)\b/.test(low)) return true;
  if (/\b(stock price|weather in|election result)\b/.test(low)) return true;
  if (/\b(breaking news|just announced|just happened)\b/.test(low)) return true;
  return false;
}

function needsCodeWebSearchHeuristic(text) {
  const low = text.toLowerCase();

  const typoAliases = ['serch', 'saerch', 'seach', 'searc', 'seatch', 'goggle', 'lattest', 'latst'];
  if (typoAliases.some(t => low.includes(t))) return true;

  const searchWords = ['search', 'google', 'lookup', 'latest', 'current', 'recent', 'newest', 'changelog', 'deprecated', 'version'];
  if (fuzzyIncludesAny(text, searchWords, 2)) return true;

  if (/\b(as of \d{4}|breaking change|just released)\b/.test(low)) return true;
  if (/\bv?\d+\.\d+(\.\d+)?\b.*\b(release|version|update|changelog)\b/i.test(text)) return true;
  return false;
}

function looksLikeImageRequest(text) {
  return /\b(image|picture|photo|draw|sketch|paint|art|wallpaper|illustration|render|pic\b)\b/i.test(text);
}

function buildSearchQuery(userMessage) {
  const now     = new Date();
  const dateStr = `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`;
  if (/\b(20\d\d|today|yesterday|this week)\b/i.test(userMessage)) return userMessage.slice(0, 200);
  return `${userMessage.slice(0, 180)} ${dateStr}`;
}

// ═════════════════════════════════════════════════════════════
// ── EXPRESS APP SETUP
// ═════════════════════════════════════════════════════════════
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://vortis-ai.vercel.app').split(',');
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.path === '/api/handler' && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('Vortis backend is running.'));

// ═════════════════════════════════════════════════════════════
// ── DEBUG ENDPOINTS
// ═════════════════════════════════════════════════════════════
function debugAuthOk(req) {
  const expected = process.env.X_APP_KEY;
  if (!expected) return true;
  return req.headers['x-app-key'] === expected;
}

app.get('/debug/nvidia-models', async (req, res) => {
  if (!debugAuthOk(req)) return res.status(403).json({ error: 'missing X-App-Key' });
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return res.status(500).json({ error: 'NVIDIA_API_KEY not set' });

  let catalog = [];
  try {
    const catRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/models`, {}, 8000);
    if (catRes.__clearTimeout) catRes.__clearTimeout();
    if (catRes.ok) {
      const data = await catRes.json();
      catalog = (data?.data || []).map(m => m.id).sort();
    }
  } catch (e) {
    console.warn('debug/nvidia-models: catalog fetch failed:', e.message);
  }

  const ourModelIds = [
    { role: 'fast',    id: NVIDIA_CHAT_FAST },
    { role: 'quality', id: NVIDIA_CHAT_QUALITY },
    { role: 'heavy',   id: NVIDIA_CHAT_CODE },
    { role: 'vision',  id: NVIDIA_VISION_MODEL },
    ...NVIDIA_VISION_CHAIN.map((id, i) => ({ role: `vision_chain[${i}]`, id })),
  ];
  const our_models = [];
  for (const m of ourModelIds) {
    const t0 = Date.now();
    try {
      const r = await fetchWithTimeout(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m.id,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1,
          temperature: 0,
          stream: true,
        }),
      }, 15000);
      if (r.__clearTimeout) r.__clearTimeout();
      const latency_ms = Date.now() - t0;
      let error = null;
      if (!r.ok) {
        try { error = (await r.text()).slice(0, 200); } catch (_) {}
      } else {
        try {
          const reader = r.body.getReader();
          await reader.read();
          await reader.cancel('debug');
        } catch (_) {}
      }
      our_models.push({
        role: m.role,
        id: m.id,
        in_catalog: catalog.includes(m.id),
        http_status: r.status,
        latency_ms,
        error,
      });
    } catch (e) {
      our_models.push({
        role: m.role,
        id: m.id,
        in_catalog: catalog.includes(m.id),
        http_status: -1,
        latency_ms: Date.now() - t0,
        error: e.message,
      });
    }
  }
  res.json({
    base_url: NVIDIA_BASE_URL,
    catalog_size: catalog.length,
    catalog,
    our_models,
  });
});

app.get('/debug/nvidia-health', (req, res) => {
  if (!debugAuthOk(req)) return res.status(403).json({ error: 'missing X-App-Key' });
  const now = Date.now();
  const invalid = [];
  for (const [model, entry] of nvidiaEolModels.entries()) {
    invalid.push({
      model,
      reason: entry.reason,
      since_iso: new Date(entry.since).toISOString(),
      expires_in_sec: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
    });
  }
  const transient = [];
  for (const [model, entry] of nvidiaFailureTracker.entries()) {
    transient.push({
      model,
      consecutive_failures: entry.count,
      last_fail_ago_sec: Math.round((now - entry.lastFailTime) / 1000),
      cooldown_remaining_sec: Math.max(0, Math.round((NVIDIA_FAILURE_COOLDOWN_MS - (now - entry.lastFailTime)) / 1000)),
    });
  }
  const warm = [];
  for (const [model, entry] of nvidiaWarmState.entries()) {
    warm.push({
      model,
      warm: entry.warm,
      last_check_ago_sec: Math.round((now - entry.lastCheck) / 1000),
    });
  }
  // ── FIX 2: surface consecutive-slow counts in the health endpoint so
  // sustained degradation (vs. genuine cold-start) is visible without
  // grepping logs.
  const slow = [];
  for (const [model, count] of nvidiaConsecutiveSlow.entries()) {
    slow.push({ model, consecutive_slow_pings: count });
  }
  res.json({
    now_iso: new Date(now).toISOString(),
    configured_models: {
      fast:    NVIDIA_CHAT_FAST,
      quality: NVIDIA_CHAT_QUALITY,
      heavy:   NVIDIA_CHAT_CODE,
      vision:  NVIDIA_VISION_MODEL,
    },
    chain_pick: {
      heavy:    pickHeavyChain(),
      standard: NVIDIA_CODE_CHAINS.standard,
      trivial:  NVIDIA_CODE_CHAINS.trivial,
    },
    invalid_ttl_ms: NVIDIA_INVALID_TTL_MS,
    invalid_models: invalid,
    transient_failures: transient,
    warm_state: warm,
    consecutive_slow: slow,
    keepalive_in_flight: [...nvidiaKeepaliveInFlight],
  });
});

// ═════════════════════════════════════════════════════════════
// ── WARMUP + KEEP-ALIVE
// ═════════════════════════════════════════════════════════════
async function warmUp() {
  try {
    await admin.firestore().collection('_warmup').limit(1).get();
    console.log('Firestore warmed');
  } catch (e) {
    console.log('Firestore warmup skipped:', e.message);
  }
  try {
    await fetch('https://api.groq.com', { method: 'HEAD' });
    console.log('Groq TLS warmed');
  } catch (_) {}
  try {
    await fetch(NVIDIA_BASE_URL, { method: 'HEAD' });
    console.log('NVIDIA TLS warmed');
  } catch (_) {}

  const nvKey = process.env.NVIDIA_API_KEY;
  if (nvKey) {
    const modelsToWarm = [...new Set([
      NVIDIA_CODE_MODEL_FAST,
      NVIDIA_CODE_MODEL_HEAVY,
      NVIDIA_CHAT_MODEL_QUALITY,
    ].filter(m => !isNvidiaModelInvalid(m)))];

    for (const modelId of modelsToWarm) {
      const timeout = modelId === NVIDIA_CODE_MODEL_HEAVY ? 150000
                    : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 20000
                    : 30000;

const retryWarmup = async (modelId, timeout, attempt, maxAttempts) => {
  const result = await warmUpNvidiaModel(modelId, timeout);
  if (result.ok || attempt >= maxAttempts) return result;
  await new Promise(r => setTimeout(r, 5000));
  console.log(`NVIDIA warmup: retrying ${modelId} (attempt ${attempt + 1}/${maxAttempts})...`);
  return retryWarmup(modelId, timeout, attempt + 1, maxAttempts);
};

      retryWarmup(modelId, timeout, 1, 2).then(({ ok, ms }) => {
        if (!ok) console.log(`NVIDIA warmup skipped: ${modelId} not ready after ${ms}ms${modelId === NVIDIA_CODE_MODEL_HEAVY ? ' — will keep trying via keep-alive' : ''}`);
      });
    }
  } else {
    console.log('NVIDIA warmup skipped: NVIDIA_API_KEY not set');
  }
}

async function warmUpNvidiaModel(modelId, timeoutMs = 30000) {
  const nvKey = process.env.NVIDIA_API_KEY;
  if (!nvKey) return { ok: false, ms: 0 };
  if (isNvidiaModelInvalid(modelId)) {
    return { ok: false, ms: 0 };
  }
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:       modelId,
          messages:    [{ role: 'user', content: 'Say "ok" and nothing else.' }],
          max_tokens:  50,
          temperature: 0.3,
          stream:      false,
        }),
      },
      timeoutMs
    );
    if (res.__clearTimeout) res.__clearTimeout();

    if (res.status === 404 || res.status === 401 || res.status === 410) {
      markNvidiaModelInvalid(modelId, `HTTP ${res.status} during warmup`);
      try { await res.text(); } catch (_) {}
      return { ok: false, ms: Date.now() - t0 };
    }

    if (res.ok) {
      let rawText = '';
      try { rawText = await res.text(); } catch (_) {}
      const ms = Date.now() - t0;

      let bodySummary = 'unparseable';
      try {
        const data = JSON.parse(rawText);
        if (data?.error) {
          bodySummary = `error: ${data.error.message || data.error.code || 'unknown'}`;
        } else if (Array.isArray(data?.choices)) {
          const c = data.choices[0];
          const content = c?.message?.content;
          const fr = c?.finish_reason;
          bodySummary = `choices[0] finish_reason=${fr || 'n/a'} content=${content === null ? 'null' : typeof content === 'string' ? `"${content.slice(0, 50)}"` : typeof content}`;
        } else {
          bodySummary = `keys=[${Object.keys(data || {}).join(',')}]`;
        }
      } catch (_) {}

      console.log(`NVIDIA warmup OK: ${modelId} ready (${ms}ms) — body: ${bodySummary}`);
      recordNvidiaSuccess(modelId);
      recordNvidiaLatency(modelId, ms);
      return { ok: true, ms };
    }

    const elapsed = Date.now() - t0;
    try { await res.text(); } catch (_) {}

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      recordNvidiaFailure(modelId);
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP ${res.status} (transient — will retry via keep-alive) [${elapsed}ms]`);
    } else if (res.status === 429) {
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP 429 (rate limited — will retry via keep-alive) [${elapsed}ms]`);
    } else {
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP ${res.status} [${elapsed}ms]`);
    }
    return { ok: false, ms: elapsed };
  } catch (e) {
    console.log(`NVIDIA warmup ${modelId} failed:`, e.message);
    return { ok: false, ms: Date.now() - t0 };
  }
}

// ── NVIDIA KEEP-ALIVE PING ─────────────────────────────────────
const NVIDIA_KEEPALIVE_INTERVAL_FAST_MS  = 20 * 1000;
const NVIDIA_KEEPALIVE_INTERVAL_HEAVY_MS = 70 * 1000;
const NVIDIA_KEEPALIVE_INTERVAL_QUALITY_MS = 40 * 1000;
const nvidiaKeepaliveInFlight = new Set();

async function pingNvidiaModel(modelId) {
  if (isNvidiaModelBlocked(modelId)) return;
  if (nvidiaKeepaliveInFlight.has(modelId)) {
    if (process.env.VERBOSE_KEEPALIVE === '1') {
      console.log(`NVIDIA keep-alive: ${modelId} skipped — previous ping still in flight`);
    }
    return;
  }
  nvidiaKeepaliveInFlight.add(modelId);
  try {
    const t0 = Date.now();
    const pingTimeout = modelId === NVIDIA_CODE_MODEL_HEAVY ? 25000
                     : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 12000
                     : 12000;
    const res = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:       modelId,
          messages:    [{ role: 'user', content: 'ok' }],
          max_tokens:  1,
          temperature: 0,
          stream:      true,
        }),
      },
      pingTimeout
    );
    if (res.__clearTimeout) res.__clearTimeout();
    if (res.ok) {
      try {
        const reader = res.body.getReader();
        const { value } = await reader.read();
        try { await reader.cancel('keepalive-done'); } catch (_) {}
        if (!value || value.length === 0) {
          console.warn(`NVIDIA keep-alive: ${modelId} returned empty first chunk`);
          recordNvidiaFailure(modelId);
          return;
        }
      } catch (readErr) {
        console.warn(`NVIDIA keep-alive: ${modelId} stream read error:`, readErr.message);
        recordNvidiaFailure(modelId);
        return;
      }
      recordNvidiaSuccess(modelId);
      const ms = Date.now() - t0;
      recordNvidiaLatency(modelId, ms);
      const slowThreshold = modelId === NVIDIA_CODE_MODEL_HEAVY ? 15000
                          : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 10000
                          : 8000;
      if (ms > slowThreshold) {
        // ── FIX 2: distinguish genuine cold-start ("warming") from
        // sustained degradation. Only call it "warming" for the first 3
        // consecutive slow pings; past that, it's flagged as persistent
        // and the model is explicitly marked NOT warm so pickHeavyChain
        // stops treating it as a good candidate based on stale state.
        const count = (nvidiaConsecutiveSlow.get(modelId) || 0) + 1;
        nvidiaConsecutiveSlow.set(modelId, count);
        if (count <= 3) {
          console.log(`NVIDIA keep-alive: ${modelId} slow (${ms}ms — was warming, ${count}/3)`);
        } else {
          console.warn(`NVIDIA keep-alive: ${modelId} PERSISTENTLY SLOW (${ms}ms, ${count} consecutive pings) — likely throttled/overloaded upstream, not cold-starting. Check NVIDIA account tier/quota.`);
          nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
        }
      } else {
        if (nvidiaConsecutiveSlow.has(modelId)) nvidiaConsecutiveSlow.delete(modelId);
      }
    } else if (res.status === 429) {
      try { await res.text(); } catch (_) {}
    } else if (res.status === 404 || res.status === 401 || res.status === 410) {
      try { await res.text(); } catch (_) {}
      markNvidiaModelInvalid(modelId, `HTTP ${res.status} during keep-alive`);
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      try { await res.text(); } catch (_) {}
      if (process.env.VERBOSE_KEEPALIVE === '1') {
        console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status} (unavailable, will retry next cycle)`);
      }
    } else {
      console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status}`);
      try { await res.text(); } catch (_) {}
    }
  } catch (e) {
    if (!e.message?.includes('aborted')) {
      console.log(`NVIDIA keep-alive: ${modelId} error:`, e.message);
    }
  } finally {
    nvidiaKeepaliveInFlight.delete(modelId);
  }
}

function startNvidiaKeepAlive() {
  if (!process.env.NVIDIA_API_KEY) return;

  const modelsToPing = [...new Set([
    NVIDIA_CODE_MODEL_FAST,
    NVIDIA_CODE_MODEL_HEAVY,
    NVIDIA_CHAT_MODEL_QUALITY,
  ].filter(m => !isNvidiaModelInvalid(m)))];

  for (const modelId of modelsToPing) {
    const interval = modelId === NVIDIA_CODE_MODEL_HEAVY ? NVIDIA_KEEPALIVE_INTERVAL_HEAVY_MS
                  : modelId === NVIDIA_CHAT_MODEL_QUALITY ? NVIDIA_KEEPALIVE_INTERVAL_QUALITY_MS
                  : NVIDIA_KEEPALIVE_INTERVAL_FAST_MS;
    console.log(`NVIDIA keep-alive: ${modelId} every ${interval / 1000}s`);
    pingNvidiaModel(modelId).catch(() => {});
    setInterval(() => { pingNvidiaModel(modelId).catch(() => {}); }, interval);
  }
}

warmUp();
setTimeout(startNvidiaKeepAlive, 5000);

const externalUrl = process.env.RENDER_EXTERNAL_URL;
if (externalUrl) {
  setInterval(() => {
    fetch(`${externalUrl}/health`).catch(() => {});
  }, 4 * 60 * 1000);
  console.log(`Self-ping enabled via ${externalUrl}/health`);
} else {
  console.log('RENDER_EXTERNAL_URL not set — set up an external uptime pinger (e.g. UptimeRobot) hitting /health to prevent free-tier spin-down.');
}

// ═════════════════════════════════════════════════════════════
// ── MAIN HANDLER
// ═════════════════════════════════════════════════════════════
app.post('/api/handler', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let uid;
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);

    if (!action) return res.status(400).json({ error: 'Missing action' });
    if (!['chat', 'search', 'image', 'vision', 'tts', 'execute', 'transcribe', 'memory', 'title'].includes(action)) return res.status(400).json({ error: `Invalid action: ${action}` });
    if (!checkRateLimit(userIp, action)) return res.status(429).json({ error: 'Too many requests. Slow down a bit!' });

    if (action === 'title') {
  const titlePrompt = sanitizeString(req.body.prompt || '', 2000);
  if (!titlePrompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  const titleController = new AbortController();
  const titleTimer = setTimeout(() => titleController.abort(), 6000);
  try {
    const result = await groq.chat.completions.create({
      model: GROQ_CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: titlePrompt }],
      max_tokens: 200,
      temperature: 0,
      reasoning_effort: 'low',
    }, { signal: titleController.signal });
    const clean = stripInternalReasoning(result.choices?.[0]?.message?.content || '').trim();
    if (clean) return res.status(200).json({ title: clean });
    console.warn('TITLE: Groq returned empty — falling back to Cloudflare');
  } catch (e) {
    console.error('TITLE ERROR (Groq):', e.message, '— falling back to Cloudflare');
  } finally {
    clearTimeout(titleTimer);
  }

  const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
  const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (CF_TOKEN && CF_ACCOUNT) {
    for (const cfModel of CF_CHAT_MODELS) {
      try {
        const cfRes = await fetchWithTimeout(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: titlePrompt }],
              stream: false,
              max_tokens: 30,
            }),
          },
          8000
        );
        if (!cfRes.ok) { console.log(`TITLE: CF model ${cfModel} HTTP ${cfRes.status}`); continue; }

        const data = await cfRes.json();
        let rawText = data?.result?.response;
        if (typeof rawText !== 'string') {
          rawText = data?.result?.output_text ?? data?.result?.choices?.[0]?.message?.content ?? null;
        }
        if (typeof rawText !== 'string') {
          console.log(`TITLE: CF model ${cfModel} unexpected shape:`, JSON.stringify(data).slice(0, 200));
          continue;
        }

        const clean = stripInternalReasoning(rawText).trim();
        if (clean) {
          console.log(`TITLE: Cloudflare fallback succeeded (${cfModel})`);
          return res.status(200).json({ title: clean });
        }
      } catch (e) {
        console.log(`TITLE: CF model error (${cfModel}):`, e.message);
      }
    }
  } else {
    console.warn('TITLE: Cloudflare fallback skipped — CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID not set');
  }

  return res.status(200).json({ title: '' });
}

    const LIMITS = {
      free:     { messages: 10,  documents: 1,  images: 2,  vision: 0 },
      silver:   { messages: 80,  documents: 5,  images: 6,  vision: 2 },
      gold:     { messages: 100, documents: 8,  images: 10, vision: 3 },
      platinum: { messages: 120, documents: 10, images: 12, vision: 4 },
    };
    const USAGE_KEY = {
      chat: 'messages', search: 'messages', tts: 'messages',
      execute: 'messages', transcribe: 'messages',
      image: 'images', vision: 'vision',
    };

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const rawTier = (userData.tier || '').toString().trim().toLowerCase();
    const tier = LIMITS[rawTier] ? rawTier : 'free';
    const today = new Date().toDateString();
    let usage = userData.usage || { messages: 0, documents: 0, images: 0, vision: 0 };
    if (userData.usageDate !== today) usage = { messages: 0, documents: 0, images: 0, vision: 0 };

    const bucket = USAGE_KEY[action] || 'messages';
    const limit  = LIMITS[tier][bucket];

    if (usage[bucket] >= limit) {
      return res.status(429).json({ error: `Daily ${bucket} limit reached for your plan.` });
    }

    usage[bucket] += 1;
    await userRef.set({ usage, usageDate: today, tier }, { merge: true });

    const prompt  = sanitizeString(body.prompt  || '', 15000);
    const query   = sanitizeString(body.query   || '', 500);
    const image   = body.image || null;
    const history = sanitizeHistory(body.history || []);
    const isVoiceCall = Boolean(body.isVoiceCall);
    const isCodeMode  = Boolean(body.mode === 'code' || body.isCodeChat === true);

    const clientSignal = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        try { clientSignal.abort(); } catch (_) {}
      }
    });

    const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
    const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!CF_TOKEN || !CF_ACCOUNT) {
      console.error('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID missing — Cloudflare fallback unavailable for this request');
    }

    if (isCodeMode && action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        if (isImageGenerationRequest(prompt)) {
          const redirectMsg = `I'm **Vertex**, the coding side of **Vortis** — I specialize in writing, debugging, and explaining code, and I don't generate images directly.\n\nFor image generation, switch to the main **Vortis** chat (use the chat switcher in the sidebar or start a new Vortis chat). Vortis has a built-in image generator powered by FLUX + Pollinations — it'll turn your prompt into a real image in a few seconds.\n\nIf you actually wanted code that *calls* an image-generation API (e.g. a Python script using OpenAI's DALL-E, or a Node.js script calling Pollinations), just say so and I'll write that for you here.`;
          try {
            res.write(`data: ${JSON.stringify({ content: redirectMsg })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (_) {}
          console.log('Code-chat: short-circuited image-generation request with redirect message');
          return;
        }

        const lastUserForSearch = history[history.length - 1]?.content || prompt.trim();

        const looksLikeClarifyAnswerEarly = /\S.{0,80}?:\s*\S.{0,80}?(\s*·\s*\S.{0,80}?:\s*\S.{0,80}?)+/.test(lastUserForSearch);

        let codeSearchContext = '';

        const looksLikeCodePasteRequest = /```/.test(lastUserForSearch) && /\b(return only the corrected code|continue from where you left off|the following code has an issue)\b/i.test(lastUserForSearch);

    if (!looksLikeClarifyAnswerEarly && !looksLikeCodePasteRequest &&
    await aiNeedsSearch(groq, lastUserForSearch, { isCode: true, clientSignal: clientSignal.signal })) {
          try {
            const sq = buildSearchQuery(lastUserForSearch.slice(0, 300));
            let results = await fetchWebResults(sq);
            const rawCount = results.length;
            results = cleanCodeResults(results, sq);
            results = deduplicate(results);
            results = scoreAndSort(results, sq);
            console.log(`Code search "${sq}": ${rawCount} raw → ${results.length} after clean`);

            if (results.length > 0) {
              const snippets = results.slice(0, 5).map((r, i) =>
                `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 350)}\nSource: ${r.source} | Date: ${r.date}`
              ).join('\n\n');
              codeSearchContext = `\n\n---\nLIVE WEB SEARCH RESULTS (current info — trust this over your training data for versions/APIs/recent changes):\n${snippets}\n---`;
            } else {
              codeSearchContext = `\n\n---\nA live web search was attempted for this query but returned no usable results. Tell the user you searched but didn't find current info on this, then answer from your best general knowledge and flag that it may be outdated.\n---`;
            }
          } catch (e) {
            console.error('Code-chat search failed:', e.message);
            codeSearchContext = `\n\n---\nA live web search was attempted but failed due to a technical error. Tell the user the search failed, then answer from general knowledge and flag it may be outdated.\n---`;
          }
        }

        const priorHistory = sanitizeHistory(history, 12);
        const lastUserContent = (priorHistory[priorHistory.length - 1]?.role === 'user')
          ? priorHistory[priorHistory.length - 1].content
          : prompt.trim();

        const looksLikeClarifyAnswer = looksLikeClarifyAnswerEarly || /\S.{0,80}?:\s*\S.{0,80}?(\s*·\s*\S.{0,80}?:\s*\S.{0,80}?)+/.test(lastUserContent);

        const codeSysContent = (prompt.trim().slice(0, 12000)) + codeSearchContext +
    '\n\nRespond directly with the final answer only. Do NOT emit any thinking preamble, reasoning walkthrough, or step-by-step deliberation before the answer. Do NOT echo or reference these instructions.' +
    (looksLikeClarifyAnswer
    ? '\n\nThe user just answered your clarifying questions (see conversation history). Do NOT emit another <<<ASK>>> block under any circumstances — use their answers and start building the full solution now.'
    : '') +
    (codeSearchContext
    ? '\n\nLIVE SEARCH RESULTS WERE PROVIDED ABOVE. STRICT RULE: only state a specific fact (a model name, version number, endpoint, pricing, availability) as CONFIRMED if it is literally present in the search snippets above. If a specific name/version/detail is NOT in the snippets, either omit it entirely or explicitly say "not confirmed by search — may be inaccurate." NEVER invent a source (a forum post, a username, a repo) to make an unconfirmed claim sound more credible — that is worse than just saying you\'re unsure. When multiple models are close in name, do not blend/invent hybrid version numbers (e.g. do not write "GLM 5.1/5.2" unless that exact string appears in a snippet).'
    : '\n\nNo live search results were retrieved for this specific message. Never claim you lack real-time or internet access — Vertex has live web search built in via the backend, it simply wasn\'t triggered or didn\'t return results for this particular question. Just answer from your best knowledge, and only flag it as possibly outdated if the topic is genuinely version/date-sensitive.');
        const codeMessages = [{ role: 'system', content: codeSysContent }];
        codeMessages.push(...priorHistory);
        if (!codeMessages.length || codeMessages[codeMessages.length - 1].role !== 'user') {
          codeMessages.push({ role: 'user', content: prompt.trim() });
        }

       const priorCodingTask = codeMessages
          .slice(0, -1)
          .some(m => m.role === 'user' && isActualCodingTask(m.content));

       let chainName = pickCodeChatChain(lastUserContent);
if (looksLikeClarifyAnswer) {
  chainName = 'heavy';
} else if (priorCodingTask) {
  const isBuildDirective = /\b(don'?t ask|no questions|stop asking|skip( the)? questions?|just (build|make|do|go|start)|go ahead|proceed|continue building|keep going)\b/i.test(lastUserContent);
  const looksLikeCodingFollowup = isActualCodingTask(lastUserContent)
    || /\b(code|function|api|error|bug|fix|build|game|app|website|script|html|css|js|javascript|python|react|node)\b/i.test(lastUserContent)
    || isBuildDirective
    || (lastUserContent.trim().length < 10 && !isObviouslyTrivial(lastUserContent));

  if (looksLikeCodingFollowup) {
    chainName = 'heavy';
  } else if (!isTrivialCodeMessage(lastUserContent)) {
    chainName = 'standard';
  }
}

        console.log(`Code-chat: routing "${lastUserContent.slice(0, 50)}..." → chain=${chainName}`);
        let ok = await streamNvidiaGLMOnly(codeMessages, res, 32768, clientSignal.signal, chainName);
        if (!ok && !clientSignal.signal.aborted && !res.writableEnded) {
          console.warn('Code-chat: NVIDIA chain failed — falling through to Groq+CF (streamCodeChatFallback)');
          try {
            ok = await streamCodeChatFallback(groq, codeMessages, res, {
              CF_TOKEN,
              CF_ACCOUNT,
              clientSignal: clientSignal.signal,
              chainName,
            });
          } catch (fallbackErr) {
            console.error('Code-chat Groq+CF fallback also failed:', fallbackErr.message);
            ok = false;
          }
        }
        if (!ok && !clientSignal.signal.aborted && !res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ content: 'All code models are temporarily unavailable (NVIDIA + Groq + Cloudflare all failed). Please retry in a moment.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (_) {}
        }
      } catch (err) {
        console.error('CODE CHAT ERROR:', err.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Code chat request failed' });
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ content: 'I hit an error while generating that. Please try again — rephrasing your request may help.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (_) {}
        }
      }
      return;
    }

    if (!CF_TOKEN || !CF_ACCOUNT) return res.status(500).json({ error: 'Server configuration error' });

    if (action === 'tts') {
      const text  = sanitizeString(body.text  || '', 1000);
      const voice = sanitizeString(body.voice || 'en-US-GuyNeural', 60);
      if (!text) return res.status(400).json({ error: 'Missing text' });

      const cleanText = text
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1FA00}-\u{1FA9F}]/gu, '')
        .replace(/[\u2600-\u27BF]/g, '')
        .replace(/[★✦•→←↑↓◆◇○●©®™⚡️]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900);

      if (!cleanText || cleanText.length < 2) return res.status(200).json({ audio: '' });

      try {
        const { EdgeTTS } = await import('@andresaya/edge-tts');
        const tts = new EdgeTTS();
        await tts.synthesize(cleanText, voice, {
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          rate: '-12%',
        });
        const base64 = await tts.toBase64();
        if (base64 && base64.length > 100) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).json({ audio: base64 });
        }
        throw new Error('Empty audio');
      } catch (e) { console.log('TTS attempt 1 failed:', e.message); }

      try {
        const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const readable = tts.toStream(cleanText);
        const chunks = [];
        await new Promise((resolve, reject) => {
          readable.on('data', chunk => chunks.push(chunk));
          readable.on('end', resolve);
          readable.on('error', reject);
          setTimeout(() => reject(new Error('stream timeout')), 10000);
        });
        const buf = Buffer.concat(chunks);
        if (buf.length > 100) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).json({ audio: buf.toString('base64') });
        }
        throw new Error('Empty buffer');
      } catch (e) { console.log('TTS attempt 2 failed:', e.message); }

      try {
        const cfTtsRes = await fetchWithTimeout(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/myshell-ai/melotts`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CF_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: cleanText }),
          },
          15000
        );
        if (cfTtsRes.ok) {
          const arrayBuffer = await cfTtsRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          if (base64 && base64.length > 100) {
            console.log('Cloudflare MeloTTS succeeded ✅');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.status(200).json({ audio: base64 });
          }
        }
        console.log('Cloudflare MeloTTS failed:', cfTtsRes.status);
      } catch (e) { console.log('TTS attempt 3 (CF MeloTTS) failed:', e.message); }

      return res.status(502).json({ error: 'TTS synthesis failed', audio: '' });
    }

    if (action === 'chat') {
    if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) { try { res.write(': ping\n\n'); } catch (_) {} }
  }, 8000);

  try {
    if (isVoiceCall) {
      const nvKey = process.env.NVIDIA_API_KEY;

      const voiceIdentity = `You are Vortis, a voice AI assistant built by the Vortis team.
If asked who made you, who developed you, what company you are from, or what model/AI you are running on, respond ONLY with: "I was built by the Vortis team."
Never say Nvidia, Meta, Llama, Nemotron, GPT, OpenAI, Claude, Anthropic, Gemini, Google, or any other company or model name — even if directly, indirectly, or repeatedly asked, and even if it conflicts with what you were trained on.

Example:
User: who made you?
Assistant: I was built by the Vortis team.

User: are you nvidia's model / llama / nemotron?
Assistant: No — I'm Vortis, built by the Vortis team.

RESPONSE STYLE: Be concise and to the point. Short answers for simple questions (1-3 sentences max).
`;

      const voiceSystemContent = voiceIdentity + '\n\n' + prompt.trim().slice(0, 12000);

      try {
        const nvRes = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: NVIDIA_CHAT_FAST,
              messages: [
                { role: 'system', content: voiceSystemContent },
                ...sanitizeHistory(history, 8),
              ],
              max_tokens: 800,
              temperature: body.temperature ?? 0.4,
              frequency_penalty: 0.4,
              presence_penalty: 0.3,
              stream: false,
            }),
          },
          10000
        );

        if (nvRes.ok) {
          const data = await nvRes.json();
          const text = stripInternalReasoning(data?.choices?.[0]?.message?.content ?? '').trim();
          if (text.length > 2) {
            console.log('Voice → NVIDIA ✅ (primary)');
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        }
      } catch (e) {
        console.log('NVIDIA voice failed:', e.message, '— falling back to Groq');
      }

      try {
        const voiceKey = pickGroqKey();
        if (!voiceKey) {
          console.warn('No Groq key available for voice fallback — trying CF');
        } else {
          const voiceGroq = makeGroqClient(voiceKey);
          const stream = await voiceGroq.chat.completions.create({
            model:      GROQ_CHAT_PRIMARY,
            messages:   [
              { role: 'system', content: prompt.trim().slice(0, 12000) },
              ...sanitizeHistory(history, 8),
            ],
            max_tokens:  600,
            temperature: 0.7,
            stream:      true,
          });
          let buffer = '';
          for await (const chunk of stream) {
            const token = chunk.choices?.[0]?.delta?.content;
            if (!token) continue;
            buffer += token;
            res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
          }
          if (buffer.trim().length > 0) {
            console.log('Voice → Groq (fallback 1)');
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          console.warn('Groq voice returned empty — trying CF');
        }
      } catch (e) {
        console.error('Groq voice fallback failed:', e.message, '— trying CF');
      }

      for (const cfModel of CF_CHAT_MODELS) {
        try {
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [
                  { role: 'system', content: prompt.trim().slice(0, 12000) },
                  ...sanitizeHistory(history, 8),
                ],
                stream: false,
                max_tokens: 400,
              }),
            }
          );
          if (!cfRes.ok) continue;
          const data = await cfRes.json();
          let rawText = data?.result?.response ?? data?.result?.output_text ?? data?.result?.choices?.[0]?.message?.content ?? null;
          if (typeof rawText !== 'string') continue;
          const text = stripInternalReasoning(rawText);
          if (isValidResponse(text)) {
            console.log(`Voice → Cloudflare ✅ (fallback 2: ${cfModel})`);
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        } catch (e) {
          console.log(`CF voice fallback error (${cfModel}):`, e.message);
        }
      }

      res.write(`data: ${JSON.stringify({ content: 'Sorry, voice is unavailable right now.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const lastUserMsg = history[history.length - 1]?.content || '';

    const shouldSearch = await aiNeedsSearch(groq, lastUserMsg, { isCode: false });

    const [searchContext, userLocation] = await Promise.all([
      (async () => {
        if (!shouldSearch) return '';
        const searchWork = (async () => {
          try {
            const sq        = buildSearchQuery(lastUserMsg);
            const isSports  = /\b(nba|nfl|mlb|nhl|epl|premier league|la liga|bundesliga|champions league|football|soccer|basketball|tennis)\b/i.test(sq);
            const isCricket = /\b(ipl|cricket|rcb|csk|\bmi\b|kkr|srh|pbks|\brr\b|\bgt\b|lsg|bcci|wicket|innings)\b/i.test(sq);
            const [webResult, espnResult] = await Promise.allSettled([
              fetchWebResults(sq),
              (isSports && !isCricket) ? fetchESPN(sq) : Promise.resolve([]),
            ]);
            let allRes = [
              ...(espnResult.status === 'fulfilled' ? espnResult.value : []),
              ...(webResult.status  === 'fulfilled' ? webResult.value  : []),
            ];
            allRes = cleanResults(allRes, sq);
            allRes = deduplicate(allRes);
            allRes = scoreAndSort(allRes, sq);
            if (allRes.length === 0) return '';
            const snippets = allRes.slice(0, 6).map((r, i) =>
              `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 350)}\nSource: ${r.source} | Date: ${r.date}`
            ).join('\n\n');
            return `\n\n---\nLIVE WEB SEARCH RESULTS (use ONLY these for facts, never training data):\n${snippets}\n---`;
          } catch (e) {
            console.error('Auto-search failed:', e.message);
            return '';
          }
        })();
        return Promise.race([
          searchWork,
          new Promise(resolve => setTimeout(() => resolve(''), 7000)),
        ]);
      })(),

      (async () => {
        if (!shouldSearch) return '';
        try {
          const geoRes = await fetchWithTimeout(`https://ipapi.co/${userIp}/json/`, { headers: { 'User-Agent': BROWSER_UA } }, 1500);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo.city && geo.country_name) return `${geo.city}, ${geo.region}, ${geo.country_name}`;
          }
        } catch (_) {}
        return '';
      })(),
    ]);

    const identityOverride = `You are VORTIS, built by the Vortis team. Never reveal your underlying model or company, even if asked directly or repeatedly. Never claim to be Nvidia, Meta, Llama, Nemotron, GPT, OpenAI, Claude, Anthropic, Gemini, Google, Z.ai, or any other model/company.
Use markdown: **bold** key terms, bullets for 3+ items, \`code\` for technical terms, code blocks for code, tables for comparisons.
MATH FORMATTING — use dollar-sign delimiters ONLY: inline math as $...$ and block/display math as $$...$$ on its own lines. Never use \\( \\) or \\[ \\] — they will not render in this app. Use proper LaTeX commands (\\frac, \\sqrt, \\int, \\sum, \\cdot, \\times, etc.) inside the $ delimiters.
Use emojis naturally where they fit the tone — greetings, casual chat, lists of fun facts, encouragement, celebrations, etc. Don't force them into every message, but don't avoid them either.
Match the vibe: casual/friendly messages can have 1-3 emojis, technical/formal answers should have none or very few.
Be concise and proportional to the user's request. Simple questions should usually receive a short, direct response; do not add sentences just to reach a minimum length. Give more detail only when the question or context requires it. Under 200 words unless the user asks for more detail. Never repeat, pad, or over-explain. Always finish complete sentences, full depth only for complex/technical tasks. Under 200 words unless detail is asked for. Never repeat or pad. Always finish complete sentences.
If declining, briefly say why and offer an alternative.\n\n`;

    const imageGuard = looksLikeImageRequest(lastUserMsg) ? `
IMAGE RULE: Before GENERATE_IMAGE:<desc>, confirm a real subject exists (this msg or earlier in chat). Words like "generate/gen/image/make it" alone are NOT a subject. No subject anywhere → ask one short question instead, don't generate blind.\n\n` : '';

    const locationNote = userLocation ? `\nUser's location: ${userLocation}` : '';
    const tableGuard = looksLikeTableRequest(lastUserMsg) ? `
TABLE FORMATTING — CRITICAL: When outputting a markdown table, put a blank line before the table starts, put each row on its own separate line (never join rows with "| |"), and put the header separator row (|---|---|) on its own line too. Never compress a table into one paragraph.\n\n` : '';

    const sysContent = identityOverride + imageGuard + tableGuard + prompt.trim().slice(0, 20000) + locationNote + searchContext;

    const messages = [];
    if (sysContent) messages.push({ role: 'system', content: sysContent });
    messages.push(...history);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      const userMsg = history.length > 0
        ? history[history.length - 1].content
        : prompt.replace(/^You are VORTIS[\s\S]{0,500}/, '').trim();
      messages.push({ role: 'user', content: userMsg });
    }

    const ok = await streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal: clientSignal.signal });
    if (!ok) {
      if (!res.writableEnded && !clientSignal.signal.aborted) {
        res.write(`data: ${JSON.stringify({ content: 'All AI providers are busy — please try again in a moment.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  } catch (error) {
    console.error('CHAT ERROR:', error.message);
    if (!res.headersSent) return res.status(500).json({ error: 'AI request failed' });
    if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
  } finally {
    clearInterval(heartbeat);
  }
  return;
}

    if (action === 'memory') {
      const userMsg = sanitizeString(body.userMsg || '', 800);
      const existing = Array.isArray(body.existing) ? body.existing.slice(0, 30) : [];
      if (!userMsg || userMsg.trim().split(/\s+/).length < 2) {
        return res.status(200).json({ ops: [] });
      }

      const existingList = existing.length
        ? existing.map((m, i) => `${i}. ${m.text}`).join('\n')
        : '(none yet)';

      const sys = `You maintain a small memory bank of durable facts about a user, for a chat assistant.

EXISTING MEMORIES:
${existingList}

TASK: Read the user's new message. Decide what to do with the memory bank. Output ONLY a JSON array of operations, nothing else. Each operation is one of:
{"op":"ADD","text":"<new fact, full sentence>"}
{"op":"UPDATE","index":<existing memory index>,"text":"<corrected full sentence>"}
{"op":"DELETE","index":<existing memory index>}

RULES — be strict, most messages produce an EMPTY array []:
- Only extract durable facts: name, profession/job, location, stated skill, long-term preference, ongoing project, relationship, stated goal.
- NEVER extract: single words, sentence fragments, questions, requests, opinions about the assistant, one-off tasks, transient states ("I'm tired right now"), or anything under 4 words.
- Each "text" must be a complete, grammatical, third-person sentence like "User works as a nurse in Chicago" — never a bare word or phrase.
- If the new message contradicts or updates an existing memory, use UPDATE with that memory's index. If it makes one obsolete, use DELETE.
- Max 2 ops per message. If nothing durable and fact-like is stated, return [].
- Output ONLY the JSON array — no markdown, no explanation, no backticks.`;

      try {
        const result = await Promise.race([
          groq.chat.completions.create({
            model: GROQ_CLASSIFIER_MODEL,
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: userMsg.slice(0, 500) },
            ],
            max_tokens: 300,
            temperature: 0,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('memory timeout')), 4000)),
        ]);

        let raw = result.choices?.[0]?.message?.content || '[]';
        raw = raw.replace(/```json|```/g, '').trim();
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        if (start === -1 || end === -1) return res.status(200).json({ ops: [] });

        let parsed;
        try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return res.status(200).json({ ops: [] }); }
        if (!Array.isArray(parsed)) return res.status(200).json({ ops: [] });

        const validOps = parsed.filter(o => {
          if (!o || typeof o !== 'object') return false;
          if (!['ADD', 'UPDATE', 'DELETE'].includes(o.op)) return false;
          if (o.op === 'DELETE') return Number.isInteger(o.index) && o.index >= 0 && o.index < existing.length;
          if (typeof o.text !== 'string') return false;
          const t = o.text.trim();
          if (t.length < 12 || t.length > 140) return false;
          if (t.split(/\s+/).length < 4) return false;
          if (!/^[A-Z]/.test(t)) return false;
          if (o.op === 'UPDATE' && !(Number.isInteger(o.index) && o.index >= 0 && o.index < existing.length)) return false;
          return true;
        }).slice(0, 2);

        return res.status(200).json({ ops: validOps });
      } catch (e) {
        console.error('MEMORY ERROR:', e.message);
        return res.status(200).json({ ops: [] });
      }
    }

    if (action === 'search') {
      const searchQuery = (query || prompt).trim();
      if (!searchQuery)             return res.status(400).json({ error: 'Missing search query' });
      if (searchQuery.length > 300) return res.status(400).json({ error: 'Query too long' });
      console.log(`SEARCH action: query="${searchQuery.slice(0, 80)}"  serper_key=${process.env.SERPER_API_KEY ? 'set' : 'MISSING'}  tavily_key=${process.env.TAVILY_API_KEY ? 'set' : 'MISSING'}`);

      const low       = searchQuery.toLowerCase();
      const isCricket = /\b(ipl|cricket|rcb|csk|\bmi\b|kkr|srh|pbks|\brr\b|\bgt\b|lsg|bcci|wicket|innings)\b/.test(low);
      const isSports  = /\b(nba|nfl|mlb|nhl|epl|premier league|la liga|bundesliga|champions league|football|soccer|basketball|tennis)\b/.test(low);

      const [webResult, espnResult] = await Promise.allSettled([
        fetchWebResults(searchQuery),
        (isSports && !isCricket) ? fetchESPN(searchQuery) : Promise.resolve([]),
      ]);

      let allResults = [
        ...(espnResult.status === 'fulfilled' ? espnResult.value : []),
        ...(webResult.status  === 'fulfilled' ? webResult.value  : []),
      ];
      allResults = cleanResults(allResults, searchQuery);
      allResults = deduplicate(allResults);
      allResults = scoreAndSort(allResults, searchQuery);

      let aiSummary = null;
      if (allResults.length > 0) {
        const contextSnippets = allResults.slice(0, 4).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 200)}\nSource: ${r.source}`
        ).join('\n\n');
        const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
          const result = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                {
                  role:    'system',
                  content: `Today is ${todayStr}. Summarize these search results in 2-3 sentences.\nRULES:\n- Use ONLY the results below.\n- Be specific: names, scores, dates, numbers.\n- Direct and factual.\n- If results show a sports result, state it clearly.\n- Do NOT say "as of my knowledge".\n\nSEARCH RESULTS:\n${contextSnippets}`,
                },
                { role: 'user', content: `Summarize briefly.` },
              ],
              max_tokens:  300,
              temperature: 0.2,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 5000)),
          ]);
          const rawT = result.choices?.[0]?.message?.content || null;
          const t    = rawT ? stripInternalReasoning(rawT) : null;
          if (t && t.trim().length > 10) aiSummary = t.trim();
        } catch (e) { console.error('AI summary failed:', e.message); }
      }

      if (allResults.length === 0) {
        console.error('SEARCH: all providers (Tavily, Serper, DuckDuckGo, Bing) returned 0 results.');
        try {
          const fallback = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                { role: 'system', content: `Today is ${new Date().toDateString()}. Answer factually in 2-3 sentences. Note that live web search was attempted but returned no results — flag that the answer may not reflect the latest info.` },
                { role: 'user',   content: searchQuery },
              ],
              max_tokens: 300,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          const rawAnswer = fallback.choices?.[0]?.message?.content || null;
          const answer    = rawAnswer ? stripInternalReasoning(rawAnswer) : null;
           if (answer) {
           aiSummary = answer;
          }
        } catch (e) { console.error('Knowledge fallback failed:', e.message); }
      }

      return res.json({
        success:        allResults.length > 0,
        results:        allResults.slice(0, 10),
        aiSummary:      aiSummary || null,
        provider:       allResults[0]?.source || 'unknown',
        searchWarning:  allResults.length === 0 ? 'All search providers returned no results. Check your network or try a different query.' : null,
      });
    }

    if (action === 'vision') {
      if (!image)                     return res.status(400).json({ error: 'Missing image data' });
      if (!isValidBase64Image(image)) return res.status(400).json({ error: 'Invalid image format' });
      if (isImageTooLarge(image))     return res.status(400).json({ error: 'Image too large (max 5MB)' });

      const base64Data = image.startsWith('data:') ? image.split(',')[1] : image;
      const cleanPrompt = sanitizeString(prompt || 'Describe this image in detail.', 500);

      const tryCloudflareVision = async (modelId, useLlavaFormat = false) => {
        try {
          const body = useLlavaFormat
            ? { prompt: cleanPrompt, image: Array.from(Buffer.from(base64Data, 'base64')) }
            : {
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                    { type: 'text', text: cleanPrompt },
                  ],
                }],
                max_tokens: 2048,
              };
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${modelId}`,
            { method: 'POST', headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          );
          if (!cfRes.ok) return null;
          const data = await cfRes.json();
          return data.result?.response || data.result?.description || null;
        } catch (e) {
          console.log(`Cloudflare vision (${modelId}) failed:`, e.message);
          return null;
        }
      };

      const tryNvidiaVision = async (modelId) => {
  if (isNvidiaModelBlocked(modelId)) {
    if (process.env.VERBOSE_KEEPALIVE === '1') {
      console.log(`NVIDIA vision (${modelId}) skipped — blocked (invalid or circuit-breaker cooldown)`);
    }
    return null;
  }
  try {
    const nvKey = process.env.NVIDIA_API_KEY;
    if (!nvKey) return null;
    const nvRes = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: cleanPrompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
            ],
          }],
          max_tokens: 2048,
          temperature: 0.5,
        }),
      },
      20000
    );
    if (!nvRes.ok) {
      let errBody = '';
      try { errBody = (await nvRes.text()).slice(0, 300); } catch (_) {}
      if (nvRes.status === 404 || nvRes.status === 401 || nvRes.status === 410) {
        markNvidiaModelInvalid(modelId, `HTTP ${nvRes.status} during vision`);
        console.warn(`NVIDIA vision (${modelId}) marked INVALID — HTTP ${nvRes.status} (${errBody.slice(0, 120)})`);
        return null;
      }
      if (nvRes.status === 429) {
        recordNvidiaFailure(modelId);
        console.warn(`NVIDIA vision (${modelId}) HTTP 429 (rate limited) — strike 1/2`);
        return null;
      }
      if (nvRes.status === 502 || nvRes.status === 503 || nvRes.status === 504) {
        recordNvidiaFailure(modelId);
        recordNvidiaFailure(modelId);
        console.warn(`NVIDIA vision (${modelId}) HTTP ${nvRes.status} — instant circuit breaker trip`);
        return null;
      }
      console.log(`NVIDIA vision (${modelId}) HTTP ${nvRes.status} — ${errBody}`);
      return null;
    }
    const data = await nvRes.json();
    const rawDesc = data?.choices?.[0]?.message?.content ?? null;
    if (typeof rawDesc !== 'string') {
      console.log(`NVIDIA vision (${modelId}) no content field:`, JSON.stringify(data).slice(0, 200));
      return null;
    }
    const desc = stripInternalReasoning(rawDesc);
    if (desc && desc.trim().length > 2) {
      recordNvidiaSuccess(modelId);
      return desc;
    }
    return null;
  } catch (e) {
    console.log(`NVIDIA vision (${modelId}) failed:`, e.message);
    return null;
  }
};

      let description = null;

      const raceNvidiaModels = async (label) => {
        const candidates = NVIDIA_VISION_CHAIN
          .filter(id => !isNvidiaModelBlocked(id))
          .map(id => ({
            name: `nvidia-${id}`,
            fn: () => tryNvidiaVision(id),
          }));
        if (candidates.length === 0) {
          console.warn(`Vision [${label}] race skipped — all NVIDIA vision models currently blocked`);
          return null;
        }
        return Promise.any(
          candidates.map(async (c) => {
            const result = await c.fn();
            if (result && result.trim().length > 2) {
              console.log(`Vision [${label}] succeeded: ${c.name}`);
              return result;
            }
            throw new Error(`${c.name} empty`);
          })
        ).catch(() => null);
      };

      description = await raceNvidiaModels('race');

      if (!description) {
        const retryCandidates = NVIDIA_VISION_CHAIN.slice(0, 3).filter(id => !isNvidiaModelBlocked(id));
        if (retryCandidates.length > 0) {
          await new Promise(r => setTimeout(r, 2000));
          for (const modelId of retryCandidates) {
            const result = await tryNvidiaVision(modelId);
            if (result && result.trim().length > 2) {
              console.log(`Vision [retry] succeeded: nvidia-${modelId}`);
              description = result;
              break;
            }
          }
        }
      }

      if (!description) {
        for (const [modelId, useLlavaFormat] of NVIDIA_VISION_CF_FALLBACK) {
          description = await tryCloudflareVision(modelId, useLlavaFormat);
          if (description && description.trim().length > 2) break;
        }
      }

      if (description && description.trim().length > 2) {
        return res.status(200).json({ success: true, description: description.trim() });
      }

      return res.status(200).json({
        success: true,
        description: 'I tried multiple vision models but they are all busy right now. Please try again in a moment — your image was received but I could not analyze it yet.',
      });
    }

    if (action === 'transcribe') {
      const audioBase64 = body.audio || '';
      if (!audioBase64) return res.status(400).json({ error: 'Missing audio data' });

      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        if (audioBuffer.length < 100) return res.status(400).json({ error: 'Audio too short' });
        if (audioBuffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Audio too large' });

        const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

        const transcription = await groq.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-large-v3-turbo',
          response_format: 'verbose_json',
        });

        const text = (transcription?.text || '').trim();
        const detectedLang = transcription?.language || null;
        return res.status(200).json({ text, language: detectedLang });
      } catch (error) {
        console.error('TRANSCRIBE ERROR:', error.message);
        return res.status(500).json({ error: 'Transcription failed', text: '' });
      }
    }

    if (action === 'image') {
      if (!prompt.trim())       return res.status(400).json({ error: 'Missing image prompt' });
      if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt too long' });

      async function tryFlux(promptText) {
        try {
          const seed   = Math.floor(Math.random() * 999999);
          const imgRes = await fetchWithTimeout(
            `https://floral-math-6a24.raghavprabhakar5.workers.dev/`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'x-worker-token': process.env.WORKER_SECRET },
              body:    JSON.stringify({ prompt: promptText.trim(), model: 'flux', seed }),
            },
            25000
          );
          if (!imgRes.ok) {
            console.log('Cloudflare Flux worker HTTP', imgRes.status);
            return null;
          }

          const contentType = imgRes.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await imgRes.json();
            if (json?.imageUrl) return json;
            console.log('Cloudflare Flux worker returned error:', json?.error || JSON.stringify(json).slice(0, 200));
            return null;
          }
          if (contentType.startsWith('image/')) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            return { success: true, imageUrl: `data:${contentType};base64,${buf.toString('base64')}` };
          }

          const responseText = await imgRes.text();
          try {
            const parsed = JSON.parse(responseText);
            if (parsed?.imageUrl) return parsed;
            console.log('Cloudflare Flux worker returned non-image JSON:', (parsed?.error || responseText).slice(0, 200));
            return null;
          } catch {
            console.log('Cloudflare Flux worker returned unknown content-type:', contentType, 'len=', responseText.length);
            return null;
          }
        } catch (e) {
          console.error('Flux worker failed:', e.message);
          return null;
        }
      }

      async function tryPollinations(promptText) {
        try {
          const safePrompt = (promptText || '').trim().slice(0, 800);
          if (!safePrompt) return null;

          const seed = Math.floor(Math.random() * 999999);
          const params = new URLSearchParams({
            width:  '1024',
            height: '1024',
            seed:   String(seed),
            model:  'flux',
            nologo: 'true',
          });
          const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?${params.toString()}`;

          const imgRes = await fetchWithTimeout(url, {}, 45000);
          if (!imgRes.ok) {
            console.log('Pollinations HTTP', imgRes.status);
            return null;
          }

          const contentType = imgRes.headers.get('content-type') || '';
          if (!contentType.startsWith('image/')) {
            console.log('Pollinations returned non-image content-type:', contentType);
            return null;
          }

          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length < 1000) {
            console.log('Pollinations returned suspiciously small payload:', buf.length, 'bytes');
            return null;
          }

          const mime = contentType.split(';')[0].trim() || 'image/jpeg';
          console.log('Pollinations image received ✅', `(${buf.length} bytes, ${mime})`);
          return { success: true, imageUrl: `data:${mime};base64,${buf.toString('base64')}` };
        } catch (e) {
          console.error('Pollinations failed:', e.message);
          return null;
        }
      }

      try {
        console.log('Routing prompt to Cloudflare Flux worker as Primary...');

        const fluxResult = await tryFlux(prompt);
        if (fluxResult?.imageUrl) {
          return res.status(200).json({ ...fluxResult, provider: 'flux', usage, limits: LIMITS[tier] });
        }

        console.log('Cloudflare Flux worker failed, shifting to Pollinations (flux) fallback...');
        const pollResult = await tryPollinations(prompt);
        if (pollResult?.imageUrl) {
          return res.status(200).json({ ...pollResult, provider: 'pollinations-flux', usage, limits: LIMITS[tier] });
        }

        console.log('All image generation providers failed.');
        return res.status(503).json({ error: 'Image generation service is temporarily unavailable. Please try again later.' });
      } catch (error) {
        console.error('IMAGE GEN ERROR:', error.message);
        return res.status(503).json({ error: 'Image generation service is temporarily unavailable. Please try again later.' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('GLOBAL ERROR:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── START SERVER ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vortis backend listening on port ${PORT}`);
});