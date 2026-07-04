import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange, isBusy }) => {
  onStateChange?.('listening');

  const vad = await MicVAD.new({
    baseAssetPath: '/vad/',
    onnxWASMBasePath: '/vad/',
    onSpeechStart: () => { if (!isBusy?.()) onStateChange?.('listening'); },
    onSpeechEnd: async (audio) => {
      if (isBusy?.()) return;
      onStateChange?.('transcribing');
      const text = await transcribeAudio(audio);
      if (text) await onTranscript(text);
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