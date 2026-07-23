export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '5mb',
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
const GROQ_CHAT_PRIMARY = "llama-3.3-70b-versatile";      
const GROQ_CHAT_QUALITY = 'openai/gpt-oss-120b';    
const GROQ_CLASSIFIER_MODEL = "llama-3.1-8b-instant";

// NVIDIA NIM (build.nvidia.com) — free OpenAI-compatible endpoints, used as a
// fallback layer between Groq and Cloudflare. Same /v1/chat/completions shape.
const NVIDIA_BASE_URL     = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_CHAT_FAST    = 'meta/llama-3.1-8b-instruct';   // Very fast, lower latency
const NVIDIA_CHAT_QUALITY = 'nvidia/nemotron-3-ultra-550b-a55b'; // Massive 550B flagship for heavy agent logic
const NVIDIA_CHAT_CODE    = 'poolside/laguna-xs-2.1';// 284B MoE, 13B active — fast, coding-optimized
const NVIDIA_VISION_MODEL = 'minimaxai/minimax-m3';          // image_url/video_url in messages
const NVIDIA_IMAGE_MODEL  = 'qwen/qwen-image-2512';          // /v1/images/generations

const CF_CHAT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];

// ── RATE LIMITER ──────────────────────────────────────────────
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:    { window: 60000, max: 30 },
  image:   { window: 60000, max: 5  },
  search:  { window: 60000, max: 20 },
  vision:  { window: 60000, max: 5  },
  tts:     { window: 60000, max: 20 },
  execute: { window: 60000, max: 15 },
  transcribe: { window: 60000, max: 40 },
  nvidia_global: { window: 60000, max: 35 }, 
  memory: { window: 60000, max: 20 },
  
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
  let t = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^→.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
  // Drop lines that narrate reasoning instead of speaking to the user
  t = t.split(/\n+/)
    .filter(line => !/\b(the user is|the user said|the user wants|i (should|need to|will) reply|detected language|i think the|so i should)\b/i.test(line))
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

  // 1. Instant local heuristic overrides
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

  // 2. LLM Classification with a strict race-timeout
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

    // 3. Clean fallback if LLM or timeout fails
    return isComplexMessage(text) ? 'hard' : 'medium';
  }
}

// ── NVIDIA NIM CHAT FALLBACK ────────────────────────────────────
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
          stream:      true,
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

// ── GLOBAL NVIDIA RATE GUARD (protects shared API key across all users) ──
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

