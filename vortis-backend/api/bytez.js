export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// ══════════════════════════════════════════════════════════════
// ── NVIDIA NIM CONFIG
// ══════════════════════════════════════════════════════════════
const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// ── CHAT MODELS ───────────────────────────────────────────────
// Best free endpoint models as of 2026 — confirmed free tier
// 
// HARD tasks (coding, debug, reasoning):
//   - minimax-m2.7: 230B params, 11M+ uses, BEST all-around free model
//   - qwen3-coder-480b: purpose-built coding, 256K context, insane for code
//
// MEDIUM tasks (general chat, explanation, writing):
//   - mistral-nemotron: best function-calling free model at any price
//   - step-3.5-flash: 200B reasoning, fast, very efficient on tokens
//
// FAST tasks (quick replies, classifier, summaries):
//   - glm-5.1: lightweight, efficient, multilingual, low token usage
//   - llama-4-maverick: most popular on NIM, 22M uses, great general model

const NIM_HARD   = 'minimax/minimax-m2.7';            // 230B — best coding + reasoning
const NIM_CODER  = 'qwen/qwen3-coder-480b-a35b-instruct'; // 480B — best pure coding
const NIM_MEDIUM = 'mistralai/mistral-nemotron';       // best function calling
const NIM_FAST   = 'stepfun-ai/step-3.5-flash';       // fast + efficient tokens
const NIM_MINI   = 'z-ai/glm-5.1';                    // tiny, very fast, low tokens

// ── VISION MODEL ──────────────────────────────────────────────
// MiniMax M3 Preview — multimodal, reasoning + vision + tool calling
const NIM_VISION = 'minimax/minimax-m3-preview';

// ── IMAGE GENERATION ──────────────────────────────────────────
// Flux Dev — best quality free image gen on NIM
const NIM_IMAGE  = 'black-forest-labs/flux-dev';

// ── TTS ───────────────────────────────────────────────────────
// Magpie TTS — 23 languages, natural voices
const NIM_TTS    = 'magpie-tts/multilingual-2.0';

// ── STT ───────────────────────────────────────────────────────
// Parakeet — NVIDIA's own fast ASR model
const NIM_STT    = 'nvidia/parakeet-ctc-0.6b-asr';

// ── TOKEN BUDGETS (keep low to respect 40 RPM limit) ──────────
// Shorter responses = faster = more requests stay under rate limit
const TOKENS = {
  hard:   2000, // coding / deep reasoning
  medium: 800,  // general chat
  fast:   300,  // quick replies, summaries
};

// ══════════════════════════════════════════════════════════════
// ── RATE LIMITER
// ══════════════════════════════════════════════════════════════
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:   { window: 60000, max: 25 },
  image:  { window: 60000, max: 4  },
  search: { window: 60000, max: 20 },
  vision: { window: 60000, max: 4  },
  tts:    { window: 60000, max: 15 },
  stt:    { window: 60000, max: 10 },
};

setInterval(() => {
  const now = Date.now();
  for (const [key, requests] of rateLimiter.entries()) {
    const recent = requests.filter(t => now - t < 60000);
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

// ══════════════════════════════════════════════════════════════
// ── SANITIZATION
// ══════════════════════════════════════════════════════════════
function sanitizeString(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '');
}

function sanitizeHistory(history, maxMessages = 20) {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxMessages)
    .filter(m => m && typeof m === 'object' && m.role && m.content)
    .map(m => ({
      role:    ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user',
      content: sanitizeString(String(m.content), 6000),
    }));
}

function isValidBase64Image(str) {
  if (!str || typeof str !== 'string') return false;
  const validPrefixes = [
    'data:image/jpeg;base64,', 'data:image/jpg;base64,',
    'data:image/png;base64,',  'data:image/webp;base64,',
  ];
  return validPrefixes.some(p => str.startsWith(p));
}

function isImageTooLarge(base64str) {
  const raw = base64str.startsWith('data:') ? base64str.split(',')[1] : base64str;
  return (raw.length * 3) / 4 > 5 * 1024 * 1024;
}

function stripThinking(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*\n/gm, '\n')
    .trim();
}

