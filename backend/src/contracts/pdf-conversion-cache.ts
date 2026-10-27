import { createHash } from 'node:crypto';

type CacheEntry = { promise: Promise<Buffer>; size: number };

export class PdfConversionCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(private readonly maxEntries = 32, private readonly maxBytes = 32 * 1024 * 1024) {}

  getOrCreate(docx: Buffer, convert: () => Promise<Buffer>): Promise<Buffer> {
    const key = createHash('sha256').update(docx).digest('hex');
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }

    const promise = Promise.resolve().then(convert);
    const entry: CacheEntry = { promise, size: 0 };
    this.entries.set(key, entry);
    this.trim();
    void promise.then((pdf) => {
      if (this.entries.get(key) !== entry) return;
      if (pdf.length > this.maxBytes) {
        this.delete(key);
        return;
      }
      entry.size = pdf.length;
      this.totalBytes += entry.size;
      this.trim();
    }, () => {
      if (this.entries.get(key) === entry) this.delete(key);
    });
    return promise;
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.size;
    this.entries.delete(key);
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }
}
