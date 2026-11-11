export type PatchTextLine = { text: string; bullet: boolean };

export type PatchBlock =
  | { type: 'text'; text: string; bullet: boolean }
  | { type: 'image'; src: string; alt?: string };

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripInlineTags(input: string): string {
  return input
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, ' ')
    .replace(/<\/?(strong|b|em|i|span|u|a)[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert release-note HTML into plain text lines.
 * List items keep the bullet on the same line as their content even when TipTap wraps
 * each <li> body in a <p>.
 */
export function htmlToTextLines(html: string): PatchTextLine[] {
  // Flatten <li> first so nested block tags cannot split "•" from the item text.
  let normalized = String(html || '').replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
    const itemText = decodeHtmlEntities(stripInlineTags(String(inner || '')));
    return itemText ? `\n• ${itemText}\n` : '\n';
  });

  normalized = normalized
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<em[^>]*>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/<[^>]*>/g, '');

  const lines = decodeHtmlEntities(normalized)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const isBullet = line.startsWith('•');
      const text = isBullet ? line.replace(/^•\s*/, '').trim() : line;
      return { text, bullet: isBullet && text.length > 0 };
    })
    .filter((line) => line.text.length > 0);

  return lines;
}

export function parsePatchBlocks(html: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index);
    const beforeLines = htmlToTextLines(before);
    for (const line of beforeLines) {
      blocks.push({ type: 'text', text: line.text, bullet: line.bullet });
    }

    const imgTag = match[0];
    const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i);
    const altMatch = imgTag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const src = srcMatch?.[1]?.trim();
    if (src) {
      blocks.push({ type: 'image', src, alt: altMatch?.[1] || '' });
    }

    lastIndex = imgRegex.lastIndex;
  }

  const after = html.slice(lastIndex);
  const afterLines = htmlToTextLines(after);
  for (const line of afterLines) {
    blocks.push({ type: 'text', text: line.text, bullet: line.bullet });
  }

  return blocks;
}
