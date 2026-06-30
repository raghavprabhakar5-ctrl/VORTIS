import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

// Ensure v3 configuration avoids quantization glitches
env.backends.onnx.quantized = false;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  
  console.log("📥 Loading official v3 Whisper Model...");
  
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-small', // ✨ FIX: Changed from Xenova to the official v3 repo matching your library
    {
      quantized: false, 
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