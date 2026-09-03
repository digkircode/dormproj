import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// soffice — тяжёлый процесс (сотни МБ RAM на конвертацию), а сервер и так впритык по
// памяти (см. промпт проекта, "RAM — 1.9 ГБ всего"). Поэтому все конвертации идут строго
// ПОСЛЕДОВАТЕЛЬНО через общую очередь, а не параллельно (даже при массовой печати
// нескольких договоров разом, см. printBatchPdf в contracts.controller.ts) — исключает и
// риск по памяти, и гонку за lock-файлом профиля soffice.
let queue: Promise<unknown> = Promise.resolve();

const CONVERT_TIMEOUT_MS = 60_000;

function runSoffice(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('soffice', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`soffice exited with code ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}

async function convertOnce(buffer: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'dormproj-docx2pdf-'));
  const profileDir = join(workDir, 'lo-profile');
  const inputPath = join(workDir, 'input.docx');
  const outputPath = join(workDir, 'input.pdf');
  try {
    await writeFile(inputPath, buffer);
    await Promise.race([
      runSoffice([
        '--headless',
        '--norestore',
        '--nologo',
        '--nofirststartwizard',
        // Свой профиль на каждый вызов — soffice падает/зависает, если несколько
        // процессов делят один UserInstallation (даже при последовательном вызове мог
        // остаться lock-файл от упавшей предыдущей конвертации).
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'pdf',
        '--outdir',
        workDir,
        inputPath,
      ]),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Конвертация в PDF не уложилась в таймаут')), CONVERT_TIMEOUT_MS),
      ),
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Единственная точка входа — ставит конвертацию в общую очередь, гарантируя, что
// одновременно выполняется не больше одного процесса soffice (см. комментарий выше).
export function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  const result = queue.then(() => convertOnce(buffer));
  // Следующий в очереди не должен ждать УСПЕХА этой конвертации, только её завершения —
  // иначе одна упавшая конвертация подвесит очередь навсегда.
  queue = result.catch(() => undefined);
  return result;
}
