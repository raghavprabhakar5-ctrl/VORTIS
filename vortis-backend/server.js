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
const GROQ_REASONING_NONE_MODELS = new Set(['qwen/qwen3.6-27b']);
const GROQ_REASONING_LOW_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);

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
  // Try each key in round-robin order; skip ones marked dead.
  for (let i = 0; i < GROQ_API_KEYS.length; i++) {
    const idx = (groqKeyIndex + i) % GROQ_API_KEYS.length;
    const key = GROQ_API_KEYS[idx];
    const deadUntil = groqKeyDeadUntil.get(key) || 0;
    if (now >= deadUntil) {
      groqKeyIndex = (idx + 1) % GROQ_API_KEYS.length;
      return key;
    }
  }
  // All keys are dead — return the soonest-reviving one anyway, the caller
  // will handle the 429. Better than crashing.
  return GROQ_API_KEYS[groqKeyIndex];
}

function markGroqKeyTpdExhausted(key, retryAfterMs) {
  if (!key) return;
  // Cap the dead-time at 24h to avoid permanent block on edge cases.
  const wait = Math.min(retryAfterMs || (24 * 60 * 60 * 1000), 24 * 60 * 60 * 1000);
  groqKeyDeadUntil.set(key, Date.now() + wait);
  console.warn(`Groq key ${key.slice(0, 10)}... marked TPD-exhausted for ${Math.round(wait / 1000 / 60)}min — ${GROQ_API_KEYS.length - 1} key(s) still active`);
}

// Factory: returns a fresh Groq client bound to a specific key.
// Called per-request so we can rotate keys between requests.
function makeGroqClient(key) {
  if (!key) return null;
  return new Groq({ apiKey: key });
}

const NVIDIA_BASE_URL     = 'https://integrate.api.nvidia.com/v1';
// ── NVIDIA NIM MODEL LINEUP (FIX 2026-09-06, v2) ─────────────────────
// v2 CHANGES:
//   1. CODING MODEL (heavy): z-ai/glm-5.2 → 'moonshotai/kimi-k3'
//      - GLM-5.2 IS DEAD: NVIDIA end-of-life'd it on 2026-08-21. Every call
//        now returns HTTP 410 Gone ("The model 'z-ai/glm-5.2' has reached
//        its end of life"), which is why the boot warmup kept failing
//        ("not ready after 0ms" = short-circuited by the invalid registry)
//        and heavy code requests fell through to deepseek (cold, 40s+
//        timeouts) and then lightning (a small 30B-A3B model that writes
//        short/truncated files). Confirmed live 2026-09-06 via
//        GET /v1/models/z-ai/glm-5.2 → 410 Gone.
//      - REPLACEMENT: moonshotai/kimi-k3 — Moonshot's flagship coding/
//        agentic model. Verified: listed in this key's /v1/models catalog,
//        resolves on /v1/models/moonshotai/kimi-k3, and supports
//        max_tokens 1-65536 (docs.api.nvidia.com/nim/reference/
//        moonshotai-kimi-k3-infer) — the largest output budget in the
//        catalog, whole projects in ONE pass.
//      - No other z-ai/* model exists on NIM (glm-5.2-flash / glm-5 /
//        glm-4.7 etc. all 404 — probed live 2026-09-06).
//   2. QUALITY MODEL: deepseek-ai/deepseek-v4-pro-0813 (unchanged).
//      NOTE: deepseek-v4-pro cold-starts slowly on NIM (40s+ after idle)
//        — that's the "This operation was aborted" warmup noise. It is NOT
//        broken: the keep-alive warms it within a couple of cycles, it is
//        always retried once per heavy request even when marked invalid,
//        and kimi-k3 now sits in front of it as the primary coding model.
//   3. FAST MODEL: unchanged (nemotron-3.5-lightning-30b-a3b) — now the
//      LAST resort in the heavy chain instead of the de-facto coding model.
//
// ALL-VERIFIED (2026-09-06, live ping via /debug/nvidia-models on the
// deployed Render service + integrate.api.nvidia.com + docs.api.nvidia.com
// per-model reference):
//   moonshotai/kimi-k3                      → in catalog, max_tokens ≤ 65536
//   deepseek-ai/deepseek-v4-pro-0813        → in catalog, max_tokens ≤ 16384
//   nvidia/nemotron-3.5-lightning-30b-a3b   → in catalog, max_tokens ≤ 32768 (HTTP 200, ~350ms warm)
//   nvidia/nemotron-3-nano-omni-30b-a3b-... → in catalog, HTTP 200 (vision)
//   meta/llama-3.2-11b-vision-instruct      → in catalog, HTTP 200 (vision)
//   z-ai/glm-5.2                            → HTTP 410 GONE (EOL 2026-08-21) — removed
const NVIDIA_CHAT_FAST    = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const NVIDIA_CHAT_QUALITY = 'deepseek-ai/deepseek-v4-pro-0813';
const NVIDIA_CHAT_CODE    = 'moonshotai/kimi-k3';

// ── PER-MODEL max_tokens CAPS (FIX 2026-09-06, v2) ───────────────────
// The code-chat path deliberately requests max_tokens=65536 — the LARGEST
// budget any model in the chain accepts, per the user's "don't add any
// text limit like token limit" instruction (NIM rate limits are
// request-based, not output-token-based, so requesting the max costs
// nothing — the model stops when it's done). But deepseek-ai models on
// NIM HARD-CAP max_tokens at 16384 — sending more returns HTTP 400
// "max_tokens must be between 1 and 16384", which burns a failure strike
// and silently pushes the request to the fallback models. So every NVIDIA
// call clamps through nvidiaMaxTokensFor(): each model gets its OWN
// maximum — kimi-k3 65536, lightning 32768, deepseek 16384.
const NVIDIA_MODEL_MAX_TOKENS = {
  'moonshotai/kimi-k3':                    65536,
  'moonshotai/kimi-k2.6':                  16384,
  'z-ai/glm-5.2':                          32768, // EOL on NIM — kept only so a stray reference clamps safely
  'deepseek-ai/deepseek-v4-pro-0813':      16384,
  'deepseek-ai/deepseek-v4-flash-0731':    16384,
  'nvidia/nemotron-3.5-lightning-30b-a3b': 32768,
  'nvidia/nemotron-3-super-120b-a12b':     32768,
  _default: 16384,
};

function nvidiaMaxTokensFor(model, requested) {
  const cap = NVIDIA_MODEL_MAX_TOKENS[model] ?? NVIDIA_MODEL_MAX_TOKENS._default;
  return Math.max(1, Math.min(requested ?? cap, cap));
}

// ── VISION MODELS ──
// Raced in parallel — first valid response wins. CF is worst-case fallback.
const NVIDIA_VISION_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

// NVIDIA NIM — vision chain models
// FIX (2026-08-26): pruned dead / slow models based on production logs.
//   - 'meta/muse-glimmer-30b'              → always aborted in the parallel
//                                           race (cold-start > 20s, never
//                                           produced output within the
//                                           timeout).
//   - 'nvidia/nemotron-nano-12b-v2-vl'     → HTTP 410 — NVIDIA marked this
//                                           model end-of-life on
//                                           2026-08-26T09:00:00Z. Keeping
//                                           it in the chain burned a
//                                           network round-trip on every
//                                           vision request and produced
//                                           a noisy log line every time.
//   - 'meta/llama-3.2-90b-vision-instruct' → consistently aborted in the
//                                           parallel race (90B MoE cold-
//                                           start >> 20s timeout).
//
// Only the two models that actually win the race in real traffic are kept.
// The race still happens — if NVIDIA revives a pruned ID later we can add
// it back to this array.
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

  // Fixed order: heavy → quality → fast — ALWAYS, regardless of warm state.
  // Lightning writes noticeably worse code than ultra/step-3.7-flash, so we
  // do not let a "warm but weak" model jump ahead of a "cold but strong" one
  // just to save latency. A cold-start wait (up to 50s, see
  // firstByteTimeoutFor) is the correct tradeoff for a heavy/code-generation
  // request — fast-but-bad code is worse than a slower wait for good code.
  // CRITICAL: the quality model (stepfun) MUST ALWAYS be in the heavy chain
  // between heavy (ultra-550b) and fast (lightning-30b), even when it has been
  // marked permanently invalid by a previous 404/401/410. Reasons:
  //
  //   1. NVIDIA occasionally rotates model IDs on the NIM endpoint — a model
  //      that returned 404 yesterday may come back tomorrow. Always giving
  //      stepfun one shot per heavy request costs at most a single failed
  //      HTTP round-trip (~300ms) and recovers automatically if NVIDIA
  //      revives the endpoint. Without this, every heavy request skips
  //      stepfun and falls straight from ultra-550b to lightning-30b, which
  //      the user explicitly called out as a regression ("before 3.5
  //      lightning it should fall to quality model which is stepfun").
  //
  //   2. The keep-alive stops pinging permanently-invalid models (correct —
  //      we don't want to keep spamming a known-bad ID). But the chain still
  //      tries them at request time, which is the only way to detect that
  //      NVIDIA has brought the model back without a server restart.
  //
  //   3. Order is preserved: heavy -> quality -> fast, ALWAYS, regardless
  //      of warm state. Lightning writes noticeably worse code than ultra
  //      or step-3.7-flash, so we never let a "warm but weak" model jump
  //      ahead of a "cold but strong" one just to save latency.
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
//
// FIX (2026-08-26): vision-described image uploads and image-generation
// requests are short-circuited BEFORE the heavy chain. Both were getting
// routed to ultra-550b (a non-vision reasoning model), which then either
// ignored the image description and wrote irrelevant code, or tried to
// write HTML/CSS that 'draws' the requested image. Neither was what the
// user wanted. See isVisionDescribedImageMessage / isImageGenerationRequest
// below for the full rationale.
function pickCodeChatChain(text) {
  if (isImageGenerationRequest(text))   return 'trivial'; // short-circuit
  if (isVisionDescribedImageMessage(text)) return 'trivial'; // image uploads → fast
  if (isActualCodingTask(text))   return 'heavy';    // CHECK FIRST
  if (isTrivialCodeMessage(text)) return 'trivial';
  return 'standard';
}

