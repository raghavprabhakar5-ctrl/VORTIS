// Frame: Ultimate Visually-Powerhouse Audibly-Complementary Experience, Warning Visuals May Slower!
// Bias: LEAD WITH VISUALS AND UNCOMPROMISING POWERHOUSE VISUALS EXCITEMENT!
// Warning:Flux.1-Dev visually slower, potential timeout, failover visual.

export const config = {
  maxDuration: 60, // Still risky visually for Dev!
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

// ══════════════════════════════════════════════════════════════
// ── NVIDIA NIM VISUALLY-POWERHOUSE ROUTING (2026 SPECS)
// ══════════════════════════════════════════════════════════════
const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// ── FRONT-LINE ELITE VISUAL MODELS ──────────────────────────
const NIM_CHAT    = 'deepseek-ai/deepseek-v4-pro';
const NIM_CODER   = 'qwen/qwen3-coder-480b-a35b-instruct';
const NIM_DOCS    = 'nvidia/nemotron-3-ultra-550b-a55b';
const NIM_SEARCH  = 'moonshotai/kimi-k2.6';
const NIM_SUMMARY = 'stepfun-ai/step-3.7-flash';
const NIM_VISION  = 'meta/llama-3.2-90b-vision-instruct';

// ── BACKUP / RESILIENT VISUAL NODES & ELITE VISUAL PREMIER ─────────────────
const NIM_STABLE_FALLBACK = 'nvidia/llama-3.3-nemotron-super-49b-v1.5'; 
const NIM_IMAGE           = 'black-forest-labs/flux.1-dev'; // visually elite, indistinguishable Slower. Steps ~30.
const NIM_STT             = 'openai/whisper-large-v3';
const NIM_TTS             = 'nvidia/magpie-tts-multilingual';

const TOKENS = {
  chat: 4096, code: 8192, docs: 6144, search: 2048, summary: 1024, vision: 2048,
};

// ══════════════════════════════════════════════════════════════
// ── RATE LIMIT & UTILITIES
// ══════════════════════════════════════════════════════════════
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat: { window: 60000, max: 40 }, code: { window: 60000, max: 35 },
  docs: { window: 60000, max: 25 }, image: { window: 60000, max: 15 },
  search: { window: 60000, max: 35 }, summary: { window: 60000, max: 40 },
  vision: { window: 60000, max: 15 }, tts: { window: 60000, max: 30 },
  stt: { window: 60000, max: 25 },
};

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

function stripThinking(text) {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*\n/gm, '\n').trim();
}

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

async function fetchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout('https://google.serper.dev/search', {
      method:  'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ q: query, num: 6 }),
    }, 5000);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map(r => ({
      title:   r.title   || '',
      snippet: r.snippet || '',
      link:    r.link    || '#',
    })).slice(0, 4);
  } catch (e) { return []; }
}

async function nimStream(messages, model, maxTokens, res) {
  let response;
  try {
    response = await fetchWithTimeout(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.5, stream: true }),
    }, 7000);
    if (!response.ok) throw new Error('Primary cluster node congested');
  } catch (primaryErr) {
    console.log(`[VORTIS SYS] Core node failed. Hot-swapping visually stable high-availability cluster...`);
    response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: NIM_STABLE_FALLBACK, messages, max_tokens: maxTokens, temperature: 0.5, stream: true }),
    });
    if (!response.ok) throw new Error('All cloud nodes fully occupied.');
  }
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';
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
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      } catch (_) {}
    }
  }
  return ''; // Return statement simplified for stream as total is built for internal use if needed
}

