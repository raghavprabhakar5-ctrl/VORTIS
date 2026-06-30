import { MicVAD } from '@ricky0123/vad-web';
import { loadWhisper, transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange }) => {
  try {
    // 1. Force the model to load FIRST while UI shows loading
    onStateChange?.('loading');
    console.log("⏳ Pipeline: Pre-loading Whisper engine...");
    await loadWhisper(); 

    // 2. ONLY start the microphone after the model is 100% ready
    console.log("🎙️ Pipeline: Model ready. Initializing microphone...");
    onStateChange?.('listening');

    const vad = await MicVAD.new({
      onSpeechStart: () => {
        onStateChange?.('listening');
      },
      onSpeechEnd: async (audio) => {
        onStateChange?.('transcribing');
        try {
          const text = await transcribeAudio(audio);
          if (text && text.trim().length > 1) {
            onTranscript(text);
          }
        } catch (err) {
          console.error("❌ Transcription error:", err);
        } finally {
          onStateChange?.('listening');
        }
      },
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechFrames: 3,
      redemptionFrames: 25,
    });

    vad.start();
    return vad;
  } catch (err) {
    console.error("❌ Critical Pipeline Failure:", err);
    onStateChange?.('idle');
    throw err;
  }
};