// ── STREAMING callAI ───────────────────────────────────────────
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT }) {
  const systemPrompt = messages.find(m => m.role === 'system');

  const recentConversations = messages
    .filter(m => m.role !== 'system')
    .slice(-12);

  const optimizedMessages = systemPrompt
    ? [systemPrompt, ...recentConversations]
    : [...recentConversations];

  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  const hasCodeFence = /```/.test(lastMsg);
  const looksLikeCodeRequest = isObviouslyHard(lastMsg);
  const isHard = hasCodeFence || looksLikeCodeRequest;

  const model     = isHard ? GROQ_CHAT_QUALITY : GROQ_CHAT_PRIMARY;
  const maxTokens = isHard ? 8192 : 2048; // raised floor for both tiers

  console.log(`Routing: hard=${isHard} (fence=${hasCodeFence}, heuristic=${looksLikeCodeRequest}) → model: ${model} → maxTokens: ${maxTokens}`);

  const MAX_CONTINUATIONS = 3; // hard safety cap so we never loop forever

  for (const modelToTry of [model, isHard ? GROQ_CHAT_PRIMARY : GROQ_CHAT_QUALITY]) {
    try {
      let convoMessages = [...optimizedMessages];
      let fullBuffer = '';
      let continuations = 0;
      let streamedAnything = false;

      while (true) {
        const stream = await groq.chat.completions.create({
          model:       modelToTry,
          messages:    convoMessages,
          max_tokens:  maxTokens,
          temperature: 0.7,
          stream:      true,
          ...(modelToTry === GROQ_CHAT_QUALITY ? { reasoning_effort: 'low' } : {}),
        });

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
            res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
            if (res.flush) res.flush();
          }
        }

        if (!inThink && pending) {
          streamedAnything = true;
          res.write(`data: ${JSON.stringify({ content: pending })}\n\n`);
          pending = '';
        }

        fullBuffer += buffer;

        const gotRealContent = stripInternalReasoning(buffer).trim().length > 0;

        // ── Model hit the token cap — continue the SAME logical response ──
        if (finishReason === 'length' && continuations < MAX_CONTINUATIONS) {
          continuations++;
          console.warn(`Truncated by max_tokens (${maxTokens}) on ${modelToTry} — auto-continuing (${continuations}/${MAX_CONTINUATIONS})`);

          // Feed back exactly what the model produced so far, then ask it
          // to continue with no repetition and no re-greeting.
          convoMessages = [
            ...convoMessages,
            { role: 'assistant', content: buffer },
            { role: 'user', content: 'Continue exactly where you left off. Do not repeat any earlier text, do not restart, do not add any preamble.' },
          ];
          continue; // loop again with same modelToTry, appended history
        }

        // ── Done (either finished naturally, or hit continuation cap) ──
        if (gotRealContent || streamedAnything) {
          if (finishReason === 'length') {
            console.warn(`Still truncated after ${continuations} continuations — ending stream (model: ${modelToTry})`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return true;
        }

        console.warn(`Model ${modelToTry} returned empty — trying fallback`);
        break; // empty response, fall through to next model in outer for-loop
      }
    } catch (e) {
      console.error(`Groq stream failed (${modelToTry}):`, e.message);
      if (e.status === 429 || e.message?.includes('rate_limit_exceeded')) {
        console.log('Rate limit hit, trying next model...');
        continue;
      }
      console.log('Non-rate-limit error, trying next model anyway...');
    }
  }
  // ── NVIDIA NIM BACKUP FALLBACK (between Groq and Cloudflare) ────
  if (checkGlobalLimit('nvidia_global')) {
    const nvidiaModelsToTry = isHard
      ? [NVIDIA_CHAT_CODE, NVIDIA_CHAT_QUALITY, NVIDIA_CHAT_FAST]
      : [NVIDIA_CHAT_FAST, NVIDIA_CHAT_QUALITY];

    for (const nvModel of nvidiaModelsToTry) {
      const text = await tryNvidiaChat(nvModel, optimizedMessages, maxTokens);
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

  // ── CLOUDFLARE WORKERS AI BACKUP FALLBACK ───────────────────────
  for (const cfModel of CF_CHAT_MODELS) {
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: optimizedMessages, stream: true, max_tokens: 1200 }),
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

// ── SERPER (now the fallback, only used if Tavily is unavailable/empty) ──
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

// ── UNIFIED WEB SEARCH — Tavily primary, Serper as fallback ──────
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
  // Only search when the user EXPLICITLY wants current/live info
  if (/\b(score|live score|who won|who is winning|current price|right now|today's|tonight's)\b/.test(low)) return true;
  if (/\b(ipl|cricket|rcb|csk|kkr|srh|pbks|\bgt\b|lsg)\b/.test(low)) return true;
  if (/\b(nba|nfl|mlb|nhl|epl|la liga|bundesliga|champions league)\b/.test(low)) return true;
  if (/\b(stock price|weather in|election result)\b/.test(low)) return true;
  if (/\b(breaking news|just announced|just happened)\b/.test(low)) return true;
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
    if (!['chat', 'search', 'image', 'vision', 'tts', 'execute', 'transcribe', 'memory'].includes(action)) return res.status(400).json({ error: `Invalid action: ${action}` });
    if (!checkRateLimit(userIp, action)) return res.status(429).json({ error: 'Too many requests. Slow down a bit!' });

    // ── SERVER-SIDE TIER + USAGE ENFORCEMENT ──
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


// ── CODE-CHAT STREAMING (DeepSeek V4 Flash) ───────────────────
// Used when the frontend sends mode:'code' — bypasses Groq + Cloudflare
// entirely and streams directly from NVIDIA's deepseek-v4-flash endpoint.
// No model fallback: if it fails, we surface a clean error to the
// client instead of silently switching models.
const NVIDIA_CHAT_CODE = 'poolside/laguna-xs-2.1';
// Returns true on success (response already streamed + res.end() called),
// false on failure (caller decides how to respond).
async function streamNvidiaGLMOnly(messages, res, maxTokens = 4096) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    console.error('Code-chat stream: NVIDIA_API_KEY missing');
    return false;
  }

  // Respect the shared NVIDIA global rate guard so the API key doesn't
  // get burned across users.
  if (!checkGlobalLimit('nvidia_global')) {
    console.warn('Code-chat stream: NVIDIA global rate limit reached');
    return false;
  }

  // FIX: declared here (not inside try) so the catch block can see it
  let written = 0;

  try {
    const nvRes = await fetchWithTimeout(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:           NVIDIA_CHAT_CODE,   // 'deepseek-ai/deepseek-v4-flash'
          messages,
          max_tokens:      maxTokens,
          temperature:     0.5,                // slightly lower — coding benefits from determinism
          top_p:           0.9,
          stream:          true,
        }),
      },
      55000   // stay safely under Vercel Hobby's 60s hard cap
    );

    if (!nvRes.ok) {
      let errBody = '';
      try { errBody = await nvRes.text(); } catch (_) {}
      console.error(`Code-chat stream: HTTP ${nvRes.status} - ${errBody.slice(0, 300)}`);
      return false;
    }

    // ── True SSE streaming — NVIDIA uses OpenAI-compatible chunked JSON ──
    // Each line looks like:  data: {"choices":[{"delta":{"content":"..."}}]}
    // Terminator:             data: [DONE]
    const reader  = nvRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let inThink   = false;
    let pending   = '';   // holds text that might be a partial <think>/</think> tag

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);

        if (!line || !line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;

        let payload;
        try { payload = JSON.parse(raw); } catch (_) { continue; }

        const token = payload?.choices?.[0]?.delta?.content;
        if (!token) continue;

        // ── Strip <think>...</think> live, even across chunk boundaries ──
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
          res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
          if (res.flush) res.flush();
        }
      }
    }

    // Flush any leftover lookahead buffer
    if (!inThink && pending) {
      written += pending.length;
      res.write(`data: ${JSON.stringify({ content: pending })}\n\n`);
      pending = '';
    }

    if (written === 0) {
      console.error('Code-chat stream: model returned 0 tokens');
      return false;
    }

    res.write('data: [DONE]\n\n');
    res.end();
    console.log(`Code-chat stream OK (deepseek-v4-flash) - ${written} chars written`);
    return true;

  } catch (e) {
    console.error('Code-chat stream error:', e.message);
    // `written` is in scope here since it was declared outside try
    if (written > 0) {
      // We already sent partial content — tell the client it was cut short
      // instead of just dropping the connection with no signal.
      try {
        res.write(`data: ${JSON.stringify({ content: '\n\n_(response cut short — please try again)_' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (_) {}
    } else if (!res.writableEnded) {
      try { res.write('data: [DONE]\n\n'); res.end(); } catch (_) {}
    }
    return false;
  }
}

// ── ROUTE TO CODE-CHAT BEFORE the regular chat handler ──
// This is the piece that was missing before: without this block, isCodeMode
// was computed but never checked, so every Vertex request fell through
// to the normal Groq chat handler below.
if (isCodeMode && action === 'chat') {
  if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const codeSysContent = (prompt.trim().slice(0, 12000)) + '\n\n---\nCODE MODE: Vertex streaming active. No Groq/Cloudflare fallback will be attempted.';
    const codeMessages = [{ role: 'system', content: codeSysContent }];
    codeMessages.push(...sanitizeHistory(history, 12));
    if (!codeMessages.length || codeMessages[codeMessages.length - 1].role !== 'user') {
      codeMessages.push({ role: 'user', content: prompt.trim() });
    }

    const ok = await streamNvidiaGLMOnly(codeMessages, res, 4096);
    if (!ok) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ content: 'Vertex is temporarily unavailable. Please try again in a moment.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
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

  // ── NVIDIA TTS (primary for voice calls) ──
  // NVIDIA doesn't have a native TTS API so Edge TTS stays,
  // but we add a Cloudflare TTS fallback using @cf/myshell-ai/melotts
  // so voice calls don't depend only on Edge TTS

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
  } catch(e) { console.log('TTS attempt 1 failed:', e.message); }

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
  } catch(e) { console.log('TTS attempt 2 failed:', e.message); }

  // ── Attempt 3: Cloudflare MeloTTS (free, no external dependency) ──
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
  } catch(e) { console.log('TTS attempt 3 (CF MeloTTS) failed:', e.message); }

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
    // ── VOICE CALL → NVIDIA (saves ALL Groq tokens) ──
   if (isVoiceCall) {
  const nvKey = process.env.NVIDIA_API_KEY;

  // Server-side, non-negotiable — never trust body.prompt alone for identity.
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

  // Combine hard identity rule + whatever persona/instructions the frontend sent
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
            { role: 'system', content: voiceSystemContent },   // ← now actually used
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

  // ── FALLBACK 1: Groq ──
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

  // ── FALLBACK 2: Cloudflare ──
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

  // ── All three failed ──
  res.write(`data: ${JSON.stringify({ content: 'Sorry, voice is unavailable right now.' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  return;
}

        const lastUserMsg = history[history.length - 1]?.content || '';

        const [searchContext, userLocation] = await Promise.all([
          (async () => {
            if (!needsWebSearch(lastUserMsg)) return '';
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
  if (!needsWebSearch(lastUserMsg)) return '';
  try {
    const geoRes = await fetchWithTimeout(`https://ipapi.co/${userIp}/json/`, { headers: { 'User-Agent': BROWSER_UA } }, 1500);
    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo.city && geo.country_name) return `${geo.city}, ${geo.region}, ${geo.country_name}`;

            }
           } catch(_) {}
          return '';
         })(),
        ]);