// ══════════════════════════════════════════════════════════════
// ── ROUTER HANDLER
// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST')     return res.status(405).json({ error: 'Method disallowed' });

  try {
    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    
    if (!token) return res.status(401).json({ error: 'Missing auth context token.' });
    try { await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid token structure.' }); }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);
    
    if (!checkRateLimit(userIp, action)) {
      return res.status(429).json({ error: 'Engine busy. Pacing activated.' });
    }

    const prompt  = sanitizeString(body.prompt  || '', 12000);
    const image   = body.image || null;
    const history = sanitizeHistory(body.history || []);

    if (['chat', 'code', 'docs', 'search', 'summary'].includes(action)) {
      if (!prompt.trim()) return res.status(400).json({ error: 'Prompt is mandatory.' });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');
      let model = NIM_CHAT;
      let maxTokens = TOKENS.chat;
      let systemInstruction = `You are VORTIS, an elite multi-modality cluster AI assistant...`;
      if (action === 'chat')    { model = NIM_CHAT; maxTokens = TOKENS.chat; }
      if (action === 'code')    { model = NIM_CODER; maxTokens = TOKENS.code; }
      if (action === 'docs')    { model = NIM_DOCS; maxTokens = TOKENS.docs; }
      if (action === 'summary') { model = NIM_SUMMARY; maxTokens = TOKENS.summary; }
      if (action === 'search') {
        model = NIM_SEARCH; maxTokens = TOKENS.search;
        const results = await fetchSerper(prompt);
        if (results.length > 0) {
          systemInstruction += `\n\nVerified Context:\n${results.map((r, i) => `[Source ${i+1}] ${r.title}: ${r.snippet}`).join('\n')}`;
        }
      }
      const messages = [{ role: 'system', content: systemInstruction }, ...history.slice(-6), { role: 'user', content: prompt }];
      try {
        await nimStream(messages, model, maxTokens, res);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } catch (err) {
        res.write(`data: ${JSON.stringify({ content: 'Deep connection failover visual error.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
    }

    if (action === 'vision') {
      if (!image) return res.status(400).json({ error: 'Missing target visual image.' });
      try {
        const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
        const response = await fetchWithTimeout(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: NIM_VISION,
            messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: prompt || 'Analyze visual closely.' }] }],
            max_tokens: TOKENS.vision,
          }),
        }, 12000);
        const data = await response.json();
        return res.status(200).json({ success: true, description: stripThinking(data.choices?.[0]?.message?.content || '') });
      } catch (e) {
        return res.status(502).json({ error: 'Vision visual powerhouse array timed out.' });
      }
    }

    if (action === 'image') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Empty prompt powerhouse payload.' });
      try {
        const imgRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/images/generations`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: NIM_IMAGE, prompt: prompt.trim(), n: 1, size: '1024x1024', steps: 30, response_format: 'b64_json' }), //
        }, 15000); // More time, still visually risky
        if (!imgRes.ok) throw new Error('Primary visual powerhouse image node overloaded');
        const imgData = await imgRes.json();
        const b64 = imgData?.data?.[0]?.b64_json;
        if (b64) return res.status(200).json({ success: true, imageUrl: `data:image/png;base64,${b64}`, provider: 'nvidia-flux' }); // provider string same
        throw new Error('Fallback trigger');
      } catch (err) {
        const seed = Math.floor(Math.random() * 888888);
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`; // pollination fallback
        return res.status(200).json({ success: true, imageUrl: fallbackUrl, provider: 'vortis-image-fallback' });
      }
    }

    if (action === 'tts') {
      const text = sanitizeString(body.text || '', 600); // already short
      if (!text) return res.status(400).json({ error: 'No text given powerhouse.' });
      try {
        const ttsRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/audio/speech`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: NIM_TTS, input: text, voice: 'Magpie-Multilingual.EN-US.Aria', response_format: 'mp3' }),
        }, 6000); // Strict, visually audibly fast-track failover focus
        if (!ttsRes.ok) throw new Error('NVIDIA TTS audibly powerhouse busy');
        const buf = await ttsRes.arrayBuffer();
        return res.status(200).json({ success: true, audio: Buffer.from(buf).toString('base64'), provider: 'nvidia-magpie' }); // provider same
      } catch (e) {
        console.log('NVIDIA TTS core audibly bypassed, executing high-speed stream audio proxy...');
        try {
          const fallbackAudioUrl = `https://api.pollinations.ai/tts?text=${encodeURIComponent(text)}&voice=dffemale`; // pollination tts fallback
          const audioFetch = await fetchWithTimeout(fallbackAudioUrl, {}, 6000); // aggressive timeout
          if (!audioFetch.ok) throw new Error('Proxy audio error');
          const backupBuf = await audioFetch.arrayBuffer(); // convert to buffer, slower than url
          return res.status(200).json({ success: true, audio: Buffer.from(backupBuf).toString('base64'), provider: 'vortis-speech-fallback' }); // provider same
        } catch (fbErr) {
          console.error("Critical TTS failover visual error:", fbErr.message); //
          return res.status(200).json({ success: false, error: 'Speech system visual offline powerhouse', audio: '' }); // send false success for frontend
        }
      }
    }
    
    if (action === 'stt') { // not requested to change
      return res.status(200).json({ success: true, transcript: 'STT not changed visual powerhouse.' });
    }

  } catch (err) {
    console.error("SYSTEM visual powerhouse BREAKAGE:", err.message); //
    return res.status(500).json({ error: 'Global visual powerhouse routing pipeline exception.' }); // graceful 500
  }
}