// ═══════════════════════════════════════════════════════════════════
//  GLM PROVIDER — free 24/7 AI backbone for VORTIS
//  Powered by z-ai-web-dev-sdk (Z.ai / GLM family)
//
//  Capabilities: chat (streaming + plain), vision, web search,
//                image generation, TTS, ASR (speech-to-text)
//
//  CONFIG RESOLUTION (first match wins):
//    1. ZAI_CONFIG_JSON  env — full JSON: {baseUrl, apiKey, chatId, userId, token}
//    2. GLM_API_KEY      env (+ optional GLM_BASE_URL) — your own Z.ai key
//    3. .z-ai-config     file in cwd / ~ / /etc (SDK default)
//
//  BAN PROTECTION (the "too many requests" guard):
//    - Global RPM cap  (GLM_RPM_LIMIT,   default 40 req/min)
//    - Per-kind RPM    (chat 25, search 15, vision 10, image 5, tts 10, asr 10)
//    - Minimum spacing between calls (GLM_MIN_GAP_MS, default 200ms)
//    - 429 → hard cooldown (60s minimum, 2× Retry-After when provided)
//    - 3 consecutive failures → 60s circuit-breaker cooldown
//    - NO background keep-alive pings (managed API — always warm)
// ═══════════════════════════════════════════════════════════════════
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── CONFIG RESOLUTION ────────────────────────────────────────────────
let _cachedZai = null;
let _configSource = null;
let _initPromise = null;

function resolveGlmConfig() {
  // 1. Full JSON via env (recommended for Render — copy into ZAI_CONFIG_JSON)
  if (process.env.ZAI_CONFIG_JSON) {
    try {
      const cfg = JSON.parse(process.env.ZAI_CONFIG_JSON);
      if (cfg.baseUrl && cfg.apiKey) return { ...cfg, _source: 'ZAI_CONFIG_JSON env' };
    } catch (e) {
      console.error('glm-provider: ZAI_CONFIG_JSON is set but invalid JSON:', e.message);
    }
  }
  // 2. Own API key via env
  if (process.env.GLM_API_KEY) {
    return {
      baseUrl: process.env.GLM_BASE_URL || 'https://api.z.ai/api/paas/v4',
      apiKey: process.env.GLM_API_KEY,
      _source: 'GLM_API_KEY env',
    };
  }
  // 3. SDK default file lookup — .z-ai-config in cwd / home / /etc
  for (const p of [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (cfg.baseUrl && cfg.apiKey) return { ...cfg, _source: p };
    } catch (_) { /* not present — keep looking */ }
  }
  return null;
}

async function getZAI() {
  if (_cachedZai) return _cachedZai;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cfg = resolveGlmConfig();
    if (!cfg) {
      console.warn('glm-provider: no config found (set ZAI_CONFIG_JSON or GLM_API_KEY, or place .z-ai-config) — GLM provider disabled');
      return null;
    }
    try {
      const { _source, ...sdkCfg } = cfg;
      _configSource = _source;
      const zai = new ZAI(sdkCfg);
      // Smoke test — 1 tiny call so we KNOW it's live before routing traffic
      const probe = await zai.chat.completions.create({
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 2,
        thinking: { type: 'disabled' },
      });
      if (!probe?.choices) throw new Error('probe returned no choices');
      _cachedZai = zai;
      console.log(`glm-provider: GLM ONLINE via ${_source} — free 24/7 backbone active`);
      return zai;
    } catch (e) {
      console.warn('glm-provider: config found but probe failed — GLM disabled for now:', e.message?.slice(0, 200));
      return null;
    } finally {
      // allow re-resolution later if it was down at boot (checked lazily)
      setTimeout(() => { _initPromise = null; }, 5 * 60 * 1000).unref?.();
    }
  })();
  return _initPromise;
}

// ── RATE LIMITER (ban protection) ────────────────────────────────────
const GLM_GLOBAL_RPM = Number(process.env.GLM_RPM_LIMIT || 20);
// EMPIRICALLY CALIBRATED (2026-09-01): the Z.ai session gateway accepts
// ~1 request per 2 seconds per session — 5 calls at 2s spacing all pass,
// 2nd call at 1.2s spacing 429s. Default 2.5s keeps a safety margin.
const GLM_MIN_GAP_MS = Number(process.env.GLM_MIN_GAP_MS || 2500);
const GLM_KIND_RPM = {
  chat:   Number(process.env.GLM_CHAT_RPM   || 20),
  search: Number(process.env.GLM_SEARCH_RPM || 12),
  vision: Number(process.env.GLM_VISION_RPM || 8),
  image:  Number(process.env.GLM_IMAGE_RPM  || 4),
  tts:    Number(process.env.GLM_TTS_RPM    || 8),
  asr:    Number(process.env.GLM_ASR_RPM    || 8),
};

