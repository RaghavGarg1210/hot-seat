import { describe, it, expect } from 'vitest';
import { extractPdf } from '../apps/server/src/pdf';
function document(
  pages: number,
  text = 'Gather helps independent coffee shops reduce food waste with a preparation checklist.',
) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
describe('PDF ingestion', () => {
  it('extracts text and retains page numbers', async () => {
    const pages = await extractPdf(document(2));
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0].text).toContain('Gather');
  });
  it('rejects long and empty decks', async () => {
    await expect(extractPdf(document(41))).rejects.toThrow('40 pages');
    await expect(extractPdf(document(1, ''))).rejects.toThrow('No readable text');
  });
  it('rejects malformed files and oversize uploads', async () => {
    await expect(extractPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(extractPdf(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow('20 MB');
  });
});
