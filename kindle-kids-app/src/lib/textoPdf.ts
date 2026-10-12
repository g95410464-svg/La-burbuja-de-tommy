/** Keeps the PDF's own reading order. Illustrated/scanned pages fall back to OCR. */
export function unirTextoPdf(items: Array<{ str?: string; hasEOL?: boolean }>): string {
  return items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '')
    .join('').replace(/-\s*\n\s*(?=\p{Ll})/gu, '').replace(/\s+/g, ' ').trim();
}
