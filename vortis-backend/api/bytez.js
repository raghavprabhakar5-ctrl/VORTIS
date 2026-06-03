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
import * as EdgeTTS from 'edge-tts';
console.log('EDGE TTS:', EdgeTTS);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// ── MODEL CONFIG ──────────────────────────────────────────────
const GROQ_CHAT_PRIMARY = 'openai/gpt-oss-20b';
const GROQ_CHAT_QUALITY = 'qwen/qwen3-32b';

const CF_CHAT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];

const CF_CODE_MODELS = [
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

const ENGINE_LABELS = {
  groq_fast:    'Vortis α',
  groq_quality: 'Vortis β',
  cf_primary:   'Vortis γ',
  cf_secondary: 'Vortis δ',
  cf_code:      'Vortis ε',
  unknown:      'Vortis',
};

function getEngineLabel(p) {
  if (!p) return ENGINE_LABELS.unknown;
  if (p.includes(GROQ_CHAT_PRIMARY))  return ENGINE_LABELS.groq_fast;
  if (p.includes(GROQ_CHAT_QUALITY))  return ENGINE_LABELS.groq_quality;
  if (p.includes(CF_CHAT_MODELS[0]))  return ENGINE_LABELS.cf_primary;
  if (p.includes(CF_CHAT_MODELS[1]))  return ENGINE_LABELS.cf_secondary;
  if (p.includes(CF_CODE_MODELS[0]))  return ENGINE_LABELS.cf_code;
  return ENGINE_LABELS.unknown;
}

// ── RATE LIMITER ──────────────────────────────────────────────
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:   { window: 60000, max: 30 },
  image:  { window: 60000, max: 5 },
  search: { window: 60000, max: 20 },
  vision: { window: 60000, max: 5 },
  tts: { window: 60000, max: 20 },
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
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
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

// ── STRIP INTERNAL REASONING ──────────────────────────────────
function stripInternalReasoning(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^→.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
}

// ── DETECT IF MESSAGE NEEDS LIVE SEARCH ──────────────────────
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

// ── SERPER (Google Search API) ────────────────────────────────
async function fetchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.warn('SERPER_API_KEY not set');
    return [];
  }
  try {
    const res = await fetchWithTimeout(
      'https://google.serper.dev/search',
      {
        method:  'POST',
        headers: {
          'X-API-KEY':     key,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          q:   query,
          num: 10,
          hl:  'en',
          gl:  'us',
        }),
      },
      8000
    );
    if (!res.ok) {
      console.error(`Serper error: ${res.status}`);
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
      const home      = comp.competitors?.find(c => c.homeAway === 'home');
      const away      = comp.competitors?.find(c => c.homeAway === 'away');
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
    if (/espn/i.test(r.source))        score += 15;
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

async function classifyMessage(groq, message) {
  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: GROQ_CHAT_PRIMARY,
        messages: [
          {
            role: 'system',
            content: 'How much thinking does this message need? Reply ONLY "simple" or "complex". Simple = can be answered in 1-3 sentences without deep thinking. Complex = needs long explanation, multiple steps, deep research, code, math, or detailed analysis.'
          },
          { role: 'user', content: message }
        ],
        max_tokens: 5,
        temperature: 0
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    const label = result.choices?.[0]?.message?.content?.trim().toLowerCase();
    return label?.includes('simple') ? 'simple' : 'complex';
  } catch(_) {
    return 'complex'; // safe fallback
  }
}