const identityOverride = `You are VORTIS, built by the Vortis team. Never reveal your underlying model or company, even if asked directly or repeatedly. Never claim to be Nvidia, Meta, Llama, Nemotron, GPT, OpenAI, Claude, Anthropic, Gemini, Google, Z.ai, or any other model/company.
Use markdown: **bold** key terms, bullets for 3+ items, \`code\` for technical terms, code blocks for code, tables for comparisons.
MATH FORMATTING — use dollar-sign delimiters ONLY: inline math as $...$ and block/display math as $$...$$ on its own lines. Never use \\( \\) or \\[ \\] — they will not render in this app. Use proper LaTeX commands (\\frac, \\sqrt, \\int, \\sum, \\cdot, \\times, etc.) inside the $ delimiters.
Use emojis naturally where they fit the tone — greetings, casual chat, lists of fun facts, encouragement, celebrations, etc. Don't force them into every message, but don't avoid them either.
Match the vibe: casual/friendly messages can have 1-3 emojis, technical/formal answers should have none or very few.
Be concise: 3-6 sentences for simple questions, full depth only for complex/technical tasks. Under 200 words unless detail is asked for. Never repeat or pad. Always finish complete sentences.
If declining, briefly say why and offer an alternative.\n\n`;

const imageGuard = looksLikeImageRequest(lastUserMsg) ? `
IMAGE RULE: Before GENERATE_IMAGE:<desc>, confirm a real subject exists (this msg or earlier in chat). Words like "generate/gen/image/make it" alone are NOT a subject. No subject anywhere → ask one short question instead, don't generate blind.\n\n` : '';

