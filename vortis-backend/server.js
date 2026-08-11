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
const GROQ_CHAT_PRIMARY = 'openai/gpt-oss-20b';
const GROQ_CHAT_QUALITY = 'openai/gpt-oss-120b';
const GROQ_CLASSIFIER_MODEL = 'openai/gpt-oss-20b';

const NVIDIA_BASE_URL     = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_CHAT_FAST    = 'nvidia/nvidia-nemotron-nano-9b-v2';     // 9b nano — fast, reliable, PRIMARY for ALL code-chat
const NVIDIA_CHAT_QUALITY = 'nvidia/nemotron-3-super-120b-a12b';     // 120b super — regular chat fallback only
const NVIDIA_CHAT_CODE    = 'nvidia/nemotron-3-ultra-550b-a55b';   // 550b ultra — heavy coding  
const NVIDIA_VISION_MODEL = 'minimaxai/minimax-m3';


// NEW STRATEGY: nano-9b is the PRIMARY for ALL code-chat (heavy, standard,
// trivial). It's fast (1-3s warm), reliable, and handles 90% of coding
// tasks well. For heavy coding that needs more power, 
//   - Much faster to warm the 550b ultra 
// If both NVIDIA models fail, we fall through to Groq (gpt-oss-120b for
// hard, gpt-oss-20b for medium) which is also good at code.

// CODE-CHAT MODEL CHOICE:
//   nano-9b is the PRIMARY for ALL code-chat. It's fast (1-3s warm) and
//   handles most coding tasks well. 550b ultra is the fallback for when
//   nano fails or returns poor results.
//
//   Chains (tried in order; circuit breaker skips blocked models):
//     - Heavy coding task:   nano-9b → 550b ultra  → [Groq+CF]
//     - Simple code Q&A:     nano-9b → 550b ultra  → [Groq+CF]
//     - Trivial:             nano-9b → 550b ultra  → [Groq+CF]
//
const NVIDIA_CODE_MODEL_HEAVY    = NVIDIA_CHAT_CODE;   
const NVIDIA_CODE_MODEL_FAST     = NVIDIA_CHAT_FAST;  

const NVIDIA_CODE_CHAINS = {
  heavy:    [NVIDIA_CODE_MODEL_FAST, NVIDIA_CODE_MODEL_HEAVY],
  standard: [NVIDIA_CODE_MODEL_FAST, NVIDIA_CODE_MODEL_HEAVY],
  trivial:  [NVIDIA_CODE_MODEL_FAST, NVIDIA_CODE_MODEL_HEAVY],
};

// Coding verbs and their common typos. Used for fuzzy matching so
// "amke me a game" (typo of "make") still routes correctly.
// We use explicit typo lists for the most common verbs + Levenshtein
// distance 2 as a safety net for anything we missed.
const CODING_VERBS_EXACT = [
  'make', 'build', 'create', 'generate', 'develop', 'implement',
  'code', 'write', 'debug', 'refactor', 'fix', 'optimi', 'optimize',
  'optimise', 'compile', 'deploy',
];
const CODING_VERBS_TYPOS = [
  // make
  'amke', 'mkae', 'maek', 'mak', 'makke', 'mke',
  // build
  'bulid', 'biuld', 'buidl', 'buld', 'bild', 'builld',
  // create
  'craete', 'cretae', 'cerate', 'creat', 'creatte', 'crteate',
  // generate
  'genrate', 'generat', 'generete', 'genrate', 'genertae',
  // write
  'wrtie', 'wirte', 'wrie', 'writ', 'writte',
  // debug
  'deubg', 'debg', 'dbgug', 'deugg',
  // fix
  'fxi', 'fx', 'fixx',
  // refactor
  'refacter', 'refacotr', 'refacter', 'rfactor',
  // implement
  'implment', 'implement', 'implemnt', 'impliment',
  // code
  'cdoe', 'ocde', 'cde',
  // develop
  'develp', 'develoop', 'develope', 'dvlp',
  // optimize
  'optimze', 'optmize', 'optmize',
  // deploy
  'depoy', 'delpoy', 'deply',
];

