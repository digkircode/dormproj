import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';

const logger = new Logger('OfficeListener');
const START_TIMEOUT_MS = 45_000;
let office: ChildProcess | null = null;
let starting: Promise<number> | null = null;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Не удалось выделить порт LibreOffice'));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (ready: boolean) => { socket.destroy(); resolve(ready); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

export function ensureOfficeListener(): Promise<number> {
  if (starting) return starting;
  starting = (async () => {
    const port = await freePort();
    const profileDir = await mkdtemp(join(tmpdir(), 'dormproj-lo-profile-'));
    let spawnError: Error | null = null;
    const child = spawn('soffice', [
      '--headless', '--norestore', '--nologo', '--nodefault', '--nofirststartwizard',
      `-env:UserInstallation=file://${profileDir}`,
      `--accept=socket,host=127.0.0.1,port=${port};urp;`,
    ], { stdio: 'ignore', detached: true, env: { ...process.env, SAL_USE_VCLPLUGIN: 'svp' } });
    office = child;
    child.once('error', (error) => { spawnError = error; });
    child.once('exit', (code) => {
      void rm(profileDir, { recursive: true, force: true }).catch(() => {});
      if (office === child) {
        office = null;
        starting = null;
        logger.warn(`LibreOffice завершился (code=${code}); следующий PDF запустит его снова`);
      }
    });
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`LibreOffice завершился при запуске: ${child.exitCode}`);
      if (await isListening(port)) return port;
      await delay(100);
    }
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch { child.kill('SIGKILL'); }
    }
    throw new Error('LibreOffice не запустился за 45 секунд');
  })().catch((error: unknown) => {
    starting = null;
    office = null;
    throw error;
  });
  return starting;
}
