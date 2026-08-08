import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

// ── GLOBAL MIC STREAM REGISTRY ──
// vad-web (and possibly other libs) may call getUserMedia() internally and
// never expose or fully release that stream on destroy(). Instead of
// guessing at internal property names per-version, we patch
// getUserMedia ONCE at module load to record every stream this page opens,
// so we can force-stop ALL of them on hangup — guaranteed, regardless of
// what any library does internally.
if (typeof window !== 'undefined' && !window.__micStreamRegistryPatched) {
  window.__micStreamRegistryPatched = true;
  window.__activeMicStreams = new Set();

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await originalGetUserMedia(constraints);
    if (constraints?.audio) {
      window.__activeMicStreams.add(stream);
      // auto-remove from registry once all tracks naturally end
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => window.__activeMicStreams.delete(stream));
      });
    }
    return stream;
  };
}

export const stopAllMicStreams = () => {
  if (!window.__activeMicStreams) return;
  window.__activeMicStreams.forEach(stream => {
    stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
  });
  window.__activeMicStreams.clear();
};

export const startVoicePipeline = async ({ onTranscript, onStateChange, isBusy, getLanguageHint }) => {
  onStateChange?.('listening');

  const vad = await MicVAD.new({
    baseAssetPath: '/vad/',
    onnxWASMBasePath: '/vad/',
    onSpeechStart: () => { if (!isBusy?.()) onStateChange?.('listening'); },
    onSpeechEnd: async (audio) => {
      if (isBusy?.()) return;
      onStateChange?.('transcribing');
      const hint = getLanguageHint?.() || null;
      const { text, language } = await transcribeAudio(audio, hint);
      if (text) await onTranscript(text, language);
      if (!isBusy?.()) onStateChange?.('listening');
    },
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.4,
    minSpeechFrames: 4,
    redemptionFrames: 16,
  });

  vad.start();

  const originalDestroy = vad.destroy.bind(vad);
  vad.destroy = () => {
    try { originalDestroy(); } catch (_) {}
    // Guaranteed cleanup regardless of what vad-web released internally.
    stopAllMicStreams();
  };

  return vad;
};