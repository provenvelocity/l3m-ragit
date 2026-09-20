import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

type BackendMode = 'auto' | 'docker' | 'native';

const mode = (process.env.RAGIT_BACKEND_MODE ?? 'auto') as BackendMode;
if (!['auto', 'docker', 'native'].includes(mode)) fail(`Invalid RAGIT_BACKEND_MODE: ${mode}`);

const originalArgs = process.argv.slice(2);
const statusOnly = originalArgs[0] === '--ragit-status';
const backendArgs = statusOnly ? ['--version'] : originalArgs;
const root = resolve(process.env.CBM_ALLOWED_ROOT || process.cwd());
const image = process.env.RAGIT_CBM_IMAGE || 'ragit/codebase-memory-mcp:0.11.0';
const dockerfile = process.env.RAGIT_DOCKERFILE || resolve(dirname(process.argv[1]), '..', 'docker', 'Dockerfile');
const dockerCli = process.env.RAGIT_DOCKER_COMMAND || 'docker';
const nativeCommand = process.env.RAGIT_NATIVE_COMMAND || 'codebase-memory-mcp';
const npxCommand = process.env.RAGIT_NPX_COMMAND || 'npx';

function fail(message: string): never {
  process.stderr.write(`Ragit backend error: ${message}\n`);
  process.exit(1);
}

function run(command: string, args: string[], timeout = 15000): SpawnSyncReturns<string> {
  return spawnSync(command, args, { encoding: 'utf8', timeout, windowsHide: true });
}

function dockerReady(): { ready: boolean; reason?: string } {
  if (process.platform === 'win32') return { ready: false, reason: 'Docker mode currently requires macOS, Linux, or WSL' };
  const info = run(dockerCli, ['info', '--format', '{{.ServerVersion}}']);
  if (info.status !== 0) return { ready: false, reason: info.error?.message || info.stderr.trim() || 'Docker daemon is unavailable' };
  if (run(dockerCli, ['image', 'inspect', image]).status === 0) return { ready: true };
  process.stderr.write(`Ragit: building pinned Docker backend ${image} on first use...\n`);
  const built = run(dockerCli, ['build', '--quiet', '--file', dockerfile, '--tag', image, resolve(dirname(dockerfile), '..')], 300000);
  if (built.stdout) process.stderr.write(built.stdout);
  if (built.stderr) process.stderr.write(built.stderr);
  return built.status === 0 ? { ready: true } : { ready: false, reason: built.error?.message || 'Docker image build failed' };
}

function nativeReady(): { ready: boolean; command?: string; args?: string[]; label?: string; version?: string; reason?: string } {
  const probe = run(nativeCommand, ['--version']);
  if (probe.status === 0) {
    return { ready: true, command: nativeCommand, args: [], label: 'installed PATH command', version: probe.stdout.trim() };
  }
  const npxProbe = run(npxCommand, ['--yes', 'codebase-memory-mcp@0.11.0', '--version'], 300000);
  if (npxProbe.status === 0) {
    return {
      ready: true, command: npxCommand, args: ['--yes', 'codebase-memory-mcp@0.11.0'],
      label: 'managed npm package', version: npxProbe.stdout.trim(),
    };
  }
  const nativeReason = probe.error?.message || probe.stderr.trim() || `${nativeCommand} is unavailable`;
  const npmReason = npxProbe.error?.message || npxProbe.stderr.trim() || `${npxCommand} is unavailable`;
  return { ready: false, reason: `${nativeReason}; npm fallback: ${npmReason}` };
}

function dockerCommand(): { command: string; args: string[] } {
  const workspaceId = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const container = `ragit-cbm-${workspaceId}`;
  const cacheBase = process.env.RAGIT_CBM_CACHE_BASE || resolve(process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache'), 'ragit', 'cbm');
  const cache = resolve(cacheBase, workspaceId);
  mkdirSync(cache, { recursive: true });

  const existing = run(dockerCli, ['container', 'inspect', container]);
  if (existing.status === 0) {
    const containerImage = run(dockerCli, ['container', 'inspect', '--format', '{{.Image}}', container]).stdout.trim();
    const requestedImage = run(dockerCli, ['image', 'inspect', '--format', '{{.Id}}', image]).stdout.trim();
    if (containerImage !== requestedImage) {
      const removed = run(dockerCli, ['rm', '-f', container]);
      if (removed.status !== 0) throw new Error(removed.stderr.trim() || `Could not replace stale container ${container}`);
    }
  }

  if (run(dockerCli, ['container', 'inspect', container]).status !== 0) {
    const created = run(dockerCli, [
      'run', '-d', '--name', container, '--label', `ragit.workspace=${workspaceId}`,
      '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--env', 'HOME=/tmp', '--env', 'CBM_CACHE_DIR=/cbm-cache', '--env', `CBM_ALLOWED_ROOT=${root}`,
      '--volume', `${root}:${root}:ro`, '--volume', `${cache}:/cbm-cache`, '--workdir', root,
      '--entrypoint', '/bin/sh', image, '-c', 'trap "exit 0" TERM INT; while :; do sleep 3600 & wait $!; done',
    ], 30000);
    if (created.status !== 0 && run(dockerCli, ['container', 'inspect', container]).status !== 0) {
      throw new Error(created.stderr.trim() || `Could not create container ${container}`);
    }
  }

  const running = run(dockerCli, ['container', 'inspect', '--format', '{{.State.Running}}', container]).stdout.trim();
  if (running !== 'true') {
    const started = run(dockerCli, ['start', container], 30000);
    if (started.status !== 0) throw new Error(started.stderr.trim() || `Could not start container ${container}`);
  }

  return {
    command: dockerCli,
    args: ['exec', '-i', '--workdir', root, '--env', `CBM_ALLOWED_ROOT=${root}`, '--env', 'CBM_CACHE_DIR=/cbm-cache', container, 'codebase-memory-mcp', ...backendArgs],
  };
}

function proxy(command: string, args: string[]): void {
  const child = spawn(command, args, { cwd: root, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const stop = (signal: NodeJS.Signals) => child.kill(signal);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  child.once('error', error => fail(error.message));
  child.once('close', code => process.exit(code ?? 1));
}

function main(): void {
  const docker = mode === 'native' ? { ready: false, reason: 'disabled by configuration' } : dockerReady();
  let dockerFailure = docker.reason;
  if (docker.ready) {
    try {
      const selected = dockerCommand();
      if (statusOnly) {
        const version = run(selected.command, selected.args, 30000);
        if (version.status !== 0) throw new Error(version.stderr.trim() || 'Docker backend version check failed');
        process.stdout.write(`Backend: Docker\n${version.stdout.trim()}\nImage: ${image}\n`);
      } else {
        proxy(selected.command, selected.args);
      }
      return;
    } catch (error) {
      dockerFailure = error instanceof Error ? error.message : String(error);
      if (mode === 'docker') fail(dockerFailure);
      process.stderr.write(`Ragit: Docker backend failed (${dockerFailure}); trying npm/native PATH fallback.\n`);
    }
  }
  if (mode === 'docker') fail(dockerFailure || 'Docker backend is unavailable');
  const native = nativeReady();
  if (!native.ready) {
    fail(`Docker unavailable (${dockerFailure}); npm/native backend unavailable (${native.reason}). Install Docker or Node.js with npm, or run: npm install --global codebase-memory-mcp@0.11.0`);
  }
  if (statusOnly) process.stdout.write(`Backend: npm/native fallback (${native.label})\n${native.version}\nCommand: ${native.command}\n`);
  else proxy(native.command!, [...native.args!, ...backendArgs]);
}

main();
