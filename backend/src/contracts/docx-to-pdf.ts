import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// soffice — тяжёлый процесс (сотни МБ RAM на конвертацию), а сервер и так впритык по
// памяти (см. промпт проекта, "RAM — 1.9 ГБ всего"). Поэтому все конвертации идут строго
// ПОСЛЕДОВАТЕЛЬНО через общую очередь, а не параллельно (даже при массовой печати
// нескольких договоров разом, см. printBatchPdf в contracts.controller.ts) — исключает и
// риск по памяти, и гонку за lock-файлом профиля soffice.
let queue: Promise<unknown> = Promise.resolve();

const CONVERT_TIMEOUT_MS = 60_000;

// Один и тот же профиль soffice на ВСЕ конвертации (не создаётся заново на каждый вызов,
// как раньше) — по прямой просьбе 2026-09-05, разбор "почему PDF ждать секунды 4". Часть
// холодного старта soffice — не сама конвертация, а первичная инициализация ПРОФИЛЯ
// (создание registrymodifications.xcu и служебных папок с нуля); переиспользование профиля
// это убирает. Безопасно ИМЕННО потому, что все конвертации и так строго последовательны
// (см. queue ниже) — один и тот же профиль никогда не используется двумя процессами
// одновременно, живой гонки за него нет. Единственный риск — лишний lock-файл, оставшийся
// от упавшей предыдущей конвертации (та же причина, по которой раньше профиль каждый раз
// пересоздавался с нуля) — снимается явным удалением лока перед каждым запуском ниже,
// вместо того чтобы платить полную цену пересоздания профиля на каждый вызов. Сам процесс
// soffice по-прежнему стартует и завершается на каждую конвертацию — постоянно висящего в
// памяти демона это не заводит, пиковое потребление RAM то же, что и раньше.
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
      // A separate process group lets the timeout stop soffice and its children.
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        // Явно фиксирует headless-бэкенд рендеринга вместо автоопределения GUI-тулкита —
        // известный приём для более быстрого холодного старта soffice в контейнере без X.
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
    // Wait for process exit before releasing the shared LibreOffice profile.
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
  // Лок остаётся в корне UserInstallation (".lock") — если предыдущий вызов упал/завис,
  // не дав soffice снять его штатно, следующий запуск иначе решил бы, что профиль уже
  // занят другим процессом, и не запустился бы вовсе.
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

// Единственная точка входа — ставит конвертацию в общую очередь, гарантируя, что
// одновременно выполняется не больше одного процесса soffice (см. комментарий выше).
export function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  const result = queue.then(() => convertOnce(buffer));
  // Следующий в очереди не должен ждать УСПЕХА этой конвертации, только её завершения —
  // иначе одна упавшая конвертация подвесит очередь навсегда.
  queue = result.catch(() => undefined);
  return result;
}
