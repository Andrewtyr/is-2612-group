import { BadRequestException } from '@nestjs/common';
import { basename } from 'node:path';

export const maxAttachmentSize = 5 * 1024 * 1024;

export function validateAttachment(
  contentType: string,
  contents: Buffer,
  originalName: string,
) {
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  if (contents.length === 0 || contents.length > maxAttachmentSize)
    throw new BadRequestException(
      'Размер документа должен быть от 1 байта до 5 МБ',
    );

  const signatures: Record<string, { extension: string; valid: boolean }> = {
    'application/pdf': {
      extension: '.pdf',
      valid: contents.subarray(0, 5).toString() === '%PDF-',
    },
    'image/jpeg': {
      extension: '.jpg',
      valid:
        contents.length >= 3 &&
        contents[0] === 0xff &&
        contents[1] === 0xd8 &&
        contents[2] === 0xff,
    },
    'image/png': {
      extension: '.png',
      valid: contents
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    },
  };
  const match = signatures[mimeType];
  if (!match?.valid)
    throw new BadRequestException('Допустимы только PDF, JPG и PNG');

  const safeName = basename(originalName.replaceAll('\\', '/'))
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .slice(0, 120);
  return {
    mimeType,
    extension: match.extension,
    fileName:
      safeName && safeName !== '.' && safeName !== '..'
        ? safeName
        : `документ${match.extension}`,
  };
}
