export const config = {
  maxDuration: 60,
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
// ── NVIDIA NIM CONFIG (FRONTIER FLAGSHIPS - 2026)
// ══════════════════════════════════════════════════════════════
const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// ── ELITE MODEL MAPPING ───────────────────────────────────────
const NIM_CHAT    = 'deepseek-ai/deepseek-v4-pro';             // Elite Conversational Brain
const NIM_CODER   = 'qwen/qwen3-coder-480b-a35b-instruct';     // 480B Pure Code Powerhouse
const NIM_DOCS    = 'nvidia/nemotron-3-ultra-550b-a55b';        // 550B Heavy Duty Document Analysis
const NIM_SEARCH  = 'moonshotai/kimi-k2.6';                    // Web Synthesis Specialist
const NIM_SUMMARY = 'stepfun-ai/step-3.7-flash';                // Ultra-Fast Summary Maker
const NIM_VISION  = 'meta/llama-3.2-90b-vision-instruct';       // 90B Top-Tier Visual Reasoning & OCR
const NIM_IMAGE   = 'black-forest-labs/flux.1-dev';               // Elite Quality Image Rendering
const NIM_STT     = 'openai/whisper-large-v3';                 // Global Multilingual Audio Transcriber
const NIM_TTS     = 'magpie-tts/multilingual-2.0';             // Ultra Natural Voice Synthesizer

// ── EXPANDED CEILING TOKEN BUDGETS (No More Cutting Off) ──────
const TOKENS = {
  chat:    4096, // Long, descriptive deep human conversations
  code:    8192, // Massive architecture windows for full scripts
  docs:    6144, // Generous reading room for deep contextual file analyses
  search:  2048, // Clean workspace for summarizing search indices
  summary: 1024, // High-fidelity breakdown window
  vision:  2048, // Deep chart/data parsing responses
};

// ══════════════════════════════════════════════════════════════
// ── RATE LIMITER
// ══════════════════════════════════════════════════════════════
const rateLimiter = new Map();
const RATE_LIMITS = {
  chat:    { window: 60000, max: 25 },
  code:    { window: 60000, max: 20 },
  docs:    { window: 60000, max: 15 },
  image:   { window: 60000, max: 4  },
  search:  { window: 60000, max: 20 },
  summary: { window: 60000, max: 25 },
  vision:  { window: 60000, max: 4  },
  tts:     { window: 60000, max: 15 },
  stt:     { window: 60000, max: 10 },
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
// ── SANITIZATION & STRIP HELPERS
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
  const validPrefixes = ['data:image/jpeg;base64,', 'data:image/jpg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,'];
  return validPrefixes.some(p => str.startsWith(p));
}

function isImageTooLarge(base64str) {
  const raw = base64str.startsWith('data:') ? base64str.split(',')[1] : base64str;
  return (raw.length * 3) / 4 > 5 * 1024 * 1024;
}

function stripThinking(text) {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*\n/gm, '\n').trim();
}

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
// ── WEB SERPER EXTRACTOR
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
    return (data.organic || []).map(r => ({
      title:   r.title   || '',
      snippet: r.snippet || '',
      link:    r.link    || '#',
      source:  (() => { try { return new URL(r.link).hostname.replace('www.', ''); } catch { return 'Web'; } })(),
    })).slice(0, 5);
  } catch (e) {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// ── STREAMING COMPLETION ENGINE
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

  if (!response.ok) throw new Error(`NIM Engine error on ${model}: ${response.status}`);

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
// ── MAIN ROUTER HANDLER
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST')     return res.status(405).json({ error: 'Method not allowed' });

  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Invalid payload' });
  if (!NVIDIA_API_KEY) return res.status(500).json({ error: 'NVIDIA credentials array missing.' });

  try {
    const token  = req.headers.authorization?.split('Bearer ')[1];
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (!token) return res.status(401).json({ error: 'Unauthorized user context.' });
    try { await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid structural token' }); }

    const body   = req.body;
    const action = sanitizeString(body.action || '', 20);
    
    if (!['chat', 'code', 'docs', 'search', 'summary', 'vision', 'image', 'tts', 'stt'].includes(action)) {
      return res.status(400).json({ error: `Action unrecognized: ${action}` });
    }
    if (!checkRateLimit(userIp, action)) {
      return res.status(429).json({ error: 'Engine saturation met. Please pace your calls.' });
    }

    const prompt  = sanitizeString(body.prompt  || '', 12000);
    const image   = body.image || null;
    const audio   = body.audio || null;
    const history = sanitizeHistory(body.history || []);

    // ── 1 THROUGH 5: TEXT CAPABLE TEXT STREAMS (CHAT, CODE, DOCS, SEARCH, SUMMARY) ──
    if (['chat', 'code', 'docs', 'search', 'summary'].includes(action)) {
      if (!prompt.trim()) return res.status(400).json({ error: 'Prompt field content mandatory.' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');

      let model = NIM_CHAT;
      let maxTokens = TOKENS.chat;
      let systemInstruction = `You are VORTIS, an elite multi-modality cluster assistant constructed by the Vortis development collective. Never disclose underlying provider blueprints.`;

      if (action === 'chat')    { model = NIM_CHAT; maxTokens = TOKENS.chat; }
      if (action === 'code')    { model = NIM_CODER; maxTokens = TOKENS.code; systemInstruction += "\nFocus explicitly on software architecture layout and flawless technical script outputs."; }
      if (action === 'docs')    { model = NIM_DOCS; maxTokens = TOKENS.docs; systemInstruction += "\nAnalyze the accompanying structural data matrices with maximum depth reasoning."; }
      if (action === 'summary') { model = NIM_SUMMARY; maxTokens = TOKENS.summary; systemInstruction += "\nCondense the parsed structure cleanly into immediate bulleted value targets."; }
      
      if (action === 'search') {
        model = NIM_SEARCH;
        maxTokens = TOKENS.search;
        const results = await fetchSerper(prompt);
        if (results.length > 0) {
          const webMatrix = results.map((r, i) => `[Reference ${i + 1}] Title: ${r.title}\nInsight: ${r.snippet}\nLink: ${r.link}`).join('\n\n');
          systemInstruction += `\n\nUse this context index explicitly for immediate global timeline matching:\n${webMatrix}`;
        }
      }

      const recentHistory = history.slice(-6);
      const messages = [
        { role: 'system', content: systemInstruction },
        ...recentHistory,
        { role: 'user', content: prompt }
      ];

      try {
        const streamData = await nimStream(messages, model, maxTokens, res);
        if (streamData.trim().length > 1) {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      } catch (err) {
        console.error("Stream route mapping interruption:", err.message);
      }
      
      res.write(`data: ${JSON.stringify({ content: 'Pipeline structural timeout. Retrying node...' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // ── 6. DYNAMIC VISION MULTIMODAL ROUTE ────────────────────────
    if (action === 'vision') {
      if (!image)                     return res.status(400).json({ error: 'Missing analysis target image matrix.' });
      if (!isValidBase64Image(image)) return res.status(400).json({ error: 'Invalid asset base64 syntax.' });
      if (isImageTooLarge(image))     return res.status(400).json({ error: 'Asset limits overflow 5MB maximum.' });

      try {
        const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
        const userText = sanitizeString(prompt || 'Provide architectural breakdown of graphic components.', 1000);
        const activeVisionModel = body.model || NIM_VISION;

        const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: activeVisionModel,
            messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: userText }] }],
            max_tokens: TOKENS.vision,
            temperature: 0.4,
            stream: false,
          }),
        });

        if (!response.ok) throw new Error(`Vision array returned state: ${response.status}`);
        const data = await response.json();
        return res.status(200).json({ success: true, description: stripThinking(data.choices?.[0]?.message?.content || '').trim() });
      } catch (e) {
        return res.status(502).json({ error: 'Visual reasoning node completely saturated at this block.' });
      }
    }

    // ── 7. ELITE NATIVE IMAGE GENERATION (FLUX DEV) ───────────────
    if (action === 'image') {
      if (!prompt.trim()) return res.status(400).json({ error: 'Empty creative prompt string.' });

      try {
        const imgRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/images/generations`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            model: NIM_IMAGE,
            prompt: prompt.trim(),
            negative_prompt: 'blurry, low contrast, text generation error, structural deformities',
            n: 1,
            size: '1024x1024',
            steps: 32,
            response_format: 'b64_json',
          }),
        }, 45000);

        if (!imgRes.ok) throw new Error(`Image engine connection failure: ${imgRes.status}`);
        const imgData = await imgRes.json();
        const b64 = imgData?.data?.[0]?.b64_json;

        if (b64 && b64.length > 100) {
          return res.status(200).json({ success: true, imageUrl: `data:image/png;base64,${b64}`, provider: 'nvidia-native-flux' });
        }
        throw new Error('Matrix generation fault.');
      } catch (err) {
        return res.status(502).json({ error: 'NVIDIA flagship render core is loaded. Re-try execution profile.' });
      }
    }

    // ── 8. GLOBAL LANG TEXT TO SPEECH (TTS) ────────────────────────
    if (action === 'tts') {
      const text = sanitizeString(body.text || '', 1500);
      const voice = sanitizeString(body.voice || 'English-US.Female-1', 60);
      if (!text) return res.status(400).json({ error: 'Input text data stream empty.' });

      try {
        const ttsRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/audio/speech`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: NIM_TTS, input: text, voice: voice, response_format: 'mp3' }),
        }, 25000);

        if (!ttsRes.ok) throw new Error(`TTS layer mismatch state: ${ttsRes.status}`);
        const buf = await ttsRes.arrayBuffer();
        return res.status(200).json({ success: true, audio: Buffer.from(buf).toString('base64') });
      } catch (e) {
        return res.status(502).json({ error: 'Acoustic synthesis pipelines occupied.' });
      }
    }

    // ── 9. WHISPER LARGE V3 SPEECH TO TEXT (STT) ──────────────────
    if (action === 'stt') {
      if (!audio) return res.status(400).json({ error: 'Audio input sample required.' });

      try {
        const audioBuffer = Buffer.from(audio.startsWith('data:') ? audio.split(',')[1] : audio, 'base64');
        const boundary = `----VortisAudioBoundary${Date.now().toString(16)}`;
        
        const headerData = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
        const footerData = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${NIM_STT}\r\n--${boundary}--\r\n`;

        const multipartBody = Buffer.concat([
          Buffer.from(headerData, 'utf-8'),
          audioBuffer,
          Buffer.from(footerData, 'utf-8')
        ]);

        const sttRes = await fetchWithTimeout(`${NVIDIA_BASE_URL}/audio/transcriptions`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body:    multipartBody,
        }, 30000);

        if (!sttRes.ok) throw new Error(`Acoustic conversion core processing error: ${sttRes.status}`);
        const sttData = await sttRes.json();
        return res.status(200).json({ success: true, transcript: (sttData?.text || '').trim() });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Acoustic translation block timeout.' });
      }
    }

  } catch (globalError) {
    console.error('SYSTEM RUNTIME BREAKAGE:', globalError.message);
    return res.status(500).json({ error: 'Internal global execution loop engine exception.' });
  }
}