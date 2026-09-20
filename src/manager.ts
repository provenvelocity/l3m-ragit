import * as vscode from 'vscode';
import { join } from 'node:path';
import { Backend, type BackendApi, qualifiedNames, resultText } from './backend.js';
import { IndexQueue, type IndexState } from './indexQueue.js';
import { projectName, selectWorkspace, shouldObserve } from './workspace.js';

export interface ContextInput { query: string; workspace?: string }
export interface SymbolInput { qualifiedName: string; workspace?: string }

interface WorkspaceRuntime {
  folder: vscode.WorkspaceFolder;
  root: string;
  name: string;
  project: string;
  backend: BackendApi;
  command: { executable: string; args: string[]; env: Record<string, string>; managed: boolean };
  queue: IndexQueue;
  watcher: vscode.FileSystemWatcher;
}

function config<T>(key: string, folder?: vscode.WorkspaceFolder): T {
  return vscode.workspace.getConfiguration('ragit', folder?.uri).get<T>(key)!;
}

function cancellationSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) controller.abort();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}

export class WorkspaceManager implements vscode.Disposable {
  private runtimes: WorkspaceRuntime[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);

  constructor(private readonly output: vscode.OutputChannel, private readonly extensionPath: string) {
    this.statusBar.command = 'ragit.status';
    this.disposables.push(this.statusBar, vscode.workspace.onDidChangeWorkspaceFolders(() => this.rebuild()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('ragit')) this.rebuild();
      }));
    this.rebuild();
  }

  dispose(): void {
    this.disposeRuntimes();
    this.disposables.forEach(d => d.dispose());
  }

  private disposeRuntimes(): void {
    for (const runtime of this.runtimes) { runtime.queue.dispose(); runtime.watcher.dispose(); }
    this.runtimes = [];
  }

  private rebuild(): void {
    this.disposeRuntimes();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== 'file' || !config<boolean>('enabled', folder)) continue;
      const root = folder.uri.fsPath;
      const override = config<string>('backendPath', folder).trim();
      const command = override
        ? { executable: override, args: [], env: {}, managed: false }
        : {
            executable: process.execPath,
            args: [join(this.extensionPath, 'dist', 'backend-launcher.cjs')],
            env: {
              ELECTRON_RUN_AS_NODE: '1',
              RAGIT_BACKEND_MODE: config<string>('backendMode', folder),
              RAGIT_DOCKERFILE: join(this.extensionPath, 'docker', 'Dockerfile'),
            },
            managed: true,
          };
      const backend = new Backend({
        ...command,
        timeoutMs: config<number>('backendTimeoutSeconds', folder) * 1000,
      });
      const runtime = {} as WorkspaceRuntime;
      const queue = new IndexQueue(async signal => {
        this.output.appendLine(`[${folder.name}] indexing ${root}`);
        const result = await backend.call(root, 'index_repository', {
          repo_path: root, name: projectName(root), mode: config<string>('indexMode', folder), persistence: false,
        }, signal);
        this.output.appendLine(`[${folder.name}] ${resultText(result)}`);
      }, config<number>('debounceMs', folder), state => this.updateStatus(folder.name, state));
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*'));
      const changed = (uri: vscode.Uri) => {
        if (shouldObserve(root, uri.fsPath)) queue.markChanged();
      };
      watcher.onDidCreate(changed); watcher.onDidChange(changed); watcher.onDidDelete(changed);
      Object.assign(runtime, { folder, root, name: folder.name, project: projectName(root), backend, command, queue, watcher });
      this.runtimes.push(runtime);
      queue.schedule();
    }
    this.refreshStatusBar();
  }

  private updateStatus(name: string, state: IndexState): void {
    const message = state.phase === 'failed' ? `failed: ${state.error}` : state.phase;
    this.output.appendLine(`[${name}] ${message} (${state.indexedRevision}/${state.revision})`);
    this.refreshStatusBar();
  }

  private refreshStatusBar(): void {
    if (!this.runtimes.length) { this.statusBar.hide(); return; }
    const states = this.runtimes.map(r => r.queue.snapshot());
    const failed = states.some(s => s.phase === 'failed');
    const busy = states.some(s => s.phase === 'indexing' || s.phase === 'pending');
    this.statusBar.text = failed ? '$(error) Ragit' : busy ? '$(sync~spin) Ragit' : '$(database) Ragit';
    this.statusBar.tooltip = this.statusText();
    this.statusBar.show();
  }

  private activeRoot(): string | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    return uri ? vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath : undefined;
  }

  private select(requested?: string): WorkspaceRuntime {
    return selectWorkspace(this.runtimes, requested, this.activeRoot());
  }

  async reindex(requested?: string): Promise<void> {
    const selected = requested ? [this.select(requested)] : this.runtimes;
    if (!selected.length) throw new Error('No enabled file workspace is open.');
    selected.forEach(runtime => runtime.queue.markChanged());
    await Promise.all(selected.map(runtime => runtime.queue.flush()));
  }

  async checkBackend(requested?: string): Promise<string> {
    const runtime = this.select(requested);
    const backend = runtime.backend as Backend;
    if (!('version' in backend)) return 'Injected backend does not expose version information.';
    return `${await backend.version(runtime.root)}\nWorkspace: ${runtime.root}`;
  }

  statusText(): string {
    if (!this.runtimes.length) return 'Ragit: no enabled file workspace.';
    return this.runtimes.map(runtime => {
      const s = runtime.queue.snapshot();
      return `${runtime.name}\n  root: ${runtime.root}\n  project: ${runtime.project}\n  state: ${s.phase}\n  indexed revision: ${s.indexedRevision}/${s.revision}${s.lastIndexedAt ? `\n  completed: ${s.lastIndexedAt}` : ''}${s.error ? `\n  error: ${s.error}` : ''}`;
    }).join('\n\n');
  }

  mcpDefinitions(): vscode.McpStdioServerDefinition[] {
    if (!config<boolean>('nativeMcp')) return [];
    return this.runtimes.map(runtime => {
      const definition = new vscode.McpStdioServerDefinition(
        `Ragit upstream: ${runtime.name}`,
        runtime.command.executable,
        [...runtime.command.args, '--tool-profile=analysis'],
        { ...runtime.command.env, CBM_ALLOWED_ROOT: runtime.root },
      );
      definition.cwd = runtime.folder.uri;
      return definition;
    });
  }

  async context(input: ContextInput, token: vscode.CancellationToken, requestedBudget?: number): Promise<string> {
    if (!input.query?.trim()) throw new Error('A non-empty context query is required.');
    const runtime = this.select(input.workspace);
    await runtime.queue.flush();
    const budget = Math.max(128, Math.min(requestedBudget ?? config<number>('contextTokens', runtime.folder), 32000));
    const graphBudget = Math.max(256, Math.floor(budget * 0.45));
    let result = await runtime.backend.call(runtime.root, 'search_graph', {
      project: runtime.project, semantic_query: [input.query.trim()], semantic_limit: 20,
      include_connected: true, limit: 40, max_output_tokens: graphBudget, format: 'json',
    }, cancellationSignal(token));
    let names = qualifiedNames(result);
    if (!names.length) {
      result = await runtime.backend.call(runtime.root, 'search_graph', {
        project: runtime.project, query: input.query.trim(), include_connected: true,
        limit: 40, max_output_tokens: graphBudget, format: 'json',
      }, cancellationSignal(token));
      names = qualifiedNames(result);
    }
    const snippetBudget = Math.max(256, Math.floor((budget - graphBudget) / Math.max(1, names.length)));
    const snippets = await Promise.allSettled(names.map(name => runtime.backend.call(runtime.root, 'get_code_snippet', {
      project: runtime.project, qualified_name: name, include_neighbors: true,
      source_mode: 'auto', max_output_tokens: snippetBudget, format: 'tree',
    }, cancellationSignal(token))));
    const source = snippets.flatMap((value, index) => value.status === 'fulfilled'
      ? [`symbol: ${names[index]}\n${resultText(value.value)}`]
      : [`symbol: ${names[index]}\nsource retrieval failed: ${value.reason instanceof Error ? value.reason.message : String(value.reason)}`]);
    const status = runtime.queue.snapshot();
    return `workspace: ${runtime.root}\nproject: ${runtime.project}\nindexed_revision: ${status.indexedRevision}/${status.revision}\nunsaved_buffers_included: false\n\nGRAPH RESULTS\n${resultText(result)}\n\nSOURCE SNIPPETS\n${source.join('\n\n') || '[No source symbols were returned; broaden or reformulate the query.]'}`;
  }

  async symbol(input: SymbolInput, token: vscode.CancellationToken, requestedBudget?: number): Promise<string> {
    if (!input.qualifiedName?.trim()) throw new Error('A qualified symbol name is required.');
    const runtime = this.select(input.workspace);
    await runtime.queue.flush();
    const result = await runtime.backend.call(runtime.root, 'get_code_snippet', {
      project: runtime.project, qualified_name: input.qualifiedName.trim(), include_neighbors: true,
      source_mode: 'auto', max_output_tokens: Math.max(128, Math.min(requestedBudget ?? 4000, 16000)), format: 'tree',
    }, cancellationSignal(token));
    return `workspace: ${runtime.root}\nunsaved_buffers_included: false\n\n${resultText(result)}`;
  }
}