// Checks if any word in the text is a coding verb (exact or typo).
// Uses fuzzyIncludesAny (Levenshtein distance) as a safety net.
//
// CRITICAL FIX: we only apply fuzzy matching to words with length >= 4.
// Previously, "hi" (2 chars) was matching "fix" with Levenshtein distance 2,
// causing simple greetings to be routed to the heavy GLM 5.2 model.
// Short words like "hi", "ok", "no", "hey" cannot be typos of coding verbs
// like "fix", "make", "code" — those verbs are all 3+ chars and a 2-char
// word matching within distance 2 is a false positive.
function containsCodingVerb(text) {
  if (!text) return false;
  const low = text.toLowerCase();
  // Fast path: exact match (word-boundary protected)
  for (const v of CODING_VERBS_EXACT) {
    if (new RegExp(`\\b${v}\\b`).test(low)) return true;
  }
  // Fast path: known typos (word-boundary protected)
  for (const v of CODING_VERBS_TYPOS) {
    if (new RegExp(`\\b${v}\\b`).test(low)) return true;
  }
  // Safety net: Levenshtein distance ≤ 2 for any coding verb.
  // ONLY apply to words with length >= 4 to avoid false positives like
  // "hi" → "fix", "ok" → "code", "no" → "node".
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

// Detects whether a code-chat message is an actual coding task that
// warrants the heavy fallback (llama-3.3-70b).
//
// CRITICAL: this is checked BEFORE isTrivialCodeMessage in
// pickCodeChatChain, so "make me a game" (short but clearly coding)
// routes to heavy, not trivial. Also handles typos — "amke me a game"
// still routes to heavy.
function isActualCodingTask(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase();
  // Code fence anywhere = definitely coding
  if (/```/.test(text)) return true;
  // Any coding verb (exact or typo) + "me"/"a"/"an"/"the" = coding task
  // "make me a game", "amke me a game", "bulid a todo app", etc.
  if (containsCodingVerb(text) && /\b(me|a|an|the|some|this|that)\b/i.test(text)) return true;
  // Standalone creative verb at start of message (even without "me/a")
  // "build something", "create website", "debug please"
  if (containsCodingVerb(text) && low.trim().length < 100) return true;
  // Explicit coding/debug/refactor verbs (also catches "fix my code" etc.)
  if (/\b(stack trace|exception|compile|syntax error|unit test|integration test)\b/i.test(text)) return true;
  // Actual code patterns (not just mentions of code)
  if (/\b(def |function\s*\(|class\s+\w+|import\s|from\s+\w+\s+import|const\s|let\s|var\s|=>|public\s+class|<\?php|#include|console\.log|print\(|async\s+function|await\s|return\s|if\s*\(|for\s*\(|while\s*\()\b/.test(text)) return true;
  // Long technical message (>200 chars) likely needs deep reasoning
  if (text.length > 200 && /\b(code|function|api|endpoint|database|query|algorithm|architecture|design pattern|class|method|variable|array|object|loop|recursion|complexity|game|app|website|script|program)\b/i.test(low)) return true;
  return false;
}

// Detects trivial code-chat messages that should use the fast 30b nano.
// CRITICAL: does NOT return true for messages with creative/build verbs —
// "make me a game" is short but is a coding task, not trivial.
// Also checks for typos so "amke" doesn't slip through.
function isTrivialCodeMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase().trim();
  // If the message contains any coding verb (exact or typo), it's NOT trivial
  if (containsCodingVerb(text)) return false;
  // Very short messages without build verbs = trivial
  if (low.length < 15) return true;
  // Common greetings / acknowledgments
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|cool|nice|great|awesome)\b/.test(low)) return true;
  if (/^(what (is|s) your name|who are you|how are you|good morning|good evening)\b/.test(low)) return true;
  return false;
}

// Picks the right model chain for a code-chat message.
// ORDER MATTERS: isActualCodingTask is checked FIRST so that short
// coding requests like "make me a game" don't get misrouted to trivial.
function pickCodeChatChain(text) {
  if (isActualCodingTask(text))   return 'heavy';    // CHECK FIRST
  if (isTrivialCodeMessage(text)) return 'trivial';
  return 'standard';
}

// ── NVIDIA CIRCUIT BREAKER ────────────────────────────────────
// If a specific NVIDIA model fails N times in a row, skip it for
// COOLDOWN_MS before trying again. This prevents the "abort, retry,
// abort, retry" cascade that was burning 90s+ per request when
// NVIDIA was cold-starting. After 2 consecutive failures we assume
// the model is cold/unavailable and route around it for 2 minutes.
const NVIDIA_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;  // 2 minutes
const NVIDIA_FAILURE_THRESHOLD   = 2;                // consecutive failures
const nvidiaFailureTracker = new Map(); // model -> { count, lastFailTime }

function isNvidiaModelBlocked(model) {
  const entry = nvidiaFailureTracker.get(model);
  if (!entry) return false;
  if (entry.count < NVIDIA_FAILURE_THRESHOLD) return false;
  const elapsed = Date.now() - entry.lastFailTime;
  if (elapsed >= NVIDIA_FAILURE_COOLDOWN_MS) {
    // Cooldown expired — reset and allow a fresh attempt.
    nvidiaFailureTracker.delete(model);
    return false;
  }
  return true;
}

function recordNvidiaFailure(model) {
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
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];

// ── GROQ TPM BUDGET + COOLDOWN TRACKING ─────────────────────────
// Fixes the "first message randomly slow, 429s cascade" issue by
// skipping a model BEFORE hitting Groq if we know it's rate-limited
// or would blow the per-minute token budget, instead of finding out
// after a wasted network round trip.
//
// REAL LIMITS (confirmed from your error log — service tier `on_demand`):
//   openai/gpt-oss-20b  → Limit 8000 TPM  (413 error said "Limit 8000")
//   openai/gpt-oss-120b → ~5000 TPM (heavier model, lower limit)
//   llama-3.1-8b-instant → ~15000 TPM
//
// We set the caps ~1000 BELOW the real limit so a single oversized
// request doesn't trip the 413 (Groq's TPM check is per-request, not
// just per-minute — a 11276-token request against an 8000 cap fails
// immediately even if you haven't sent anything else this minute).
const GROQ_TPM_CAPS = {
  'openai/gpt-oss-20b':   7000,  // real limit 8000, 1k safety buffer
  'openai/gpt-oss-120b':  4000,  // real limit ~5000
  'llama-3.1-8b-instant': 14000, // real limit ~15000
  _default: 5000,
};
function groqTpmCapFor(model) {
  return GROQ_TPM_CAPS[model] ?? GROQ_TPM_CAPS._default;
}
const groqTpmTracker = new Map(); // model -> [{ tokens, time }]
const groqCooldowns  = new Map(); // model -> timestamp when safe to retry

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4); // ~4 chars/token, Groq's own rule of thumb
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

function setGroqCooldown(model, retryAfterSec = 30) {
  groqCooldowns.set(model, Date.now() + retryAfterSec * 1000);
  console.log(`Cooling down ${model} for ${retryAfterSec}s`);
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
  vision:  { window: 60000, max: 5 },
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

// fetchWithTimeout: aborts the fetch if no response headers arrive within
// timeoutMs. For streaming responses, the caller MUST call
// `res.__clearTimeout()` once headers arrive (otherwise the timer keeps
// running and will abort the in-progress body read). The streaming code
// in streamNvidiaGLMOnly and streamAI both do this.
//
// The caller can also pass `options.signal` (e.g. an AbortController tied
// to req.on('close')) — we forward its aborts to our internal controller
// so a closed browser tab cancels the upstream fetch.
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const res = await fetch(url, { ...options, signal: controller.signal, body: options.body });
    // Do NOT clearTimeout here — caller clears via res.__clearTimeout()
    // once they're done with the response (or it fires naturally).
    res.__clearTimeout = () => clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Reads a ReadableStream<Uint8Array> with an idle timeout — if no bytes
// arrive for idleMs, aborts the underlying fetch and throws. Returns the
// decoded text chunks via the onChunk callback. This is the real fix for
// "Code-chat stream error: This operation was aborted" — previously a
// stalled NVIDIA stream would hang until the OUTER 45s timer fired,
// then the retry would hit the same stall. Now we abort quickly and let
// the fallback chain (NVIDIA → Groq → CF) take over.
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
    // Flush any trailing bytes in the decoder
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

  // FIX: previous Promise.race + setTimeout didn't actually abort the
  // underlying Groq fetch — the request kept running and burning TPM
  // long after the race resolved. Now we pass an AbortSignal that
  // actually cancels the HTTP request on timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
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
// Non-streaming NVIDIA completion used as a fallback in streamAI().
// 60s timeout — was 35s but cold-start on the 120b quality model can
// legitimately take 30-40s on the first request after idle. We also
// clear the timer as soon as headers arrive (before res.json()) so
// the body-parse phase doesn't get falsely aborted.
async function tryNvidiaChat(modelId, messages, maxTokens, clientSignal) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  // Skip if circuit breaker has blocked this model.
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
      60000
    );
    if (!res.ok) {
      console.log(`NVIDIA model ${modelId} HTTP ${res.status}`);
      // Instant circuit breaker for 410/502/503/504:
      //   - 410 Gone: model end-of-life (permanent)
      //   - 502/503/504: model unavailable (2 min cooldown)
      if (res.status === 410 || res.status === 502 || res.status === 503 || res.status === 504) {
        recordNvidiaFailure(modelId);
        recordNvidiaFailure(modelId);
        const reason = res.status === 410 ? 'END-OF-LIFE (permanent)' : 'unavailable (2 min cooldown)';
        console.warn(`NVIDIA model ${modelId} HTTP ${res.status} — instant circuit breaker trip — ${reason}`);
      } else {
        recordNvidiaFailure(modelId);
      }
      return null;
    }
    // Clear the outer timer as soon as headers arrive — body parsing
    // (res.json) is fast and shouldn't be aborted by the headers-phase timer.
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
    // Record failure for circuit breaker — but only if it wasn't a
    // client-initiated abort (closing the browser tab shouldn't count
    // against the model's reliability score).
    if (e.name !== 'AbortError' && !clientSignal?.aborted) {
      recordNvidiaFailure(modelId);
    }
    return null;
  }
}

// ── STREAMING callAI ───────────────────────────────────────────
// FIX: accepts a clientSignal (from req.on('close')) so that if the
// browser tab is closed mid-stream, we abort the upstream Groq/
// NVIDIA/CF request instead of letting it run to completion and
// wasting TPM budget / NVIDIA global budget on a response no one
// will ever read.
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal }) {
  const systemPrompt = messages.find(m => m.role === 'system');
  const recentConversations = messages.filter(m => m.role !== 'system').slice(-12);
  const optimizedMessages = systemPrompt ? [systemPrompt, ...recentConversations] : [...recentConversations];
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  const hasCodeFence = /```/.test(lastMsg);
  const looksLikeCodeRequest = isObviouslyHard(lastMsg);
  const isHard = hasCodeFence || looksLikeCodeRequest;

  // NEW: buffer mode for table-like requests — repair before sending, don't stream raw
  const bufferMode = looksLikeTableRequest(lastMsg);

  const model     = isHard ? GROQ_CHAT_QUALITY : GROQ_CHAT_PRIMARY;
  // FIX: previous flat 2048 for trivial messages wasted TPM budget —
  // a "hi" + system prompt was claiming 2k tokens against the 30k TPM
  // cap, which added up fast under load. Trivial messages now use 512.
  const trivialTier = isObviouslyTrivial(lastMsg);
  const maxTokens = isHard ? 8192 : (trivialTier ? 512 : 2048);

  console.log(`Routing: hard=${isHard} bufferMode=${bufferMode} trivial=${trivialTier} → model: ${model} → maxTokens: ${maxTokens}`);

  const MAX_CONTINUATIONS = 3;

  for (const modelToTry of [model, isHard ? GROQ_CHAT_PRIMARY : GROQ_CHAT_QUALITY]) {
    const estTokens = estimateTokens(JSON.stringify(optimizedMessages)) + maxTokens;
    if (isGroqCoolingDown(modelToTry)) { console.log(`Skipping ${modelToTry} — cooling down`); continue; }
    if (!groqTpmAvailable(modelToTry, estTokens)) { console.log(`Skipping ${modelToTry} — TPM budget`); continue; }
    if (clientSignal?.aborted) { console.log('Client disconnected before model call'); return false; }

    try {
      let convoMessages = [...optimizedMessages];
      let fullBuffer = '';
      let continuations = 0;
      let streamedAnything = false;

      while (true) {
        // Pass the client abort signal through to Groq so a closed
        // browser tab cancels the upstream request instead of letting
        // it run to completion and waste TPM. NOTE: groq-sdk takes the
        // signal in a SECOND options argument, NOT inside the body —
        // putting it in the body causes HTTP 400
        // "property 'signal' is unsupported".
        const stream = await groq.chat.completions.create({
          model: modelToTry, messages: convoMessages, max_tokens: maxTokens, temperature: 0.7, stream: true,
        }, { signal: clientSignal });
        recordGroqTpm(modelToTry, estTokens);

        let buffer = '';
        let finishReason = null;
        let inThink = false;
        let pending = '';

        for await (const chunk of stream) {
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
              // normal path: stream immediately, unchanged
              res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
              if (res.flush) res.flush();
            }
            // in bufferMode we don't write yet — it accumulates in `buffer`/`fullBuffer` below
          }
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
            // repair once, then send the whole clean thing in one shot
            const repaired = repairGluedTableRows(stripInternalReasoning(fullBuffer));
            res.write(`data: ${JSON.stringify({ content: repaired })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return true;
        }

        console.warn(`Model ${modelToTry} returned empty — trying fallback`);
        break;
      }
    } catch (e) {
      console.error(`Groq stream failed (${modelToTry}):`, e.message);
      if (e.status === 429 || e.message?.includes('rate_limit_exceeded')) {
        const waitSec = parseRetryAfterSec(e.message);
        setGroqCooldown(modelToTry, waitSec);
        continue;
      }
    }
  }

  if (checkGlobalLimit('nvidia_global')) {
    const nvidiaModelsToTry = isHard
      ? [NVIDIA_CHAT_CODE, NVIDIA_CHAT_QUALITY, NVIDIA_CHAT_FAST]
      : [NVIDIA_CHAT_FAST, NVIDIA_CHAT_QUALITY];

    for (const nvModel of nvidiaModelsToTry) {
      if (clientSignal?.aborted) { console.log('Client disconnected — skipping NVIDIA'); break; }
      const text = await tryNvidiaChat(nvModel, optimizedMessages, maxTokens, clientSignal);
      if (text) {
        console.log(`NVIDIA fallback succeeded: ${nvModel}`);
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
      console.warn(`NVIDIA model ${nvModel} returned empty — trying next`);
    }
  } else {
    console.warn('NVIDIA global rate limit reached — skipping straight to Cloudflare');
  }

  // FIX: previous CF fallback called CF with `stream: true` in the body
  // but then `await cfRes.json()` on the response. When CF honors the
  // stream flag it returns SSE text ("data: {...}\n\n"), which fails JSON
  // parsing with: "Unexpected token 'd', \"data: {\"ch\"... is not valid JSON".
  // That's exactly the error in the log. Set stream:false so CF returns
  // a single JSON object that .json() can parse.
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
        20000
      );
      if (!cfRes.ok) { console.log(`CF model ${cfModel} HTTP ${cfRes.status}`); continue; }

      const data = await cfRes.json();
      if (cfRes.__clearTimeout) cfRes.__clearTimeout();
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

  // Force a line break before a table that starts mid-sentence
  fixed = fixed.replace(
    /([^\n])[ \t]*(\|[^\n|]+\|[^\n]*\|)/,
    (m, before, tableStart) => `${before}\n\n${tableStart}`
  );

  // Split rows joined by "| |" back onto separate lines
  fixed = fixed.replace(/\|\s*\|\s*(?=[A-Za-z0-9*_])/g, '|\n|');

  // Make sure the --- separator row sits on its own line
  fixed = fixed.replace(
    /(\|[\s:-]*---[\s:-]*\|[\s:-]*(?:---[\s:-]*\|)*)\s*(\|)/g,
    '$1\n$2'
  );

  return fixed;
}

// Detects whether a user's message is asking for tabular/structured output
function looksLikeTableRequest(text) {
  const low = (text || '').toLowerCase();
  return /\b(table|compare|comparison|vs\.?|versus|pros and cons|side.by.side)\b/.test(low);
}

// ── Code-chat streaming (NVIDIA primary, with Groq+CF fallback) ─
// FIXES applied:
//   1. Per-read idle timeout (15s) — if NVIDIA stalls mid-stream we
//      abort quickly instead of waiting for the 60s outer timer, then
//      cascade into retry which hits the same stall. This was the root
//      cause of every "Code-chat stream error: This operation was
//      aborted" in the log.
//   2. Client-disconnect detection — if the browser closes the SSE
//      connection we cancel the upstream NVIDIA fetch instead of
//      finishing a response nobody will read.
//   3. Safe res.write — wrapped in try/catch so a closed socket
//      doesn't crash the loop.
//   4. Returns false on full failure so the caller can fall back to
//      Groq then CF instead of showing the dead-end "Vertex is
//      temporarily unavailable" message.
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
  // HEADERS_TIMEOUT_MS bounds the time from request start until NVIDIA
  // returns response headers (the cold-start phase for the model).
  const HEADERS_TIMEOUT_MS = 120000; // 2 min — cold start on NVIDIA on_demand can be slow
  // IDLE_TIMEOUT_MS: inter-chunk gap mid-stream (after first byte arrives)
  const IDLE_TIMEOUT_MS = 15000;

  // MODEL-DEPENDENT FIRST-BYTE TIMEOUT:
  //   - meta/llama-3.3-70b: 15s — if warm, responds in 3-8s. If cold, abort
  //     at 15s and the user gets nano's answer (which was already tried first).
  //   - nvidia-nemotron-nano-9b: 8s — if warm, responds in 1-3s. Very fast.
  // Since nano is tried FIRST, llama-70b is only reached if nano failed.
  // A 15s timeout is fine — if llama is cold, nano already gave an answer.
  function firstByteTimeoutFor(model) {
    if (model === NVIDIA_CODE_MODEL_HEAVY) return 15000;  // meta/llama-3.3-70b
    return 8000;  // nano-9b and anything else
  }

  // Safe write helper — never throws, returns false if the socket is closed.
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

  // Iterate over the model fallback chain. Each model gets one attempt.
  // Models blocked by the circuit breaker are skipped without a network call.
  // The chain is picked by the caller based on message content:
  //   heavy (real coding → nano first, llama-70b fallback), standard (→ nano), trivial (→ nano)
  const chain = NVIDIA_CODE_CHAINS[chainName] || NVIDIA_CODE_CHAINS.standard;
  const modelsToTry = chain.filter(m => !isNvidiaModelBlocked(m));
  if (modelsToTry.length === 0) {
    console.warn(`Code-chat stream: all NVIDIA code models blocked by circuit breaker (chain=${chainName}) — skipping to Groq+CF`);
    return false;
  }
  console.log(`Code-chat stream: chain=${chainName} will try [${modelsToTry.join(', ')}]`);

  let attemptIdx = 0;
  for (const nvidiaModel of modelsToTry) {
    attemptIdx++;
    if (clientSignal?.aborted) {
      console.log('Code-chat: client disconnected before model', nvidiaModel);
      return false;
    }

    let written = 0;
    let convoMessages = [...messages];
    let continuations = 0;
    let fullRawBuffer = '';
    let attemptFailed = false;
    let failureWasTimeout = false;  // true if the failure was a first-byte/idle timeout (not a real error)
    let idleTimer = null;
    let headersTimerCleared = false;

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
          HEADERS_TIMEOUT_MS
        );

        if (!nvRes.ok) {
          let errBody = '';
          try { errBody = await nvRes.text(); } catch (_) {}
          console.error(`Code-chat stream: ${nvidiaModel} HTTP ${nvRes.status} - ${errBody.slice(0, 300)}`);
          // INSTANT CIRCUIT BREAKER for 410/502/503/504:
          //   - 410 Gone: model reached end-of-life (permanent — skip forever)
          //   - 502/503/504: model genuinely unavailable (skip for 2 min)
          // Record 2 failures immediately to trip the threshold and skip
          // this model instead of wasting time retrying a dead model on
          // every request. This was the root cause of qwen2.5-coder-32b
          // burning time per request when it returned 410 (EOL).
          if (nvRes.status === 410 || nvRes.status === 502 || nvRes.status === 503 || nvRes.status === 504) {
            recordNvidiaFailure(nvidiaModel);
            recordNvidiaFailure(nvidiaModel);
            const reason = nvRes.status === 410 ? 'END-OF-LIFE (permanent)' : 'unavailable (2 min cooldown)';
            console.warn(`Code-chat: ${nvidiaModel} HTTP ${nvRes.status} — instant circuit breaker trip — ${reason}`);
          }
          attemptFailed = true;
          break;
        }

        // CRITICAL FIX: clear the outer HEADERS_TIMEOUT_MS timer as soon
        // as headers arrive. Previously this timer kept running during the
        // streaming body phase and would abort the read loop at 90s/
        // 120s even though we had separate first-byte + idle timers
        // for that. The symptom was "This operation was aborted"
        // appearing on long-but-healthy streams.
        if (nvRes.__clearTimeout) { nvRes.__clearTimeout(); headersTimerCleared = true; }

        const reader  = nvRes.body.getReader();
        // MODEL-DEPENDENT first-byte timeout: ultra gets 20s, nano gets 10s.
        // If the model is warm, it'll respond well within this. If cold,
        // we abort fast and fall back to the next model in the chain.
        const fbTimeout = firstByteTimeoutFor(nvidiaModel);
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          failureWasTimeout = true;  // timeout, not a real error — don't trip circuit breaker
          console.warn(`Code-chat stream: first-byte timeout (${fbTimeout}ms) on ${nvidiaModel}, cancelling reader`);
          try { reader.cancel('first-byte-timeout').catch(() => {}); } catch (_) {}
        }, fbTimeout);

        const decoder = new TextDecoder();
        let buffer    = '';
        let inThink   = false;
        let pending   = '';
        let turnBuffer = '';
        let finishReason = null;
        let clientGone = false;

        try {
          while (true) {
            if (clientSignal?.aborted) { clientGone = true; break; }

            const { done, value } = await reader.read();
            if (done) break;

            // After the first byte arrives, switch from the generous
            // first-byte timeout (45s) to the tighter inter-chunk idle
            // timeout (15s). Mid-stream stalls > 15s are real stalls.
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              failureWasTimeout = true;  // timeout, not a real error
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
          // If we never cleared it (early throw before headers were processed),
          // clear now to be safe.
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
          convoMessages = [
            ...convoMessages,
            { role: 'assistant', content: turnBuffer },
            { role: 'user', content: 'Continue exactly where you left off. Do not repeat any earlier text, do not restart, do not add any preamble or explanation — just continue the code/text.' },
          ];
          continue;
        }

        break;
      }
    } catch (e) {
      console.error(`Code-chat stream error on ${nvidiaModel}:`, e.message);
      attemptFailed = true;
      // CRITICAL: Detect AbortError (timeout/cold-start) and treat it as
      // a TIMEOUT, not a real error. This prevents the circuit breaker
      // from tripping on cold-start failures, which would block the
      // model for 2 minutes and prevent the keep-alive from warming it.
      //
      // AbortError happens when:
      //   - The first-byte timer fires (20s for coder, 10s for nano)
      //   - The idle timer fires (15s mid-stream stall)
      //   - The headers timer fires (120s — model didn't respond at all)
      //   - The client closed the browser tab (clientSignal.aborted)
      // ALL of these are "cold/slow" or "client gone" — NOT "model broken".
      // Only HTTP 503/502/504 (handled separately above) trips the breaker.
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
    }

    // This model failed — record it for the circuit breaker and move on.
    // BUT: only trip the circuit breaker for REAL errors (HTTP 5xx, etc.).
    // Timeouts (first-byte timeout, idle timeout) mean the model was just
    // cold/slow, not broken — tripping the breaker would block it for 2 min
    // and prevent the keep-alive from warming it. The next request should
    // still try it (it might be warm by then).
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
  // Do NOT end the response here — the caller owns the fallback chain.
  return false;
}

// ── Code-chat Groq fallback ─────────────────────────────────────
// Used when NVIDIA code-chat fails entirely. Streams via Groq using
// gpt-oss-20b (fast, decent for code) and falls back through the same
// NVIDIA / CF chain that regular chat uses. Mirrors streamAI() but
// keeps the code-chat system prompt + search context intact.
async function streamCodeChatFallback(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal }) {
  // Reuse the regular streaming fallback chain by delegating straight
  // to streamAI — it already handles Groq → NVIDIA → CF with proper
  // TPM / cooldown / abort handling.
  //
  // DO NOT force `isHard=true` here. Previously this appended a fake
  // code fence to the user message to make streamAI route to
  // gpt-oss-120b (quality tier, 8192 max_tokens). That was wrong for
  // two reasons:
  //   1. A trivial "hi" in code mode would get 8192 max_tokens, blowing
  //      the gpt-oss-120b TPM cap (4000) and cascading to gpt-oss-20b,
  //      which then ALSO failed with 413 because the request was
  //      11276 tokens against an 8000-token limit.
  //   2. Code-chat system prompt is already rich enough — streamAI's
  //      natural isObviouslyHard() check on the user's actual content
  //      will pick the right tier. Forcing hard=true was overriding
  //      that and burning budget on simple messages.
  // Let streamAI route naturally based on the real user content.
  return streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal });
}

// ── TAVILY (primary search provider) ────────────────────────────
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
          search_depth:    'basic',
          max_results:     10,
          include_answer:  false,
          include_images:  false,
        }),
      },
      8000
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
      8000
    );
    if (!res.ok) return [];
    const data    = await res.json();
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

async function fetchWebResults(query) {
  try {
    const tavilyResults = await fetchTavily(query);
    if (tavilyResults.length > 0) return tavilyResults;
    console.log('Tavily returned no results — falling back to Serper');
  } catch (e) {
    console.log('Tavily threw — falling back to Serper:', e.message);
  }
  return fetchSerper(query);
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

// ── Lighter relevance filter for code/technical queries — the default
// cleanResults() is tuned to kill sports/health spam and ends up nuking
// legit docs/API results for niche technical searches. Keep spam/dedup
// checks, drop the strict word-overlap requirement.
function cleanCodeResults(results, query) {
  return results
    .filter(r => !isSpam(r))
    .filter(r => (r.snippet || '').trim().length >= 15)
    .filter(r => { const t = (r.title || '').trim(); return t.length >= 3 && !/^(home|index|page \d+|untitled)$/i.test(t); });
}

// ── AI-BASED SEARCH DECISION ────────────────────────────────────
// Instead of matching keywords (which breaks on typos, phrasing variety,
// or anything not explicitly listed), ask a fast/cheap model to decide
// whether this message needs live web results. Falls back to the old
// heuristic if the classifier call fails or times out.
async function aiNeedsSearch(groq, text, { isCode = false, clientSignal } = {}) {
  const heuristicFallback = isCode ? needsCodeWebSearchHeuristic(text) : needsWebSearchHeuristic(text);

  // Explicit user intent ("search", "google", "lookup", "latest", etc.) always
  // wins — never let the classifier override a direct request from the user.
  if (heuristicFallback) return true;

  // FIX: same AbortController pattern as classifyTier — Promise.race
  // alone doesn't cancel the upstream fetch, so the request kept eating
  // TPM after the 1.2s race timer fired.
  const controller = new AbortController();
  // If the client closed the connection, abort the classifier too.
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), 1200);
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
        { role: 'user', content: text.slice(0, 500) },
      ],
      max_tokens: 5,
      temperature: 0,
    }, { signal: controller.signal });

    const raw = result.choices?.[0]?.message?.content?.toLowerCase() || '';
    return raw.includes('yes');
  } catch (e) {
    console.warn('Search-decision classifier failed:', e.message);
    return false; // heuristic already checked above and was false
  } finally {
    clearTimeout(timer);
  }
}

// Fuzzy keyword match — catches common typos (transpositions, missing/extra
// letters) so "serch", "lattest" etc. still trigger correctly, instead of
// relying on exact regex matches.
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

// Old regex logic kept ONLY as a fallback for when the classifier call fails
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

  // Guaranteed catches for common typo variants — don't rely on edit-distance alone.
  const typoAliases = ['serch', 'saerch', 'seach', 'searc', 'seatch', 'goggle', 'lattest', 'latst'];
  if (typoAliases.some(t => low.includes(t))) return true;

  const searchWords = ['search', 'google', 'lookup', 'latest', 'current', 'recent', 'newest', 'changelog', 'deprecated', 'version'];
  if (fuzzyIncludesAny(text, searchWords, 2)) return true; // maxDist bumped 1 → 2

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
app.set('trust proxy', true); // needed so req.ip / x-forwarded-for work correctly behind Render's proxy
app.use(express.json({ limit: '5mb' }));

// ── CORS (same allowlist logic as before, applied as Express middleware) ──
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

// ── Health check — Render pings this to know the service is alive ──
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('Vortis backend is running.'));

// ═════════════════════════════════════════════════════════════
// ── WARMUP + KEEP-ALIVE
// ═════════════════════════════════════════════════════════════
// FIX for "first message is slow": your screenshot confirms Render's free
// tier spins the instance down after inactivity ("can delay requests by
// 50 seconds or more"). Pinging localhost from inside the same process
// does NOT count as external activity to Render's proxy, so it does NOT
// prevent spin-down — that was the bug in the previous version.
//
// The only things that reliably prevent spin-down on Render's free tier:
//   1) An external uptime service (UptimeRobot, cron-job.org, etc.)
//      hitting your PUBLIC URL every few minutes — this is the real fix.
//   2) Upgrading off the free tier (removes spin-down entirely).
//
// Below, we still warm up in-process connections (Firestore, Groq, NVIDIA
// TLS handshakes) so that once a request *does* arrive, it's not also
// paying for cold connection setup on top of the Render wake-up delay.
// We also self-ping the public RENDER_EXTERNAL_URL if Render provides one,
// which at least helps for paid/instant-scaling tiers or short idle gaps —
// but this is a supplement, not a substitute for an external pinger.

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

  // CRITICAL: warm up the NVIDIA code-chat models with tiny completions.
  // A HEAD request to NVIDIA_BASE_URL only warms the TLS handshake — it
  // does NOT trigger the model to load.
  //
  // We warm up:
  //   - nano-9b          (primary for ALL code-chat) — ~5s cold start
  //   - llama-3.3-70b    (fallback for heavy coding) — 15-25s cold start
  // The 120b super is NOT warmed (not used in code-chat anymore).
  //
  // NON-BLOCKING: warmUp() is fire-and-forget — we do NOT await it.
  // The server starts listening immediately and warmup runs in the
  // background. The keep-alive ping (started 5s later) keeps the models
  // warm going forward.
  const nvKey = process.env.NVIDIA_API_KEY;
  if (nvKey) {
    // Warm the 9b nano (primary for ALL code-chat) — ~5s cold start
    warmUpNvidiaModel(NVIDIA_CODE_MODEL_FAST, 30000).then(({ ok, ms }) => {
      if (ok) console.log(`NVIDIA warmup OK: ${NVIDIA_CODE_MODEL_FAST} ready (${ms}ms)`);
      else    console.log(`NVIDIA warmup skipped: ${NVIDIA_CODE_MODEL_FAST} not ready after ${ms}ms`);
    });
    // Warm the llama-3.3-70b (heavy coding fallback) — 15-25s cold start.
    // 45s timeout: should be plenty for a 70b model. Much faster than
    // GLM 5.2's 60-90s cold start.
    warmUpNvidiaModel(NVIDIA_CODE_MODEL_HEAVY, 45000).then(({ ok, ms }) => {
      if (ok) console.log(`NVIDIA warmup OK: ${NVIDIA_CODE_MODEL_HEAVY} ready (${ms}ms) — llama-70b ready for heavy coding fallback`);
      else    console.log(`NVIDIA warmup skipped: ${NVIDIA_CODE_MODEL_HEAVY} not ready after ${ms}ms — will keep trying via keep-alive`);
    });
  } else {
    console.log('NVIDIA warmup skipped: NVIDIA_API_KEY not set');
  }
}

// Helper: warms up a single NVIDIA model with a tiny completion.
// Returns { ok, ms } once the request finishes (success or failure).
// Never throws — warmup failures are non-fatal.
async function warmUpNvidiaModel(modelId, timeoutMs = 120000) {
  const nvKey = process.env.NVIDIA_API_KEY;
  if (!nvKey) return { ok: false, ms: 0 };
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:       modelId,
          messages:    [{ role: 'user', content: 'hi' }],
          max_tokens:  5,
          temperature: 0.5,
          stream:      false,
        }),
      },
      timeoutMs
    );
    if (res.__clearTimeout) res.__clearTimeout();
    if (res.ok) {
      // Drain the body so the connection can be reused.
      try { await res.text(); } catch (_) {}
      recordNvidiaSuccess(modelId);
      return { ok: true, ms: Date.now() - t0 };
    }
    console.log(`NVIDIA warmup ${modelId} HTTP ${res.status}`);
    return { ok: false, ms: Date.now() - t0 };
  } catch (e) {
    console.log(`NVIDIA warmup ${modelId} failed:`, e.message);
    return { ok: false, ms: Date.now() - t0 };
  }
}

// ── NVIDIA KEEP-ALIVE PING ─────────────────────────────────────
// NVIDIA's on_demand tier unloads models after ~60s of idle time,
// causing the next request to cold-start (15-90s depending on model
// size). We ping each model every 30s with a 1-token "hi" request
// to keep them warm. This is the single biggest speed win — without
// it, EVERY request after 60s of silence hits a cold start.
//
// Cost: ~4 tiny requests per model per 5-min window. On NVIDIA's
// on_demand tier this is essentially free (counts against RPM, not
// a paid quota). The llama-70b ping takes ~3s when warm vs 15-25s
// cold — massive net win.
const NVIDIA_KEEPALIVE_INTERVAL_MS = 30 * 1000; // 30s
const NVIDIA_KEEPALIVE_MODELS = [
  NVIDIA_CODE_MODEL_FAST,      // nvidia-nemotron-nano-9b-v2 — primary for ALL code-chat (keep warm!)
  NVIDIA_CODE_MODEL_HEAVY,     // meta/llama-3.3-70b-instruct — heavy coding fallback (keep warm!)
  // 120b super is NOT pinged — it's not used in code-chat anymore.
  // It's still available as a regular-chat fallback (via NVIDIA_CHAT_QUALITY)
  // but we don't keep it warm since it was slow on NVIDIA's on_demand tier.
];

// Models that returned HTTP 410 (Gone / end-of-life). We stop pinging
// these forever to avoid wasting RPM budget on permanently-dead models.
// A model is added here when the keep-alive gets a 410 response.
const nvidiaEolModels = new Set();

function startNvidiaKeepAlive() {
  if (!process.env.NVIDIA_API_KEY) return;
  console.log(`NVIDIA keep-alive: pinging [${NVIDIA_KEEPALIVE_MODELS.join(', ')}] every ${NVIDIA_KEEPALIVE_INTERVAL_MS / 1000}s`);

  // Run the ping loop in the background. Each model is pinged
  // sequentially (not in parallel) to avoid spiking NVIDIA's RPM limit.
  const pingAll = async () => {
    for (const modelId of NVIDIA_KEEPALIVE_MODELS) {
      // Skip if circuit breaker has blocked this model — no point
      // pinging a model we know is broken.
      if (isNvidiaModelBlocked(modelId)) continue;
      // Skip if this model returned HTTP 410 (end-of-life) previously —
      // it's permanently gone, pinging it wastes RPM budget.
      if (nvidiaEolModels.has(modelId)) continue;
      try {
        const t0 = Date.now();
        const res = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/chat/completions`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model:       modelId,
              messages:    [{ role: 'user', content: 'ok' }],
              max_tokens:  1,
              temperature: 0.5,
              stream:      false,
            }),
          },
          // MODEL-DEPENDENT keep-alive timeout:
          //   - llama-3.3-70b: 45s — cold start 15-25s, 45s is plenty
          //   - nano-9b: 20s — cold start ~5s, 20s is plenty
          modelId === NVIDIA_CODE_MODEL_HEAVY ? 45000 : 20000
        );
        if (res.__clearTimeout) res.__clearTimeout();
        if (res.ok) {
          try { await res.text(); } catch (_) {}
          recordNvidiaSuccess(modelId);
          // Quiet log — only print if it took suspiciously long (warming)
          const ms = Date.now() - t0;
          if (ms > 5000) console.log(`NVIDIA keep-alive: ${modelId} slow (${ms}ms — was warming)`);
        } else if (res.status === 429) {
          // Rate limited — back off this cycle, no need to log loudly
        } else if (res.status === 410) {
          // Model reached end-of-life — STOP pinging it forever. This
          // prevents wasting RPM budget on a permanently-dead model.
          // We add it to a "do not ping" set so future cycles skip it.
          console.log(`NVIDIA keep-alive: ${modelId} HTTP 410 (END-OF-LIFE — stopping keep-alive for this model)`);
          nvidiaEolModels.add(modelId);
        } else if (res.status === 502 || res.status === 503 || res.status === 504) {
          // Model unavailable — log it but DON'T trip circuit breaker from
          // keep-alive. The keep-alive is a background ping; we don't want
          // it to block the model for real user requests. If the model is
          // truly down, real user requests will trip the breaker instead.
          console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status} (unavailable, will retry next cycle)`);
        } else {
          console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status}`);
        }
      } catch (e) {
        // Don't let one model's failure stop the others
        if (e.message?.includes('aborted')) {
          // Timeout — model might be cold, that's fine, the next ping will warm it
        } else {
          console.log(`NVIDIA keep-alive: ${modelId} error:`, e.message);
        }
      }
    }
  };

  // Ping once immediately (in background, don't block startup), then on interval
  pingAll().catch(() => {});
  setInterval(pingAll, NVIDIA_KEEPALIVE_INTERVAL_MS);
}

