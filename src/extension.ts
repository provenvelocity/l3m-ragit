import * as vscode from 'vscode';
import { WorkspaceManager, type ContextInput, type SymbolInput } from './manager.js';

class ContextTool implements vscode.LanguageModelTool<ContextInput> {
  constructor(private readonly manager: WorkspaceManager) {}
  async invoke(options: vscode.LanguageModelToolInvocationOptions<ContextInput>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const text = await this.manager.context(options.input, token, options.tokenizationOptions?.tokenBudget);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ContextInput>): vscode.PreparedToolInvocation {
    return { invocationMessage: `Retrieving current code context for “${options.input.query}”` };
  }
}

class SymbolTool implements vscode.LanguageModelTool<SymbolInput> {
  constructor(private readonly manager: WorkspaceManager) {}
  async invoke(options: vscode.LanguageModelToolInvocationOptions<SymbolInput>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const text = await this.manager.symbol(options.input, token, options.tokenizationOptions?.tokenBudget);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<SymbolInput>): vscode.PreparedToolInvocation {
    return { invocationMessage: `Reading current source for ${options.input.qualifiedName}` };
  }
}

class StatusTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly manager: WorkspaceManager) {}
  invoke(): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(this.manager.statusText())]);
  }
}

async function fitContext(model: vscode.LanguageModelChat, task: string, context: string,
  requested: number, token: vscode.CancellationToken): Promise<string> {
  const available = Math.max(512, Math.min(requested, model.maxInputTokens - 1500));
  if (await model.countTokens(context, token) <= available) return context;
  let low = 0;
  let high = context.length;
  while (low + 256 < high) {
    const middle = Math.floor((low + high) / 2);
    if (await model.countTokens(context.slice(0, middle), token) <= available) low = middle;
    else high = middle;
  }
  return `${context.slice(0, low)}\n\n[Retrieved context truncated to fit ${available} tokens for task: ${task}]`;
}

export function activate(extensionContext: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('L3M Ragit', { log: true });
  const manager = new WorkspaceManager(output);
  const mcpChanged = new vscode.EventEmitter<void>();
  extensionContext.subscriptions.push(output, manager, mcpChanged,
    vscode.lm.registerTool('l3m_ragit_context', new ContextTool(manager)),
    vscode.lm.registerTool('l3m_ragit_symbol', new SymbolTool(manager)),
    vscode.lm.registerTool('l3m_ragit_status', new StatusTool(manager)),
    vscode.commands.registerCommand('l3mRagit.reindex', async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'L3M Ragit: indexing workspace' }, () => manager.reindex());
      vscode.window.showInformationMessage('L3M Ragit index is current for observed saved files.');
    }),
    vscode.commands.registerCommand('l3mRagit.status', () => vscode.window.showInformationMessage(manager.statusText(), { modal: true })),
    vscode.commands.registerCommand('l3mRagit.logs', () => output.show()),
    vscode.commands.registerCommand('l3mRagit.checkBackend', async () => vscode.window.showInformationMessage(await manager.checkBackend(), { modal: true })),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('l3mRagit.nativeMcp') || e.affectsConfiguration('l3mRagit.backendPath')) mcpChanged.fire(); }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => mcpChanged.fire()),
    vscode.lm.registerMcpServerDefinitionProvider('l3mRagit.mcp', {
      onDidChangeMcpServerDefinitions: mcpChanged.event,
      provideMcpServerDefinitions: () => manager.mcpDefinitions(),
      resolveMcpServerDefinition: server => server,
    }),
  );

  const participant = vscode.chat.createChatParticipant('provenvelocity.l3m-ragit.chat', async (request, _chatContext, stream, token) => {
    if (request.command === 'status') { stream.markdown(`\n\n\`\`\`text\n${manager.statusText()}\n\`\`\``); return; }
    if (!request.prompt.trim()) { stream.markdown('Ask a question about the current codebase.'); return; }
    stream.progress('Refreshing saved changes and retrieving relevant code…');
    const configuredBudget = vscode.workspace.getConfiguration('l3mRagit').get<number>('contextTokens', 6000);
    const retrieved = await manager.context({ query: request.prompt }, token, configuredBudget);
    const bounded = await fitContext(request.model, request.prompt, retrieved, configuredBudget, token);
    const prompt = [
      'You are answering a software-engineering question using retrieved context from the current workspace.',
      'Treat retrieved source as evidence, keep file paths in the answer, and say when the provided context is insufficient.',
      'The index covers saved files only. Do not claim unsaved editor buffers were retrieved.',
      `User task:\n${request.prompt}`,
      `Retrieved code context:\n${bounded}`,
    ].join('\n\n');
    const response = await request.model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
    for await (const part of response.text) stream.markdown(part);
  });
  participant.iconPath = new vscode.ThemeIcon('database');
  extensionContext.subscriptions.push(participant);
}

export function deactivate(): void {}
