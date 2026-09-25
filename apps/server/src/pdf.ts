import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
export async function extractPdf(buffer: Uint8Array) {
  if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('PDFs must be 20 MB or smaller.');
  const task = getDocument({ data: buffer, useSystemFonts: false, disableFontFace: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 40) throw new Error('PDFs must have 40 pages or fewer.');
    const pages = [];
    let total = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      total += text.length;
      if (total > 120000)
        throw new Error('This deck contains too much text. Paste a shorter brief.');
      pages.push({ page, text: text.slice(0, 30000) });
    }
    if (pages.reduce((n, p) => n + p.text.length, 0) < 40)
      throw new Error(
        'No readable text found. Scanned decks are not supported; paste your pitch brief instead.',
      );
    return pages;
  } finally {
    await task.destroy();
  }
}