// Fire-and-forget — do NOT await. Server starts listening immediately.
warmUp();
// Start the keep-alive pings AFTER the initial warmup has had a chance
// to run. The keep-alive will keep all models warm going forward.
setTimeout(startNvidiaKeepAlive, 5000);

const externalUrl = process.env.RENDER_EXTERNAL_URL; // Render sets this automatically if available
if (externalUrl) {
  setInterval(() => {
    fetch(`${externalUrl}/health`).catch(() => {});
  }, 4 * 60 * 1000);
  console.log(`Self-ping enabled via ${externalUrl}/health`);
} else {
  console.log('RENDER_EXTERNAL_URL not set — set up an external uptime pinger (e.g. UptimeRobot) hitting /health to prevent free-tier spin-down.');
}

// ═════════════════════════════════════════════════════════════
// ── MAIN HANDLER  (was the Vercel default export, now a route)
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

    // ── TITLE — cheap internal housekeeping. Not a real user message:
    // no daily-quota hit, no NVIDIA global budget spent, no web search.
    if (action === 'title') {
  const titlePrompt = sanitizeString(req.body.prompt || '', 2000);
  if (!titlePrompt.trim()) return res.status(400).json({ error: 'Missing prompt' });
  // FIX: AbortController so the title call actually cancels on timeout
  // instead of leaking TPM budget via a hung groq fetch.
  const titleController = new AbortController();
  const titleTimer = setTimeout(() => titleController.abort(), 4000);
  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',   // ← use the ACTUAL non-reasoning fast model
      messages: [{ role: 'user', content: titlePrompt }],
      max_tokens: 30,                   // ← a little headroom, cheap either way
      temperature: 0.3,
    }, { signal: titleController.signal });
    const raw = result.choices?.[0]?.message?.content || '';
    const clean = stripInternalReasoning(raw).trim();   // <- strip <think> just in case
    return res.status(200).json({ title: clean });
  } catch (e) {
    console.error('TITLE ERROR:', e.message);
    return res.status(200).json({ title: '' });
  } finally {
    clearTimeout(titleTimer);
  }
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

    // FIX: create one AbortController per request that fires when the
    // browser closes the SSE connection. We forward this signal to
    // every upstream provider (Groq, NVIDIA, CF) so a closed tab
    // cancels the in-flight request instead of letting it burn TPM
    // and NVIDIA global budget on a response no one will read.
    const clientSignal = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        try { clientSignal.abort(); } catch (_) {}
      }
    });

    // ── ROUTE TO CODE-CHAT BEFORE the regular chat handler ──
    if (isCodeMode && action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const lastUserForSearch = history[history.length - 1]?.content || prompt.trim();
        let codeSearchContext = '';

        if (await aiNeedsSearch(groq, lastUserForSearch, { isCode: true, clientSignal: clientSignal.signal })) {
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

       const codeSysContent = (prompt.trim().slice(0, 12000)) + codeSearchContext +
    '\n\n---\nCODE MODE: Vertex streaming active. NVIDIA is primary; Groq/Cloudflare will be used as automatic fallback if NVIDIA is unavailable. Respond directly with the final answer only — do not include any internal reasoning, thinking, or step-by-step deliberation before your response.' +
    (codeSearchContext
    ? '\n\nLIVE SEARCH RESULTS WERE PROVIDED ABOVE. STRICT RULE: only state a specific fact (a model name, version number, endpoint, pricing, availability) as CONFIRMED if it is literally present in the search snippets above. If a specific name/version/detail is NOT in the snippets, either omit it entirely or explicitly say "not confirmed by search — may be inaccurate." NEVER invent a source (a forum post, a username, a repo) to make an unconfirmed claim sound more credible — that is worse than just saying you\'re unsure. When multiple models are close in name, do not blend/invent hybrid version numbers (e.g. do not write "GLM 5.1/5.2" unless that exact string appears in a snippet).'
    : '\n\nNo live search results were retrieved for this specific message. Never claim you lack real-time or internet access — Vertex has live web search built in via the backend, it simply wasn\'t triggered or didn\'t return results for this particular question. Just answer from your best knowledge, and only flag it as possibly outdated if the topic is genuinely version/date-sensitive.');
        const codeMessages = [{ role: 'system', content: codeSysContent }];
        codeMessages.push(...sanitizeHistory(history, 12));
        if (!codeMessages.length || codeMessages[codeMessages.length - 1].role !== 'user') {
          codeMessages.push({ role: 'user', content: prompt.trim() });
        }

        // FIX: NVIDIA is now primary, but if it fails entirely we fall
        // back to Groq (gpt-oss-20b/120b) then Cloudflare, instead of
        // leaving the user with "Vertex is temporarily unavailable".
        // This was the root cause of "Code-chat stream: all NVIDIA
        // attempts failed" being the last word in the user's chat.
        //
        // SMART ROUTING: pick the model chain based on the user's actual
        // message content. Real coding tasks (code fence, "debug",
        // "implement", etc.) → nano first (fast), llama-70b fallback.
        // Trivial greetings → nano. Routing still matters because it
        // affects which Groq model we fall back to if NVIDIA fails:
        // when it's actually needed and makes everything else fast.
        const lastUserContent = codeMessages[codeMessages.length - 1]?.content || prompt.trim();
        const chainName = pickCodeChatChain(lastUserContent);
        console.log(`Code-chat: routing "${lastUserContent.slice(0, 50)}..." → chain=${chainName}`);
        let ok = await streamNvidiaGLMOnly(codeMessages, res, 8000, clientSignal.signal, chainName);
        if (!ok && !clientSignal.signal.aborted && !res.writableEnded) {
          console.warn('Code-chat: NVIDIA failed — falling back to Groq+CF chain');
          const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
          const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
          if (CF_TOKEN && CF_ACCOUNT) {
            ok = await streamCodeChatFallback(groq, codeMessages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal: clientSignal.signal });
          }
        }
        if (!ok && !clientSignal.signal.aborted && !res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ content: 'Vertex is temporarily unavailable — please try again in a moment.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (_) {}
        }
      } catch (err) {
        console.error('CODE CHAT ERROR:', err.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Code chat request failed' });
        if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
      }
      return;
    }

    const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
    const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!CF_TOKEN || !CF_ACCOUNT) return res.status(500).json({ error: 'Server configuration error' });

    // ╔══════════════════════════════════════╗
    // ║  TTS                                 ║
    // ╚══════════════════════════════════════╗
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

    // ╔══════════════════════════════════════╗
    // ║  CHAT  — true token streaming        ║
    // ╚══════════════════════════════════════╝
    if (action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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

          const voiceSystemContent = voiceIdentity + '\n\n' + prompt.trim().slice(0, 2000);

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
            const stream = await groq.chat.completions.create({
              model:      GROQ_CHAT_PRIMARY,
              messages:   [
                { role: 'system', content: prompt.trim().slice(0, 2000) },
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
              console.log('Voice → Groq ✅ (fallback 1)');
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            console.warn('Groq voice returned empty — trying CF');
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
                      { role: 'system', content: prompt.trim().slice(0, 2000) },
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

// Ask the AI ONCE whether this message needs live search —
// then reuse that single answer in both branches below,
// instead of firing two separate classifier calls for the same question.
const shouldSearch = await aiNeedsSearch(groq, lastUserMsg, { isCode: false });

const [searchContext, userLocation] = await Promise.all([
  (async () => {
    if (!shouldSearch) return '';
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
  })(),

  (async () => {
    if (!shouldSearch) return ''; // reuses the same decision, no second AI call
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
        // Trimmed from 10000 → 6000 chars: cuts token cost per request without losing
        // meaningful system-prompt content, which directly reduces how fast we hit the Groq TPM cap.
        const tableGuard = looksLikeTableRequest(lastUserMsg) ? `
TABLE FORMATTING — CRITICAL: When outputting a markdown table, put a blank line before the table starts, put each row on its own separate line (never join rows with "| |"), and put the header separator row (|---|---|) on its own line too. Never compress a table into one paragraph.\n\n` : '';

        const sysContent = identityOverride + imageGuard + tableGuard + prompt.trim().slice(0, 6000) + locationNote + searchContext;

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
      }
      return;
    }

    // ╔══════════════════════════════════════╗
    // ║  MEMORY  — extract facts, decide op  ║
    // ╚══════════════════════════════════════╝
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

    // ╔══════════════════════════════════════╗
    // ║  SEARCH                              ║
    // ╚══════════════════════════════════════╝
    if (action === 'search') {
      const searchQuery = (query || prompt).trim();
      if (!searchQuery)             return res.status(400).json({ error: 'Missing search query' });
      if (searchQuery.length > 300) return res.status(400).json({ error: 'Query too long' });

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
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 250)}\nSource: ${r.source}`
        ).join('\n\n');
        const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
          const result = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                {
                  role:    'system',
                  content: `Today is ${todayStr}. Summarize these search results.\nRULES:\n- Use ONLY the results below.\n- Be specific: names, scores, dates, numbers.\n- 3-5 sentences. Direct and factual.\n- If results show a sports result, state it clearly.\n- Do NOT say "as of my knowledge".\n\nSEARCH RESULTS:\n${contextSnippets}`,
                },
                { role: 'user', content: `Summarize in 3-5 sentences.` },
              ],
              max_tokens:  500,
              temperature: 0.2,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 8000)),
          ]);
          const rawT = result.choices?.[0]?.message?.content || null;
          const t    = rawT ? stripInternalReasoning(rawT) : null;
          if (t && t.trim().length > 10) aiSummary = t.trim();
        } catch (e) { console.error('AI summary failed:', e.message); }
      }

      if (allResults.length === 0) {
        try {
          const fallback = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                { role: 'system', content: `Today is ${new Date().toDateString()}. Answer factually in 2-3 sentences.` },
                { role: 'user',   content: searchQuery },
              ],
              max_tokens: 400,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          const rawAnswer = fallback.choices?.[0]?.message?.content || null;
          const answer    = rawAnswer ? stripInternalReasoning(rawAnswer) : null;
          if (answer) {
            allResults.push({ title: searchQuery, snippet: answer, link: '#', source: 'Vortis', date: new Date().toISOString().split('T')[0] });
            aiSummary = answer;
          }
        } catch (e) { console.error('Knowledge fallback failed:', e.message); }
      }

      return res.json({ success: allResults.length > 0, results: allResults.slice(0, 10), aiSummary: aiSummary || null });
    }

    // ╔══════════════════════════════════════╗
    // ║  VISION                              ║
    // ╚══════════════════════════════════════╝
    if (action === 'vision') {
      if (!image)                     return res.status(400).json({ error: 'Missing image data' });
      if (!isValidBase64Image(image)) return res.status(400).json({ error: 'Invalid image format' });
      if (isImageTooLarge(image))     return res.status(400).json({ error: 'Image too large (max 5MB)' });

      const base64Data = image.startsWith('data:') ? image.split(',')[1] : image;

      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                  { type: 'text', text: sanitizeString(prompt || 'Describe this image in detail.', 500) },
                ],
              }],
              max_tokens: 2048,
            }),
          }
        );
        if (cfRes.ok) {
          const data = await cfRes.json();
          const description = data.result?.response || data.result?.description || null;
          if (description && description.trim().length > 2) return res.status(200).json({ success: true, description });
        }
      } catch (e) {
        console.log('Cloudflare vision failed:', e.message);
      }

      try {
        const nvKey = process.env.NVIDIA_API_KEY;
        if (nvKey) {
          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/chat/completions`,
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${nvKey}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                model: NVIDIA_VISION_MODEL,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: sanitizeString(prompt || 'Describe this image in detail.', 500) },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                  ],
                }],
                max_tokens: 2048,
                temperature: 0.5,
              }),
            },
            20000
          );
          if (nvRes.ok) {
            const data = await nvRes.json();
            const rawDesc = data?.choices?.[0]?.message?.content ?? null;
            if (typeof rawDesc === 'string') {
              const description = stripInternalReasoning(rawDesc);
              if (description && description.trim().length > 2) {
                return res.status(200).json({ success: true, description });
              }
            }
          } else {
            console.log(`NVIDIA vision HTTP ${nvRes.status}`);
          }
        }
      } catch (e) {
        console.log('NVIDIA vision failed:', e.message);
      }

      try {
        const bytes = Array.from(Buffer.from(base64Data, 'base64'));
        const llavaRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ prompt: sanitizeString(prompt || 'Describe this image in detail.', 500), image: bytes }),
          }
        );
        if (!llavaRes.ok) return res.status(200).json({ success: false, description: 'Could not analyze image — please try again.' });
        const d = await llavaRes.json();
        const fallbackDesc = d.result?.description || d.result?.response || null;
        return res.status(200).json({ success: true, description: fallbackDesc?.trim().length > 2 ? fallbackDesc : 'Could not analyze image.' });
      } catch (error) {
        console.error('VISION ERROR:', error.message);
        return res.status(200).json({ success: false, description: 'Vision service unavailable.' });
      }
    }

    // ╔══════════════════════════════════════╗
    // ║  TRANSCRIBE (Voice call STT)         ║
    // ╚══════════════════════════════════════╝
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

    // ╔══════════════════════════════════════╗
    // ║  IMAGE GENERATION                    ║
    // ╚══════════════════════════════════════╝
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
          if (!imgRes.ok) return null;

          const contentType = imgRes.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await imgRes.json();
            return json?.imageUrl ? json : null;
          }

          const responseText = await imgRes.text();
          try {
            return JSON.parse(responseText);
          } catch {
            return { success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(responseText, 'binary').toString('base64')}` };
          }
        } catch (e) {
          console.error('Flux worker failed:', e.message);
          return null;
        }
      }

      async function tryNvidiaSD35(promptText) {
        try {
          const nvKey = process.env.NVIDIA_API_KEY;
          if (!nvKey) return null;

          const model = 'stabilityai/stable-diffusion-3.5-large';

          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/images/generations`,
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${nvKey}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                model,
                prompt:          promptText.trim(),
                n:               1,
                response_format: 'b64_json',
              }),
            },
            30000
          );

          if (!nvRes.ok) {
            console.log('NVIDIA SD 3.5 gen HTTP', nvRes.status);
            return null;
          }

          const data = await nvRes.json();
          const b64  = data?.data?.[0]?.b64_json;
          if (!b64 || b64.length < 100) {
            console.log('NVIDIA SD 3.5 gen returned empty payload');
            return null;
          }

          console.log('NVIDIA SD 3.5 image generation received ✅');
          return { success: true, imageUrl: `data:image/png;base64,${b64}` };
        } catch (e) {
          console.error('NVIDIA SD 3.5 gen failed:', e.message);
          return null;
        }
      }

      async function tryNvidiaLlama(promptText) {
        try {
          const nvKey = process.env.NVIDIA_API_KEY;
          if (!nvKey) return null;

          const model = 'meta/llama-3-diffusion-xl';

          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/images/generations`,
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${nvKey}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                model,
                prompt:          promptText.trim(),
                n:               1,
                response_format: 'b64_json',
              }),
            },
            30000
          );

          if (!nvRes.ok) {
            console.log('NVIDIA Llama-3 gen HTTP', nvRes.status);
            return null;
          }

          const data = await nvRes.json();
          const b64  = data?.data?.[0]?.b64_json;
          if (!b64 || b64.length < 100) {
            console.log('NVIDIA Llama-3 gen returned empty payload');
            return null;
          }

          console.log('NVIDIA Llama-3 image generation received ✅');
          return { success: true, imageUrl: `data:image/png;base64,${b64}` };
        } catch (e) {
          console.error('NVIDIA Llama-3 gen failed:', e.message);
          return null;
        }
      }

      try {
        console.log('Routing prompt to Cloudflare Flux worker as Primary...');

        const fluxResult = await tryFlux(prompt);
        if (fluxResult?.imageUrl) {
          return res.status(200).json({ ...fluxResult, provider: 'flux', usage, limits: LIMITS[tier] });
        }

        console.log('Cloudflare failed, shifting to NVIDIA SD 3.5...');
        const sd35Fallback = await tryNvidiaSD35(prompt);
        if (sd35Fallback?.imageUrl) {
          return res.status(200).json({ ...sd35Fallback, provider: 'nvidia-sd-3.5-large', usage, limits: LIMITS[tier] });
        }

        console.log('NVIDIA SD 3.5 failed, shifting to NVIDIA Llama-3...');
        const llamaFallback = await tryNvidiaLlama(prompt);
        if (llamaFallback?.imageUrl) {
          return res.status(200).json({ ...llamaFallback, provider: 'nvidia-llama-3', usage, limits: LIMITS[tier] });
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