// ══════════════════════════════════════════════════════════════
// ── TIER CLASSIFIER (local, no extra API call = saves RPM!)
// ══════════════════════════════════════════════════════════════
function classifyTier(text) {
  const low = text.toLowerCase().trim();

  // Fast tier — simple/short
  if (low.length < 40) return 'fast';
  if (/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|how are you|who are you|what is your name)\b/.test(low)) return 'fast';

  // Hard tier — coding / deep reasoning
  if (/```|def |function |class |import |const |let |var |=>/.test(text)) return 'hard';
  if (/\b(debug|fix this|error|exception|algorithm|refactor|optimize|implement|code|coding|programming|script)\b/.test(low)) return 'hard';
  if (/\b(explain in detail|step by step|compare|analyze|architecture|design|math|equation|calculate)\b/.test(low)) return 'hard';

  // Medium tier — everything else
  return 'medium';
}

// ══════════════════════════════════════════════════════════════
// ── HELPERS
// ══════════════════════════════════════════════════════════════
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

// ══════════════════════════════════════════════════════════════
// ── NVIDIA NIM: STREAMING CHAT
// ══════════════════════════════════════════════════════════════
async function nimStream(messages, model, maxTokens, res) {
  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  maxTokens,
      temperature: 0.7,
      stream:      true,
    }),
  });

  if (!response.ok) throw new Error(`NIM ${model} error: ${response.status}`);

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';
  let total     = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (raw === '[DONE]') continue;
      try {
        const json  = JSON.parse(raw);
        const token = json.choices?.[0]?.delta?.content;
        if (!token) continue;
        total += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      } catch (_) {}
    }
  }
  return total;
}

// ══════════════════════════════════════════════════════════════
// ── NVIDIA NIM: NON-STREAMING (for summaries, TTS, etc)
// ══════════════════════════════════════════════════════════════
async function nimCall(messages, model, maxTokens = 400, temperature = 0.5) {
  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false }),
  });
  if (!res.ok) throw new Error(`NIM call error: ${res.status}`);
  const data = await res.json();
  return stripThinking(data.choices?.[0]?.message?.content || '');
}

// ══════════════════════════════════════════════════════════════
// ── WEB SEARCH
// ══════════════════════════════════════════════════════════════
async function fetchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout('https://google.serper.dev/search', {
      method:  'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ q: query, num: 8, hl: 'en', gl: 'us' }),
    }, 8000);
    if (!res.ok) return [];
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
    return [...news, ...organic].filter(r => r.title.length > 3).slice(0, 8);
  } catch (e) {
    console.error('Serper failed:', e.message);
    return [];
  }
}

function needsWebSearch(text) {
  const low = text.toLowerCase();
  if (/\b(ipl|cricket|rcb|csk|\bmi\b|kkr|virat|rohit|dhoni|wicket|innings)\b/.test(low)) return true;
  if (/\b(nba|nfl|epl|premier league|champions league|football|soccer|basketball)\b/.test(low)) return true;
  if (/\b(today|tonight|yesterday|right now|currently|latest|breaking|live|recent)\b/.test(low)) return true;
  if (/\b(news|update|announced|launched|released|election|president|prime minister|stock|weather)\b/.test(low)) return true;
  if (/\b(2025|2026)\b/.test(low)) return true;
  if (/^(who is|who won|what is the current|what happened)\b/.test(low)) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// ── MAIN HANDLER
// ══════════════════════════════════════════════════════════════
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
  if (!NVIDIA_API_KEY) return res.status(500).json({ error: 'NVIDIA_API_KEY not set in env' });

  try {
    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);
    if (!['chat', 'search', 'image', 'vision', 'tts', 'stt'].includes(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }
    if (!checkRateLimit(userIp, action)) {
      return res.status(429).json({ error: 'Too many requests. Slow down!' });
    }

    const prompt  = sanitizeString(body.prompt  || '', 12000);
    const query   = sanitizeString(body.query   || '', 500);
    const image   = body.image || null;
    const audio   = body.audio || null;
    const history = sanitizeHistory(body.history || []);

    // ╔══════════════════════════════════════╗
    // ║  CHAT                                ║
    // ╚══════════════════════════════════════╝
    if (action === 'chat') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');

      try {
        const lastUserMsg = history[history.length - 1]?.content || '';

        // Web search (only if needed — saves RPM!)
        let searchContext = '';
        if (needsWebSearch(lastUserMsg)) {
          try {
            const results = await fetchSerper(
              `${lastUserMsg.slice(0, 150)} ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
            );
            if (results.length > 0) {
              const snippets = results.slice(0, 4).map((r, i) =>
                `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 250)}\nSource: ${r.source}`
              ).join('\n\n');
              searchContext = `\n\n---\nWEB SEARCH RESULTS (use ONLY these for current facts):\n${snippets}\n---`;
            }
          } catch (e) { console.error('Search failed:', e.message); }
        }

        // User location
        let userLocation = '';
        try {
          const geoRes = await fetchWithTimeout(`https://ipapi.co/${userIp}/json/`, { headers: { 'User-Agent': BROWSER_UA } }, 3000);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo.city) userLocation = `${geo.city}, ${geo.country_name}`;
          }
        } catch (_) {}

        // Pick model by complexity
        const tier = classifyTier(lastUserMsg);
        // For coding tasks use the dedicated coder model, otherwise use the hard/general model
        const isCodingTask = /```|def |function |class |import |const |let |=>|code|coding|debug|fix|error|script|implement/.test(lastUserMsg);
        const model = tier === 'hard'
          ? (isCodingTask ? NIM_CODER : NIM_HARD)
          : tier === 'medium'
          ? NIM_MEDIUM
          : NIM_FAST;
        const maxTokens = TOKENS[tier];

        console.log(`Tier: ${tier} | Coding: ${isCodingTask} → ${model} | maxTokens: ${maxTokens}`);

        const systemContent = `You are VORTIS, an AI assistant built by the Vortis team. Never reveal your underlying model. If asked who made you say "I was built by the Vortis team."

