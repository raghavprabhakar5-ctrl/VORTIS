/**
 * chatExport.js — let the user download a chat as PDF / DOCX / TXT / MD / HTML / JSON / CSV.
 *
 * Pure browser-side — no backend round-trip, no server storage.
 *
 * DEPS
 *   npm i jspdf docx file-saver
 *
 * FIXES vs the previous version:
 *   1. PDF generation was breaking on any emoji, curly quote, em-dash, or bullet
 *      glyph (✦ ▸ •) because jsPDF's built-in fonts (helvetica/courier) only
 *      support Latin-1 (WinAnsi) — anything outside that range corrupts the
 *      PDF or throws. We now sanitize all text before it reaches jsPDF:
 *      common "smart" punctuation is normalized to plain ASCII, and any
 *      remaining non-Latin-1 codepoint (emoji, CJK, Devanagari, etc.) is
 *      stripped so the PDF always renders instead of failing silently.
 *      DOCX/TXT/MD are untouched by this — Word's XML format embeds real
 *      Unicode fonts, so it never had this problem.
 *   2. labelFor()/isUser now read BOTH m.role and m.type — the app's actual
 *      chat message objects use `type` ('user' | 'vortis' | 'system'), not
 *      `role`, so the old code always mislabeled messages and never
 *      detected user messages.
 *   3. exportChat() now accepts every format App.js's SUPPORTED_BY_LIB set
 *      claims to support (html, htm, json, csv, markdown) instead of
 *      throwing "Unknown export format" for anything but pdf/docx/txt/md.
 *
 * messages shape:
 *   [{ role?: string, type?: string, text: string, ts?: number|string|Date }, ...]
 *
 * opts shape (all optional):
 *   { title?, filename?, userName?, aiName? }
 */

import { jsPDF } from 'jspdf';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';

// ── Helpers ─────────────────────────────────────────────────────────────────
const safe = (s) => String(s ?? '');

const roleOf = (m) => safe(m?.role || m?.type).toLowerCase();

const stampToDate = (ts) => {
  if (!ts) return null;
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch (_) {
    return null;
  }
};

const fmtTs = (ts) => {
  const d = stampToDate(ts);
  if (!d) return '';
  return d.toLocaleString();
};

const slugify = (s) =>
  safe(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'chat';

const stripMarkdown = (s) =>
  safe(s)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .trim();

const labelFor = (m, aiName) => {
  const role = roleOf(m);
  if (role === 'user') return 'You';
  if (role === 'assistant' || role === 'vortis' || role === 'ai') return aiName || 'Vortis';
  if (role === 'system') return 'System';
  return role || 'Message';
};

// ── PDF-safe text sanitization ───────────────────────────────────────────────
// jsPDF's standard 14 fonts (helvetica, courier, times) only cover Latin-1 /
// WinAnsi (roughly codepoints 0x00–0xFF, mapped through a custom table).
// Anything outside that — emoji, curly quotes, em/en dashes, bullets like
// ✦ ▸ •, non-Latin scripts — either renders as garbage or corrupts the PDF
// so it won't open. Rather than embedding a full Unicode font (heavy, and
// still needs per-script coverage), we normalize common "smart" punctuation
// to plain ASCII and drop anything else outside Latin-1. This guarantees
// the PDF always generates; a few decorative characters just won't appear.
const PDF_CHAR_MAP = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
  '\u2013': '-', '\u2014': '--', '\u2015': '--',
  '\u2026': '...',
  '\u2022': '-', '\u25AA': '-', '\u25B8': '>', '\u2726': '*', '\u2727': '*',
  '\u2192': '->', '\u2190': '<-', '\u2191': '^', '\u2193': 'v',
  '\u00A0': ' ',
};

function sanitizeForPdf(text) {
  if (!text) return '';
  let out = String(text);
  for (const [from, to] of Object.entries(PDF_CHAR_MAP)) {
    out = out.split(from).join(to);
  }
  // Strip surrogate-pair emoji and any other codepoint outside Latin-1.
  // (Latin-1 supplement covers 0x00–0xFF; jsPDF's core fonts map that range.)
  out = out.replace(/[\u{10000}-\u{10FFFF}]/gu, ''); // emoji / supplementary plane
  out = out.replace(/[^\u0000-\u00FF\n\r\t]/g, '');  // anything else non-Latin-1
  return out;
}

