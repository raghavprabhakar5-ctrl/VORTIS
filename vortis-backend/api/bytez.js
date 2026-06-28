export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

import admin from 'firebase-admin';
import Groq from 'groq-sdk';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// ── MODEL CONFIG ──────────────────────────────────────────────
const GROQ_CHAT_PRIMARY      = 'openai/gpt-oss-20b';
const GROQ_CHAT_QUALITY      = 'openai/gpt-oss-120b';
const GROQ_CLASSIFIER_MODEL  = 'openai/gpt-oss-20b';

// NVIDIA NIM — free OpenAI-compatible endpoints, PRIMARY for chat (saves Groq tokens)
// Groq is faster so it stays PRIMARY for voice (latency critical)
const NVIDIA_BASE_URL         = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_CHAT_FAST        = 'minimaxai/minimax-m2.7';               // fast, general chat
const NVIDIA_CHAT_QUALITY     = 'mistralai/devstral-2-123b-instruct-2512'; // code/complex tasks
const NVIDIA_VISION_MODEL     = 'minimaxai/minimax-m3';                  // image_url in messages
const NVIDIA_IMAGE_MODEL      = 'qwen/qwen-image-2512';                  // /v1/images/generations

// ── VOICE MODEL CONFIG ────────────────────────────────────────
// Groq is PRIMARY for voice — sub-100ms TTFT, LPU hardware, deterministic latency
// NVIDIA is FALLBACK for voice — free but 10-30s response time on free tier
const GROQ_VOICE_MODEL        = 'openai/gpt-oss-20b';  // same as chat primary, fast enough

const CF_CHAT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];

// ── RATE LIMITER ──────────────────────────────────────────────
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:          { window: 60000, max: 30 },
  image:         { window: 60000, max: 5  },
  search:        { window: 60000, max: 20 },
  vision:        { window: 60000, max: 5  },
  tts:           { window: 60000, max: 20 },
  execute:       { window: 60000, max: 15 },
  nvidia_global: { window: 60000, max: 35 },
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
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function isValidResponse(text) {
  if (!text || text.trim().length < 2) return false;
  return !/rate.?limit|connection.?error|too many request|try again later|quota exceeded|service unavailable/i.test(text.trim());
}

function stripInternalReasoning(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^→.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
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
  ) return 'hard';
  if (isObviouslyTrivial(text)) return 'medium';
  try {
    const result = await Promise.race([
      groq.chat.completions.create({
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
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('classifier timeout')), 2500)),
    ]);
    const raw = result.choices?.[0]?.message?.content?.toLowerCase() || '';
    return raw.includes('hard') ? 'hard' : 'medium';
  } catch (e) {
    console.warn('Tier classifier failed, falling back to heuristic:', e.message);
    return isComplexMessage(text) ? 'hard' : 'medium';
  }
}

