import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.backends.onnx.quantized = true;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  
  console.log("📥 Loading hyper-fast Whisper Tiny Model...");
  
  transcriber = await pipeline(
    'automatic-speech-recognition',
    // ✨ CHANGE THIS LINE: Switch from whisper-small to whisper-tiny
    'onnx-community/whisper-tiny', 
    {
      quantized: true,
      dtype: 'q4', // Keeps it incredibly small and lightweight
      progress_callback: onProgress,
    }
  );
  
  console.log("✅ Whisper Tiny Loaded Successfully!");
  return transcriber;
};