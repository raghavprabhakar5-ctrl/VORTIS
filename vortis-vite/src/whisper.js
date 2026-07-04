import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

const LARGE_FILE_REDIRECTS = {
  'encoder_model_quantized.onnx':
    'https://github.com/raghavprabhakar5-ctrl/VORTIS/releases/download/v1-whisper-models/encoder_model_quantized.onnx',
  'decoder_model_merged_quantized.onnx':
    'https://github.com/raghavprabhakar5-ctrl/VORTIS/releases/download/v1-whisper-models/decoder_model_merged_quantized.onnx',
};

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  for (const [filename, redirectUrl] of Object.entries(LARGE_FILE_REDIRECTS)) {
    if (url.includes(filename)) {
      console.log('Redirecting fetch for', filename, '→', redirectUrl);
      return originalFetch(redirectUrl, init);
    }
  }
  return originalFetch(input, init);
};

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
    console.log('Running ASR inference...');
    const result = await asr(audioFloat32Array, {
      language: language || undefined,
      task: 'transcribe',
    });
    console.log('ASR raw result:', result);
    const text = result?.text?.trim() || '';
    console.log('Final transcribed text:', JSON.stringify(text));
    return text;
  } catch (e) {
    console.error('transcribeAudio FAILED:', e);
    throw e;
  }
};