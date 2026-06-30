import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-small',
    {
      quantized: true,
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