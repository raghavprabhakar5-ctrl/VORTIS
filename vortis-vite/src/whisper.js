import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

// ── Redirect large .onnx files to GitHub Releases (avoids git size limits) ──
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
      return originalFetch(redirectUrl, init);
    }
  }
  return originalFetch(input, init);
};

let transcriber = null;

export const loadWhisper = async (onProgress) => {
  if (transcriber) return transcriber;
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'whisper-small',
    {
      dtype: 'q8',
      local_files_only: true,
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