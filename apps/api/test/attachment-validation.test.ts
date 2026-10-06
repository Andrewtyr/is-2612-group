import { describe, expect, it } from 'vitest';
import { validateAttachment } from '../src/modules/absence/attachment-validation';

describe('absence document validation', () => {
  it('accepts a real PDF and removes path segments from its name', () => {
    expect(
      validateAttachment(
        'application/pdf',
        Buffer.from('%PDF-1.7'),
        '../справка.pdf',
      ),
    ).toEqual({
      mimeType: 'application/pdf',
      extension: '.pdf',
      fileName: 'справка.pdf',
    });
  });

  it('rejects a file whose contents do not match the declared type', () => {
    expect(() =>
      validateAttachment(
        'application/pdf',
        Buffer.from('not a PDF'),
        'fake.pdf',
      ),
    ).toThrow();
  });

  it('rejects oversized files', () => {
    expect(() =>
      validateAttachment(
        'image/png',
        Buffer.alloc(5 * 1024 * 1024 + 1),
        'x.png',
      ),
    ).toThrow();
  });
});
