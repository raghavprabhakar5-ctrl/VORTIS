import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange, isBusy }) => {
  onStateChange?.('loading');
  await transcribeAudio(new Float32Array(1), null).catch(() => {}); // warm up
  onStateChange?.('listening');

  const vad = await MicVAD.new({
    baseAssetPath: '/',
    onnxWASMBasePath: '/',
    onSpeechStart: () => {
      if (isBusy?.()) return; // ignore mic input while a turn is already processing
      onStateChange?.('listening');
    },
    onSpeechEnd: async (audio) => {
      if (isBusy?.()) return; // ← the actual guard: drop this segment entirely
      onStateChange?.('transcribing');
      const text = await transcribeAudio(audio);
      if (text) {
        await onTranscript(text); // ← now awaited
      }
      if (!isBusy?.()) onStateChange?.('listening');
    },
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.4,
    minSpeechFrames: 4,
    redemptionFrames: 16,
  });

  vad.start();
  return vad;
};