// ── VISION-DESCRIBED IMAGE DETECTION ────────────────────────────
// The frontend (vertex App.js, around line 4290) wraps every uploaded image
// with this marker before sending it to the backend:
//
//     [Image: friend.png — Image description:]
//     The image shows two friends smiling outdoors...
//     <!--vrtx-img-end-->
//     <user's actual typed prompt, e.g. "check this my image with my friend">
//
// Two problems with the previous routing:
//   1. isActualCodingTask() returned TRUE for these messages because the
//      description text is >200 chars and frequently contains words like
//      'code', 'function', 'app', 'image' (if there's a code screenshot
//      in the image) — triggering the heavy chain.
//   2. The heavy chain runs ultra-550b, which is a NON-VISION reasoning
//      model. Ultra can't see the image — it only sees the description
//      text — and because its training is code-heavy AND the system
//      prompt says "you are a coding assistant", ultra would often
//      start WRITING CODE about the described image instead of just
//      commenting on it conversationally. The user uploaded a photo of
//      a friend and got back a Python script.
//
// Fix: detect the marker and route to the trivial chain (lightning-30b).
// Lightning is fast (~2s warm), non-reasoning, and conversational — exactly
// what you want for 'look at this image, what do you think?'. If the user
// actually wants code from the image (e.g. 'rebuild this UI from the
// screenshot'), they'll include a coding verb in their typed prompt —
// which is preserved AFTER the <!--vrtx-img-end--> marker, so
// containsCodingVerb() still fires and overrides this back to heavy.
function isVisionDescribedImageMessage(text) {
  if (!text || typeof text !== 'string') return false;
  // The sentinel-delimited block is the canonical marker.
  if (/\[Image:[^\]]*—\s*(Image description|OCR extracted text):\]/.test(text)) return true;
  if (/\[Attached image:[^\]]*\]/.test(text)) return true;
  // Fallback for older frontends that don't emit the sentinel — if the
  // text starts with [Image: ... — ...] and the user's actual typed
  // prompt is very short, treat it as a vision-described image.
  if (/^\s*\[Image:[^\]]*—/m.test(text)) return true;
  return false;
}

// ── IMAGE GENERATION REQUEST DETECTION ──────────────────────────
// When the user types 'generate me an image of a sunset' inside code-chat,
// the old routing:
//   1. matched 'generate' as a coding verb (CODING_VERBS_EXACT)
//   2. escalated to the heavy chain
//   3. ultra-550b happily wrote HTML/CSS that 'draws' a sunset, or worse,
//      Python code that calls an image-generation API
//
// The user wanted an actual image — which Vertex CAN'T produce. Vortis
// (the main chat) has the image generator (FLUX + Pollinations). The
// correct response is to TELL the user to switch, not write fake code.
//
// We detect the request server-side so the redirect is consistent
// regardless of which model would have been picked. Returns true for:
//   'generate me an image', 'draw a picture', 'create an image of',
//   'make me a picture of', 'render an image', 'paint a scene', etc.
// Also catches the typo-prone variants ('genrate', 'cretae').
function isImageGenerationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const low = text.toLowerCase();

  // Strong signal: explicit 'image'/'picture'/'photo' noun + generation verb
  const hasGenVerb = /\b(generate|genrate|generat|draw|paint|create|cretae|creat|make|render|produce|design|sketch|illustrate)\b/i.test(low);
  const hasImageNoun = /\b(image|images|picture|pictures|photo|photos|artwork|art|drawing|painting|illustration|wallpaper|logo|icon)\b/i.test(low);
  if (!hasGenVerb || !hasImageNoun) return false;

  // Disambiguate 'make me a game' (coding) from 'make me an image of a game' (image gen):
  // If the noun is 'image/picture/photo/art/illustration/etc.' we treat as image gen;
  // 'make a game', 'build a website' have different nouns and are NOT image gen.
  // We already required hasImageNoun, so we just need to make sure the user isn't
  // asking the model to 'edit code' or 'debug an image-processing function' —
  // those are real coding tasks that happen to mention 'image'.
  const looksLikeCodingTask = /\b(debug|refactor|optimi[sz]e|fix|code|function|class|component|api|endpoint|bug|error|stack trace|unit test|compile)\b/i.test(low);
  if (looksLikeCodingTask) {
    // Edge case: 'write a function that generates an image' IS a coding task.
    // Only treat as image-gen if the gen verb is the MAIN action AND there's
    // no 'function/code/class' word nearby. The cheap heuristic: if the user
    // wrote 'generate an image of X' early in the message and didn't mention
    // code/functions, it's image gen.
    const firstChars = low.slice(0, 150);
    const isPureImageRequest = !/\b(function|code|class|script|method|api|component|endpoint|bug|error|compile|debug)\b/.test(firstChars);
    if (!isPureImageRequest) return false;
  }

  return true;
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

// Per-model "warm" latency thresholds. A model is considered warm if its
// last ping completed under this threshold. These MUST match the model's
// actual warm response time — otherwise isNvidiaModelWarm() always returns
// false and pickHeavyChain can't make good routing decisions.
//
// Real warm response times (from user's logs):
//   - lightning-30b: 2-12s when warm (threshold 15s)
//   - ultra-550b MoE: 5-25s when warm (threshold 30s) — this is a 550B MoE,
//                     it's never going to respond in 6s even when warm.
//                     The old 6000ms threshold meant ultra was NEVER marked
//                     warm, which broke pickHeavyChain's warm-state logic.
//   - step-3.7-flash: 700ms-3s when warm (threshold 5s)
// Per-model "warm" latency thresholds. A model is considered warm if its
// last ping completed under this threshold. These MUST match the model's
// actual warm response time — otherwise isNvidiaModelWarm() always returns
// false and pickHeavyChain can't make good routing decisions.
//
// UPDATED 2026-09-06 for the new lineup:
//   - GLM-5.2 (heavy): large flagship — give it 20s warm headroom.
//   - deepseek-v4-pro (quality): 18s.
//   - lightning-30b (fast): 12s.
const NVIDIA_WARM_LATENCY_THRESHOLD_MS = {
  [NVIDIA_CODE_MODEL_HEAVY]: 20000,
  [NVIDIA_CHAT_MODEL_QUALITY]: 18000,
  [NVIDIA_CODE_MODEL_FAST]: 12000,
  _default: 10000,
};
const NVIDIA_WARM_TTL_MS = 90 * 1000;
const nvidiaWarmState = new Map();

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

// INVALID REGISTRY — for HTTP 404 / 401 / 410.
//
// These status codes used to mean "this model ID will NEVER work" and the
// model was blacklisted FOREVER (until server restart). That was too harsh:
//
//   1. NVIDIA gates some models (e.g. nemotron-3-ultra-550b-a55b) behind
//      higher API-key tiers and returns 404 — NOT 403 — when the calling
//      key lacks access. If the user later upgrades their NVIDIA developer
//      tier, the model becomes accessible but our server would never know
//      without a restart.
//
//   2. NVIDIA occasionally rotates model endpoints. A 410 today may become
//      a 200 next week.
//
// FIX: replace the forever-Set with a TTL Map. A model marked invalid is
// skipped for NVIDIA_INVALID_TTL_MS (30 min), then auto-retried on the
// next keep-alive ping or request. If it 404s again, the TTL resets.
//
// Side benefit: the recurring "keep-alive: HTTP 404" spam is gone — we
// only retry once per 30 min instead of every 70s.
const NVIDIA_INVALID_TTL_MS = 30 * 60 * 1000; // 30 minutes
// 410 Gone = NVIDIA formally end-of-life'd the model (e.g. z-ai/glm-5.2,
// EOL 2026-08-21). Unlike a 404 (often just a key-tier/entitlement issue
// that can resolve after an account upgrade), a 410 is definitive, so it
// gets a 24h TTL — retrying it every 30 minutes just burns a request and
// a log line for a model that will never come back.
const NVIDIA_INVALID_EOL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const nvidiaEolModels = new Map(); // model -> { expiresAt, reason, since }

function markNvidiaModelInvalid(model, reason) {
  const prev = nvidiaEolModels.get(model);
  // 410 (end-of-life) gets the 24h TTL; 404/401 keep the 30-min TTL so a
  // key-scope/entitlement fix is picked up quickly.
  const ttl = /410/.test(String(reason)) ? NVIDIA_INVALID_EOL_TTL_MS : NVIDIA_INVALID_TTL_MS;
  // Always reset the TTL on a fresh failure — even if there was a previous
  // entry. This prevents a model from being un-blacklisted mid-cooldown
  // by an old expiry timestamp.
  nvidiaEolModels.set(model, {
    expiresAt: Date.now() + ttl,
    reason,
    since: Date.now(),
  });
  if (!prev) {
    console.error(`NVIDIA model ${model} marked INVALID for ${Math.round(ttl / 60000)}min — ${reason}. Will auto-retry after TTL expires.`);
  }
}

function isNvidiaModelInvalid(model) {
  const entry = nvidiaEolModels.get(model);
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt) {
    // TTL expired — allow retry. If the model is still 404'ing, the next
    // call will re-mark it via markNvidiaModelInvalid and reset the TTL.
    nvidiaEolModels.delete(model);
    console.log(`NVIDIA model ${model} invalid TTL expired — will retry on next request`);
    return false;
  }
  return true;
}

// Returns the seconds-until-expiry for debug logging. -1 if not invalid.
function nvidiaModelInvalidRemainingSec(model) {
  const entry = nvidiaEolModels.get(model);
  if (!entry) return -1;
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}

