import { pipeline, env } from '@huggingface/transformers';

// Lock everything to local — zero network calls at runtime
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/'; // matches your public/models folder

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'whisper-base', // must match your folder name exactly
    {
      quantized: true,
      local_files_only: true,
      progress_callback: onProgress,
    }
  );
  return transcriber;
};

export const transcribeAudio = async (audioFloat32Array, language = null) => {
  const asr = await loadWhisper();
  const result = await asr(audioFloat32Array, {
    language: language || undefined, // omit = auto-detect
    task: 'transcribe',
  });
  return result?.text?.trim() || '';
};