const API = 'https://vortis-backend.vercel.app/api/bytez';

const floatTo16BitPCM = (float32Array) => {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};

const encodeWAV = (float32Array, sampleRate = 16000) => {
  const pcmData = floatTo16BitPCM(float32Array);
  const buffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcmData.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcmData));
  return buffer;
};

const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export const transcribeAudio = async (audioFloat32Array, language = null) => {
  const wavBuffer = encodeWAV(audioFloat32Array, 16000);
  const base64Audio = arrayBufferToBase64(wavBuffer);

  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken(true);

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-App-Key': 'vortis-2026',
    },
    body: JSON.stringify({ action: 'transcribe', audio: base64Audio, language: language || undefined }),
  });

  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  const data = await res.json();
  return { text: (data.text || '').trim(), language: data.language || null }; // ← return language too
};