import { PdfConversionCache } from './pdf-conversion-cache';

describe('PdfConversionCache', () => {
  it('shares an in-flight conversion and reuses the PDF while the DOCX is unchanged', async () => {
    const cache = new PdfConversionCache();
    let resolveConversion!: (value: Buffer) => void;
    const convert = jest.fn(() => new Promise<Buffer>((resolve) => { resolveConversion = resolve; }));
    const docx = Buffer.from('contract version one');
    const first = cache.getOrCreate(docx, convert);
    const second = cache.getOrCreate(Buffer.from(docx), convert);

    expect(first).toBe(second);
    await Promise.resolve();
    expect(convert).toHaveBeenCalledTimes(1);
    resolveConversion(Buffer.from('pdf version one'));
    await expect(first).resolves.toEqual(Buffer.from('pdf version one'));
    await expect(cache.getOrCreate(docx, convert)).resolves.toEqual(Buffer.from('pdf version one'));
    expect(convert).toHaveBeenCalledTimes(1);

    await cache.getOrCreate(Buffer.from('contract version two'), () => Promise.resolve(Buffer.from('pdf version two')));
  });

  it('retries after a failed conversion', async () => {
    const cache = new PdfConversionCache();
    const docx = Buffer.from('contract');
    await expect(cache.getOrCreate(docx, () => Promise.reject(new Error('conversion failed')))).rejects.toThrow('conversion failed');
    await expect(cache.getOrCreate(docx, () => Promise.resolve(Buffer.from('pdf')))).resolves.toEqual(Buffer.from('pdf'));
  });

  it('evicts old results when the cache reaches its memory limit', async () => {
    const cache = new PdfConversionCache(10, 4);
    const first = jest.fn(() => Promise.resolve(Buffer.from('abcd')));
    await cache.getOrCreate(Buffer.from('first'), first);
    await cache.getOrCreate(Buffer.from('second'), () => Promise.resolve(Buffer.from('efgh')));
    await cache.getOrCreate(Buffer.from('first'), first);
    expect(first).toHaveBeenCalledTimes(2);
  });
});