const glmCallLog = [];              // [{ t, kind }]
let glmLastCallAt = 0;              // for min-gap spacing
let glmCooldownUntil = 0;           // global cooldown after 429/5xx
let glmConsecutiveFails = 0;
const stats = { total: 0, ok: 0, fail: 0, rateLimited: 0, cooldowns: 0, lastError: null, lastOkAt: 0 };

function rpmUsed(kind) {
  const now = Date.now();
  while (glmCallLog.length && now - glmCallLog[0].t > 60000) glmCallLog.shift();
  const kindCount = glmCallLog.filter(e => e.kind === kind).length;
  return { global: glmCallLog.length, kind: kindCount };
}

// Returns true if a call of this kind may fire right now.
function glmBudgetOk(kind) {
  if (Date.now() < glmCooldownUntil) return false;
  const used = rpmUsed(kind);
  if (used.global >= GLM_GLOBAL_RPM) return false;
  if (used.kind >= (GLM_KIND_RPM[kind] ?? 20)) return false;
  return true;
}

function recordGlmCall(kind) {
  glmCallLog.push({ t: Date.now(), kind });
  glmLastCallAt = Date.now();
  stats.total++;
}

function glmWaitForGap() {
  const wait = glmLastCallAt + GLM_MIN_GAP_MS - Date.now();
  return wait > 0 ? new Promise(r => setTimeout(r, Math.min(wait, GLM_MIN_GAP_MS + 1000))) : Promise.resolve();
}

