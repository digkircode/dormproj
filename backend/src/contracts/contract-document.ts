import { readFileSync } from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export type ContractDocumentTemplate = 'standard' | 'minor';

const TEMPLATE_FILES: Record<ContractDocumentTemplate, string> = {
  standard: 'contract-standard.docx',
  minor: 'contract-minor.docx',
};

// Шаблоны — реальные бланки договора, присланные пользователем (см. описание полей в
// плане реализации), с подставленными {tag}-плейсхолдерами вместо подчёркиваний.
// process.cwd() — и в Docker (CMD запущен из /app), и локально (npm run из backend/)
// это корень backend, где лежит templates/ рядом с dist/prisma.
function templatePath(template: ContractDocumentTemplate): string {
  return path.join(process.cwd(), 'templates', TEMPLATE_FILES[template]);
}

export function renderContractDocument(template: ContractDocumentTemplate, data: Record<string, string>): Buffer {
  const zip = new PizZip(readFileSync(templatePath(template)));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer' });
}