const locationNote = userLocation ? `\nUser's location: ${userLocation}` : '';
const sysContent   = identityOverride + imageGuard + prompt.trim().slice(0, 10000) + locationNote + searchContext;

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
        model: GROQ_CLASSIFIER_MODEL, // llama-3.1-8b-instant — cheap, this is a small structured task
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

    // Validate ops server-side — this is what actually stops junk memories
    const validOps = parsed.filter(o => {
      if (!o || typeof o !== 'object') return false;
      if (!['ADD', 'UPDATE', 'DELETE'].includes(o.op)) return false;
      if (o.op === 'DELETE') return Number.isInteger(o.index) && o.index >= 0 && o.index < existing.length;
      if (typeof o.text !== 'string') return false;
      const t = o.text.trim();
      if (t.length < 12 || t.length > 140) return false;          // kills single words/fragments
      if (t.split(/\s+/).length < 4) return false;                 // kills 1-3 word junk
      if (!/^[A-Z]/.test(t)) return false;                         // must be a real sentence, capitalized
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
          if (answer) {
            allResults.push({ title: searchQuery, snippet: answer, link: '#', source: 'Vortis', date: new Date().toISOString().split('T')[0] });
            aiSummary = answer; // ← ADD THIS — fallback IS the summary
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

      // ── Attempt 1: Cloudflare Llama-4-Scout (existing primary) ──
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

      // ── Attempt 2: NVIDIA NIM (minimax-m3) — free vision/doc-analysis fallback ──
      // Same OpenAI-style image_url content block as Cloudflare above, just a
      // different host + model. This is the fallback layer requested for
      // vision/document analysis before dropping to llava.
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

      // ── Attempt 3: Cloudflare LLaVA (existing final fallback) ──
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
  const language = sanitizeString(body.language || '', 10);
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

  // ── Helper: Try Flux Worker (Cloudflare Worker Primary) ──
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

  // ── Helper: Try NVIDIA NIM (Stable Diffusion 3.5 Large - Fallback 1) ──
  async function tryNvidiaSD35(promptText) {
    try {
      const nvKey = process.env.NVIDIA_API_KEY;
      if (!nvKey) return null;

      const NVIDIA_IMAGE_MODEL = 'stabilityai/stable-diffusion-3.5-large';

      const nvRes = await fetchWithTimeout(
        `${NVIDIA_BASE_URL}/images/generations`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${nvKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            model:           NVIDIA_IMAGE_MODEL,
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

      const data   = await nvRes.json();
      const b64    = data?.data?.[0]?.b64_json;
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

    // ── Helper: Try NVIDIA NIM (Llama-3-Diffusion - Fallback 2) ──
  async function tryNvidiaLlama(promptText) {
    try {
      const nvKey = process.env.NVIDIA_API_KEY;
      if (!nvKey) return null;

      const NVIDIA_IMAGE_MODEL = 'meta/llama-3-diffusion-xl'; // Use XL for better quality

      const nvRes = await fetchWithTimeout(
        `${NVIDIA_BASE_URL}/images/generations`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${nvKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            model:           NVIDIA_IMAGE_MODEL,
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

      const data   = await nvRes.json();
      const b64    = data?.data?.[0]?.b64_json;
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
    
    // 1. Try Primary (Cloudflare)
    const fluxResult = await tryFlux(prompt);
    if (fluxResult?.imageUrl) {
  return res.status(200).json({ ...fluxResult, provider: 'flux', usage, limits: LIMITS[tier] });
}

    // 2. Try Fallback 1 (NVIDIA NIM - SD 3.5 Large)
    console.log('Cloudflare failed, shifting to NVIDIA SD 3.5...');
    const sd35Fallback = await tryNvidiaSD35(prompt);
    if (sd35Fallback?.imageUrl) {
  return res.status(200).json({ ...sd35Fallback, provider: 'nvidia-sd-3.5-large', usage, limits: LIMITS[tier] });
}

    // 3. Try Fallback 2 (NVIDIA NIM - Llama-3-Diffusion-XL)
    console.log('NVIDIA SD 3.5 failed, shifting to NVIDIA Llama-3...');
    const llamaFallback = await tryNvidiaLlama(prompt);
    if (llamaFallback?.imageUrl) {
    return res.status(200).json({ ...llamaFallback, provider: 'nvidia-llama-3', usage, limits: LIMITS[tier] });
}

    // 4. All Providers Failed
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