function isNvidiaModelBlocked(model) {
  // Invalid (404/401/410) — blocked until TTL expires, then auto-retried.
  // Use isNvidiaModelInvalid() (not .has()) so the TTL expiry check runs.
  if (isNvidiaModelInvalid(model)) return true;
  // Transient failure cooldown (502/503/504/empty response).
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
  // Permanent-invalid models don't need their counter incremented.
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
// Updated for the reverted model lineup. TPM (tokens-per-minute) caps
// are Groq's free-tier per-minute limits; TPD (tokens-per-day) is
// enforced by the multi-key rotation logic above (markGroqKeyTpdExhausted).
const GROQ_TPM_CAPS = {
  'qwen/qwen3.6-27b':         process.env.GROQ_TPM_QWEN ? Number(process.env.GROQ_TPM_QWEN) : 7000,
  'openai/gpt-oss-20b':       process.env.GROQ_TPM_20B  ? Number(process.env.GROQ_TPM_20B)  : 7000,
  'openai/gpt-oss-120b':      process.env.GROQ_TPM_120B ? Number(process.env.GROQ_TPM_120B) : 4000,
  _default: 6000,
};

function groqTpmCapFor(model) {
  return GROQ_TPM_CAPS[model] ?? GROQ_TPM_CAPS._default;
}
const GROQ_OTPM_CAPS = {
  'qwen/qwen3.6-27b':    process.env.GROQ_OTPM_QWEN ? Number(process.env.GROQ_OTPM_QWEN) : 900,
  'openai/gpt-oss-20b':  process.env.GROQ_OTPM_20B  ? Number(process.env.GROQ_OTPM_20B)  : 4000,
  'openai/gpt-oss-120b': process.env.GROQ_OTPM_120B ? Number(process.env.GROQ_OTPM_120B) : 5000,
  _default: 4000,
};

function groqOtpmCapFor(model) {
  return GROQ_OTPM_CAPS[model] ?? GROQ_OTPM_CAPS._default;
}
const groqOtpmTracker = new Map();

function groqOtpmUsed(model) {
  const now = Date.now();
  const entries = (groqOtpmTracker.get(model) || []).filter(e => now - e.time < 60000);
  groqOtpmTracker.set(model, entries);
  return entries.reduce((sum, e) => sum + e.tokens, 0);
}

function groqOtpmRemaining(model) {
  return Math.max(0, groqOtpmCapFor(model) - groqOtpmUsed(model));
}

function groqOtpmClamp(model, maxTokens) {
  return Math.max(0, Math.min(maxTokens, groqOtpmRemaining(model)));
}

function recordGroqOtpm(model, tokens) {
  if (!tokens || tokens <= 0) return;
  const entries = groqOtpmTracker.get(model) || [];
  entries.push({ tokens, time: Date.now() });
  groqOtpmTracker.set(model, entries);
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

function setGroqCooldown(model, retryAfterSec = 30, isRealRateLimit = false) {
  const capped = isRealRateLimit
    ? Math.min(retryAfterSec, 30)
    : Math.min(retryAfterSec, 5); // our own timeout ≠ Groq being down
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
  // Strip reasoning-model preambles that leak into the visible content
  // field (NOT the reasoning_content field, which is dropped separately).
  // Common patterns from gpt-oss / nemotron / qwen when they forget to
  // use the reasoning_content channel:
  //   "Here's a thinking process:\n1. **Analyze..."
  //   "Let me think about this step by step."
  //   "**Thinking:**\n..."
  //   "Step 1: ...\nStep 2: ..."
  // We strip the WHOLE preamble up to the first double-newline that's
  // followed by actual answer content. This is conservative — we only
  // fire when the message starts with one of the known preamble patterns.
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
  // Strip lines that look like leaked system-prompt echoes (the
  // "CODE MODE: Vertex streaming active..." regression). Even though
  // we removed that text from the system prompt in Fix 1, some models
  // may still echo fragments of instructions — catch them here too.
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

  // FIX: previous Promise.race + setTimeout didn't actually abort the
  // underlying Groq fetch — the request kept running and burning TPM
  // long after the race resolved. Now we pass an AbortSignal that
  // actually cancels the HTTP request on timeout.
  const controller = new AbortController();
  // SPEED FIX: was 2500ms - classifier returns a single word
  // ('medium' or 'hard'). 1500ms is plenty for gpt-oss-20b.
  // Saves up to 1s per request when the classifier is slow.
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
          // FIX 2026-09-06: clamp per-model — deepseek models reject >16384.
          max_tokens:  nvidiaMaxTokensFor(modelId, maxTokens),
          temperature: 0.7,
          stream:      false,
        }),
        signal: clientSignal,
      },
      timeoutMs
    );
    if (!res.ok) {
      console.log(`NVIDIA model ${modelId} HTTP ${res.status}`);
      // PERMANENT errors (404 / 401 / 410) — model ID is wrong, API key
      // has been revoked, or the model has been end-of-life'd on NVIDIA's
      // side. None of these will ever recover on retry — mark the model
      // invalid forever so the keep-alive stops pinging it (this was the
      // source of the recurring "NVIDIA keep-alive: ... HTTP 404" spam).
      if (res.status === 404 || res.status === 401 || res.status === 410) {
        markNvidiaModelInvalid(modelId, `HTTP ${res.status}`);
        return null;
      }
      // TRANSIENT errors (502/503/504) — model is up but unavailable right
      // now. Trip the circuit breaker instantly (2 strikes = threshold)
      // so we skip it for 2 minutes instead of wasting another attempt.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        recordNvidiaFailure(modelId);
        recordNvidiaFailure(modelId);
        console.warn(`NVIDIA model ${modelId} HTTP ${res.status} — instant circuit breaker trip — unavailable (2 min cooldown)`);
        return null;
      }
      // Other non-OK statuses (400/402/405/etc.) — single failure count.
      // Most of these are bad request bodies; the model is fine. But we
      // count one strike so a persistently-misbehaving model still gets
      // cooled down after two such errors.
      recordNvidiaFailure(modelId);
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
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, preferQuality = false, skipNvidia = false }) {
  // ── Per-request Groq key rotation ──
  // The `groq` arg passed in was built from a single hardcoded key. We
  // ignore it and pick a fresh key per request from the rotation pool
  // so multiple Groq accounts can be load-balanced.
  const currentKey = pickGroqKey();
  if (!currentKey) {
    console.error('streamAI: no Groq key available — skipping Groq entirely');
    // Skip to NVIDIA / CF fallback chain below.
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
  // Groq free-tier per-request TPM is 8000; 6000 max_tokens leaves
  // ~2000 for the prompt. Long responses continue via MAX_CONTINUATIONS.
  const maxTokens = isHard ? 6000 : (trivialTier ? 1024 : 2048);

  const modelChain = [GROQ_CHAT_PRIMARY, GROQ_CHAT_FALLBACK];

  console.log(`Routing: hard=${isHard} bufferMode=${bufferMode} trivial=${trivialTier} → primary: ${modelChain[0]} → maxTokens: ${maxTokens}`);

  const MAX_CONTINUATIONS = 3;

  for (const modelToTry of modelChain) {
    const promptTokens = estimateTokens(JSON.stringify(optimizedMessages));
    if (isGroqCoolingDown(modelToTry)) { console.log(`Skipping ${modelToTry} — cooling down`); continue; }

    let effectiveMaxTokens = groqOtpmClamp(modelToTry, maxTokens);
    if (effectiveMaxTokens < maxTokens) {
      console.log(`Routing: ${modelToTry} OTPM cap ${groqOtpmCapFor(modelToTry)} — clamping max_tokens ${maxTokens} → ${effectiveMaxTokens} (used=${groqOtpmUsed(modelToTry)})`);
    }
    if (effectiveMaxTokens < 200) {
      console.log(`Skipping ${modelToTry} — OTPM budget exhausted (used=${groqOtpmUsed(modelToTry)}, cap=${groqOtpmCapFor(modelToTry)})`);
      setGroqCooldown(modelToTry, 15, true);
      continue;
    }

    if (!groqTpmAvailable(modelToTry, promptTokens + effectiveMaxTokens)) {
      const cap = groqTpmCapFor(modelToTry);
      const remainingBudget = cap - promptTokens;
      if (remainingBudget >= 500) {
        effectiveMaxTokens = Math.min(remainingBudget, effectiveMaxTokens);
        console.log(`Routing: ${modelToTry} TPM tight — reducing max_tokens to ${effectiveMaxTokens} (prompt=${promptTokens}, cap=${cap})`);
      } else {
        console.log(`Skipping ${modelToTry} — TPM budget exhausted (prompt=${promptTokens}, cap=${cap}, remaining=${remainingBudget})`);
        continue;
      }
    }
    if (clientSignal?.aborted) { console.log('Client disconnected before model call'); return false; }

    const reasoningEffort = GROQ_REASONING_NONE_MODELS.has(modelToTry) ? 'none'
      : GROQ_REASONING_LOW_MODELS.has(modelToTry) ? 'low'
      : null;

    try {
      let convoMessages = [...optimizedMessages];
      let fullBuffer = '';
      let continuations = 0;
      let streamedAnything = false;

      while (true) {
        const otpmBudget = groqOtpmClamp(modelToTry, effectiveMaxTokens);
        if (otpmBudget < 150) {
          if (streamedAnything) {
            console.log(`Model ${modelToTry} hit OTPM window mid-continuation — ending with partial content`);
            if (bufferMode) {
              const repaired = repairGluedTableRows(stripInternalReasoning(fullBuffer));
              res.write(`data: ${JSON.stringify({ content: repaired })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();
            return true;
          }
          console.log(`Model ${modelToTry} OTPM exhausted before any content — trying fallback`);
          break;
        }
        const requestParams = {
          model: modelToTry,
          messages: convoMessages,
          max_tokens: otpmBudget,
          temperature: 0.7,
          stream: true,
        };
        // Only add reasoning_effort if the model supports it. Otherwise
        // Groq returns HTTP 400 "unsupported parameter".
        if (reasoningEffort !== null) {
          requestParams.reasoning_effort = reasoningEffort;
        }
        const stream = await groqClient.chat.completions.create(requestParams, { signal: clientSignal });
        recordGroqTpm(modelToTry, promptTokens);

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
        // If the error mentions "tokens per day" (TPD exhausted, not just
        // a transient 429), mark THIS key as dead so future requests
        // rotate to the next one.
        if (/tokens per day|TPD/i.test(eg?.message || '')) {
          markGroqKeyTpdExhausted(currentKey, waitSec * 1000);
        }
    }
          groqStreamError = eg;
        } finally {
          if (groqIdleTimer) clearTimeout(groqIdleTimer);
          if (buffer) {
            recordGroqTpm(modelToTry, estimateTokens(buffer));
            recordGroqOtpm(modelToTry, estimateTokens(buffer));
          }
        }

        if (groqStreamError) {
          if (streamedAnything && !bufferMode) {
            console.warn(`Model ${modelToTry} errored mid-stream after content — ending with partial`);
            res.write('data: [DONE]\n\n');
            res.end();
            return true;
          }
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
        setGroqCooldown(modelToTry, waitSec, true);
        // TPD exhausted on this key → mark it dead so future requests rotate.
        if (/tokens per day|TPD/i.test(e.message || '')) {
          markGroqKeyTpdExhausted(currentKey, waitSec * 1000);
        }
        continue;
      }
    }
  }

  // Groq exhausted — fall back to NVIDIA → CF worst-case.
  return streamAIFallbackChain(messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, skipNvidia, optimizedMessages, maxTokens, isHard });
}

// NVIDIA → Cloudflare fallback chain (used by Vortis chat after Groq fails).
async function streamAIFallbackChain(messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, skipNvidia = false, optimizedMessages, maxTokens, isHard }) {
  // Fall back to optimizedMessages passed in, or rebuild from messages.
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

const nvidiaFallbackTimeoutFor = (model) =>
  model === NVIDIA_CHAT_CODE ? 25000 : model === NVIDIA_CHAT_QUALITY ? 20000 : 15000;

for (const nvModel of nvidiaModelsToTry) {
  if (clientSignal?.aborted) { console.log('Client disconnected — skipping NVIDIA'); break; }
  const text = await tryNvidiaChat(nvModel, optimizedMessages, maxTokens, clientSignal, nvidiaFallbackTimeoutFor(nvModel));
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

  // Force a line break before a table that starts mid-sentence.
  // Only fires when the line does NOT already start with | — otherwise we'd
  // tear apart a legitimate table row's cells. The "before" must also be
  // followed by content that looks like a real table row (3+ pipes).
  fixed = fixed.replace(
    /^([^\n|][^\n]*?)[ \t](\|[^\n|]+\|[^\n|]+\|[^\n]*\|)/gm,
    (m, before, tableStart) => `${before}\n\n${tableStart}`
  );

  // Split rows joined by "| |" back onto separate lines — but ONLY when
  // the joined content is a separator row (dashes) or another clear row.
  // We require the next non-pipe character to be a dash or colon to fire,
  // which prevents splitting a single row like "| A | B |" mid-row.
  fixed = fixed.replace(/\|\s*\|\s*(?=---|:|[\s]*\|)/g, '|\n|');

  // Fix a separator row glued onto the header row like:
  //   "| Model | Price | |---|---|"
  // →
  //   "| Model | Price |"
  //   "|---|---|"
  // This is the most common malformation from fast models — they forget to
  // put a newline between the header row and the separator row.
  fixed = fixed.replace(
    /(\|[^\n|]+(?:\|[^\n|]+)+\|)[ \t]*(\|(?:[\s:|-]*\|)+)/g,
    (m, headerRow, sepRow) => `${headerRow}\n${sepRow}`
  );

  // Fix malformed separator rows missing the trailing pipe.
  // Matches a line like "|---|---" (no trailing |) and appends the |.
  fixed = fixed.replace(
    /^(\|[\s:|-]+)$/gm,
    (line) => /\|$/.test(line) ? line : (line + '|')
  );

  // Fix a separator row with too few cells (e.g. header has 3 cells, sep has 2).
  // Pads the separator row with extra ---| to match. Operates on lines.
  // For the separator line, we count dash-segments (---) as cells too, since
  // models often glue separator cells together like "---|---" instead of "|---|---|".
  fixed = fixed.replace(
    /^(\|[^\n]+\|)\n(\|[\s:|-]+\|?)$/gm,
    (match, headerLine, sepLine) => {
      const headerCellCount = Math.max(0, (headerLine.match(/\|/g) || []).length - 1);
      // For separator: count dash-runs (2+ dashes).
      const sepDashRuns = (sepLine.match(/-{2,}/g) || []).length;
      const sepPipeCount = Math.max(0, (sepLine.match(/\|/g) || []).length - 1);
      const sepCellCount = Math.max(sepPipeCount, sepDashRuns);
      if (sepCellCount >= headerCellCount) return match;
      const missing = headerCellCount - sepCellCount;
      // Rebuild the separator from scratch as |---|---|---|
      const newSep = '|' + '---|'.repeat(headerCellCount);
      return headerLine + '\n' + newSep;
    }
  );

  return fixed;
}

// Detects whether a user's message is asking for tabular/structured output
function looksLikeTableRequest(text) {
  const low = (text || '').toLowerCase();
  return /\b(table|compare|comparison|vs\.?|versus|pros and cons|side.by.side)\b/.test(low);
}

// ── RESTART-DUPLICATION GUARD (FIX 2026-09-06) ──────────────────────
// The user's core complaint: "it gave me same code two time up and down".
// Root cause: when a code-chat response hits max_tokens, we auto-continue
// with "continue exactly where you left off" — but models frequently
// IGNORE that and restart the whole output (```html <!-- file: index.html
// --> <!DOCTYPE html> ...), so the user sees the same file twice.
//
// The prompt-side fixes (resumeFromHint below) reduce this, but prompts
// are suggestions — this guard is enforcement. When a CONTINUATION turn
// starts emitting text that is a wholesale restart of the PREVIOUS turn
// (its first 120+ non-whitespace chars appear verbatim inside the
// previous turn's text), we suppress the duplicated characters as they
// stream, and un-suppress the moment the model reaches genuinely new
// content (or mismatches). Legitimate continuations are unaffected:
// they continue from the END of the previous turn, so their opening
// never matches the previous turn's content verbatim.
//
// The companion frontend dedupe (chat.jsx) is the second, final layer.
function makeRestartGuard(prevTurnText) {
  const strip = (s) => s.replace(/\s+/g, '');
  const prevStripped = strip(prevTurnText || '');
  // Previous turn too short to be worth guarding (and too short for the
  // 120-char confirmation signal) — pass everything through untouched.
  if (prevStripped.length < 300) {
    return { process: (s) => s, turnEnd: () => '' };
  }

  let mode = 'holding';   // 'holding' → 'suppress' | 'pass'
  let held = '';          // raw held-back text while deciding
  let suppressedIdx = 0;  // position in prevStripped already suppressed

  const flushHeld = () => { mode = 'pass'; const out = held; held = ''; return out; };

  return {
    process(safe) {
      if (mode === 'pass' || !safe) return safe;
      if (mode === 'holding') {
        held += safe;
        const heldStripped = strip(held);
        if (heldStripped.length < 120) return ''; // still deciding — hold back
        // Decision point: does this opening appear verbatim inside the
        // previous turn? (indexOf covers both restart-from-very-start and
        // restart-skipping-the-intro-prose.)
        const at = prevStripped.indexOf(heldStripped);
        if (at === -1) {
          // Legitimate continuation — flush everything we held back.
          return flushHeld();
        }
        // CONFIRMED restart — drop the duplicated opening and enter
        // suppress mode, consuming the rest of the duplicate char-by-char.
        mode = 'suppress';
        suppressedIdx = at + heldStripped.length;
        held = '';
        console.warn(`Code-chat: continuation restarted previous output (matched at stripped offset ${at}) — suppressing duplicate stream`);
        return '';
      }
      // mode === 'suppress': drop chars while they replay the previous
      // turn (whitespace is skipped freely; a non-ws mismatch or reaching
      // the end of the previous turn resumes normal streaming).
      let out = '';
      for (const ch of safe) {
        if (mode !== 'suppress') { out += ch; continue; }
        if (/\s/.test(ch)) continue; // whitespace inside the replay: drop
        if (suppressedIdx < prevStripped.length && ch === prevStripped[suppressedIdx]) {
          suppressedIdx++;
          continue;
        }
        // Mismatch, or the replay passed the end of the previous turn —
        // everything from here on is new content. Let it through.
        mode = 'pass';
        out += ch;
      }
      return out;
    },
    // Called at end-of-turn: if we were still deciding (short turn), the
    // held text was never confirmed as a duplicate — give it back.
    turnEnd() {
      if (mode === 'holding') return flushHeld();
      return '';
    },
  };
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

  // MAX_CONTINUATIONS: how many times one model attempt may auto-continue
  // a truncated response. Raised 4 → 8 (2026-09-06 v2) so very long
  // multi-file projects never hit an artificial ceiling — NIM bills by
  // REQUEST (RPM), not tokens, so extra continuation turns cost nothing.
  const MAX_CONTINUATIONS = 8;
// Both HEADERS_TIMEOUT_MS and firstByteTimeoutFor were bounding the SAME
// "model is cold-starting" delay separately, which meant a cold heavy
// model could burn up to 60s+50s=110s before we even tried the next
// model in the chain. Collapsed into ONE per-model budget for
// headers+first-byte combined, and added an overall chain deadline
// below so we never wait more than ~35s total across all models before
// falling back to Groq/CF.
function headersTimeoutFor(model) {
  // UPDATED 2026-09-06 (v2): kimi-k3 (heavy) is a large MoE — 25s headers
  // budget for cold-start; deepseek-v4-pro (quality) 20s; others 10s.
  if (model === NVIDIA_CODE_MODEL_HEAVY) return 25000;
  if (model === NVIDIA_CHAT_MODEL_QUALITY) return 20000;
  return 10000;
}

function firstByteTimeoutFor(model) {
  // UPDATED 2026-09-06 (v2): kimi-k3 gets 22s to first byte (cold-start
  // headroom for a flagship MoE); deepseek-v4-pro 16s; others 10s.
  if (model === NVIDIA_CODE_MODEL_HEAVY) return 22000;
  if (model === NVIDIA_CHAT_MODEL_QUALITY) return 16000;
  return 10000;
}

const IDLE_TIMEOUT_MS = 20000; // was 45000 — mid-stream stalls this long are genuinely dead

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
  const chain = chainName === 'heavy' ? pickHeavyChain() : (NVIDIA_CODE_CHAINS[chainName] || NVIDIA_CODE_CHAINS.standard);
const dropped = [];
// For the heavy chain, ALWAYS keep the quality model in the candidate list
// even if it's marked permanently invalid or in circuit-breaker cooldown —
// pickHeavyChain already added it, and we want one attempt per heavy
// request in case NVIDIA has revived the endpoint. Other models still get
// filtered out by the breaker / permanent-invalid registry.
const alwaysRetryInHeavy = chainName === 'heavy' ? NVIDIA_CHAT_MODEL_QUALITY : null;
const modelsToTry = chain.filter(m => {
  // Always keep the heavy chain's quality model, regardless of block state.
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


// FIX (2026-08-26): 35s → 75s. The old 35s ceiling was the direct cause
// of 'all NVIDIA models failed — caller should try Groq/CF fallback' firing
// on every heavy code-chat after an idle gap. Ultra alone can burn 25-30s
// on a cold-start timeout; with only 35s total the chain bailed before
// stepfun or lightning even got a chance to attempt. 75s gives the chain
// enough room to actually try every model in the heavy order at least once.
// (Code now matches the comment — was 60000.)
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

    // DIAGNOSTIC: log warm state at attempt start so we can see if we're
    // hitting a cold model (which explains first-byte timeouts and empty
    // responses from reasoning models that haven't loaded their weights).
    console.log(`Code-chat: trying ${nvidiaModel} (attempt ${attemptIdx}/${modelsToTry.length}, warm=${isNvidiaModelWarm(nvidiaModel)}, blocked=${isNvidiaModelBlocked(nvidiaModel)})`);

    let written = 0;
    let convoMessages = [...messages];
    let continuations = 0;
    let fullRawBuffer = '';
    let attemptFailed = false;
    let failureWasTimeout = false;  // true if the failure was a first-byte/idle timeout (not a real error)
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
              // FIX 2026-09-06 (v2): clamp per-model — deepseek-ai models
              // cap max_tokens at 16384; sending the 65536 kimi-k3 budget
              // to them returned HTTP 400 and silently failed the request.
              max_tokens:      nvidiaMaxTokensFor(nvidiaModel, maxTokens),
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
          // PERMANENT errors (404 / 401 / 410) — model ID is wrong, key is
          // bad, or model is end-of-life. Mark invalid forever and skip
          // retrying. THIS is the fix for the recurring
          // "Code-chat stream: nemotron-3-ultra-550b-a55b HTTP 404" log.
          // Previously 404 fell through to the generic single-failure path
          // (recordNvidiaFailure once), which meant:
          //   1. The model wasn't dropped from the chain on the next request.
          //   2. The keep-alive kept pinging it every 70s, producing the
          //      "keep-alive: HTTP 404" spam.
          // Now the first 404 marks it permanently invalid and isNvidiaModelBlocked
          // returns true forever for it.
          if (nvRes.status === 404 || nvRes.status === 401 || nvRes.status === 410) {
            markNvidiaModelInvalid(nvidiaModel, `HTTP ${nvRes.status}`);
            attemptFailed = true;
            break;
          }
          // RATE LIMIT (429) — stepfun-ai/step-3.7-flash returns this when
          // NVIDIA's per-model TPM budget is exhausted. Don't count it as
          // a 'real' model failure (the model is fine, we're just over
          // quota); instead apply a single cooldown strike so the circuit
          // breaker skips it for 2 min if it happens twice in a row.
          // Without this, 429 was falling through to the generic single-
          // failure path which tripped the breaker on 2 strikes regardless
          // of cause, blocking a perfectly-good model just because we
          // briefly over-queried it.
          if (nvRes.status === 429) {
            recordNvidiaFailure(nvidiaModel);
            console.warn(`Code-chat: ${nvidiaModel} HTTP 429 (rate limited) — circuit breaker strike 1/2 (cooldown only if hit again)`);
            attemptFailed = true;
            break;
          }
          // TRANSIENT errors (502/503/504) — model up but unavailable right
          // now. Trip the circuit breaker instantly (2 strikes = threshold)
          // so we skip it for 2 minutes.
          if (nvRes.status === 502 || nvRes.status === 503 || nvRes.status === 504) {
            recordNvidiaFailure(nvidiaModel);
            recordNvidiaFailure(nvidiaModel);
            console.warn(`Code-chat: ${nvidiaModel} HTTP ${nvRes.status} — instant circuit breaker trip — unavailable (2 min cooldown)`);
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
        // FIX 2026-09-06: restart-duplication guard — non-null only while
        // streaming an auto-continuation turn. See makeRestartGuard above.
        let restartGuard = null;
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
              const reasoningToken = payload?.choices?.[0]?.delta?.reasoning_content;
              if (reasoningToken) continue; // reasoning_content is never user-facing — drop it outright

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
                // Route continuation-turn text through the restart guard
                // so a model that re-emits the previous turn's output from
                // the beginning gets its duplicate suppressed mid-stream.
                const outSafe = restartGuard ? restartGuard.process(safe) : safe;
                if (outSafe) {
                  written += outSafe.length;
                  if (!safeWrite(`data: ${JSON.stringify({ content: outSafe })}\n\n`)) {
                    clientGone = true;
                    break;
                  }
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
          const outPending = restartGuard ? restartGuard.process(pending) : pending;
          pending = '';
          if (outPending) {
            written += outPending.length;
            safeWrite(`data: ${JSON.stringify({ content: outPending })}\n\n`);
          }
        }

        // End of this model turn — if the guard was still holding text
        // back undecided (turn ended before 120 chars), release it so the
        // client isn't missing the tail of the response.
        if (restartGuard) {
          const remainder = restartGuard.turnEnd();
          if (remainder) {
            written += remainder.length;
            safeWrite(`data: ${JSON.stringify({ content: remainder })}\n\n`);
          }
          restartGuard = null;
        }

        // FIX 2026-09-06 (v2) — "the text like 100 lines is truncated":
        // the old condition auto-continued ONLY on finish_reason=length.
        // But the most common truncation in production is a model that
        // stops early MID-FILE (finish_reason=stop, or null when the
        // stream was cut) leaving the closing ``` never emitted — the
        // user gets a half file (~100 lines) and NO continuation ever
        // fires, then the model restarts the file from scratch on the
        // next turn ("same file made twice"). Now we ALSO continue when
        // the visible turn output ends inside an unclosed code fence.
        const fenceCount = (turnBuffer.match(/```/g) || []).length;
        const endsInOpenFence = fenceCount % 2 === 1 && turnBuffer.trim().length > 400;
        if ((finishReason === 'length' || endsInOpenFence) && continuations < MAX_CONTINUATIONS) {
          continuations++;
          if (endsInOpenFence && finishReason !== 'length') {
            console.warn(`Code-chat output ended inside an unclosed code fence (finish_reason=${finishReason || 'null'}, ${written} chars so far) — auto-continuing (${continuations}/${MAX_CONTINUATIONS}) on ${nvidiaModel}`);
          } else {
            console.warn(`Code-chat truncated by max_tokens — auto-continuing (${continuations}/${MAX_CONTINUATIONS}) on ${nvidiaModel}`);
          }
          // FIX (2026-08-26): the previous continuation prompt caused two
          // visible bugs in production:
          //
          //   (a) DUPLICATE CODE — the model often ignored the rule and
          //       restarted the output from the beginning, producing the
          //       same code block twice in a row (the user's screenshot:
          //       'it show same code 2 times'). Now we detect mid-sentence
          //       truncation and tell the model to RESTART the broken
          //       sentence from the last complete sentence boundary,
          //       which prevents both mid-word pickup AND restart-from-
          //       scratch duplication.
          //
          //   (b) MID-WORD PICKUP — the previous prompt said 'continue
          //       EXACTLY where you left off', which the model took
          //       literally: if the prior turn was truncated mid-word
          //       ('...this code wil') the model would continue with
          //       'l work for you', and the visible response started with
          //       'will work for you' — looking like the first sentence
          //       had been deleted (the user's report: 'first text mostly
          //       removed, just starts with will'). Now we detect mid-word
          //       truncation and tell the model to RESTART the broken
          //       sentence from the last complete sentence boundary.
          //
          // We also trim turnBuffer to the last ~12K chars to keep the
          // continuation request under NVIDIA's context window — the model
          // doesn't need to see the very beginning of a 30K-char file to
          // continue the end of it.
          const trimmedPrior = turnBuffer.length > 12000
            ? turnBuffer.slice(-12000)
            : turnBuffer;
          // Detect mid-word truncation: no terminal punctuation AND no
          // closing code fence AND last char is a word character. In that
          // case find the last sentence boundary (.
          // ! ? newline) and tell the model to restart from there.
          const lastChar = trimmedPrior.slice(-1);
          const endsMidWord = /[A-Za-z0-9_]/.test(lastChar)
            && !/```\s*$/.test(trimmedPrior)
            && !/[.!?:;\n]\s*$/.test(trimmedPrior);
          let resumeFromHint;
          if (endsMidWord) {
            // Find last sentence boundary in the trimmed prior — restart
            // from there so the visible continuation begins with a complete
            // sentence instead of mid-word pickup like 'will work for you'.
            const boundaryMatch = trimmedPrior.match(/[.!?:\n][^.!?:\n]*$/);
            const lastBoundary = boundaryMatch ? boundaryMatch.index + 1 : 0;
            const brokenSentence = trimmedPrior.slice(lastBoundary).trim();
            resumeFromHint = `You were cut off MID-SENTENCE. The last incomplete sentence was:\n\n<incomplete_sentence>\n${brokenSentence}\n</incomplete_sentence>\n\nRESTART that exact sentence from its beginning and continue from there. Do NOT pick up mid-word. Do NOT repeat any text from before this sentence.`;
          } else {
            resumeFromHint = `You were cut off mid-output. Here is the last part of what you produced:\n\n<previous_output_tail>\n${trimmedPrior}\n</previous_output_tail>\n\nContinue EXACTLY where you left off. Rules:\n- Do NOT repeat any text from above.\n- Do NOT add any preamble, explanation, or apology.\n- Do NOT restart the file or wrap in a new code fence if you were inside one.\n- Just output the next characters that would naturally follow the last character above.`;
          }
          // FIX 2026-09-06 (v2): when the cut happened INSIDE an unclosed
          // code fence, make the instruction explicit: finish the file,
          // close the fence, and never restart the file from the top —
          // that restart is exactly what made the same file appear twice.
          if (endsInOpenFence) {
            resumeFromHint += `\n\nIMPORTANT: your output stopped INSIDE an unfinished code block (the closing \`\`\` was never emitted). Continue the code from the exact stopping point, finish the file completely, and emit the closing \`\`\` when the file is done. Do NOT restart the file, do NOT re-emit any earlier part of it, and do NOT output anything before the code continues.`;
          }
          convoMessages = [
            ...convoMessages,
            { role: 'assistant', content: turnBuffer },
            { role: 'user', content: resumeFromHint },
          ];
          // FIX 2026-09-06: arm the restart-duplication guard for the
          // continuation turn — if the model restarts the output instead
          // of continuing, the duplicate is suppressed as it streams.
          restartGuard = makeRestartGuard(turnBuffer);
          turnBuffer = '';  // reset for the next turn
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

    // DIAGNOSTIC: written=0 means nothing was streamed to the client. This
    // is the "empty response" the user sees in vertex. Log exactly what we
    // got from the model so we can diagnose:
    //   - fullRawBuffer length (0 = model returned literally nothing,
    //     >0 = model returned something but it was all <think> tags)
    //   - attemptFailed (true = HTTP error or exception)
    //   - failureWasTimeout (true = first-byte or idle timeout)
    //   - finishReason (length = hit max_tokens, stop = model chose to stop,
    //     null = stream was interrupted before finishing)
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
      // Distinguish two failure modes for clearer logs:
      //   - fullRawBuffer was empty → model returned literally nothing (real error)
      //   - fullRawBuffer had content but it was all <think> → reasoning-only response
      //     (model loaded but didn't produce a visible answer — treat as a soft
      //     failure, fall through to next model in chain)
      if (fullRawBuffer.length > 0) {
        console.warn(`Code-chat: ${nvidiaModel} returned ${fullRawBuffer.length} chars but all were <think> content (no visible answer) — trying next model`);
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
async function streamCodeChatFallback(groq, messages, res, { CF_TOKEN, CF_ACCOUNT, clientSignal, chainName = 'standard' }) {
  const preferQuality = chainName !== 'trivial';
  // FIX: skipNvidia=true — we already tried the full NVIDIA code-chat
  // chain (heavy/standard/trivial) and it failed. streamAI's default
  // behavior would re-try NVIDIA as a fallback, wasting a network
  // round-trip on a model that just failed. Skip straight to Groq → CF.
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

// ── TAVILY (fallback search provider) ──────────────────────────
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

function stripCodeFences(text) {
  return (text || '').replace(/```[\s\S]*?```/g, ' ');
}

// ── AI-BASED SEARCH DECISION ────────────────────────────────────
// Instead of matching keywords (which breaks on typos, phrasing variety,
// or anything not explicitly listed), ask a fast/cheap model to decide
// whether this message needs live web results. Falls back to the old
// heuristic if the classifier call fails or times out.
async function aiNeedsSearch(groq, text, { isCode = false, clientSignal } = {}) {
  // Explicit user intent: "search the web for X", "google X", "look this up",
  // "find online", "search and tell me", etc. Honor without consulting the
  // classifier — saves a round trip and prevents the LLM saying NO when the
  // user clearly asked for a search.
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

  // FIX: code-chat slowness — was firing a Groq LLM classifier call with a
  // 2000ms timeout for EVERY code request before the NVIDIA stream could
  // start. That meant a "make me a tic tac toe game" request sat showing
  // "thinking..." for 2 seconds while Groq answered a pointless YES/NO
  // question. The heuristic + explicit-phrase checks above already catch
  // genuine search-needed cases (latest/current/version/deprecated/changelog
  // /breaking-change patterns), so for code-chat we skip the classifier
  // entirely and let the model answer from general knowledge. Regular chat
  // still uses the classifier — it's only code that suffers the latency.
  if (isCode) return false;

  if (/^(hi|hello|hey|thanks|thank you|thx|ty|ok|okay|sure|yes|no|yep|nope|cool|nice|great|awesome|good (morning|evening|night|afternoon)|what time|what date|how are you|who are you|what is your name|sup|yo|lol|haha)\b/i.test((searchableText || '').trim())) return false;
  if ((searchableText || '').trim().length < 8) return false;

  const controller = new AbortController();
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  // Code mode gets a tighter budget — 700ms instead of 1200ms. A missed
  // search classification just means "answer from general knowledge",
  // which is the safe default anyway, so there's no correctness cost
  // to cutting this short.
  // FIX: was 700ms for code mode — too tight for gpt-oss-20b (a reasoning
  // model that needs ~500-1500ms to produce even a YES/NO answer). The
  // log showed "Search-decision classifier failed: Request was aborted"
  // repeatedly. Bumped to 2000ms — still fast enough that the user
  // doesn't notice the delay, but gives Groq time to actually respond.
  // A missed search classification just means "answer from general
  // knowledge", which is the safe default, so there's no correctness
  // cost to a slightly longer timeout.
  // SPEED FIX: was 1200ms for non-code - classifier returns
  // YES or NO. 700ms is enough for gpt-oss-20b. Saves up to
  // 500ms per request when the classifier is slow.
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
// ── DEBUG ENDPOINTS — for diagnosing NVIDIA model access issues
// ═════════════════════════════════════════════════════════════
// Both endpoints are gated behind X-App-Key header (same key your
// frontend already sends). If X-App-Key isn't configured in env,
// they're open to anyone with the URL — fine for debugging on
// Render but lock it down before going to prod.

function debugAuthOk(req) {
  const expected = process.env.X_APP_KEY;
  if (!expected) return true; // no key configured = open (debug mode)
  return req.headers['x-app-key'] === expected;
}

// /debug/nvidia-models
//   Lists every model NVIDIA's /v1/models endpoint exposes, then for
//   each of OUR configured models (fast/quality/heavy/vision chain)
//   runs a 1-token streaming ping to see if our key can actually
//   reach it. Returns:
//     { catalog: [...], our_models: [{ id, in_catalog, http_status,
//       latency_ms, error }] }
//
//   This is the diagnostic for "is nemotron-3-ultra-550b-a55b actually
//   accessible with my key?" — a 404 in the http_status field means
//   NVIDIA is gating that model behind a higher tier.
app.get('/debug/nvidia-models', async (req, res) => {
  if (!debugAuthOk(req)) return res.status(403).json({ error: 'missing X-App-Key' });
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return res.status(500).json({ error: 'NVIDIA_API_KEY not set' });

  // 1. Fetch the full catalog (unauthenticated — NVIDIA returns the
  //    list of all models on the endpoint, regardless of key tier).
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

  // 2. Test each of our configured models with a 1-token streaming ping.
  //    We deliberately bypass isNvidiaModelBlocked() here — the whole
  //    point is to test models that have been marked invalid.
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
        // Drain one chunk then cancel — same as the keep-alive.
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

// /debug/nvidia-health
//   Returns the in-memory state of the circuit breaker + warm-state
//   tracker + invalid-TTL registry. Use this to see which models are
//   currently being skipped and why, without grepping logs.
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
    keepalive_in_flight: [...nvidiaKeepaliveInFlight],
  });
});

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

  // Warm up the two working models. Skip NVIDIA_CHAT_MODEL_QUALITY if it
  // points to the same ID as FAST (lightning is now both FAST and QUALITY
  // since super-120b was removed) — warming the same model twice just
  // wastes a request.
  const nvKey = process.env.NVIDIA_API_KEY;
  if (nvKey) {
    const modelsToWarm = [...new Set([
      NVIDIA_CODE_MODEL_FAST,
      NVIDIA_CODE_MODEL_HEAVY,
      NVIDIA_CHAT_MODEL_QUALITY,
    ].filter(m => !isNvidiaModelInvalid(m)))];

    for (const modelId of modelsToWarm) {
      // Ultra-550b is a 550B MoE that takes 25-90s to cold-start on NIM.
      // The old 90s timeout was STILL right at the edge — your warmup logs
      // showed "This operation was aborted" on the first attempt followed
      // by a successful retry at 1085-2360ms. That's because cold-start on
      // a freshly-deployed NIM endpoint can take up to 120s on the very
      // first request after deploy. 150s gives comfortable headroom so
      // the first attempt succeeds instead of falling through to the
      // 10-second retry delay. Once warm, pings drop to 5-15s and the
      // timeout never fires.
      // FIX: stepfun (quality model) was timing out at 30s during warmup,
      // triggering 'This operation was aborted' on every warmup attempt.
      // Cold-start on NIM endpoints can legitimately take 30-60s on the
      // first request after deploy. Give stepfun 60s of headroom (matches
      // the keep-alive timeout for the quality slot) instead of the 30s
      // default for non-heavy models. Heavy (ultra-550b) still gets 150s
      // because it's a 550B MoE that takes even longer to cold-start.
      // UPDATED 2026-09-06 (v2): heavy is now kimi-k3 (60s warmup budget
      // for a flagship MoE cold-start), quality is deepseek-v4-pro-0813
      // (55s — its cold-start on NIM legitimately takes 40s+ right after
      // a deploy/idle gap, which is exactly the "This operation was
      // aborted" warmup noise in the logs; it is NOT broken), others 30s.
      const timeout = modelId === NVIDIA_CODE_MODEL_HEAVY ? 60000
                    : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 55000
                    : 30000;

      // RETRY LOOP: if the warmup fails with a transient error (502/503/504/
      // timeout), retry up to 3 times with increasing delay. This gets ultra
      // warmed as soon as NVIDIA brings it back online, instead of waiting
      // 70s for the keep-alive. The old code gave up after 1 attempt and
      // waited for keep-alive — if ultra was temporarily down (502), it
      // stayed cold for 70s+, and heavy requests fell to lightning (slower
      // for complex code).
      // Fixed — cap the warmup timeout much lower (this is a background task,
// not a user-facing request — no reason to wait 60s per attempt), and
// stop retrying once it's clear this model just isn't answering.
const retryWarmup = async (modelId, timeout, attempt, maxAttempts) => {
  const result = await warmUpNvidiaModel(modelId, timeout);
  if (result.ok || attempt >= maxAttempts) return result;
  // Back off but don't retry more than twice total — 3 full attempts at
  // 60s each was burning ~3 minutes of background fetch time per
  // deploy/restart, competing with real user requests for bandwidth.
  await new Promise(r => setTimeout(r, 5000));
  console.log(`NVIDIA warmup: retrying ${modelId} (attempt ${attempt + 1}/${maxAttempts})...`);
  return retryWarmup(modelId, timeout, attempt + 1, maxAttempts);
};

      retryWarmup(modelId, timeout, 1, 2).then(({ ok, ms }) => {
        if (!ok) {
          // v2: say WHY the warmup gave up. "not ready after 0ms" (the log
          // that looked like a bug) means the model is already in the
          // invalid registry — the warmup short-circuits without a network
          // call (e.g. GLM-5.2 after its 410 end-of-life, or a 404 key-tier
          // issue). Anything else is a real timeout/HTTP failure.
          const invalidEntry = nvidiaEolModels.get(modelId);
          const invalidNote = invalidEntry
            ? ` — marked invalid: ${invalidEntry.reason || 'unknown'} (auto-retries after TTL)`
            : (modelId === NVIDIA_CODE_MODEL_HEAVY ? ' — will keep trying via keep-alive' : '');
          console.log(`NVIDIA warmup skipped: ${modelId} not ready after ${ms}ms${invalidNote}`);
        }
      });
    }
  } else {
    console.log('NVIDIA warmup skipped: NVIDIA_API_KEY not set');
  }
}

// Helper: warms up a single NVIDIA model with a tiny completion.
// Returns { ok, ms } once the request finishes (success or failure).
// Never throws — warmup failures are non-fatal.
async function warmUpNvidiaModel(modelId, timeoutMs = 30000) {
  const nvKey = process.env.NVIDIA_API_KEY;
  if (!nvKey) return { ok: false, ms: 0 };
  // Skip immediately if we already know this model ID is permanently
  // invalid (e.g. a previous call returned 404). No point spending a
  // network round trip on a known-bad ID.
  if (isNvidiaModelInvalid(modelId)) {
    return { ok: false, ms: 0 };
  }
  const t0 = Date.now();
  try {
    // Warmup prompt: use a question that reasoning models can answer briefly,
    // and give enough tokens (50) for the model to get past its <think> phase
    // and produce a visible answer. The old max_tokens=5 was too small for
    // reasoning models like ultra-550b — they'd consume all 5 tokens on
    // <think> reasoning and return content: null with finish_reason: "length".
    // That looked like a "malformed body" to our validation, but the model
    // was actually loaded and working fine (proven by 51K-char real requests).
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
    try {

    // PERMANENT errors (404/401/410) — mark invalid immediately so the
    // keep-alive never tries this ID again.
    if (res.status === 404 || res.status === 401 || res.status === 410) {
      markNvidiaModelInvalid(modelId, `HTTP ${res.status} during warmup`);
      try { await res.text(); } catch (_) {}
      return { ok: false, ms: Date.now() - t0 };
    }

    if (res.ok) {
      // BULLETPROOF WARMUP: any HTTP 200 = ready. Period.
      //
      // The goal of warmup is to load the model into NVIDIA's inference
      // memory. A 200 response means the model endpoint exists, accepted
      // our request, and returned something. That's all we need — the
      // model is now loaded and will respond faster on the next (real)
      // request.
      //
      // We do NOT validate the body because:
      //   - Reasoning models (ultra-550b) return content:null when
      //     max_tokens is too small — that's normal, model is loaded.
      //   - Some models return <think>-only content with no visible
      //     answer for tiny prompts — that's normal, model is loaded.
      //   - Body structure varies between model versions — trying to
      //     validate it caused more false failures than real catches.
      //
      // The ONLY way to detect a truly broken model ID now is:
      //   - HTTP 404/401/410 (handled above) — permanent invalid.
      //   - HTTP 503/504 — transient, handled by circuit breaker.
      //   - Real requests producing empty output — handled by the
      //     streaming code's salvage + fallback logic.
      //
      // We still read the body (to drain the connection for reuse) and
      // log a debug summary, but we never reject based on body content.
      let rawText = '';
      try { rawText = await res.text(); } catch (_) {}
      const ms = Date.now() - t0;

      // Quick parse for debug logging only — never affects the result.
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

    // NON-OK RESPONSES (502/503/504/429/500/etc.)
    // CRITICAL: do NOT call recordNvidiaLatency here! The latency for a
    // 502 is typically very fast (300-500ms) because the gateway rejects
    // quickly. If we call recordNvidiaLatency with 398ms, it checks
    // 398 <= 30000 (ultra threshold) = true → marks model as WARM.
    // But the model just returned 502 — it's DOWN, not warm!
    // This caused pickHeavyChain to try ultra first on heavy requests
    // even though it was returning 502, wasting time and causing
    // "empty response" errors.
    //
    // Instead: explicitly mark as NOT warm, and for transient errors
    // (502/503/504), count one failure toward the circuit breaker so
    // if it fails repeatedly, the model gets cooled down.
    const elapsed = Date.now() - t0;
    try { await res.text(); } catch (_) {}  // drain body

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      // Transient — model temporarily unavailable. Don't trip circuit
      // breaker instantly (one failure only); the keep-alive will retry.
      recordNvidiaFailure(modelId);
      // Explicitly mark as NOT warm — overrides any stale warm state
      // from a previous successful warmup.
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP ${res.status} (transient — will retry via keep-alive) [${elapsed}ms]`);
    } else if (res.status === 429) {
      // Rate limited — back off, don't count as failure.
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP 429 (rate limited — will retry via keep-alive) [${elapsed}ms]`);
    } else {
      // Other non-OK status (500, 400, etc.) — log with status.
      nvidiaWarmState.set(modelId, { warm: false, lastCheck: Date.now() });
      console.log(`NVIDIA warmup ${modelId} HTTP ${res.status} [${elapsed}ms]`);
    }
    return { ok: false, ms: elapsed };
    } finally {
      if (res.__clearTimeout) res.__clearTimeout();
    }
  } catch (e) {
    console.log(`NVIDIA warmup ${modelId} failed:`, e.message);
    return { ok: false, ms: Date.now() - t0 };
  }
}

// ── NVIDIA KEEP-ALIVE PING ─────────────────────────────────────
// FIX: the heavy 550b model routinely takes 5-23s to respond, which is
// LONGER than the old 20s interval. That let consecutive ping cycles
// overlap — a second ping firing before the first one for the SAME model
// had finished — stacking concurrent requests against NVIDIA's per-model
// rate limit. This was the direct cause of the HTTP 429 seen on a real
// user request: keep-alive traffic was competing with them for the same
// budget. Two fixes:
//   1. Per-model in-flight guard — skip a model's ping this cycle if its
//      previous ping hasn't finished yet (no more stacking).
//   2. Separate, longer interval for the heavy model (45s) vs fast (20s)
//      — 45s is still well under NVIDIA's ~60s idle-unload window, but
//      gives each slow ping room to finish before the next one fires.
const NVIDIA_KEEPALIVE_INTERVAL_FAST_MS  = 20 * 1000;
const NVIDIA_KEEPALIVE_INTERVAL_HEAVY_MS = 45 * 1000;
const NVIDIA_KEEPALIVE_INTERVAL_QUALITY_MS = 35 * 1000;
const nvidiaKeepaliveInFlight = new Set(); // models currently mid-ping

// nvidiaEolModels is now declared up near the circuit breaker (line ~237)
// so that isNvidiaModelBlocked / recordNvidiaFailure can see it.

async function pingNvidiaModel(modelId) {
  // isNvidiaModelBlocked already checks nvidiaEolModels, so this single
  // guard covers both transient cooldowns and permanent-invalid models.
  if (isNvidiaModelBlocked(modelId)) return;
  // Guard: don't fire a new ping for this model while an old one is
  // still in flight — this is what was causing overlapping 429s.
  if (nvidiaKeepaliveInFlight.has(modelId)) {
    // Per-model in-flight guard fires every cycle when a slow heavy model
    // is mid-ping (ultra-550b routinely takes 5-25s, heavy ping interval
    // is 70s). Silence the log line by default — it's not actionable and
    // was producing 10-15 noise lines per minute. Set VERBOSE_KEEPALIVE=1
    // to re-enable for debugging.
    if (process.env.VERBOSE_KEEPALIVE === '1') {
      console.log(`NVIDIA keep-alive: ${modelId} skipped — previous ping still in flight`);
    }
    return;
  }
  nvidiaKeepaliveInFlight.add(modelId);
  try {
    const t0 = Date.now();
    //
    // STREAMING KEEP-ALIVE — the main slowness fix.
    //
    // Old behavior: `stream: false, max_tokens: 5`. The server waited for
    // the FULL completion (including any reasoning tokens on Nemotron
    // models) before responding. For warm models that's 5-12s, for cold
    // models 20-25s — exactly the "was warming" log spam the user saw.
    //
    // New behavior: `stream: true, max_tokens: 1`. We grab the response
    // reader, read ONE SSE chunk (which is enough to know the model is
    // alive and warmed up), then cancel the stream. Cold-start still has
    // to load the model into GPU memory before the first byte, but we
    // don't wait for any generation. Result: warm pings drop to 1-3s,
    // cold pings to 8-15s.
    //
    // The headers-phase timeout is also tightened — old 25-150s was way
    // too generous for a 1-token ping. 12s for fast/quality, 25s for
    // ultra-550b cold-start headroom.
    // UPDATED 2026-09-06: GLM-5.2 (heavy) 25s, deepseek-v4-pro (quality)
    // 20s, fast/lightning 15s.
    const pingTimeout = modelId === NVIDIA_CODE_MODEL_HEAVY ? 25000
                     : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 20000
                     : 15000;
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
    try {
    if (res.ok) {
      // Read exactly one chunk, then cancel. This proves the model is
      // loaded and responsive without paying for full generation.
      try {
        const reader = res.body.getReader();
        const { value } = await reader.read();
        // value is a Uint8Array — even an empty SSE comment (": ok\n\n")
        // counts as "model is alive". Cancel the rest of the stream.
        try { await reader.cancel('keepalive-done'); } catch (_) {}
        if (!value || value.length === 0) {
          // Empty first chunk is suspicious — treat as failure but don't
          // mark invalid (could be a transient NIM quirk).
          console.warn(`NVIDIA keep-alive: ${modelId} returned empty first chunk`);
          recordNvidiaFailure(modelId);
          return;
        }
      } catch (readErr) {
        // Stream read failed AFTER headers arrived — model is at least
        // returning 200, so don't mark invalid. Count one transient fail.
        console.warn(`NVIDIA keep-alive: ${modelId} stream read error:`, readErr.message);
        recordNvidiaFailure(modelId);
        return;
      }
      recordNvidiaSuccess(modelId);
      const ms = Date.now() - t0;
      recordNvidiaLatency(modelId, ms);
      // Per-model "slow" threshold. With streaming, warm pings should be
      // well under 5s. Anything over 10s for fast/quality or 15s for
      // ultra means the model was cold-starting.
      const slowThreshold = modelId === NVIDIA_CODE_MODEL_HEAVY ? 15000
                          : modelId === NVIDIA_CHAT_MODEL_QUALITY ? 10000
                          : 8000;  // fast/lightning
      if (ms > slowThreshold) console.log(`NVIDIA keep-alive: ${modelId} slow (${ms}ms — was warming)`);
    } else if (res.status === 429) {
      // back off silently this cycle
      try { await res.text(); } catch (_) {}
    } else if (res.status === 404 || res.status === 401 || res.status === 410) {
      // HARD errors — model ID doesn't exist for this key (404), API key
      // revoked (401), or model end-of-life'd (410). Mark invalid via the
      // central registry — the TTL is 30min (NVIDIA_INVALID_TTL_MS), so we
      // will auto-retry once per half hour in case access is granted back.
      try { await res.text(); } catch (_) {}
      markNvidiaModelInvalid(modelId, `HTTP ${res.status} during keep-alive`);
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      // Transient unavailability — the circuit breaker (in streamNvidiaGLMOnly
      // and tryNvidiaChat) already trips instantly on 502/503/504 and gives
      // the model a 2-min cooldown, so logging it here every cycle is pure
      // noise. Demote to debug-level unless VERBOSE_KEEPALIVE=1.
      try { await res.text(); } catch (_) {}
      if (process.env.VERBOSE_KEEPALIVE === '1') {
        console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status} (unavailable, will retry next cycle)`);
      }
    } else {
      console.log(`NVIDIA keep-alive: ${modelId} HTTP ${res.status}`);
      try { await res.text(); } catch (_) {}
    }
    } finally {
      if (res.__clearTimeout) res.__clearTimeout();
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

  // Deduplicate models — since NVIDIA_CHAT_QUALITY now points to the same
  // ID as NVIDIA_CHAT_FAST (lightning), we'd otherwise ping it twice and
  // waste budget. Build a set of unique model IDs and ping each once.
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

    // ── TITLE — cheap internal housekeeping.
   if (action === 'title') {
  const titlePrompt = sanitizeString(req.body.prompt || '', 2000);
  if (!titlePrompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  // gpt-oss-20b is a reasoning model. reasoning_effort='low' is the lowest
  // supported value ('none' returns 400). max_tokens=200 leaves room for
  // reasoning + actual title (max_tokens=30 returns empty content because
  // the model burns it all on reasoning_content). stripInternalReasoning()
  // strips any reasoning that leaks into the content field.
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

  // Cloudflare fallback — reuses the same two models already proven to work
  // as the CF chat fallback chain elsewhere in this file (CF_CHAT_MODELS),
  // and the same response-shape parsing (result.response, or output_text,
  // or choices[0].message.content depending on the model).
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

  // Both providers failed — return empty; the frontend already falls back
  // to using the first user message as the title (see generateChatTitle).
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

    // ── FIX (TDZ bug): CF_TOKEN / CF_ACCOUNT must be declared BEFORE the
    // isCodeMode branch below. Previously these were declared further down
    // (right before the `action === 'tts'` section), which meant that when
    // the code-chat path fell through to `streamCodeChatFallback(...,
    // { CF_TOKEN, CF_ACCOUNT, ... })`, the reference threw:
    //   "ReferenceError: Cannot access 'CF_TOKEN' before initialization"
    // because `const CF_TOKEN` / `const CF_ACCOUNT` exist in the temporal
    // dead zone for the whole function until their declaration line runs —
    // and that line never ran before the code-chat branch returned.
    // Moving the declarations up here fixes the Groq+CF fallback for
    // code-chat without touching any other logic.
    const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
    const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!CF_TOKEN || !CF_ACCOUNT) {
      console.error('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID missing — Cloudflare fallback unavailable for this request');
    }

    // ── ROUTE TO CODE-CHAT BEFORE the regular chat handler ──
    if (isCodeMode && action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        // FIX (2026-08-26): short-circuit IMAGE GENERATION requests with a
        // templated redirect message instead of letting them flow into the
        // NVIDIA heavy chain (which would write fake 'image generation'
        // code — exactly what the user reported: 'it starting gen code of
        // that i think he trying to gen me image with code').
        //
        // The redirect tells the user professionally:
        //   - Vertex = coding side of Vortis, can't generate images
        //   - Vortis (the main chat) has a built-in image generator
        //   - Switch to Vortis for image generation
        // Matches the user's explicit request: 'it should say if you want
        // to gen image you can go to vortis it can help you better — like
        // this it should say professionally'.
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

        // Compute this FIRST, cheaply (sync regex, no network) — lets us
        // skip the search-need classifier call entirely for clarify answers,
        // saving a full Groq round-trip on the most common turn in a build flow.
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

        // Reuse the early check — same regex, same input in practice
        // (lastUserForSearch and lastUserContent are the same turn).
        const looksLikeClarifyAnswer = looksLikeClarifyAnswerEarly || /\S.{0,80}?:\s*\S.{0,80}?(\s*·\s*\S.{0,80}?:\s*\S.{0,80}?)+/.test(lastUserContent);

        // SYSTEM PROMPT STRUCTURE FIX: the previous version embedded a
        // user-visible '---\nCODE MODE: Vertex streaming active...' block
        // in the system message. Reasoning models (nemotron-ultra, gpt-oss)
        // were treating that block as content and ECHOING it back in the
        // response — the user saw 'CODE MODE: Vertex streaming active...'
        // as a paragraph in the chat. That's the 'internal thinking' leak.
        //
        // The fix: drop the 'CODE MODE' label entirely (it was metadata
        // for the model, not for the user) and phrase the 'no reasoning
        // preamble' instruction as a direct second-person command placed
        // at the very END of the system prompt, where reasoning models
        // treat it as the strongest instruction and don't echo it.
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

        // If any earlier turn in this thread was a genuine build request, treat
        // the whole thread as a coding task so follow-ups (edits, "also add X",
        // etc.) stay on the heavy NVIDIA chain instead of drifting to nano
        // mid-conversation.
        //
        // GUARD: don't let this override an obviously trivial/conversational
        // message ("fair point?", "you took too long", "thanks", "ok"). Those
        // are chit-chat riding on a coding thread, not codegen requests — the
        // heavy 550b model is wasted on them and adds unnecessary latency.
        // Only escalate when the current turn itself isn't clearly trivial.
       const priorCodingTask = codeMessages
          .slice(0, -1)
          .some(m => m.role === 'user' && isActualCodingTask(m.content));

       let chainName = pickCodeChatChain(lastUserContent);
if (looksLikeClarifyAnswer) {
  chainName = 'heavy';
} else if (priorCodingTask) {
  // Directives that steer an in-progress build ("don't ask", "just build it",
  // "go ahead") must escalate even though they're short and verb-free —
  // isTrivialCodeMessage's length<15 check would otherwise swallow them.
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
  // else: falls through to pickCodeChatChain's own classification (chit-chat like "thanks")
}

        console.log(`Code-chat: routing "${lastUserContent.slice(0, 50)}..." → chain=${chainName}`);
        // Token budget: 65536 — the kimi-k3 maximum, deliberately set to
        // the LARGEST budget any chain model accepts (user instruction:
        // "don't add any text limit like token limit — nim apis based on
        // rpm speed"). NIM rate limits by REQUEST, not output tokens, so
        // requesting the max costs nothing; each model still gets clamped
        // to its own hard cap by nvidiaMaxTokensFor() (kimi-k3 65536,
        // lightning 32768, deepseek 16384) to avoid HTTP 400s. The old
        // 8000 cap was the primary cause of "code getting cut off
        // mid-stream"; long outputs that STILL overflow (rare now) are
        // handled by the auto-continuation above — including the new
        // unclosed-code-fence detection.
        let ok = await streamNvidiaGLMOnly(codeMessages, res, 65536, clientSignal.signal, chainName);
        // FIX (2026-08-26): the previous version printed a hardcoded
        // 'code models are temporarily unavailable' message here and bailed
        // — even though streamCodeChatFallback() (defined further up in this
        // file) was DESIGNED for exactly this case. The dead-code gap meant
        // that whenever every NVIDIA model timed out (which happens often
        // right after a deploy or idle gap, when ultra-550b is cold-starting
        // at 23-29s and exceeds even our 25s first-byte budget), the user
        // saw 'temporarily unavailable' instead of getting an answer from
        // Groq + Cloudflare. Now we actually fall through, matching the
        // intent of streamCodeChatFallback's comment: 'Used when NVIDIA
        // code-chat fails entirely. Streams via Groq using gpt-oss-20b
        // (fast, decent for code) and falls back through the same
        // NVIDIA / CF chain that regular chat uses.'
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
        // Only show the 'unavailable' message if BOTH the NVIDIA chain AND
        // the Groq+CF fallback failed. This is now genuinely rare — it
        // requires every provider to be down at once.
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
        // CRITICAL: if the stream was opened but no content was written
        // (because an exception happened mid-stream), write a fallback
        // message so the user doesn't see "empty response" in the frontend.
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

    // NOTE: CF_TOKEN / CF_ACCOUNT are already declared above (before the
    // isCodeMode block) — do NOT redeclare them here with `const`, that
    // would throw "Identifier 'CF_TOKEN' has already been declared".
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
    // ╚══════════════════════════════════════╗
    
    if (action === 'chat') {
    if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();                 // ← CHANGED: send headers now, don't wait for content
  res.write(': connected\n\n');       // ← CHANGED: SSE comment, resolves client fetch() immediately

  // ← CHANGED: heartbeat keeps the connection alive during search/geo lookups
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
        // ← CHANGED: wrapped the actual search work in its own promise so we
        // can race it against a hard timeout below.
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
        // ← CHANGED: hard 7s ceiling — degrade to no search context instead of stalling
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
    clearInterval(heartbeat);   // ← CHANGED: always clear, whichever path returned above
  }
  return;
}

    // ╔══════════════════════════════════════╗
    // ║  MEMORY  — extract facts, decide op  ║
    // ╚══════════════════════════════════════╗
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
    // ╚══════════════════════════════════════╗
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
        // All four search providers returned nothing. This is rare (DDG/Bing
        // are keyless), so it usually means the query was blocked or there's
        // a network issue. Tell the frontend explicitly so it can show a
        // proper error instead of silently going to the AI.
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
        // Tells the frontend which provider actually returned the results,
        // so the UI can show "via DuckDuckGo" / "via Tavily" etc.
        provider:       allResults[0]?.source || 'unknown',
        searchWarning:  allResults.length === 0 ? 'All search providers returned no results. Check your network or try a different query.' : null,
      });
    }

    // ╔══════════════════════════════════════╗
    // ║  VISION                              ║
    // ╚══════════════════════════════════════╗
    if (action === 'vision') {
      if (!image)                     return res.status(400).json({ error: 'Missing image data' });
      if (!isValidBase64Image(image)) return res.status(400).json({ error: 'Invalid image format' });
      if (isImageTooLarge(image))     return res.status(400).json({ error: 'Image too large (max 5MB)' });

      const base64Data = image.startsWith('data:') ? image.split(',')[1] : image;
      const cleanPrompt = sanitizeString(prompt || 'Describe this image in detail.', 500);

      // ── Helper: try a Cloudflare vision model ──
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

      // ── Helper: try an NVIDIA vision model ──
      // FIX (2026-08-26): the old helper had three problems that together
      //   caused the vision race to fire dead/blocked models on EVERY
      //   request and produced the recurring log spam:
      //     1. It did NOT consult isNvidiaModelBlocked() — so models that
      //        had returned HTTP 410 (end-of-life) or were in circuit-
      //        breaker cooldown were retried on every single vision call.
      //     2. It did NOT mark models invalid on 404/401/410 — so the
      //        EOL 'nvidia/nemotron-nano-12b-v2-vl' kept getting retried
      //        indefinitely (it took a chain prune to actually stop the
      //        noise). Now we mark + skip, so a future EOL won't need a
      //        code change.
      //     3. It did NOT distinguish 429 (rate-limit, transient) from
      //        real failures, so a brief over-quota moment could cascade
      //        into permanent circuit-breaker cooldown for the model.
      const tryNvidiaVision = async (modelId) => {
  // Skip blocked models up front — no wasted network round-trip on a known
  // dead ID (HTTP 410 EOL) or a model that's in 2-min cooldown after 502s.
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
      // PERMANENT errors (404/401/410) — mark invalid so we stop pinging.
      // 'nvidia/nemotron-nano-12b-v2-vl' EOL on 2026-08-26 returns 410 and
      // would otherwise be retried on every vision call forever.
      if (nvRes.status === 404 || nvRes.status === 401 || nvRes.status === 410) {
        markNvidiaModelInvalid(modelId, `HTTP ${nvRes.status} during vision`);
        console.warn(`NVIDIA vision (${modelId}) marked INVALID — HTTP ${nvRes.status} (${errBody.slice(0, 120)})`);
        return null;
      }
      // RATE LIMIT (429) — model is fine, we're over quota. Don't trip the
      // circuit breaker instantly; one strike so we only cool down if it
      // happens twice in a row.
      if (nvRes.status === 429) {
        recordNvidiaFailure(modelId);
        console.warn(`NVIDIA vision (${modelId}) HTTP 429 (rate limited) — strike 1/2`);
        return null;
      }
      // TRANSIENT (502/503/504) — instant trip, 2-min cooldown.
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

      // ── Vision routing ──
      // 1. Race all NIM models in parallel — first valid response wins.
      // 2. If all fail, retry the top 3 sequentially after a 2s delay.
      // 3. Last resort: Cloudflare llava.
      let description = null;

      const raceNvidiaModels = async (label) => {
        // FIX (2026-08-26): filter out blocked models BEFORE building the
        // race candidate list. The old code mapped over the full chain
        // unconditionally, so a model that returned 410 on the previous
        // request (and was correctly marked invalid) was STILL fired again
        // on the next request — wasting a network round-trip, producing
        // the recurring 'NVIDIA vision (...) HTTP 410' log line, and
        // slowing down the race for everyone.
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

      // Attempt 1: parallel race
      description = await raceNvidiaModels('race');

      // Attempt 2: sequential retry of remaining (non-blocked) chain models after 2s
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

      // Attempt 3: Cloudflare fallback
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

    // ╔══════════════════════════════════════╗
    // ║  TRANSCRIBE (Voice call STT)         ║
    // ╚══════════════════════════════════════╗
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
    // ╚══════════════════════════════════════╗
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

      // ── Pollinations.ai — fallback image provider (free, no API key) ──
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
        // PROVIDER CHAIN:
        //   1. Cloudflare Flux worker — PRIMARY
        //   2. Pollinations.ai        — fallback (free, no API key)
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