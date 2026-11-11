import path from 'path';
import { promises as fs } from 'fs';
import {
  parsePatchBlocks,
  type InlineRun,
  type PatchBlock,
} from './releaseNotesHtml';

export async function loadPatchImageBuffer(src: string): Promise<Buffer | null> {
  try {
    if (!src) return null;

    if (src.startsWith('data:image/')) {
      const base64Part = src.split(',')[1];
      if (!base64Part) return null;
      return Buffer.from(base64Part, 'base64');
    }

    const normalized = src.trim();
    const isLocalUploadPath =
      normalized.startsWith('/uploads/') ||
      normalized.startsWith('uploads/') ||
      normalized.startsWith('/attachments/') ||
      normalized.startsWith('attachments/');

    if (isLocalUploadPath) {
      const relativePath = normalized.replace(/^\//, '');
      const absolutePath = path.resolve(process.cwd(), relativePath);
      return await fs.readFile(absolutePath);
    }

    if (/^https?:\/\//i.test(normalized)) {
      const response = await fetch(normalized);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  } catch {
    return null;
  }
}

function runsPlainText(runs: InlineRun[]): string {
  return runs
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSectionLabel(runs: InlineRun[]): boolean {
  const plain = runsPlainText(runs);
  if (!/^(Added|Changed|Fixed|Removed|Deprecated|Security)$/i.test(plain)) {
    return false;
  }
  // Treat as a label when entirely emphasized or a short standalone paragraph.
  return runs.every((run) => run.bold || run.italic) || plain.length <= 20;
}

function pdfFontForRun(run: InlineRun): string {
  if (run.bold && run.italic) return 'Helvetica-BoldOblique';
  if (run.bold) return 'Helvetica-Bold';
  if (run.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function renderInlineRuns(
  doc: PDFKit.PDFDocument,
  runs: InlineRun[],
  options: {
    x: number;
    width: number;
    size: number;
    color: string;
    indent?: number;
  }
): void {
  const usable = runs
    .map((run) => ({ ...run, text: run.text.replace(/\s+/g, ' ') }))
    .filter((run) => run.text.length > 0);
  if (usable.length === 0) return;

  const x = options.x + (options.indent || 0);
  const width = Math.max(40, options.width - (options.indent || 0));

  usable.forEach((run, index) => {
    const isLast = index === usable.length - 1;
    doc
      .fillColor(options.color)
      .fontSize(options.size)
      .font(pdfFontForRun(run))
      .text(run.text, index === 0 ? x : undefined, index === 0 ? doc.y : undefined, {
        width,
        lineGap: 2,
        continued: !isLast,
      });
  });
}

async function renderImageBlock(
  doc: PDFKit.PDFDocument,
  block: Extract<PatchBlock, { type: 'image' }>,
  options: {
    textSize: number;
    x: number;
    width: number;
    midGray: string;
  }
): Promise<void> {
  const imageBuffer = await loadPatchImageBuffer(block.src);
  if (!imageBuffer) {
    if (block.alt) {
      doc
        .fillColor(options.midGray)
        .fontSize(options.textSize - 1)
        .font('Helvetica-Oblique')
        .text(`[Image not available: ${block.alt}]`, options.x, doc.y, { width: options.width });
    }
    return;
  }

  try {
    const opened = (doc as any).openImage(imageBuffer);
    const maxWidth = options.width;
    const maxHeight = 240;
    const scale = Math.min(maxWidth / opened.width, maxHeight / opened.height, 1);
    const renderWidth = Math.max(1, Math.floor(opened.width * scale));
    const renderHeight = Math.max(1, Math.floor(opened.height * scale));

    const pageBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + renderHeight + 12 > pageBottom) {
      doc.addPage();
    }

    doc.image(imageBuffer, options.x, doc.y, { width: renderWidth, height: renderHeight });
    doc.y += renderHeight + 8;
  } catch {
    if (block.alt) {
      doc
        .fillColor(options.midGray)
        .fontSize(options.textSize - 1)
        .font('Helvetica-Oblique')
        .text(`[Image could not be rendered: ${block.alt}]`, options.x, doc.y, { width: options.width });
    }
  }
}

export async function renderPatchNotesToPdf(
  doc: PDFKit.PDFDocument,
  patchHtml: string | null | undefined,
  options: {
    textSize: number;
    x: number;
    width: number;
    darkGray: string;
    midGray: string;
  }
): Promise<void> {
  if (!patchHtml) {
    doc
      .fillColor(options.midGray)
      .fontSize(options.textSize)
      .font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  const blocks = parsePatchBlocks(String(patchHtml));
  if (blocks.length === 0) {
    doc
      .fillColor(options.midGray)
      .fontSize(options.textSize)
      .font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  let isFirstBlock = true;

  for (const block of blocks) {
    if (block.type === 'image') {
      await renderImageBlock(doc, block, options);
      isFirstBlock = false;
      continue;
    }

    if (block.type === 'text') {
      const line = block.text.trim();
      if (!line) {
        doc.moveDown(0.25);
        continue;
      }
      const display = block.bullet ? `• ${line}` : line;
      doc
        .fillColor(options.darkGray)
        .fontSize(options.textSize)
        .font('Helvetica')
        .text(display, options.x, doc.y, {
          width: options.width,
          lineGap: 2,
          paragraphGap: block.bullet ? 2 : 0,
        });
      isFirstBlock = false;
      continue;
    }

    const plain = runsPlainText(block.runs);
    if (!plain) continue;

    if (block.type === 'heading') {
      if (!isFirstBlock) doc.moveDown(0.55);
      const size =
        block.level <= 1
          ? options.textSize + 4
          : block.level === 2
            ? options.textSize + 3
            : options.textSize + 1;
      renderInlineRuns(
        doc,
        block.runs.map((run) => ({ ...run, bold: true })),
        {
          x: options.x,
          width: options.width,
          size,
          color: options.darkGray,
        }
      );
      doc.moveDown(0.2);
      isFirstBlock = false;
      continue;
    }

    if (block.type === 'paragraph') {
      const asLabel = isSectionLabel(block.runs);
      if (!isFirstBlock) doc.moveDown(asLabel ? 0.45 : 0.2);
      const runs = asLabel
        ? block.runs.map((run) => ({ ...run, bold: true }))
        : block.runs;
      renderInlineRuns(doc, runs, {
        x: options.x,
        width: options.width,
        size: asLabel ? options.textSize + 1 : options.textSize,
        color: options.darkGray,
      });
      isFirstBlock = false;
      continue;
    }

    if (block.type === 'listItem') {
      const depth = Math.max(0, block.depth || 0);
      const indent = 10 + depth * 14;
      const marker = block.ordered ? `${block.index || 1}. ` : '• ';
      if (!isFirstBlock) doc.moveDown(0.08);
      renderInlineRuns(
        doc,
        [{ text: marker }, ...block.runs],
        {
          x: options.x,
          width: options.width,
          size: options.textSize,
          color: options.darkGray,
          indent,
        }
      );
      isFirstBlock = false;
    }
  }
}
