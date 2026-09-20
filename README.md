# Ragit

Ragit gives GitHub Copilot current, repository-level context from each developer's checkout through [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp).

It watches saved file changes, refreshes a local code graph without requiring a commit, and exposes freshness-gated Copilot tools plus the `@ragit` chat participant. Saving a file updates the index; it does not send the repository to a model. A model request receives only the relevant graph results and source snippets retrieved for that task.

## Requirements

- VS Code 1.137 or later with GitHub Copilot Chat.
- Docker Desktop/Engine, or Node.js with the `codebase-memory-mcp` npm package.
- A trusted, filesystem-backed workspace.

For Remote SSH, Dev Containers, and Codespaces, install the extension on the remote workspace host. Docker or the npm backend must also be available there.

## Getting started

For a first checkout:

```bash
git clone https://github.com/provenvelocity/ragit.git
cd ragit
```

If the `ragit` directory already exists, update it instead:

```bash
git -C ragit pull --ff-only
cd ragit
```

Package and install into VS Code Stable:

```bash
npm ci
npm run package
code --install-extension ./ragit-0.2.0.vsix
```

Install the same VSIX into VS Code Insiders:

```bash
code-insiders --install-extension ./ragit-0.2.0.vsix
```

On macOS, if `code-insiders` is not on `PATH`, use:

```bash
"/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code" --install-extension ./ragit-0.2.0.vsix
```

Reload VS Code and open a repository. Ragit automatically:

1. Tries Docker and builds the pinned, checksum-verified `codebase-memory-mcp` 0.11.0 image when it is missing.
2. Starts one persistent, isolated container for the workspace and begins indexing.
3. Falls back to an installed `codebase-memory-mcp`, then the pinned package through `npx`, when Docker is unavailable.
4. Reports an actionable error when neither backend can run.

The npm fallback can be installed explicitly:

```bash
npm install --global codebase-memory-mcp@0.11.0
codebase-memory-mcp --version
```

Run **Ragit: Check Backend** and **Ragit: Show Index Status** from the Command Palette. Then ask:

```text
@ragit Explain how authentication flows through this repository and cite the relevant files.
```

See the **[complete getting-started guide](docs/getting-started.md)** for backend controls, Remote SSH/DGX placement, verification, and troubleshooting.

## Copilot tools

- `#ragitContext` retrieves current task-relevant code.
- `#ragitSymbol` reads an indexed symbol and nearby relationships.
- `#ragitStatus` reports indexing state.

Tool availability does not force Copilot to invoke a tool for every request. Use `@ragit` when retrieval before the model request is required.

## Freshness behavior

- The initial index scans the workspace directory directly.
- Create/change/delete events are combined for 1.5 seconds by default.
- Only one index operation runs per workspace. Changes arriving during indexing cause another pass.
- Ragit retrieval waits for pending indexing to finish.
- Unsaved editor buffers are not indexed in version 0.2.0.
- codebase-memory-mcp may choose an incremental repair or full rebuild.

Ragit derives project identity from the absolute checkout path, so separate checkouts with identical directory names cannot share the wrong graph.

## Backend settings

`ragit.backendMode` defaults to `auto`, which tries Docker and then npm/native execution. Set it to `docker` or `native` to require one backend. Native mode first uses an installed `codebase-memory-mcp` command and otherwise runs the pinned package through `npx`. Set `ragit.backendPath` only when using a custom executable; a non-empty override disables automatic selection.

Set `ragit.nativeMcp` to `true` to register the selected backend directly with VS Code. Direct upstream calls bypass Ragit's saved-change queue and freshness checks, so the default is off.

## Development

```bash
npm install
npm run check
npm test
npm run build
npm run package
```

The extension launches backend processes without a shell. It confines extension-owned indexing and queries to the selected workspace with `CBM_ALLOWED_ROOT`.

## Current scope

Version 0.2.0 is a team-pilot foundation. It does not intercept every Copilot prompt, modify inline completions, merge teammates' uncommitted code, or connect a DGX-hosted model to VS Code. Model availability remains controlled by VS Code and its installed model providers.

See [architecture](docs/architecture.md) and [security](SECURITY.md) for the operational model and limitations.
