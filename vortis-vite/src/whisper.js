import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.backends.onnx.quantized = true;

let transcriber = null;

// Ensure this is exported
export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  
  console.log("📥 Loading fast Whisper model...");
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-tiny', // Using tiny to avoid browser lagging
    {
      quantized: true,
      dtype: 'q4',
      progress_callback: onProgress,
    }
  );
  return transcriber;
};

// ✨ CRITICAL: This must have 'export' right here so App.jsx can find it!
export const transcribeAudio = async (audioFloat32Array, language = null) => {
  const asr = await loadWhisper();
  console.log("🔊 Transcribing audio data buffer array...");
  
  const result = await asr(audioFloat32Array, {
    language: language || undefined,
    task: 'transcribe',
  });
  
  return result?.text?.trim() || '';
};