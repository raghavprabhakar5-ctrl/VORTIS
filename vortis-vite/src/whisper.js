import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

// 1. MUST BE TRUE so it looks for the compressed files your browser likes
env.backends.onnx.quantized = true;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  
  console.log("📥 Loading official fast v3 Whisper-Small...");
  
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-small', 
    {
      quantized: true,
      // 2. Explicitly use q4 or q8 so the file sizes drop to ~200MB instead of 900MB!
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