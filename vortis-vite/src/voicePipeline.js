import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange, isBusy }) => {
  onStateChange?.('loading');
  try {
    await transcribeAudio(new Float32Array(1), null);
  } catch (e) {
    console.error('Whisper warm-up failed:', e);
  }
  onStateChange?.('listening');

  let vad;
  try {
    vad = await MicVAD.new({
      baseAssetPath: '/vad/',
      onnxWASMBasePath: '/vad/',
      onSpeechStart: () => {
        if (isBusy?.()) return;
        onStateChange?.('listening');
      },
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
  } catch (e) {
    console.error('MicVAD.new failed:', e);
    throw e; // let startVoiceCall's catch block handle showing an error
  }

  vad.start();
  return vad;
};