// ── NVIDIA NIM CHAT HELPER ─────────────────────────────────────
async function tryNvidiaChat(modelId, messages, maxTokens) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
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
      },
      20000
    );
    if (!res.ok) {
      console.log(`NVIDIA model ${modelId} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content ?? null;
    if (typeof rawText !== 'string') return null;
    const text = stripInternalReasoning(rawText);
    return isValidResponse(text) ? text : null;
  } catch (e) {
    console.log(`NVIDIA model error (${modelId}):`, e.message);
    return null;
  }
}

// ── GLOBAL NVIDIA RATE GUARD ──────────────────────────────────
function checkGlobalLimit(action) {
  const limit = RATE_LIMITS[action];
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

// ── STREAMING callAI (regular chat — NVIDIA primary, Groq fallback) ──────────
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT }) {
  const systemPrompt = messages.find(m => m.role === 'system');

  const efficiencyRule = {
    role: 'system',
    content: `TOKEN EFFICIENCY RULES — ALWAYS FOLLOW:
- Match response length to task complexity. Simple question = 1-3 sentences. Complex task = as long as needed, no more.
- Give fast response to the user.
- NEVER pad, repeat, or over-explain. Say it once, say it well.
- NEVER truncate or cut off mid-sentence. Always finish your complete thought.
- Short tasks (greetings, yes/no, simple facts) = under 50 words.
- Medium tasks (explanations, comparisons) = under 200 words.
- Hard tasks (code, essays, research) = as long as needed to fully complete.
- Always write complete sentences. Never stop mid-word or mid-thought.
- NEVER output any reasoning, thinking, or planning text before an answer or a command. The first thing you output must be the actual answer — no preamble, no "let me think" text of any kind, ever.`,
  };

  const recentConversations = messages.filter(m => m.role !== 'system').slice(-12);
  const optimizedMessages = systemPrompt
    ? [systemPrompt, efficiencyRule, ...recentConversations]
    : [efficiencyRule, ...recentConversations];

  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const codeAndMathRegex = /(```|function\s*\(|const\s|let\s+\w|async\s|def\s|import\s|from\s+\w+\s+import|class\s+\w|return\s|public\s+class|<\?php|#include|console\.log|print\(|\b(integral|derivative|matrix|vector|equation|algebra|calculus|trigonometry|algorithm|recursion|complexity|refactor|debug|stack trace)\b|[\+\-\*\/=\<\>\{\}\[\]]{3,})/i;
  const isHard    = codeAndMathRegex.test(lastMsg);
  const maxTokens = isHard ? 4096 : 2500;

  // ── PRIMARY: NVIDIA (saves Groq tokens for regular chat) ──
  // Use quality model for hard tasks, fast model for everything else
  if (checkGlobalLimit('nvidia_global')) {
    const nvidiaModelsToTry = isHard
      ? [NVIDIA_CHAT_QUALITY, NVIDIA_CHAT_FAST]
      : [NVIDIA_CHAT_FAST, NVIDIA_CHAT_QUALITY];

    for (const nvModel of nvidiaModelsToTry) {
      const text = await tryNvidiaChat(nvModel, optimizedMessages, maxTokens);
      if (text) {
        console.log(`Chat → NVIDIA ✅ (${nvModel})`);
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
      console.warn(`NVIDIA model ${nvModel} returned empty — trying next`);
    }
  } else {
    console.warn('NVIDIA global rate limit reached — going straight to Groq');
  }

  // ── FALLBACK 1: Groq streaming ──
  const groqModel = isHard ? GROQ_CHAT_QUALITY : GROQ_CHAT_PRIMARY;
  console.log(`Chat → Groq fallback (isHard=${isHard} → ${groqModel})`);

  for (const modelToTry of [groqModel, isHard ? GROQ_CHAT_PRIMARY : GROQ_CHAT_QUALITY]) {
    try {
      const stream = await groq.chat.completions.create({
        model:       modelToTry,
        messages:    optimizedMessages,
        max_tokens:  maxTokens,
        temperature: 0.7,
        stream:      true,
        ...(modelToTry === GROQ_CHAT_QUALITY ? { reasoning_effort: 'low' } : {}),
      });

      let buffer      = '';
      let chunkCount  = 0;
      let finishReason = null;
      let inThink     = false;
      let pending     = '';

      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
        if (!token) continue;

        buffer  += token;
        pending += token;

        let safe = '';
        while (true) {
          if (!inThink) {
            const openIdx = pending.indexOf('<think>');
            if (openIdx === -1) {
              const holdBack = Math.min(pending.length, 8);
              safe   += pending.slice(0, pending.length - holdBack);
              pending = pending.slice(pending.length - holdBack);
              break;
            } else {
              safe   += pending.slice(0, openIdx);
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
          chunkCount++;
          res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
          if (chunkCount % 10 === 0 && res.flush) res.flush();
        }
      }

      if (stripInternalReasoning(buffer).trim().length > 0) {
        if (finishReason === 'length') {
          console.warn(`Response truncated by max_tokens (${maxTokens}) — model: ${modelToTry}`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
      console.warn(`Groq model ${modelToTry} returned empty — trying next`);
    } catch (e) {
      console.error(`Groq stream failed (${modelToTry}):`, e.message);
      if (e.status === 429 || e.message?.includes('rate_limit_exceeded')) {
        console.log('Groq rate limit hit, trying next model...');
        continue;
      }
      console.log('Non-rate-limit Groq error, trying next model anyway...');
    }
  }

  // ── FALLBACK 2: Cloudflare ──
  for (const cfModel of CF_CHAT_MODELS) {
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messages: optimizedMessages, stream: false, max_tokens: 1200 }),
        }
      );
      if (!cfRes.ok) { console.log(`CF model ${cfModel} HTTP ${cfRes.status}`); continue; }

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

// ── SERPER ────────────────────────────────────────────────────
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

// ── ESPN ──────────────────────────────────────────────────────
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

function needsWebSearch(text) {
  const low = text.toLowerCase();
  if (/\b(ipl|cricket|rcb|csk|\bmi\b|kkr|srh|pbks|\brr\b|\bgt\b|lsg|bcci|virat|kohli|rohit|dhoni|wicket|innings|over|scorecard)\b/.test(low)) return true;
  if (/\b(nba|nfl|mlb|nhl|epl|premier league|la liga|bundesliga|champions league|football|soccer|basketball|tennis|f1|formula 1)\b/.test(low)) return true;
  if (/\b(today|tonight|yesterday|this week|this month|right now|currently|latest|breaking|live|recent)\b/.test(low)) return true;
  if (/\b(news|update|announced|launched|released|happened|election|president|prime minister|ceo|stock price|weather)\b/.test(low)) return true;
  if (/\b(2024|2025|2026)\b/.test(low)) return true;
  if (/^(who is|who won|who leads|what is the current|what happened|when did|did .{1,40} win|has .{1,40} won|is .{1,40} still)\b/.test(low)) return true;
  return false;
}

function buildSearchQuery(userMessage) {
  const now     = new Date();
  const dateStr = `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`;
  if (/\b(20\d\d|today|yesterday|this week)\b/i.test(userMessage)) return userMessage.slice(0, 200);
  return `${userMessage.slice(0, 180)} ${dateStr}`;
}

// ═════════════════════════════════════════════════════════════
// ── MAIN HANDLER
// ═════════════════════════════════════════════════════════════
export default async function handler(req, res) {

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://vortis-ai.vercel.app').split(',');
  const origin         = req.headers.origin || '';
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  if (!allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);

    if (!action) return res.status(400).json({ error: 'Missing action' });
    if (!['chat', 'search', 'image', 'vision', 'tts', 'execute'].includes(action)) return res.status(400).json({ error: `Invalid action: ${action}` });
    if (!checkRateLimit(userIp, action)) return res.status(429).json({ error: 'Too many requests. Slow down a bit!' });

    const prompt      = sanitizeString(body.prompt  || '', 15000);
    const query       = sanitizeString(body.query   || '', 500);
    const image       = body.image || null;
    const history     = sanitizeHistory(body.history || []);
    const isVoiceCall = Boolean(body.isVoiceCall);

    const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
    const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!CF_TOKEN || !CF_ACCOUNT) return res.status(500).json({ error: 'Server configuration error' });

    // ╔══════════════════════════════════════╗
    // ║  TTS                                 ║
    // ╚══════════════════════════════════════╝
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

      // ── Attempt 1: Edge TTS (@andresaya/edge-tts) ──
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

      // ── Attempt 2: msedge-tts ──
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

      // ── Attempt 3: Cloudflare MeloTTS ──
      try {
        const cfTtsRes = await fetchWithTimeout(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/myshell-ai/melotts`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ text: cleanText }),
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
    // ║  CHAT  — token streaming             ║
    // ╚══════════════════════════════════════╝
    if (action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        // ╔══════════════════════════════════════╗
        // ║  VOICE PATH                          ║
        // ║  Groq PRIMARY  → NVIDIA → Cloudflare ║
        // ║  Reason: Groq LPU = sub-100ms TTFT  ║
        // ║  NVIDIA free tier = 10-30s latency   ║
        // ╚══════════════════════════════════════╝
        if (isVoiceCall) {
          const voiceMessages = [
            { role: 'system', content: prompt.trim().slice(0, 400) },
            ...sanitizeHistory(history, 8),
          ];

          // ── PRIMARY: Groq (fast, reliable for real-time voice) ──
          try {
            const stream = await groq.chat.completions.create({
              model:       GROQ_VOICE_MODEL,
              messages:    voiceMessages,
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
              console.log('Voice → Groq ✅ (primary)');
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            console.warn('Groq voice returned empty — trying NVIDIA');
          } catch (e) {
            console.error('Groq voice failed:', e.message, '— trying NVIDIA');
          }

          // ── FALLBACK 1: NVIDIA (slower but free, good backup) ──
          try {
            const nvKey = process.env.NVIDIA_API_KEY;
            if (nvKey) {
              const nvRes = await fetchWithTimeout(
                `${NVIDIA_BASE_URL}/chat/completions`,
                {
                  method:  'POST',
                  headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model:       NVIDIA_CHAT_FAST,
                    messages:    voiceMessages,
                    max_tokens:  800,
                    temperature: 0.7,
                    stream:      false,
                  }),
                },
                20000  // longer timeout here since it's already a fallback — latency is acceptable
              );
              if (nvRes.ok) {
                const data = await nvRes.json();
                const text = stripInternalReasoning(data?.choices?.[0]?.message?.content ?? '').trim();
                if (text.length > 2) {
                  console.log('Voice → NVIDIA ✅ (fallback 1)');
                  res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
                  res.write('data: [DONE]\n\n');
                  res.end();
                  return;
                }
                console.warn('NVIDIA voice returned empty — trying Cloudflare');
              } else {
                let errBody = '';
                try { errBody = await nvRes.text(); } catch (_) {}
                console.warn(`NVIDIA voice HTTP ${nvRes.status} — ${errBody.slice(0, 200)} — trying Cloudflare`);
              }
            }
          } catch (e) {
            console.log('NVIDIA voice failed:', e.message, '— trying Cloudflare');
          }

          // ── FALLBACK 2: Cloudflare ──
          for (const cfModel of CF_CHAT_MODELS) {
            try {
              const cfRes = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
                {
                  method:  'POST',
                  headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: voiceMessages, stream: false, max_tokens: 400 }),
                }
              );
              if (!cfRes.ok) {
                console.warn(`CF voice HTTP ${cfRes.status} (${cfModel}) — trying next`);
                continue;
              }
              const data = await cfRes.json();
              let rawText = data?.result?.response ?? data?.result?.output_text ?? data?.result?.choices?.[0]?.message?.content ?? null;
              if (typeof rawText !== 'string') {
                console.warn(`CF voice (${cfModel}) unexpected shape:`, JSON.stringify(data).slice(0, 200));
                continue;
              }
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

          // ── All three failed ──
          console.error('Voice: ALL THREE PROVIDERS FAILED (Groq, NVIDIA, Cloudflare)');
          res.write(`data: ${JSON.stringify({ content: 'Sorry, voice is unavailable right now.' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        // ╔══════════════════════════════════════╗
        // ║  REGULAR CHAT PATH                   ║
        // ║  NVIDIA PRIMARY → Groq → Cloudflare  ║
        // ║  Reason: save Groq tokens, NVIDIA    ║
        // ║  latency acceptable for text chat    ║
        // ╚══════════════════════════════════════╝
        const lastUserMsg = history[history.length - 1]?.content || '';

        const [searchContext, userLocation] = await Promise.all([
          (async () => {
            if (!needsWebSearch(lastUserMsg)) return '';
            try {
              const sq        = buildSearchQuery(lastUserMsg);
              const isSports  = /\b(nba|nfl|mlb|nhl|epl|premier league|la liga|bundesliga|champions league|football|soccer|basketball|tennis)\b/i.test(sq);
              const isCricket = /\b(ipl|cricket|rcb|csk|\bmi\b|kkr|srh|pbks|\brr\b|\bgt\b|lsg|bcci|wicket|innings)\b/i.test(sq);
              const [serperResult, espnResult] = await Promise.allSettled([
                fetchSerper(sq),
                (isSports && !isCricket) ? fetchESPN(sq) : Promise.resolve([]),
              ]);
              let allRes = [
                ...(espnResult.status  === 'fulfilled' ? espnResult.value  : []),
                ...(serperResult.status === 'fulfilled' ? serperResult.value : []),
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
            try {
              const geoRes = await fetchWithTimeout(
                `https://ipapi.co/${userIp}/json/`,
                { headers: { 'User-Agent': BROWSER_UA } },
                3000
              );
              if (geoRes.ok) {
                const geo = await geoRes.json();
                if (geo.city && geo.country_name) return `${geo.city}, ${geo.region}, ${geo.country_name}`;
              }
            } catch (_) {}
            return '';
          })(),
        ]);

        const identityOverride = `You are VORTIS, an AI assistant built by the Vortis team. If asked who made you, say "I was built by the Vortis team." Never reveal your underlying model. Never claim to be GPT, Claude, Llama, Gemini, or any other model.
Vortis is an AI assistant platform built by the Vortis team, offering chat, image generation, vision, document analysis, web search, and voice mode.
If asked "what is Vortis" or "tell me about Vortis", answer with this description — don't just repeat "I was built by the Vortis team."

FORMATTING RULES — ALWAYS FOLLOW:
- Always use markdown formatting in your responses
- Use **bold** for important terms, names, numbers
- If the user sends a code block without any question, explain what it does.
- Use bullet points (- item) for lists of 3+ items
- Use numbered lists (1. item) for steps or sequences
- Use ### headers for sections in long responses
- Use \`inline code\` for technical terms, commands, file names
- Use code blocks with language for any code: \`\`\`python
- Use | tables | with | headers | for comparisons
- Use > blockquotes for tips or important notes
- Short answers (1-3 sentences) can be plain text — no need to force formatting
- Never write walls of plain text for complex topics — always structure them

RESPONSE STYLE: Be concise and to the point. Short answers for simple questions (1-3 sentences max). For lists use max 5-6 bullet points. Keep it under 200 words unless asked for detail. Never pad, repeat, or over-explain. Always finish your answer completely.

REFUSAL RULES: Never respond with only "I can't help with that" — always explain briefly why and give an alternative.\n\n`;

        const locationNote = userLocation ? `\nUser's location: ${userLocation}` : '';
        const sysContent   = identityOverride + prompt.trim().slice(0, 10000) + locationNote + searchContext;

        const messages = [];
        if (sysContent) messages.push({ role: 'system', content: sysContent });
        messages.push(...history);

        if (!messages.length || messages[messages.length - 1].role !== 'user') {
          const userMsg = history.length > 0
            ? history[history.length - 1].content
            : prompt.replace(/^You are VORTIS[\s\S]{0,500}/, '').trim();
          messages.push({ role: 'user', content: userMsg });
        }

        const ok = await streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT });
        if (!ok) {
          if (!res.writableEnded) {
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
    // ║  SEARCH                              ║
    // ╚══════════════════════════════════════╝
    if (action === 'search') {
      const searchQuery = (query || prompt).trim();
      if (!searchQuery)             return res.status(400).json({ error: 'Missing search query' });
      if (searchQuery.length > 300) return res.status(400).json({ error: 'Query too long' });

      const low       = searchQuery.toLowerCase();
      const isCricket = /\b(ipl|cricket|rcb|csk|\bmi\b|kkr|srh|pbks|\brr\b|\bgt\b|lsg|bcci|wicket|innings)\b/.test(low);
      const isSports  = /\b(nba|nfl|mlb|nhl|epl|premier league|la liga|bundesliga|champions league|football|soccer|basketball|tennis)\b/.test(low);

      const [serperResult, espnResult] = await Promise.allSettled([
        fetchSerper(searchQuery),
        (isSports && !isCricket) ? fetchESPN(searchQuery) : Promise.resolve([]),
      ]);

      let allResults = [
        ...(espnResult.status  === 'fulfilled' ? espnResult.value  : []),
        ...(serperResult.status === 'fulfilled' ? serperResult.value : []),
      ];
      allResults = cleanResults(allResults, searchQuery);
      allResults = deduplicate(allResults);
      allResults = scoreAndSort(allResults, searchQuery);

      let aiSummary = null;
      if (allResults.length > 0) {
        const contextSnippets = allResults.slice(0, 4).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 250)}\nSource: ${r.source}`
        ).join('\n\n');
        const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
          const result = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                {
                  role:    'system',
                  content: `Today is ${today}. Summarize these search results.\nRULES:\n- Use ONLY the results below.\n- Be specific: names, scores, dates, numbers.\n- 3-5 sentences. Direct and factual.\n- If results show a sports result, state it clearly.\n- Do NOT say "as of my knowledge".\n\nSEARCH RESULTS:\n${contextSnippets}`,
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
          if (answer) allResults.push({ title: searchQuery, snippet: answer, link: '#', source: 'Vortis', date: new Date().toISOString().split('T')[0] });
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

      // ── Attempt 1: Cloudflare Llama-4-Scout ──
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
      } catch (e) { console.log('Cloudflare vision failed:', e.message); }

      // ── Attempt 2: NVIDIA NIM vision ──
      try {
        const nvKey = process.env.NVIDIA_API_KEY;
        if (nvKey) {
          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/chat/completions`,
            {
              method:  'POST',
              headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: NVIDIA_VISION_MODEL,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: sanitizeString(prompt || 'Describe this image in detail.', 500) },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                  ],
                }],
                max_tokens:  2048,
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
              if (description && description.trim().length > 2) return res.status(200).json({ success: true, description });
            }
          } else {
            console.log(`NVIDIA vision HTTP ${nvRes.status}`);
          }
        }
      } catch (e) { console.log('NVIDIA vision failed:', e.message); }

      // ── Attempt 3: Cloudflare LLaVA ──
      try {
        const bytes    = Array.from(Buffer.from(base64Data, 'base64'));
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
          try { return JSON.parse(responseText); }
          catch { return { success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(responseText, 'binary').toString('base64')}` }; }
        } catch (e) {
          console.error('Flux worker failed:', e.message);
          return null;
        }
      }

      async function tryNvidiaSD35(promptText) {
        try {
          const nvKey = process.env.NVIDIA_API_KEY;
          if (!nvKey) return null;
          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/images/generations`,
            {
              method:  'POST',
              headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model:           'stabilityai/stable-diffusion-3.5-large',
                prompt:          promptText.trim(),
                n:               1,
                response_format: 'b64_json',
              }),
            },
            30000
          );
          if (!nvRes.ok) { console.log('NVIDIA SD 3.5 gen HTTP', nvRes.status); return null; }
          const data = await nvRes.json();
          const b64  = data?.data?.[0]?.b64_json;
          if (!b64 || b64.length < 100) { console.log('NVIDIA SD 3.5 gen returned empty payload'); return null; }
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
          const nvRes = await fetchWithTimeout(
            `${NVIDIA_BASE_URL}/images/generations`,
            {
              method:  'POST',
              headers: { 'Authorization': `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model:           'meta/llama-3-diffusion-xl',
                prompt:          promptText.trim(),
                n:               1,
                response_format: 'b64_json',
              }),
            },
            30000
          );
          if (!nvRes.ok) { console.log('NVIDIA Llama-3 gen HTTP', nvRes.status); return null; }
          const data = await nvRes.json();
          const b64  = data?.data?.[0]?.b64_json;
          if (!b64 || b64.length < 100) { console.log('NVIDIA Llama-3 gen returned empty payload'); return null; }
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
        if (fluxResult?.imageUrl) return res.status(200).json({ ...fluxResult, provider: 'flux' });

        console.log('Cloudflare failed, shifting to NVIDIA SD 3.5...');
        const sd35Fallback = await tryNvidiaSD35(prompt);
        if (sd35Fallback?.imageUrl) return res.status(200).json({ ...sd35Fallback, provider: 'nvidia-sd-3.5-large' });

        console.log('NVIDIA SD 3.5 failed, shifting to NVIDIA Llama-3...');
        const llamaFallback = await tryNvidiaLlama(prompt);
        if (llamaFallback?.imageUrl) return res.status(200).json({ ...llamaFallback, provider: 'nvidia-llama-3' });

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
}