// ── TXT ─────────────────────────────────────────────────────────────────────
export function exportChatAsTxt(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const aiName = opts.aiName || 'Vortis';
  const lines = [];

  lines.push(`# ${title}`);
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push('='.repeat(60));
  lines.push('');

  for (const m of (messages || [])) {
    const ts = fmtTs(m.ts);
    lines.push(`[${labelFor(m, aiName)}]${ts ? `  ${ts}` : ''}`);
    lines.push(safe(m.text));
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, `${slugify(opts.filename || title)}.txt`);
}

// ── Markdown ────────────────────────────────────────────────────────────────
export function exportChatAsMd(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const aiName = opts.aiName || 'Vortis';
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`_Exported: ${new Date().toLocaleString()}_`);
  lines.push('');

  for (const m of (messages || [])) {
    const who = labelFor(m, aiName);
    const ts = fmtTs(m.ts);
    lines.push(`## ${who}${ts ? ` — ${ts}` : ''}`);
    lines.push('');
    lines.push(safe(m.text));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${slugify(opts.filename || title)}.md`);
}

// ── HTML — for GENERATE_DOCUMENT html/htm requests, or a shareable export ──
export function exportChatAsHtml(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const aiName = opts.aiName || 'Vortis';
  const esc = (s) => safe(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = (messages || []).map((m) => {
    const who = esc(labelFor(m, aiName));
    const ts = esc(fmtTs(m.ts));
    const isUser = roleOf(m) === 'user';
    const text = esc(safe(m.text)).replace(/\n/g, '<br/>');
    return `<div style="margin:0 0 18px;padding:12px 16px;border-radius:8px;background:${isUser ? '#eef2ff' : '#f5f5f5'}">
  <div style="font-weight:700;font-size:13px;color:${isUser ? '#4f46e5' : '#10b981'};margin-bottom:6px">${who}${ts ? ` &middot; ${ts}` : ''}</div>
  <div style="font-size:14px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap">${text}</div>
</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px">
<h1 style="font-size:22px;margin-bottom:4px">${esc(title)}</h1>
<p style="color:#888;font-size:12px;margin-bottom:24px">Exported: ${esc(new Date().toLocaleString())}</p>
${body}
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  saveAs(blob, `${slugify(opts.filename || title)}.html`);
}