// Claims the next call slot — serializes concurrent callers so two requests
// can never fire GLM calls closer than GLM_MIN_GAP_MS (single-threaded JS
// makes the check-and-set atomic). noWait: return immediately instead of
// waiting — used by latency-sensitive advisory calls (classifiers) that
// would rather fall back to a heuristic than block.
async function glmClaimSlot({ noWait = false } = {}) {
  for (let i = 0; i < 12; i++) {
    if (Date.now() - glmLastCallAt >= GLM_MIN_GAP_MS) {
      glmLastCallAt = Date.now(); // reserve the slot
      return true;
    }
    if (noWait) return false;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

function setGlmCooldown(ms, reason) {
  glmCooldownUntil = Date.now() + ms;
  stats.cooldowns++;
  console.warn(`glm-provider: cooldown ${Math.round(ms / 1000)}s — ${reason}`);
}

function recordGlmSuccess() {
  stats.ok++;
  stats.lastOkAt = Date.now();
  glmConsecutiveFails = 0;
}

function recordGlmFailure(err) {
  stats.fail++;
  stats.lastError = String(err?.message || err).slice(0, 200);
  glmConsecutiveFails++;
  if (glmConsecutiveFails >= 3) {
    glmCooldownUntil = Date.now() + 60 * 1000;
    stats.cooldowns++;
    console.warn(`glm-provider: ${glmConsecutiveFails} consecutive failures — circuit breaker open for 60s`);
    glmConsecutiveFails = 0;
  }
}

// Classifies an SDK error: 429 → cooldown (respect Retry-After); 5xx → soft fail
function handleGlmError(e) {
  const msg = String(e?.message || e);
  const m = msg.match(/status (\d{3})/);
  const status = m ? Number(m[1]) : 0;
  if (status === 429 || /too many requests|rate.?limit/i.test(msg)) {
    stats.rateLimited++;
    const retryMatch = msg.match(/retry.?after[":\s]+(\d+)/i);
    const ra = retryMatch ? Number(retryMatch[1]) * 1000 : 0;
    setGlmCooldown(Math.max(60 * 1000, ra * 2), 'HTTP 429 rate limited (2× Retry-After, min 60s)');
    return;
  }
  if (status >= 500 || status === 408) {
    recordGlmFailure(e);
    return;
  }
  // 4xx (400/401/403/404 …) — config or request problem; count softly
  recordGlmFailure(e);
}

// ── THINK-TAG FILTER (streaming-safe, same algorithm as VORTIS core) ─
function filterThinkChunk(pending, state) {
  // state: { inThink }
  let safe = '';
  let rest = pending;
  while (true) {
    if (!state.inThink) {
      const openIdx = rest.indexOf('<think>');
      if (openIdx === -1) {
        const holdBack = Math.min(rest.length, 8);
        safe += rest.slice(0, rest.length - holdBack);
        rest = rest.slice(rest.length - holdBack);
        return { safe, rest };
      }
      safe += rest.slice(0, openIdx);
      rest = rest.slice(openIdx + 7);
      state.inThink = true;
    } else {
      const closeIdx = rest.indexOf('</think>');
      if (closeIdx === -1) {
        rest = rest.slice(Math.max(0, rest.length - 9));
        return { safe, rest };
      }
      rest = rest.slice(closeIdx + 8);
      state.inThink = false;
    }
  }
}

function stripReasoning(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

function isValidResponse(text) {
  if (!text || text.trim().length < 2) return false;
  return !/rate.?limit|too many request|try again later|quota exceeded/i.test(text.trim());
}

// Race a promise against a hard timeout — the SDK's internal fetch has no
// abort-signal support, so this is the only way to guarantee a bounded wait.
// The abandoned promise resolves/throws into the void (harmless; its result
// is dropped and the SDK logs it).
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ═════ PUBLIC API ═══════════════════════════════════════════════════

export async function glmReady() {
  const z = await getZAI();
  return Boolean(z) && Date.now() >= glmCooldownUntil;
}

// ── GLM chat, non-streaming → text | null ──
export async function glmChat(messages, { maxTokens = 4096, temperature = 0.7, kind = 'chat', timeoutMs = 45000, noWait = false } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return null;
  // Guard: the GLM API 400s ("prompt parameter not properly received") when the
  // last message content is empty — skip the call instead of burning a strike.
  const lastContent = messages[messages.length - 1]?.content;
  if (!lastContent || (typeof lastContent === 'string' && !lastContent.trim())) return null;
  if (!(await glmClaimSlot({ noWait }))) return null;
  recordGlmCall(kind);
  try {
    const c = await withTimeout(
      z.chat.completions.create({
        messages,
        max_tokens: maxTokens,
        temperature,
        thinking: { type: 'disabled' },
      }),
      timeoutMs,
      'glmChat'
    );
    const text = c?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && isValidResponse(stripReasoning(text))) {
      recordGlmSuccess();
      return stripReasoning(text);
    }
    recordGlmFailure(new Error('empty/invalid chat response'));
    return null;
  } catch (e) {
    if (e?.name === 'AbortError' || /timeout/i.test(e?.message || '')) {
      recordGlmFailure(new Error('timeout'));
      return null;
    }
    handleGlmError(e);
    return null;
  }
}

// ── GLM chat, STREAMING into VORTIS SSE format → boolean ──
// Writes:  data: {"content":"…"}\n\n … data: [DONE]\n\n
// Returns true only if content was actually delivered to the client.
export async function glmStream(messages, res, { clientSignal = null, maxTokens = 8192, temperature = 0.7, bufferMode = false, kind = 'chat', repairFn = null, firstByteMs = 12000, idleMs = 20000, maxContinuations = 2 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return false;
  if (!(await glmClaimSlot())) return false;
  recordGlmCall(kind);

  const safeWrite = (chunk) => {
    if (res.writableEnded || clientSignal?.aborted) return false;
    try { res.write(chunk); if (res.flush) res.flush(); return true; }
    catch (_) { return false; }
  };

  const convo = [...messages];
  let continuations = 0;

  while (true) {
    if (clientSignal?.aborted) return false;

    let stream;
    try {
      stream = await withTimeout(
        z.chat.completions.create({
          messages: convo,
          max_tokens: maxTokens,
          temperature,
          stream: true,
          thinking: { type: 'disabled' },
        }),
        firstByteMs + 6000, // headers + first bytes budget (reader idle timer takes over after)
        'glmStream-init'
      );
    } catch (e) {
      handleGlmError(e);
      return false;
    }
    if (!(stream instanceof ReadableStream)) {
      // endpoint answered non-stream JSON — treat as full response
      const text = stream?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && isValidResponse(stripReasoning(text))) {
        recordGlmSuccess();
        const out = bufferMode && repairFn ? repairFn(stripReasoning(text)) : stripReasoning(text);
        safeWrite(`data: ${JSON.stringify({ content: out })}\n\n`);
        safeWrite('data: [DONE]\n\n');
        try { res.end(); } catch (_) {}
        return true;
      }
      recordGlmFailure(new Error('non-stream fallback had no valid content'));
      return false;
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending = '';
    let turnText = '';
    let fullText = '';
    let written = 0;
    let finishReason = null;
    let streamError = null;
    let clientGone = false;
    let drainMode = false; // client left: keep reading (discarding) to EOF
    const thinkState = { inThink: false };

    let idleTimer = null;
    const armIdle = (ms, why) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.warn(`glm-stream: ${why} — cancelling reader`);
        try { reader.cancel(why).catch(() => {}); } catch (_) {}
      }, ms);
    };
    armIdle(firstByteMs, `first-byte timeout (${firstByteMs}ms)`);

    try {
      while (true) {
        if (clientSignal?.aborted) { clientGone = true; drainMode = true; }
        const { done, value } = await reader.read();
        if (done) break;
        armIdle(Math.max(idleMs, drainMode ? 30000 : 0), `idle timeout (${drainMode ? 'drain' : idleMs + 'ms'})`);
        if (drainMode) continue; // client is gone — drain politely, discard bytes
        buffer += decoder.decode(value, { stream: true });

        let nlIdx;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (!line || !line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') continue;
          let payload;
          try { payload = JSON.parse(raw); } catch (_) { continue; }
          finishReason = payload?.choices?.[0]?.finish_reason || finishReason;
          const token = payload?.choices?.[0]?.delta?.content;
          if (typeof token !== 'string' || !token) continue;

          turnText += token;
          fullText += token;
          pending += token;
          const { safe, rest } = filterThinkChunk(pending, thinkState);
          pending = rest;
          if (safe && !bufferMode) {
            written += safe.length;
            if (!safeWrite(`data: ${JSON.stringify({ content: safe })}\n\n`)) {
              // Client left mid-stream. Instead of canceling the GLM stream
              // (an early-cancel makes the session gateway 429 the NEXT
              // request), switch to drain mode and read to natural EOF.
              clientGone = true;
              drainMode = true;
              break;
            }
          }
        }
      }
    } catch (e) {
      streamError = e;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      // Only hard-cancel when NOT draining (a cancel mid-stream trips the
      // session gateway's 429 on the next call; draining to EOF is polite).
      if (!drainMode) { try { reader.cancel('cleanup').catch(() => {}); } catch (_) {} }
    }

    if (clientGone || clientSignal?.aborted) {
      try { res.end(); } catch (_) {}
      // Stream fully drained (or still draining politely in the background
      // if the read loop exited via error) — safe for the next request.
      return written > 0;
    }

    if (streamError) {
      if (written > 0) { // partial content already delivered — end gracefully
        try { res.write('data: [DONE]\n\n'); res.end(); } catch (_) {}
        return true;
      }
      handleGlmError(streamError);
      return false;
    }

    // flush any remaining pending (outside think)
    if (!thinkState.inThink && pending) {
      written += pending.length;
      if (!bufferMode) safeWrite(`data: ${JSON.stringify({ content: pending })}\n\n`);
      pending = '';
    }

    const visibleText = stripReasoning(fullText);
    const gotContent = visibleText.trim().length > 0;

    if (!gotContent && written === 0) {
      recordGlmFailure(new Error('stream produced no visible content'));
      return false;
    }

    // continuation when truncated by max_tokens
    if (finishReason === 'length' && continuations < maxContinuations && visibleText.length > 0) {
      continuations++;
      console.log(`glm-stream: truncated by max_tokens — auto-continuing (${continuations}/${maxContinuations})`);
      convo.push({ role: 'assistant', content: turnText.slice(-12000) });
      convo.push({ role: 'user', content: 'Continue EXACTLY where you left off. Do NOT repeat any text from before. Do NOT add any preamble. Output only the next characters that would naturally follow.' });
      continue;
    }

    recordGlmSuccess();
    if (bufferMode) {
      const repaired = repairFn ? repairFn(visibleText) : visibleText;
      safeWrite(`data: ${JSON.stringify({ content: repaired })}\n\n`);
    }
    safeWrite('data: [DONE]\n\n');
    try { res.end(); } catch (_) {}
    return true;
  }
}

// ── GLM vision → description | null ──
export async function glmVision(base64Data, mime = 'image/jpeg', prompt = 'Describe this image in detail.', { kind = 'vision', timeoutMs = 45000 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return null;
  if (!(await glmClaimSlot())) return null;
  recordGlmCall(kind);
  try {
    const v = await withTimeout(
      z.chat.completions.createVision({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64Data}` } },
          ],
        }],
        max_tokens: 2048,
        thinking: { type: 'disabled' },
      }),
      timeoutMs,
      'glmVision'
    );
    const desc = v?.choices?.[0]?.message?.content;
    if (typeof desc === 'string' && desc.trim().length > 2) {
      recordGlmSuccess();
      return stripReasoning(desc);
    }
    recordGlmFailure(new Error('vision returned no content'));
    return null;
  } catch (e) {
    handleGlmError(e);
    return null;
  }
}

// ── GLM web search → VORTIS result shape ──
export async function glmSearch(query, num = 10, { kind = 'search', timeoutMs = 20000 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return [];
  if (!(await glmClaimSlot())) return [];
  recordGlmCall(kind);
  try {
    const r = await withTimeout(
      z.functions.invoke('web_search', { query, num }),
      timeoutMs,
      'glmSearch'
    );
    const items = Array.isArray(r) ? r : [];
    const mapped = items.map(item => ({
      title: item?.name || '',
      snippet: item?.snippet || '',
      link: item?.url || '#',
      source: item?.host_name || 'Web',
      date: item?.date || new Date().toISOString().split('T')[0],
    })).filter(x => x.title.length > 3);
    if (mapped.length > 0) recordGlmSuccess();
    return mapped;
  } catch (e) {
    handleGlmError(e);
    return [];
  }
}

// ── GLM image generation → { imageUrl: dataURL } | null ──
export async function glmImage(prompt, size = '1024x1024', { kind = 'image', timeoutMs = 90000 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return null;
  if (!(await glmClaimSlot())) return null;
  recordGlmCall(kind);
  try {
    const img = await withTimeout(
      z.images.generations.create({ prompt: prompt.slice(0, 800), size }),
      timeoutMs,
      'glmImage'
    );
    const b64 = img?.data?.[0]?.base64;
    if (b64 && b64.length > 100) {
      recordGlmSuccess();
      return { success: true, imageUrl: `data:image/png;base64,${b64}` };
    }
    recordGlmFailure(new Error('image gen returned no base64'));
    return null;
  } catch (e) {
    handleGlmError(e);
    return null;
  }
}

// ── GLM TTS → base64 wav | null ──
export async function glmTTS(text, voice = 'tongtong', { kind = 'tts', timeoutMs = 30000 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return null;
  if (!(await glmClaimSlot())) return null;
  recordGlmCall(kind);
  try {
    const r = await withTimeout(
      z.audio.tts.create({ input: text.slice(0, 900), voice, response_format: 'wav' }),
      timeoutMs,
      'glmTTS'
    );
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 100) {
      recordGlmSuccess();
      return buf.toString('base64');
    }
    recordGlmFailure(new Error('tts returned empty audio'));
    return null;
  } catch (e) {
    handleGlmError(e);
    return null;
  }
}

// ── GLM ASR → { text, language } | null ──
export async function glmASR(audioBase64, { kind = 'asr', timeoutMs = 30000 } = {}) {
  const z = await getZAI();
  if (!z || !glmBudgetOk(kind)) return null;
  if (!(await glmClaimSlot())) return null;
  recordGlmCall(kind);
  try {
    const r = await withTimeout(
      z.audio.asr.create({ file_base64: audioBase64 }),
      timeoutMs,
      'glmASR'
    );
    const text = (r?.text || '').trim();
    if (text) {
      recordGlmSuccess();
      return { text, language: r?.language || null };
    }
    recordGlmFailure(new Error('asr returned no text'));
    return null;
  } catch (e) {
    handleGlmError(e);
    return null;
  }
}

// ── health snapshot for /debug/glm-health ──
export function glmHealth() {
  const used = rpmUsed('chat');
  return {
    config_source: _configSource,
    online: Boolean(_cachedZai),
    cooldown_remaining_sec: Math.max(0, Math.round((glmCooldownUntil - Date.now()) / 1000)),
    rpm: {
      global_used: used.global, global_limit: GLM_GLOBAL_RPM,
      per_kind_used: Object.keys(GLM_KIND_RPM).map(k => ({
        kind: k, used: rpmUsed(k).kind, limit: GLM_KIND_RPM[k],
      })),
      min_gap_ms: GLM_MIN_GAP_MS,
    },
    stats: { ...stats, last_ok_at: stats.lastOkAt ? new Date(stats.lastOkAt).toISOString() : null },
  };
}
