import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

// CRITICAL: Tells the internal ONNX runtime engine to skip checking for 
// quantization properties that cause the "Missing required scale" crash.
env.backends.onnx.quantized = false;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-small',
    {
      quantized: false, // 💡 CHANGED TO FALSE: Bypasses the broken qdq_actions matrix bug
      progress_callback: onProgress,
    }
  );
  return transcriber;
};

export const transcribeAudio = async (audioFloat32Array, language = null) => {
  const asr = await loadWhisper();
  const result = await asr(audioFloat32Array, {
    language: language || undefined,
    task: 'transcribe',
  });
  return result?.text?.trim() || '';
};