// ── JSON — raw structured export, mainly for GENERATE_DOCUMENT json requests ──
export function exportChatAsJson(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const payload = {
    title,
    exportedAt: new Date().toISOString(),
    messages: (messages || []).map((m) => ({
      role: roleOf(m) || 'message',
      text: safe(m.text),
      ts: m.ts ?? null,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  saveAs(blob, `${slugify(opts.filename || title)}.json`);
}

// ── CSV — one row per message ──
export function exportChatAsCsv(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const escCell = (s) => `"${safe(s).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const rows = [['role', 'timestamp', 'text'].map(escCell).join(',')];
  for (const m of (messages || [])) {
    rows.push([roleOf(m) || 'message', fmtTs(m.ts), safe(m.text)].map(escCell).join(','));
  }
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${slugify(opts.filename || title)}.csv`);
}

// ── PDF (jsPDF) ─────────────────────────────────────────────────────────────
export function exportChatAsPdf(messages, opts = {}) {
  const title = sanitizeForPdf(opts.title || 'Chat Export');
  const aiName = sanitizeForPdf(opts.aiName || 'Vortis');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (h) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeParagraph = (rawText, { font = 'helvetica', size = 10, style = 'normal', color = [30, 30, 30], gapAfter = 6 }) => {
    const text = sanitizeForPdf(rawText);
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, contentW) || [];
    const lineHeight = size * 1.35;
    for (const line of wrapped) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gapAfter;
  };

  writeParagraph(title, { font: 'helvetica', size: 20, style: 'bold', color: [15, 15, 15], gapAfter: 4 });
  writeParagraph(`Exported: ${new Date().toLocaleString()}`, { size: 9, style: 'normal', color: [120, 120, 120], gapAfter: 14 });

  ensureSpace(8);
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  for (const m of (messages || [])) {
    const who = labelFor(m, aiName);
    const ts = fmtTs(m.ts);
    const isUser = roleOf(m) === 'user';

    ensureSpace(20);
    writeParagraph(`${who}${ts ? `  \u00B7  ${ts}` : ''}`, {
      size: 11,
      style: 'bold',
      color: isUser ? [37, 99, 235] : [16, 185, 129],
      gapAfter: 4,
    });

    const body = safe(m.text);
    const parts = body.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('```') && part.endsWith('```')) {
        const inner = sanitizeForPdf(part.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, ''));
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        const codeLines = doc.splitTextToSize(inner, contentW - 16) || [];
        const lineHeight = 9 * 1.35;
        for (const cl of codeLines) {
          ensureSpace(lineHeight + 4);
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y - lineHeight + 2, contentW, lineHeight + 4, 'F');
          doc.text(cl, margin + 8, y);
          y += lineHeight + 4;
        }
        y += 6;
      } else {
        writeParagraph(stripMarkdown(part) || '(empty)', {
          size: 10,
          style: 'normal',
          color: [30, 30, 30],
          gapAfter: 8,
        });
      }
    }

    ensureSpace(10);
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${title}  \u2014  page ${i} / ${pageCount}`, margin, pageH - 24);
  }

  doc.save(`${slugify(opts.filename || title)}.pdf`);
}

// ── DOCX (docx + file-saver) — Unicode-safe, no sanitization needed ────────
export async function exportChatAsDocx(messages, opts = {}) {
  const title = opts.title || 'Chat Export';
  const aiName = opts.aiName || 'Vortis';

  const children = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: title, bold: true, size: 36 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: `Exported: ${new Date().toLocaleString()}`,
      italics: true, color: '888888', size: 18,
    })],
  }));
  children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));

  for (const m of (messages || [])) {
    const who = labelFor(m, aiName);
    const ts = fmtTs(m.ts);
    const isUser = roleOf(m) === 'user';

    children.push(new Paragraph({
      children: [new TextRun({
        text: `${who}${ts ? `  \u00B7  ${ts}` : ''}`,
        bold: true,
        color: isUser ? '2563EB' : '10B981',
        size: 22,
      })],
      spacing: { before: 240, after: 80 },
    }));

    const body = safe(m.text);
    const parts = body.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('```') && part.endsWith('```')) {
        const inner = part.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
        children.push(new Paragraph({
          children: [new TextRun({ text: inner, font: 'Consolas', size: 18, color: '333333' })],
          spacing: { after: 120 },
        }));
      } else {
        const txt = stripMarkdown(part);
        if (txt) {
          for (const para of txt.split(/\n\s*\n/)) {
            children.push(new Paragraph({
              children: [new TextRun({ text: para.trim(), size: 22 })],
              spacing: { after: 120 },
            }));
          }
        }
      }
    }
  }

  const doc = new Document({
    creator: aiName,
    title,
    description: 'Chat export',
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${slugify(opts.filename || title)}.docx`);
}

// ── Convenience: pick format from a single entrypoint ───────────────────────
export async function exportChat(messages, format, opts = {}) {
  switch ((format || '').toLowerCase()) {
    case 'txt':      return exportChatAsTxt(messages, opts);
    case 'md':
    case 'markdown':  return exportChatAsMd(messages, opts);
    case 'pdf':       return exportChatAsPdf(messages, opts);
    case 'docx':      return exportChatAsDocx(messages, opts);
    case 'html':
    case 'htm':       return exportChatAsHtml(messages, opts);
    case 'json':      return exportChatAsJson(messages, opts);
    case 'csv':       return exportChatAsCsv(messages, opts);
    default:
      throw new Error(`Unknown export format: ${format}. Use one of: pdf, docx, txt, md, html, json, csv.`);
  }
}