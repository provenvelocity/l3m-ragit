# L3M Ragit

L3M Ragit gives GitHub Copilot current, repository-level context from each developer's own checkout through [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp).

It does two related jobs:

- Watches saved file changes and refreshes a local code graph without requiring a commit.
- Makes that graph available to Copilot through freshness-gated tools and the `@ragit` chat participant.

Saving a file updates the index. It does **not** send the repository to a model. When Copilot invokes a Ragit tool, or you ask `@ragit`, Ragit retrieves relevant code and includes that text in the model request.

## Requirements

- VS Code 1.137 or later with GitHub Copilot Chat.
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) installed on the machine that hosts the VS Code workspace. Version 0.11.0 is the version tested for this release.
- A trusted, filesystem-backed workspace.

For Remote SSH, Dev Containers, and Codespaces, install this extension and codebase-memory-mcp on the remote workspace host.

## Getting started

The recommended backend is the upstream native executable. The npm package downloads and launches that verified native runtime; it is not a JavaScript implementation of the indexer.

```bash
npm install --global codebase-memory-mcp@0.11.0
codebase-memory-mcp --version

git clone https://github.com/provenvelocity/l3m-ragit.git
cd l3m-ragit
npm ci
npm run package
code --install-extension ./l3m-ragit-0.1.0.vsix
```

Reload VS Code, open a repository, and run **L3M Ragit: Check Backend** followed by **L3M Ragit: Show Index Status**. Then ask Copilot Chat:

```text
@ragit Explain how authentication flows through this repository and cite the relevant files.
```

A pinned Docker option is also included for Linux amd64/arm64 and Docker Desktop on macOS. It uses a persistent per-workspace container so the upstream daemon and cache remain valid:

```bash
docker build -f docker/Dockerfile -t l3m-ragit/codebase-memory-mcp:0.11.0 .
chmod +x "$PWD/docker/cbm-docker"
"$PWD/docker/cbm-docker" --version
```

Then set `l3mRagit.backendPath` to the absolute path of `docker/cbm-docker`. See the **[complete getting-started guide](docs/getting-started.md)** for native installer commands, Docker operation, Remote SSH/DGX placement, verification, and troubleshooting.

Copilot agent mode can also invoke these tools:

- `#ragitContext` retrieves current task-relevant code.
- `#ragitSymbol` reads an indexed symbol and nearby relationships.
- `#ragitStatus` reports indexing state.

Tool availability does not force Copilot to invoke a tool for every request. Use `@ragit` when retrieval before the model request is required.

## Freshness behavior

- The initial index scans the workspace directory directly.
- Create/change/delete events from VS Code's filesystem watcher are combined for 1.5 seconds by default.
- Only one index operation runs per workspace. If changes arrive during indexing, another pass follows.
- Retrieval through Ragit's tools waits for pending indexing to finish.
- Unsaved editor buffers are not indexed in version 0.1.0.
- codebase-memory-mcp may choose an incremental repair or a full rebuild. Real-time latency therefore depends on repository size and the nature of a change.

Ragit uses a path-derived project identity so separate checkouts with identical directory names do not share the wrong graph.

## Direct MCP tools

Set `l3mRagit.nativeMcp` to `true` to register codebase-memory-mcp directly with VS Code. This exposes the upstream tools in Copilot's tool picker. Direct upstream calls bypass Ragit's saved-change queue and freshness checks; the default is off.

## Development

```bash
npm install
npm run check
npm test
npm run build
npm run package
```

Run the backend integration check against a local binary:

```bash
CBM_TEST_BINARY=/absolute/path/to/codebase-memory-mcp npm run test:backend
```

The extension launches backend processes without a shell. It confines extension-owned indexing and queries to the selected workspace with `CBM_ALLOWED_ROOT`.

## Current scope

Version 0.1.0 is a working foundation for a team pilot. It does not intercept every Copilot prompt, modify inline completions, merge teammates' uncommitted code, or connect a DGX-hosted model to VS Code. Model availability is controlled by VS Code and its installed model providers.

See [architecture](docs/architecture.md) and [security](SECURITY.md) for the operational model and limitations.
