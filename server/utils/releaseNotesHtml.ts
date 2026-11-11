export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type PatchTextLine = { text: string; bullet: boolean };

export type PatchBlock =
  | { type: 'heading'; level: number; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'listItem'; runs: InlineRun[]; ordered?: boolean; index?: number; depth?: number }
  | { type: 'image'; src: string; alt?: string }
  /** @deprecated Prefer structured blocks; kept for callers that only need plain lines. */
  | { type: 'text'; text: string; bullet: boolean };

type HtmlToken =
  | { kind: 'tag'; name: string; closing: boolean; selfClosing: boolean; attrs: string }
  | { kind: 'text'; value: string };

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function attrValue(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() || '';
}

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) {
      const name = match[1].toLowerCase();
      const attrs = match[2] || '';
      const closing = match[0].startsWith('</');
      const selfClosing = !closing && /\/\s*>$/.test(match[0]);
      tokens.push({ kind: 'tag', name, closing, selfClosing, attrs });
    } else if (match[3]) {
      tokens.push({ kind: 'text', value: match[3] });
    }
  }
  return tokens;
}

function pushRun(runs: InlineRun[], text: string, bold: boolean, italic: boolean): void {
  const cleaned = text.replace(/\s+/g, ' ');
  if (!cleaned) return;
  // Preserve intentional leading/trailing spaces when merging mid-sentence.
  const value = cleaned;
  const last = runs[runs.length - 1];
  if (last && Boolean(last.bold) === bold && Boolean(last.italic) === italic) {
    last.text = `${last.text}${value}`.replace(/\s+/g, ' ');
    return;
  }
  runs.push({
    text: value,
    ...(bold ? { bold: true } : {}),
    ...(italic ? { italic: true } : {}),
  });
}

function runsPlainText(runs: InlineRun[]): string {
  return runs
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneRuns(runs: InlineRun[]): InlineRun[] {
  return runs
    .map((run) => ({
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
    }))
    .filter((run) => run.text.trim().length > 0 || run.text.includes(' '));
}

/**
 * Parse release-note HTML into structured blocks (headings, paragraphs with inline
 * bold/italic, list items, images).
 */
export function parsePatchBlocks(html: string): PatchBlock[] {
  const tokens = tokenizeHtml(String(html || ''));
  const blocks: PatchBlock[] = [];

  let bold = false;
  let italic = false;
  let headingLevel: number | null = null;
  let inParagraph = false;
  let inListItem = false;
  let currentRuns: InlineRun[] = [];
  const listStack: Array<{ ordered: boolean; index: number }> = [];

  const flushRunsAs = (type: 'heading' | 'paragraph' | 'listItem') => {
    const runs = cloneRuns(currentRuns);
    currentRuns = [];
    const plain = runsPlainText(runs);
    if (!plain) return;

    if (type === 'heading' && headingLevel != null) {
      blocks.push({ type: 'heading', level: headingLevel, runs });
      return;
    }
    if (type === 'listItem') {
      const list = listStack[listStack.length - 1];
      const depth = Math.max(0, listStack.length - 1);
      const ordered = Boolean(list?.ordered);
      const index = list ? list.index : 1;
      blocks.push({
        type: 'listItem',
        runs,
        ordered,
        index,
        depth,
      });
      return;
    }
    blocks.push({ type: 'paragraph', runs });
  };

  for (const token of tokens) {
    if (token.kind === 'text') {
      const decoded = decodeHtmlEntities(token.value);
      if (!decoded) continue;
      // Ignore whitespace-only text between block tags unless inside content.
      if (!decoded.trim() && !inParagraph && !inListItem && headingLevel == null) {
        continue;
      }
      pushRun(currentRuns, decoded, bold, italic);
      continue;
    }

    const { name, closing, selfClosing, attrs } = token;

    if (name === 'br') {
      pushRun(currentRuns, ' ', bold, italic);
      continue;
    }

    if (name === 'img') {
      if (currentRuns.length > 0) {
        if (headingLevel != null) flushRunsAs('heading');
        else if (inListItem) flushRunsAs('listItem');
        else flushRunsAs('paragraph');
      }
      const src = attrValue(attrs, 'src');
      if (src) {
        blocks.push({ type: 'image', src, alt: attrValue(attrs, 'alt') });
      }
      continue;
    }

    if (name === 'strong' || name === 'b') {
      bold = !closing;
      continue;
    }
    if (name === 'em' || name === 'i') {
      italic = !closing;
      continue;
    }

    if (/^h[1-6]$/.test(name)) {
      if (!closing) {
        if (currentRuns.length > 0) {
          if (inListItem) flushRunsAs('listItem');
          else flushRunsAs('paragraph');
        }
        headingLevel = Number(name.slice(1));
      } else {
        flushRunsAs('heading');
        headingLevel = null;
      }
      continue;
    }

    if (name === 'ul' || name === 'ol') {
      if (!closing) {
        listStack.push({ ordered: name === 'ol', index: 0 });
      } else if (listStack.length > 0) {
        listStack.pop();
      }
      continue;
    }

    if (name === 'li') {
      if (!closing) {
        if (currentRuns.length > 0 && !inListItem) {
          flushRunsAs(headingLevel != null ? 'heading' : 'paragraph');
        }
        inListItem = true;
        const list = listStack[listStack.length - 1];
        if (list) list.index += 1;
      } else {
        flushRunsAs('listItem');
        inListItem = false;
      }
      continue;
    }

    if (name === 'p' || name === 'div') {
      if (!closing) {
        // TipTap wraps list item bodies in <p>; keep accumulating into the list item.
        if (!inListItem) {
          if (currentRuns.length > 0) flushRunsAs('paragraph');
          inParagraph = true;
        }
      } else if (inListItem) {
        // no-op: wait for </li>
      } else {
        flushRunsAs('paragraph');
        inParagraph = false;
      }
      continue;
    }

    // Ignore other tags (span, a, u, …); their text content is still captured.
    if (selfClosing) continue;
  }

  if (currentRuns.length > 0) {
    if (headingLevel != null) flushRunsAs('heading');
    else if (inListItem) flushRunsAs('listItem');
    else flushRunsAs('paragraph');
  }

  return blocks;
}

/**
 * Convert release-note HTML into plain text lines (legacy helper for tests / simple consumers).
 */
export function htmlToTextLines(html: string): PatchTextLine[] {
  return parsePatchBlocks(html)
    .filter((block): block is Exclude<PatchBlock, { type: 'image' }> => block.type !== 'image')
    .map((block) => {
      if (block.type === 'text') {
        return { text: block.text, bullet: block.bullet };
      }
      const text = runsPlainText(block.runs);
      return {
        text,
        bullet: block.type === 'listItem',
      };
    })
    .filter((line) => line.text.length > 0);
}