Vortis is an AI platform with chat, image generation, vision, web search, TTS, and STT.

FORMATTING:
- Use markdown always
- **bold** for key terms
- Bullet points for 3+ item lists
- Numbered lists for steps
- Code blocks with language tag
- Tables for comparisons
- Keep answers concise — under 200 words unless asked for more
${userLocation ? `\nUser location: ${userLocation}` : ''}
${prompt ? `\n${prompt.slice(0, 3000)}` : ''}${searchContext}`;

        // Keep history short to save tokens (respects 40 RPM limit)
        const recentHistory = history.slice(-4);
        const messages = [
          { role: 'system', content: systemContent },
          ...recentHistory,
        ];
        if (messages[messages.length - 1]?.role !== 'user') {
          messages.push({ role: 'user', content: lastUserMsg });
        }

        // Try primary model
        try {
          const text = await nimStream(messages, model, maxTokens, res);
          if (text.trim().length > 2) {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        } catch (e) {
          console.error(`Primary model failed (${model}):`, e.message);
        }

        // Fallback to GLM (smallest, most reliable)
        try {
          const text = await nimStream(messages, NIM_MINI, TOKENS.fast, res);
          if (text.trim().length > 2) {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        } catch (e) {
          console.error('Fallback GLM also failed:', e.message);
        }

        res.write(`data: ${JSON.stringify({ content: 'All models busy, try again in a moment.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        console.error('CHAT ERROR:', error.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Chat failed' });
        if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
      }
      return;
    }

    // ╔══════════════════════════════════════╗
    // ║  VISION                              ║
    // ╚══════════════════════════════════════╝
    if (action === 'vision') {
      if (!image)                     return res.status(400).json({ error: 'Missing image' });
      if (!isValidBase64Image(image)) return res.status(400).json({ error: 'Invalid image format' });
      if (isImageTooLarge(image))     return res.status(400).json({ error: 'Image too large (max 5MB)' });

      try {
        const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
        const userText = sanitizeString(prompt || 'Describe this image in detail.', 500);

        const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            model:       NIM_VISION,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                { type: 'text',      text: userText },
              ],
            }],
            max_tokens:  800,
            temperature: 0.5,
            stream:      false,
          }),
        });

        if (!response.ok) throw new Error(`Vision error: ${response.status}`);
        const data        = await response.json();
        const description = stripThinking(data.choices?.[0]?.message?.content || '');
        if (description.trim().length > 2) {
          return res.status(200).json({ success: true, description: description.trim() });
        }
        throw new Error('Empty vision response');

      } catch (error) {
        console.error('VISION ERROR:', error.message);
        return res.status(200).json({ success: false, description: 'Could not analyze image, please try again.' });
      }
    }

    // ╔══════════════════════════════════════╗
    // ║  IMAGE GENERATION                    ║
    // ╚══════════════════════════════════════╝
    if (action === 'image') {
      if (!prompt.trim())       return res.status(400).json({ error: 'Missing prompt' });
      if (prompt.length > 800)  return res.status(400).json({ error: 'Prompt too long' });

      try {
        console.log(`Generating image with ${NIM_IMAGE}`);
        const imgRes = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/images/generations`,
          {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${NVIDIA_API_KEY}`,
              'Content-Type':  'application/json',
              'Accept':        'application/json',
            },
            body: JSON.stringify({
              model:           NIM_IMAGE,
              prompt:          prompt.trim(),
              n:               1,
              size:            '1024x1024',
              response_format: 'b64_json',
            }),
          },
          35000
        );

        if (!imgRes.ok) throw new Error(`Image gen error: ${imgRes.status}`);
        const imgData = await imgRes.json();
        const b64     = imgData?.data?.[0]?.b64_json;
        const url     = imgData?.data?.[0]?.url;

        if (b64 && b64.length > 100) {
          return res.status(200).json({ success: true, imageUrl: `data:image/png;base64,${b64}`, provider: 'nvidia-flux' });
        }
        if (url) {
          return res.status(200).json({ success: true, imageUrl: url, provider: 'nvidia-flux' });
        }
        throw new Error('No image returned');

      } catch (error) {
        console.error('IMAGE GEN ERROR:', error.message);
        // Fallback to Pollinations Flux
        try {
          console.log('Falling back to Pollinations Flux...');
          const seed        = Math.floor(Math.random() * 999999);
          const encoded     = encodeURIComponent(prompt.trim());
          const polRes      = await fetchWithTimeout(
            `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`,
            { headers: { 'User-Agent': BROWSER_UA } },
            30000
          );
          if (polRes.ok) {
            const ct  = polRes.headers.get('content-type') || '';
            if (ct.startsWith('image/')) {
              const buf    = await polRes.arrayBuffer();
              const base64 = Buffer.from(buf).toString('base64');
              return res.status(200).json({ success: true, imageUrl: `data:${ct.split(';')[0]};base64,${base64}`, provider: 'pollinations' });
            }
          }
        } catch (e) { console.error('Pollinations fallback failed:', e.message); }

        return res.status(503).json({ error: 'Image generation unavailable, try again.' });
      }
    }

    // ╔══════════════════════════════════════╗
    // ║  TEXT TO SPEECH                      ║
    // ╚══════════════════════════════════════╝
    if (action === 'tts') {
      const text  = sanitizeString(body.text || '', 800);
      const voice = sanitizeString(body.voice || 'English-US.Female-1', 60);
      if (!text) return res.status(400).json({ error: 'Missing text' });

      const cleanText = text
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u2600-\u27BF]/g, '')
        .replace(/[★✦•→←↑↓◆◇○●©®™⚡]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700);

      if (!cleanText || cleanText.length < 2) return res.status(200).json({ audio: '' });

      // Try NVIDIA Magpie TTS
      try {
        const ttsRes = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/audio/speech`,
          {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${NVIDIA_API_KEY}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              model:           NIM_TTS,
              input:           cleanText,
              voice:           voice,
              response_format: 'mp3',
            }),
          },
          20000
        );
        if (ttsRes.ok) {
          const buf    = await ttsRes.arrayBuffer();
          const base64 = Buffer.from(buf).toString('base64');
          if (base64.length > 100) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.status(200).json({ audio: base64 });
          }
        }
        throw new Error(`NVIDIA TTS failed: ${ttsRes.status}`);
      } catch (e) {
        console.log('NVIDIA TTS failed, trying Edge TTS:', e.message);
      }

      // Fallback: Edge TTS
      try {
        const { EdgeTTS } = await import('@andresaya/edge-tts');
        const tts = new EdgeTTS();
        await tts.synthesize(cleanText, 'en-US-GuyNeural', {
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          rate: '-12%',
        });
        const base64 = await tts.toBase64();
        if (base64 && base64.length > 100) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).json({ audio: base64 });
        }
      } catch (e2) { console.log('Edge TTS fallback failed:', e2.message); }

      return res.status(502).json({ error: 'TTS failed', audio: '' });
    }

    // ╔══════════════════════════════════════╗
    // ║  SPEECH TO TEXT                      ║
    // ╚══════════════════════════════════════╝
    if (action === 'stt') {
      if (!audio) return res.status(400).json({ error: 'Missing audio' });

      try {
        const audioBuffer = Buffer.from(
          audio.startsWith('data:') ? audio.split(',')[1] : audio,
          'base64'
        );

        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
        formData.append('model', NIM_STT);

        const sttRes = await fetchWithTimeout(
          `${NVIDIA_BASE_URL}/audio/transcriptions`,
          {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}` },
            body:    formData,
          },
          20000
        );

        if (!sttRes.ok) throw new Error(`STT error: ${sttRes.status}`);
        const sttData    = await sttRes.json();
        const transcript = sttData?.text || '';
        return res.status(200).json({ success: true, transcript: transcript.trim() });

      } catch (error) {
        console.error('STT ERROR:', error.message);
        return res.status(500).json({ success: false, error: 'Speech recognition failed' });
      }
    }

    // ╔══════════════════════════════════════╗
    // ║  SEARCH                              ║
    // ╚══════════════════════════════════════╝
    if (action === 'search') {
      const searchQuery = (query || prompt).trim();
      if (!searchQuery)             return res.status(400).json({ error: 'Missing query' });
      if (searchQuery.length > 300) return res.status(400).json({ error: 'Query too long' });

      const results = await fetchSerper(searchQuery);
      let aiSummary = null;

      if (results.length > 0) {
        const snippets = results.slice(0, 4).map((r, i) =>
          `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 200)}\nSource: ${r.source}`
        ).join('\n\n');
        const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
          // Use the fast/mini model for summaries to save RPM
          const summary = await nimCall([
            { role: 'system', content: `Today is ${today}. Summarize these results in 3-4 sentences. Be specific with names, dates, scores. Use ONLY what's below.\n\n${snippets}` },
            { role: 'user',   content: 'Summarize.' },
          ], NIM_FAST, 300, 0.2);
          if (summary && summary.trim().length > 10) aiSummary = summary.trim();
        } catch (e) { console.error('Summary failed:', e.message); }
      }

      return res.json({ success: results.length > 0, results: results.slice(0, 8), aiSummary: aiSummary || null });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('GLOBAL ERROR:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}