import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange, isBusy, getLanguageHint }) => {
  onStateChange?.('listening');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const vad = await MicVAD.new({
    stream,
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
    stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
  };

  return vad;
};