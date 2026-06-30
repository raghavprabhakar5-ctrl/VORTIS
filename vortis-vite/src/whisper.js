import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

// Re-enable quantization for v3's optimized layout
env.backends.onnx.quantized = true;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  
  console.log("📥 Loading official v3 Whisper Model...");
  
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-small', 
    {
      // Using 'q4' ensures we pull down the highly compressed, 
      // bug-free version (~200MB instead of 900MB)
      quantized: true,
      dtype: 'q4', 
      progress_callback: onProgress,
    }
  );
  
  console.log("✅ Whisper Model Loaded Successfully!");
  return transcriber;
};

export const transcribeAudio = async (audioFloat32Array, language = null) => {
  const asr = await loadWhisper();
  console.log("🔊 Transcribing audio data buffer array...");
  
  const result = await asr(audioFloat32Array, {
    language: language || undefined,
    task: 'transcribe',
  });
  
  return result?.text?.trim() || '';
};