import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange }) => {
  // Preload the model first so first utterance isn't slow
  onStateChange?.('loading');
  await transcribeAudio(new Float32Array(1), null).catch(() => {}); // warm up
  onStateChange?.('listening');

  const vad = await MicVAD.new({
    onSpeechStart: () => onStateChange?.('listening'),
    onSpeechEnd: async (audio) => {
      onStateChange?.('transcribing');
      const text = await transcribeAudio(audio);
      if (text) onTranscript(text);
      onStateChange?.('listening');
    },
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.4,
    minSpeechFrames: 4,
    redemptionFrames: 16, // patience before deciding the person stopped — raise if it cuts off too early
  });

  vad.start();
  return vad;
};