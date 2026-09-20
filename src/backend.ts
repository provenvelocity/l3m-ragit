import { spawn } from 'node:child_process';

export interface BackendOptions { executable: string; args?: string[]; timeoutMs: number; env?: NodeJS.ProcessEnv; managed?: boolean }
export interface ToolResult { content: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean }
export interface BackendApi {
  call(root: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>;
}

const ALLOWED_TOOLS = new Set(['index_repository', 'list_projects', 'search_graph', 'get_code_snippet', 'trace_path', 'index_status', 'get_architecture']);

export function resultText(result: ToolResult): string {
  return result.content.filter(p => p.type === 'text').map(p => p.text ?? '').join('\n');
}

export function qualifiedNames(result: ToolResult, limit = 6): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || found.length >= limit) return;
    const table = value as { cols?: unknown; rows?: unknown };
    if (Array.isArray(table.cols) && Array.isArray(table.rows)) {
      const qnIndex = table.cols.indexOf('qn');
      if (qnIndex >= 0) {
        for (const row of table.rows) {
          if (Array.isArray(row) && typeof row[qnIndex] === 'string' && !found.includes(row[qnIndex])) found.push(row[qnIndex]);
          if (found.length >= limit) break;
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(result.structuredContent);
  return found.slice(0, limit);
}

export function decodeResult(raw: string): ToolResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Backend returned invalid JSON. Check the installed codebase-memory-mcp version.'); }
  if (!value || typeof value !== 'object' || !('content' in value) || !Array.isArray(value.content)) {
    throw new Error('Backend returned an unexpected MCP envelope.');
  }
  const result = value as ToolResult;
  if (result.content.some(p => !p || typeof p !== 'object' || typeof p.type !== 'string' || (p.type === 'text' && typeof p.text !== 'string'))) {
    throw new Error('Backend returned invalid content blocks.');
  }
  if (result.isError) throw new Error(resultText(result) || 'Backend tool failed.');
  return result;
}

/** No shell: paths and JSON are never evaluated as command text. */
export function runProcess(executable: string, args: string[], input: string | undefined,
  options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error('Operation cancelled.')); return; }
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env ?? process.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = '';
    let stopped: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: Error) => {
      if (stopped) return;
      stopped = error;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1500);
      killTimer.unref();
    };
    const cancel = () => stop(new Error('Operation cancelled.'));
    const timer = setTimeout(() => stop(new Error(`Backend timed out after ${Math.round(options.timeoutMs / 1000)} seconds.`)), options.timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) stop(new Error('Backend response exceeded 8 MiB. Narrow the query.'));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.stdin.on('error', () => { /* A failing child may close stdin before reading. close/error determines the result. */ });
    child.on('error', error => { stopped = new Error(`Cannot start ${executable}: ${error.message}`); });
    child.on('close', code => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', cancel);
      if (stopped) reject(stopped);
      else if (code !== 0) reject(new Error(`Backend exited with code ${code}: ${stderr.trim() || 'No diagnostics returned.'}`));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(input);
  });
}

export class Backend implements BackendApi {
  readonly options: BackendOptions;
  constructor(options: BackendOptions) { this.options = options; }

  async version(root: string, signal?: AbortSignal): Promise<string> {
    return (await runProcess(this.options.executable, [...(this.options.args ?? []), this.options.managed ? '--ragit-status' : '--version'], undefined,
      { cwd: root, timeoutMs: this.options.timeoutMs, env: { ...process.env, ...this.options.env }, signal })).trim();
  }

  async call(root: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    if (!ALLOWED_TOOLS.has(tool)) throw new Error(`Unsupported backend tool: ${tool}`);
    const raw = await runProcess(this.options.executable, [...(this.options.args ?? []), 'cli', '--quiet', '--json', tool], JSON.stringify(args), {
      cwd: root, timeoutMs: this.options.timeoutMs,
      env: { ...process.env, ...this.options.env, CBM_ALLOWED_ROOT: root }, signal,
    });
    return decodeResult(raw);
  }
}
