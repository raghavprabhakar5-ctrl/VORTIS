import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  console.log('Loading Whisper model...');
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'whisper-small',
    {
      dtype: 'q8',
      local_files_only: true,
      progress_callback: onProgress,
    }
  );
  console.log('Whisper model loaded successfully');
  return transcriber;
};

export const transcribeAudio = async (audioFloat32Array, language = null) => {
  console.log('transcribeAudio called, audio length:', audioFloat32Array?.length);
  try {
    const asr = await loadWhisper();
    const result = await asr(audioFloat32Array, {
      language: language || undefined,
      task: 'transcribe',
    });
    console.log('ASR raw result:', result);
    return result?.text?.trim() || '';
  } catch (e) {
    console.error('transcribeAudio FAILED:', e);
    throw e;
  }
};