import { MicVAD } from '@ricky0123/vad-web';
import { transcribeAudio } from './whisper';

export const startVoicePipeline = async ({ onTranscript, onStateChange }) => {
  onStateChange?.('loading');
  
  // 💡 FIX 1: Warmup with 1 second of silence (16000 samples) instead of 1 sample.
  // Passing 1 sample causes an internal matrix dimension mismatch crash inside ONNX.
  await transcribeAudio(new Float32Array(16000), null).catch((e) => {
    console.log("Warmup handled:", e);
  }); 
  
  onStateChange?.('listening');

  const vad = await MicVAD.new({
    onSpeechStart: () => {
      console.log("🎙️ VAD: Speech started detecting...");
      onStateChange?.('listening');
    },
    onSpeechEnd: async (audio) => {
      console.log(`🤫 VAD: Speech ended. Processing chunk size: ${audio.length} samples`);
      onStateChange?.('transcribing');
      
      try {
        // audio is already a Float32Array at 16kHz provided natively by ricky0123/vad
        const text = await transcribeAudio(audio);
        console.log(`📝 VAD Transcript Result: "${text}"`);
        
        if (text && text.trim().length > 1) {
          onTranscript(text);
        }
      } catch (err) {
        console.error("❌ Pipeline transcription failed:", err);
      } finally {
        onStateChange?.('listening');
      }
    },
    // Fine-tuned settings for modern web browser environments
    positiveSpeechThreshold: 0.5, // Slightly lower to be more sensitive to speech
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 3,
    redemptionFrames: 25, // Increased patience so it doesn't cut you off mid-sentence
  });

  vad.start();
  return vad;
};