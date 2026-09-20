import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const code = process.env.VSCODE_BIN ?? 'code';
const extension = resolve('ragit-0.2.0.vsix');
const profile = await mkdtemp(join(tmpdir(), 'ragit-profile-'));
const log = join(profile, 'code.log');
const args = ['--user-data-dir', profile, '--extensions-dir', join(profile, 'extensions'), '--install-extension', extension, '--force'];
const child = spawn(code, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', b => output += b.toString());
child.stderr.on('data', b => output += b.toString());
const status = await new Promise(resolveStatus => child.on('close', resolveStatus));
await writeFile(log, output);
if (status !== 0 || !output.toLowerCase().includes('successfully installed')) {
  throw new Error(`VSIX install smoke failed. Log: ${await readFile(log, 'utf8')}`);
}
console.log('host smoke passed');
