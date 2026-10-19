// Where the studio lives and which Python it uses, the same way on Mac and Windows.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PY = process.platform === 'win32'
  ? join(STUDIO, '.venv', 'Scripts', 'python.exe')
  : join(STUDIO, '.venv', 'bin', 'python');
export const ENV_FILE = join(STUDIO, '.env');
export function loadEnv() { if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE); }
export function openFile(p) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', p]]
    : process.platform === 'darwin' ? ['open', [p]] : ['xdg-open', [p]];
  spawnSync(cmd, args, { stdio: 'ignore' });
}
