import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { PdfConversionCache } from './pdf-conversion-cache';
import { ensureOfficeListener } from './office-listener';

const logger = new Logger('DocxToPdf');

let queue: Promise<unknown> = Promise.resolve();
const pdfCache = new PdfConversionCache();

const CONVERT_TIMEOUT_MS = 60_000;

export function runSoffice(args: string[], timeoutMs = CONVERT_TIMEOUT_MS, executable = 'soffice'): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        SAL_USE_VCLPLUGIN: 'svp',
      },
    });
    let stderr = '';
    let spawnError: Error | null = null;
    let timedOut = false;
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(0, 2000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('Конвертация в PDF не уложилась в таймаут'));
      else if (spawnError) reject(spawnError);
      else if (code === 0) resolve();
      else reject(new Error(`soffice exited with code ${code}: ${stderr}`));
    });
  });
}

async function convertOnce(buffer: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'dormproj-docx2pdf-'));
  const inputPath = join(workDir, 'input.docx');
  const outputPath = join(workDir, 'input.pdf');
  try {
    await writeFile(inputPath, buffer);
    try {
      if (process.platform !== 'linux') throw new Error('UNO доступен только в серверном контейнере');
      const port = await ensureOfficeListener();
      await runSoffice([join(process.cwd(), 'scripts', 'uno-convert.py'), String(port), inputPath, outputPath], CONVERT_TIMEOUT_MS, 'python3');
    } catch (error) {
      logger.warn(`UNO-конвертация недоступна, использую разовый запуск: ${error instanceof Error ? error.message : String(error)}`);
      const fallbackProfile = join(workDir, 'profile');
      await mkdir(fallbackProfile);
      await runSoffice([
        '--headless', '--norestore', '--nologo', '--nofirststartwizard',
        `-env:UserInstallation=file://${fallbackProfile}`,
        '--convert-to', 'pdf:writer_pdf_Export', '--outdir', workDir, inputPath,
      ]);
    }
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  return pdfCache.getOrCreate(buffer, () => enqueueConversion(buffer));
}

export async function warmUpPdfConverter(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  try {
    const template = await readFile(join(process.cwd(), 'templates', 'contract-standard.docx'));
    await convertDocxToPdf(template);
  } catch (error) {
    logger.warn(`Прогрев PDF-конвертера не удался: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function enqueueConversion(buffer: Buffer): Promise<Buffer> {
  const queuedAt = Date.now();
  const result = queue.then(async () => {
    const startedAt = Date.now();
    try {
      return await convertOnce(buffer);
    } finally {
      logger.log(`PDF conversion timing: queueMs=${startedAt - queuedAt} convertMs=${Date.now() - startedAt}`);
    }
  });
  queue = result.catch(() => undefined);
  return result;
}