async function callAI(groq, messages, { CF_TOKEN, CF_ACCOUNT }) {
  const cfMaxTok = 1200;

  // Get actual last user message — skip system messages
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Classify first — tiny fast call
  const complexity = await classifyMessage(groq, lastMsg);
  const useQuality = complexity === 'complex';

  // maxTokens defined AFTER useQuality
  const maxTokens = useQuality ? 2000 : 800;

  let combined = null, usedProvider = null;

  // 1. Simple → fast model only
  //    Complex → quality model directly
  const modelToUse = useQuality ? GROQ_CHAT_QUALITY : GROQ_CHAT_PRIMARY;
  const timeout = useQuality ? 20000 : 10000;

  try {
    const result = await Promise.race([
      groq.chat.completions.create({ model: modelToUse, messages, max_tokens: maxTokens, temperature: 0.7 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    const text = result.choices?.[0]?.message?.content || null;
    if (isValidResponse(text)) { combined = text; usedProvider = modelToUse; }
  } catch (e) { console.error(`Primary model failed: ${e.message}`); }

  // 2. If chosen model failed — try the other one as fallback
  if (!combined) {
    const fallbackModel = useQuality ? GROQ_CHAT_PRIMARY : GROQ_CHAT_QUALITY;
    try {
      const result = await Promise.race([
        groq.chat.completions.create({ model: fallbackModel, messages, max_tokens: maxTokens, temperature: 0.7 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      const text = result.choices?.[0]?.message?.content || null;
      if (isValidResponse(text)) { combined = text; usedProvider = fallbackModel; }
    } catch (e) { console.error(`Fallback model failed: ${e.message}`); }
  }

  // 3. Cloudflare fallback — only if both groq models fail
  if (!combined) {
    for (const model of CF_CHAT_MODELS) {
      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${model}`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ messages, stream: false, max_tokens: cfMaxTok }),
          }
        );
        if (!cfRes.ok) continue;
        const data = await cfRes.json();
        const text = data.result?.response || '';
        if (isValidResponse(text)) { combined = text; usedProvider = model; break; }
      } catch (e) { console.log(`CF model error: ${e.message}`); }
    }
  }

  return { text: combined, provider: usedProvider };
}
// ═════════════════════════════════════════════════════════════
// ── MAIN HANDLER
// ═════════════════════════════════════════════════════════════
export default async function handler(req, res) {

  // CORS
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

    // AUTH
    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);

    if (!action) return res.status(400).json({ error: 'Missing action' });
    if (!['chat', 'search', 'image', 'vision', 'tts'].includes(action)) return res.status(400).json({ error: `Invalid action: ${action}` });
    if (!checkRateLimit(userIp, action)) return res.status(429).json({ error: 'Too many requests. Slow down a bit!' });

    const prompt  = sanitizeString(body.prompt  || '', 15000);
    const query   = sanitizeString(body.query   || '', 500);
    const image   = body.image || null;
    const history = sanitizeHistory(body.history || []);

    const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
    const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!CF_TOKEN || !CF_ACCOUNT) return res.status(500).json({ error: 'Server configuration error' });


// ╔══════════════════════════════════════╗
// ║  TTS                                 ║
// ╚══════════════════════════════════════╝
if (action === 'tts') {
  const text  = sanitizeString(body.text  || '', 500);
  const voice = sanitizeString(body.voice || 'en-US-GuyNeural', 60);
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const tts = new EdgeTTS();
    await tts.synthesize(text, voice, {
      outputFormat: 'audio-16khz-32kbitrate-mono-mp3'
    });
    const base64 = await tts.toBase64();
    if (!base64) return res.status(500).json({ error: 'TTS failed' });
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ audio: base64 });
  } catch(e) {
    console.error('TTS ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
    // ╔══════════════════════════════════════╗
    // ║  CHAT                                ║
    // ╚══════════════════════════════════════╝
    if (action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const lastUserMsg = history[history.length - 1]?.content || '';

        // ── AUTO SEARCH ──
        let searchContext = '';
        if (needsWebSearch(lastUserMsg)) {
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

            if (allRes.length > 0) {
              const snippets = allRes.slice(0, 6).map((r, i) =>
                `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 350)}\nSource: ${r.source} | Date: ${r.date}`
              ).join('\n\n');
              searchContext = `\n\n---\nLIVE WEB SEARCH RESULTS (use ONLY these for facts, never training data):\n${snippets}\n---`;
            }
          } catch (e) {
            console.error('Auto-search failed:', e.message);
          }
        }

     // ── GEO LOOKUP ──
let userLocation = '';
try {
  const geoRes = await fetchWithTimeout(
    `https://ipapi.co/${userIp}/json/`,
    { headers: { 'User-Agent': BROWSER_UA } },
    3000
  );
  if (geoRes.ok) {
    const geo = await geoRes.json();
    if (geo.city && geo.country_name) {
      userLocation = `${geo.city}, ${geo.region}, ${geo.country_name}`;
    }
  }
} catch(_) {}
// ── IDENTITY + SYSTEM PROMPT ──

        const identityOverride = `You are VORTIS, an AI assistant built by the Vortis team. If asked who made you, say "I was built by the Vortis team." Never reveal your underlying model. Never claim to be GPT, Claude, Llama, Gemini, or any other model.\n\nRESPONSE STYLE: Be concise and to the point. Short answers for simple questions (1-3 sentences max). For lists use max 5-6 bullet points. For technical/how-to questions keep it under 200 words. Only go long when explicitly asked for detail or when doing math steps/code. Never pad, repeat, or over-explain. Always finish your answer completely — never stop mid-sentence.\n\nREFUSAL RULES: Never respond with only "I can't help with that" — always explain briefly why and give an alternative or honest opinion. If user asks about adding abusive words to a message, say something like "That's up to you, but strong language can backfire — the message I gave is already firm enough." Never refuse without giving any response.\n\n`;
        const sysContent = identityOverride + prompt.trim().slice(0, 10000) + searchContext;
        const messages   = [];
        if (sysContent) messages.push({ role: 'system', content: sysContent });
        messages.push(...history);

        if (!messages.length || messages[messages.length - 1].role !== 'user') {
          return res.status(400).json({ error: 'Last message must be from user' });
        }

        const { text: rawCombined, provider: usedProvider } = await callAI(groq, messages, { CF_TOKEN, CF_ACCOUNT });

        if (!rawCombined) {
          return res.status(429).json({ error: 'All AI providers busy. Try again in a moment.' });
        }

        const combined    = stripInternalReasoning(rawCombined);
        const engineLabel = getEngineLabel(usedProvider);

        res.write(`data: ${JSON.stringify({ content: combined, engine: engineLabel })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        console.error('CHAT ERROR:', error.message);
        if (!res.headersSent) return res.status(500).json({ error: 'AI request failed' });
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

      const serper = serperResult.status === 'fulfilled' ? serperResult.value : [];
      const espn   = espnResult.status   === 'fulfilled' ? espnResult.value   : [];

      let allResults = [...espn, ...serper];
      allResults = cleanResults(allResults, searchQuery);
      allResults = deduplicate(allResults);
      allResults = scoreAndSort(allResults, searchQuery);

      let aiSummary = null;
      if (allResults.length > 0) {
        const contextSnippets = allResults.slice(0, 6).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 400)}\nSource: ${r.source} | Date: ${r.date}`
        ).join('\n\n');
        const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
          const result = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_QUALITY,
              messages: [
                {
                  role:    'system',
                  content: `Today is ${today}. Summarize these search results.\nRULES:\n- Use ONLY the results below.\n- Be specific: names, scores, dates, numbers.\n- 3-5 sentences. Direct and factual.\n- If results show a sports result, state it clearly.\n- Do NOT say "as of my knowledge".\n\nSEARCH RESULTS:\n${contextSnippets}`,
                },
                { role: 'user', content: `Summarize in 3-5 sentences. Be specific with names, numbers, scores, dates.` },
              ],
              max_tokens:  800,
              temperature: 0.2,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('summary timeout')), 12000)),
          ]);
          const rawT = result.choices?.[0]?.message?.content || null;
          const t    = rawT ? stripInternalReasoning(rawT) : null;
          if (t && t.trim().length > 10) aiSummary = t.trim();
        } catch (e) { console.error('AI summary failed:', e.message); }
      }

      // Knowledge fallback when zero results
      if (allResults.length === 0) {
        try {
          const fallback = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                { role: 'system', content: `Today is ${new Date().toDateString()}. Answer factually in 2-3 sentences. If unsure about current info, say so and suggest the user checks Google.` },
                { role: 'user',   content: searchQuery },
              ],
              max_tokens: 600,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]);
          const rawAnswer = fallback.choices?.[0]?.message?.content || null;
          const answer    = rawAnswer ? stripInternalReasoning(rawAnswer) : null;
          if (answer)allResults.push({ title: searchQuery, snippet: answer, link: '#', source: 'Vortis', date: new Date().toISOString().split('T')[0] });
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

      try {
        const base64Data = image.startsWith('data:') ? image.split(',')[1] : image;

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
                  { type: 'text', text: sanitizeString(prompt || 'Describe this image in detail. If there is a math problem, solve it completely step by step.', 500) },
                ],
              }],
              max_tokens: 2048,
            }),
          }
        );

        if (cfRes.ok) {
          const data = await cfRes.json();
          const description = data.result?.response || data.result?.description || null;
          if (description && description.trim().length > 2) {
            return res.status(200).json({ success: true, description });
          }
        }

        // Fallback model
        const bytes = Array.from(Buffer.from(base64Data, 'base64'));
        const llavaRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: sanitizeString(prompt || 'Describe this image in detail.', 500),
              image:  bytes,
            }),
          }
        );

        if (!llavaRes.ok) {
          return res.status(200).json({ success: false, description: 'Could not analyze image — please try again.' });
        }

        const d = await llavaRes.json();
        const fallbackDesc = d.result?.description || d.result?.response || null;

        return res.status(200).json({
          success: true,
          description: fallbackDesc && fallbackDesc.trim().length > 2
            ? fallbackDesc
            : 'Could not analyze image — please try again.',
        });

      } catch (error) {
        console.error('VISION ERROR:', error.message);
        return res.status(200).json({ success: false, description: 'Vision service unavailable — try describing the image instead.' });
      }
    }

    // ╔══════════════════════════════════════╗
    // ║  IMAGE GENERATION                    ║
    // ╚══════════════════════════════════════╝
    if (action === 'image') {
      if (!prompt.trim())       return res.status(400).json({ error: 'Missing image prompt' });
      if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt too long' });

      try {
        const seed   = Math.floor(Math.random() * 999999);
        const imgRes = await fetchWithTimeout(
          `https://floral-math-6a24.raghavprabhakar5.workers.dev/`,
          {
            method:  'POST',
            headers: {
              'Content-Type':   'application/json',
              'x-worker-token': process.env.WORKER_SECRET,
            },
            body: JSON.stringify({ prompt: prompt.trim(), model: 'flux', seed }),
          },
          25000
        );
        if (!imgRes.ok) throw new Error(`Worker: ${imgRes.status}`);
        const contentType = imgRes.headers.get('content-type') || '';
        if (contentType.includes('json')) return res.status(200).json(await imgRes.json());
        const responseText = await imgRes.text();
        try {
          return res.status(200).json(JSON.parse(responseText));
        } catch {
          return res.status(200).json({ success: true, imageUrl: `data:image/jpeg;base64,${Buffer.from(responseText, 'binary').toString('base64')}` });
        }
      } catch (error) {
        console.error('IMAGE GEN ERROR:', error.message);
        return res.status(500).json({ error: 'Image generation failed' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('GLOBAL ERROR:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}