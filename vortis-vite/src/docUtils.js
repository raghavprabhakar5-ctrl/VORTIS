/**
 * docUtils.js — drop-in replacement for the broken `handleDocUpload` flow in App.jsx
 *
 * WHAT WAS BROKEN
 * ────────────────
 * App.jsx did this for every file:
 *
 *     reader.readAsText(file)              //  binary garbage for PDFs and DOCX
 *
 * …then immediately told the user "I've read it — ask me anything" *before*
 * checking whether the extracted text was real, and shoved the raw bytes into
 * the system prompt. Result:
 *   • The AI "thought" it had a PDF even when extraction failed.
 *   • When asked about the PDF, it had nothing but garbled bytes in context.
 *
 * WHAT THIS FILE DOES
 * ───────────────────
 *   1.  Routes each file type to the right parser:
 *         .pdf  → pdfjs-dist (real text extraction, in the browser, no backend)
 *         .docx → mammoth    (already used by CodeChat.jsx)
 *         .txt/.md/.csv/.json/.xml/.html/code files → plain readAsText
 *   2.  Returns a structured result so the caller knows whether extraction
 *       actually succeeded, and never lies to the user.
 *   3.  Caps content size so the system prompt doesn't blow up.
 *
 * REQUIRED DEPS (add to package.json)
 * ───────────────────────────────────
 *   npm i pdfjs-dist mammoth
 *
 *   // pdfjs-dist v4+ ships the worker as a separate URL. Configure it once:
 *   // in App.jsx (or wherever you import this), add:
 *   //   import { setupPdfWorker } from './docUtils';
 *   //   setupPdfWorker();
 *
 * EXPORTS
 * ───────
 *   setupPdfWorker()              → call once at module init
 *   extractDocText(file)          → Promise<DocResult>
 *   DocResult shape:
 *     {
 *       ok: boolean,              // true = real text was extracted
 *       kind: 'pdf'|'docx'|'text'|'unknown',
 *       name: string,             // file name
 *       text: string,             // extracted text (capped at MAX_DOC_CHARS)
 *       truncated: boolean,       // true if text was capped
 *       pages?: number,           // PDF only — page count
 *       error?: string,           // set when ok === false
 *     }
 */

import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import mammoth from 'mammoth';

// ── pdf.js worker setup (do this ONCE) ──────────────────────────────────────
let _pdfWorkerReady = false;
export function setupPdfWorker() {
  if (_pdfWorkerReady) return;
  try {
    // Vite / Webpack 5+ can resolve this URL string at build time.
    // If you're on CRA, this also works (CRA recognises new URL(...) for assets).
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch (_) {
    // Fallback: use the CDN-matched worker. Replace the version if you pin a
    // different pdfjs-dist in package.json.
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';
  }
  _pdfWorkerReady = true;
}

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_DOC_CHARS = 60000; // hard cap so system prompt stays manageable

// ── File-type detection ─────────────────────────────────────────────────────
const fileExt = (name = '') => {
  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const isPdfFile = (name, mime) =>
  (mime && mime === 'application/pdf') || fileExt(name) === 'pdf';

const isDocxFile = (name, mime) =>
  mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
  fileExt(name) === 'docx';

// Plain-text-friendly extensions — anything here gets readAsText.
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml',
  'ini', 'env', 'log', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h',
  'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'dockerfile',
  'makefile', 'rtf',
]);

const isTextFile = (name, mime) => {
  if (mime && (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml')) {
    return true;
  }
  return TEXT_EXTENSIONS.has(fileExt(name));
};

// ── Low-level file readers ──────────────────────────────────────────────────
const readAsText = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('readAsText failed'));
    r.readAsText(file);
  });

const readAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('readAsArrayBuffer failed'));
    r.readAsArrayBuffer(file);
  });

// ── PDF extraction (pdfjs-dist) ─────────────────────────────────────────────
const extractPdfText = async (file) => {
  setupPdfWorker();
  const buf = await readAsArrayBuffer(file);
  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  let out = '';
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join text items with spaces, preserve paragraph-ish breaks.
    const pageText = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      out += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    // Hard safety cap — never let a 1000-page PDF freeze the tab.
    if (out.length > MAX_DOC_CHARS * 2) break;
  }
  return { text: out.trim(), pages: pageCount };
};

// ── DOCX extraction (mammoth) ───────────────────────────────────────────────
const extractDocxText = async (file) => {
  const buf = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result?.value || '').trim();
};

// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Extract usable text from any supported file.
 * Always returns a DocResult — never throws.
 *
 * @param {File} file
 * @returns {Promise<{
 *   ok: boolean,
 *   kind: 'pdf'|'docx'|'text'|'unknown',
 *   name: string,
 *   text: string,
 *   truncated: boolean,
 *   pages?: number,
 *   error?: string,
 * }>}
 */
export async function extractDocText(file) {
  const name = file?.name || 'unknown';

  if (!file) {
    return { ok: false, kind: 'unknown', name, text: '', truncated: false, error: 'No file provided.' };
  }

  try {
    let kind = 'unknown';
    let raw = '';
    let pages;

    if (isPdfFile(file.name, file.type)) {
      kind = 'pdf';
      const r = await extractPdfText(file);
      raw = r.text;
      pages = r.pages;
    } else if (isDocxFile(file.name, file.type)) {
      kind = 'docx';
      raw = await extractDocxText(file);
    } else if (isTextFile(file.name, file.type)) {
      kind = 'text';
      raw = await readAsText(file);
    } else {
      // Unknown binary format (legacy .doc, pptx, xlsx, etc.) — be honest.
      return {
        ok: false,
        kind: 'unknown',
        name,
        text: '',
        truncated: false,
        error: `Cannot extract text from "${file.name}". Supported: PDF, DOCX, TXT, MD, CSV, JSON, code files.`,
      };
    }

    const truncated = raw.length > MAX_DOC_CHARS;
    const text = truncated ? raw.slice(0, MAX_DOC_CHARS) : raw;
    const ok = text.trim().length > 0;

    return {
      ok,
      kind,
      name,
      text,
      truncated,
      ...(pages ? { pages } : {}),
      ...(ok ? {} : { error: `Could not extract any text from "${file.name}". It might be a scanned PDF (no text layer) or an empty file.` }),
    };
  } catch (err) {
    console.error('extractDocText failed:', err);
    return {
      ok: false,
      kind: 'unknown',
      name,
      text: '',
      truncated: false,
      error: `Extraction failed: ${err?.message || 'unknown error'}`,
    };
  }
}

export { MAX_DOC_CHARS, isPdfFile, isDocxFile, isTextFile };
