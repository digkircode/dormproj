import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { PdfConversionCache } from './pdf-conversion-cache';

const logger = new Logger('DocxToPdf');

let queue: Promise<unknown> = Promise.resolve();
const pdfCache = new PdfConversionCache();

const CONVERT_TIMEOUT_MS = 60_000;

const PROFILE_DIR = join(tmpdir(), 'dormproj-lo-profile');
let profileDirReady: Promise<void> | null = null;
function ensureProfileDir(): Promise<void> {
  if (!profileDirReady) profileDirReady = mkdir(PROFILE_DIR, { recursive: true }).then(() => undefined);
  return profileDirReady;
}

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
  await ensureProfileDir();
  await unlink(join(PROFILE_DIR, '.lock')).catch(() => {});

  const workDir = await mkdtemp(join(tmpdir(), 'dormproj-docx2pdf-'));
  const inputPath = join(workDir, 'input.docx');
  const outputPath = join(workDir, 'input.pdf');
  try {
    await writeFile(inputPath, buffer);
    await runSoffice([
      '--headless',
      '--norestore',
      '--nologo',
      '--nofirststartwizard',
      `-env:UserInstallation=file://${PROFILE_DIR}`,
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      workDir,
      inputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  return pdfCache.getOrCreate(buffer, () => enqueueConversion(buffer));
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
