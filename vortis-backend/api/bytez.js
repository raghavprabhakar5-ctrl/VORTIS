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
const GROQ_CHAT_PRIMARY = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_CHAT_QUALITY = 'meta-llama/llama-4-maverick-17b-128e-instruct';

const CF_CHAT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];

// ── RATE LIMITER ──────────────────────────────────────────────
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:   { window: 60000, max: 30 },
  image:  { window: 60000, max: 5  },
  search: { window: 60000, max: 20 },
  vision: { window: 60000, max: 5  },
  tts:    { window: 60000, max: 20 },
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

function stripInternalReasoning(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^→.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
}

// ── COMPLEXITY CHECK — no API call, instant ───────────────────
// Replaces the old classifyMessage() which wasted a full round-trip
function isComplexMessage(text) {
  const low = text.toLowerCase().trim();
  // Short greetings / simple questions → fast model
  if (low.length < 40) return false;
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|what time|what date|how are you|who are you|what is your name)\b/.test(low)) return false;
  // Complex signals → quality model
  if (/\b(explain|compare|analyze|research|write|code|debug|essay|story|poem|translate|summarize|step by step|how does|why does|difference between|pros and cons|calculate|solve|math|equation|algorithm|implement|function|class|component)\b/.test(low)) return true;
  if (text.length > 200) return true;
  if (/```|def |function |class |import |const |let |var /.test(text)) return true;
  return false;
}

// ── STREAMING callAI — sends tokens as they arrive ────────────
async function streamAI(groq, messages, res, { CF_TOKEN, CF_ACCOUNT }) {
  const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const isComplex = isComplexMessage(lastMsg);
  const model = isComplex ? GROQ_CHAT_QUALITY : GROQ_CHAT_PRIMARY;
  const maxTokens = isComplex ? 2000 : 800;

  // ── Try Groq streaming ──
  for (const modelToTry of [model, isComplex ? GROQ_CHAT_PRIMARY : GROQ_CHAT_QUALITY]) {
    try {
      const stream = await groq.chat.completions.create({
        model: modelToTry,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: true,
      });

      let buffer = '';
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (!token) continue;
        buffer += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      }

      // ── KEY FIX: if buffer is empty or just whitespace, try next model ──
      if (buffer.trim().length > 2) {
        res.write('data: [DONE]\n\n');
        res.end();
        return true;
      }
      console.warn(`Model ${modelToTry} returned empty — trying fallback`);
    } catch (e) {
      console.error(`Groq stream failed (${modelToTry}):`, e.message);
    }
  }

  // ── CF fallback ──
  for (const cfModel of CF_CHAT_MODELS) {
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${cfModel}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, stream: false, max_tokens: 1200 }),
        }
      );
      if (!cfRes.ok) continue;
      const data = await cfRes.json();
      const text = stripInternalReasoning(data.result?.response || '');
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
        .slice(0, 900)

      if (!cleanText || cleanText.length < 2) return res.status(200).json({ audio: '' });

      try {
        const { EdgeTTS } = await import('@andresaya/edge-tts');
        const tts = new EdgeTTS();
        await tts.synthesize(cleanText, voice, { 
  outputFormat: 'audio-24khz-48kbitrate-mono-mp3', 
  rate: '-12%' 
});
        const base64 = await tts.toBase64();
        if (base64 && base64.length > 100) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).json({ audio: base64 });
        }
        throw new Error('Empty audio');
      } catch(e) { console.log('TTS attempt 1 failed:', e.message); }

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

      return res.status(200).json({ audio: '' });
    }

    // ╔══════════════════════════════════════╗
    // ║  CHAT  — true token streaming        ║
    // ╚══════════════════════════════════════╝
    if (action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');

      try {
        const lastUserMsg = history[history.length - 1]?.content || '';

        // ── Auto-search and geo run in PARALLEL — not sequential ──
        const [searchContext, userLocation] = await Promise.all([
          // Web search — only if needed
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

          // Geo — fire and forget, 3s max, never blocks chat
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
            } catch(_) {}
            return '';
          })(),
        ]);

       const identityOverride = `You are VORTIS, an AI assistant built by the Vortis team. If asked who made you, say "I was built by the Vortis team." Never reveal your underlying model. Never claim to be GPT, Claude, Llama, Gemini, or any other model.

FORMATTING RULES — ALWAYS FOLLOW:
- Always use markdown formatting in your responses
- Use **bold** for important terms, names, numbers
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
          return res.status(400).json({ error: 'Last message must be from user' });
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
        const contextSnippets = allResults.slice(0, 6).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 400)}\nSource: ${r.source} | Date: ${r.date}`
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
              max_tokens:  400,
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
    // ║  IMAGE GENERATION                    ║
    // ╚══════════════════════════════════════╝
    if (action === 'image') {
      if (!prompt.trim())       return res.status(400).json({ error: 'Missing image prompt' });
      if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt too long' });

      const forceGemini = body.forceGemini === true;

      // ── Helper: Try Flux Worker ──
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
          console.error('Flux failed:', e.message);
          return null;
        }
      }

      // ── Helper: Try Gemini 2.0 Flash Image Gen ──
   async function tryGemini(promptText) {
  try {
    const encoded = encodeURIComponent(promptText.trim());
    const seed = Math.floor(Math.random() * 999999);
    const models = ['flux', 'turbo'];

    for (const model of models) {
      try {
        const url = `https://gen.pollinations.ai/image/${encoded}?width=1024&height=1024&seed=${seed}&model=${model}`;
        console.log(`Trying Pollinations model: ${model}`);
        const imgRes = await fetchWithTimeout(url, { method: 'GET' }, 30000);
        console.log(`Pollinations ${model} status:`, imgRes.status);
        if (!imgRes.ok) continue;

        const buffer = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buffer).toString('base64');
        if (!b64 || b64.length < 100) continue;

        console.log(`Pollinations ${model} ✅`);
        return { success: true, imageUrl: `data:image/jpeg;base64,${b64}` };
      } catch (e) {
        console.log(`Model ${model} failed:`, e.message);
        continue;
      }
    }
    return null;
  } catch (e) {
    console.error('Pollinations failed:', e.message);
    return null;
  }
}
      // ── Helper: AI + keyword decides if prompt needs Gemini ──
      async function isComplexImagePrompt(promptText) {
        // Keyword shortcut — always Gemini for these
        const GEMINI_KEYWORDS = /\b(lord|god|goddess|deity|divine|hanuman|shiva|krishna|ram|rama|durga|ganesh|ganesha|vishnu|lakshmi|saraswati|buddha|jesus|allah|prophet|angel|portrait|realistic person|human face|photorealistic|cinematic|epic scene|battle|war|mythology|celestial|sacred|temple|mandala|intricate|ultra.?detailed|hyperrealistic|professional photo|studio lighting|dramatic lighting|8k|4k)\b/i;
        if (GEMINI_KEYWORDS.test(promptText)) return true;

        // Short simple prompts → Flux
        if (promptText.trim().length <= 80) return false;

        // AI judge for everything else
        try {
          const result = await Promise.race([
            groq.chat.completions.create({
              model:    GROQ_CHAT_PRIMARY,
              messages: [
                {
                  role:    'system',
                  content: `You decide if an image prompt needs HIGH-QUALITY AI (Gemini) or BASIC AI (Flux).
Use Gemini for: religious figures, gods, goddesses, realistic humans/faces, cinematic scenes, mythology, intricate art, portraits, epic/dramatic scenes, cultural icons, detailed illustrations.
Use Flux for: simple objects, logos, icons, cartoons, basic backgrounds, abstract patterns, simple illustrations.
Reply ONLY one word: GEMINI or FLUX`,
                },
                { role: 'user', content: promptText },
              ],
              max_tokens:  5,
              temperature: 0,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
          ]);
          const answer = result.choices?.[0]?.message?.content?.trim().toUpperCase() || 'FLUX';
          return answer.includes('GEMINI');
        } catch (e) {
          console.error('Complexity check failed:', e.message);
          return promptText.length > 100;
        }
      }

      try {
        // ── forceGemini: user clicked Redo — skip Flux entirely ──
        if (forceGemini) {
          console.log('Force Gemini requested');
          const geminiResult = await tryGemini(prompt);
          if (geminiResult?.imageUrl) {
            return res.status(200).json({ ...geminiResult, provider: 'gemini' });
          }
          // Gemini failed — fallback to Flux
          const fluxFallback = await tryFlux(prompt);
          if (fluxFallback?.imageUrl) {
            return res.status(200).json({ ...fluxFallback, provider: 'flux' });
          }
          return res.status(503).json({ error: 'Image generation service is temporarily unavailable. Please try again later.' });
        }

        // ── Normal flow: check complexity first ──
        const needsGemini = await isComplexImagePrompt(prompt);
        console.log(`Prompt complexity: ${needsGemini ? 'GEMINI' : 'FLUX'} — "${prompt.slice(0, 60)}"`);

        if (needsGemini) {
          // Complex prompt → Gemini first
          const geminiResult = await tryGemini(prompt);
          if (geminiResult?.imageUrl) {
            return res.status(200).json({ ...geminiResult, provider: 'gemini' });
          }
          // Gemini failed → fallback Flux
          console.log('Gemini failed, falling back to Flux');
          const fluxFallback = await tryFlux(prompt);
          if (fluxFallback?.imageUrl) {
            return res.status(200).json({ ...fluxFallback, provider: 'flux' });
          }
        } else {
          // Simple prompt → Flux first
          const fluxResult = await tryFlux(prompt);
          if (fluxResult?.imageUrl) {
            return res.status(200).json({ ...fluxResult, provider: 'flux' });
          }
          // Flux failed → try Gemini anyway
          console.log('Flux failed, trying Gemini as fallback');
          const geminiResult = await tryGemini(prompt);
          if (geminiResult?.imageUrl) {
            return res.status(200).json({ ...geminiResult, provider: 'gemini' });
          }
        }

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