import path from 'path';
import { promises as fs } from 'fs';
import { parsePatchBlocks } from './releaseNotesHtml';

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
    doc.fillColor(options.midGray).fontSize(options.textSize).font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  const blocks = parsePatchBlocks(String(patchHtml));
  if (blocks.length === 0) {
    doc.fillColor(options.midGray).fontSize(options.textSize).font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  for (const block of blocks) {
    if (block.type === 'text') {
      const line = block.text.trim();
      if (!line) {
        doc.moveDown(0.25);
        continue;
      }

      const display = block.bullet ? `• ${line}` : line;
      doc.fillColor(options.darkGray)
        .fontSize(options.textSize)
        .font('Helvetica')
        .text(display, options.x, doc.y, {
          width: options.width,
          lineGap: 2,
          paragraphGap: block.bullet ? 2 : 0,
        });
      continue;
    }

    const imageBuffer = await loadPatchImageBuffer(block.src);
    if (!imageBuffer) {
      if (block.alt) {
        doc.fillColor(options.midGray)
          .fontSize(options.textSize - 1)
          .font('Helvetica-Oblique')
          .text(`[Image not available: ${block.alt}]`, options.x, doc.y, { width: options.width });
      }
      continue;
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
        doc.fillColor(options.midGray)
          .fontSize(options.textSize - 1)
          .font('Helvetica-Oblique')
          .text(`[Image could not be rendered: ${block.alt}]`, options.x, doc.y, { width: options.width });
      }
    }
  }
}
