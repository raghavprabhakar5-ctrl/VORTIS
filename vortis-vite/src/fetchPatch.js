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

console.log('fetch patch installed');