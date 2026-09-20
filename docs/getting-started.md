# Getting started

Ragit runs in the VS Code workspace extension host. On a local folder, that is your laptop. With Remote SSH, it is the DGX Spark or other SSH host. With a Dev Container or Codespace, it is the remote extension environment.

## 1. Install the extension

Download `ragit-0.2.0.vsix` from a successful GitHub Actions run, or package it from a clone:

```bash
git clone https://github.com/provenvelocity/ragit.git
cd ragit
npm ci
npm run package
code --install-extension ./ragit-0.2.0.vsix
```

For Remote SSH, install the VSIX in the remote VS Code window by choosing **Install in SSH: host** from the Extensions view.

## 2. Let Ragit select and run the backend

No separate backend command is required for the default setup. Leave these settings at their defaults:

```json
{
  "ragit.backendMode": "auto",
  "ragit.backendPath": ""
}
```

On first use, the extension follows this order:

1. If Docker is installed and its daemon is reachable, build the bundled image when needed. The image is pinned to `codebase-memory-mcp` 0.11.0 and verifies the official amd64 or arm64 release checksum.
2. Start or reuse one persistent container for each workspace. The workspace is mounted read-only at the same absolute path, while the graph is persisted under `~/.cache/ragit/cbm`.
3. If Docker is unavailable or its image cannot be built, run `codebase-memory-mcp` from `PATH`. If it is not installed, run the pinned `codebase-memory-mcp@0.11.0` package through `npx`.
4. If neither works, record the reason in the Ragit output channel and mark indexing as failed.

Ragit does not create a disposable container for every query. The persistent container preserves the upstream coordination daemon and cache across indexing and retrieval calls.

### Require Docker

```json
{
  "ragit.backendMode": "docker"
}
```

You can prebuild the same image, although the extension normally does this automatically:

```bash
npm run build
npm run docker:build
node dist/backend-launcher.cjs --ragit-status
```

Docker mode supports Linux amd64/arm64, macOS Docker Desktop, and WSL. Docker Desktop must be allowed to share the workspace directory. Native Windows extension hosts use the npm/native fallback.

### Require npm/native

```bash
npm install --global codebase-memory-mcp@0.11.0
codebase-memory-mcp --version
```

```json
{
  "ragit.backendMode": "native"
}
```

The npm package is a launcher and installer for the verified native executable. Node does not perform code indexing. Ragit uses an installed command when available and otherwise invokes the pinned package with `npx`; it does not install anything globally. `codebase-memory-mcp install` is optional and is only needed if you also want upstream to configure other detected clients.

### Custom executable

An explicit path bypasses automatic Docker and npm selection:

```json
{
  "ragit.backendPath": "/absolute/path/to/codebase-memory-mcp"
}
```

## 3. Verify and use Ragit

1. Reload VS Code after installation.
2. Open a trusted repository folder.
3. Run **Ragit: Check Backend**. The result states whether Docker or npm/native was selected.
4. Run **Ragit: Show Index Status** and wait for `ready`.
5. Ask Copilot Chat:

   ```text
   @ragit Explain the authentication flow and cite the relevant files and symbols.
   ```

The initial pass indexes current files. Later save/create/delete events are combined for 1.5 seconds and trigger another pass. Ragit sends nothing continuously to the model: `@ragit` or a Ragit tool waits for saved changes, retrieves relevant graph results and source snippets, and adds only that bounded context to the current model request.

## Docker operations

```bash
# Show managed backend containers
docker ps --filter label=ragit.workspace

# Stop them; Ragit restarts a stopped container when needed
docker ps -q --filter label=ragit.workspace | while read -r id; do docker stop "$id"; done

# Remove containers; indexes remain under ~/.cache/ragit/cbm
docker ps -aq --filter label=ragit.workspace | while read -r id; do docker rm -f "$id"; done
```

## Troubleshooting

Open **Ragit: Show Logs** for backend errors. **Ragit: Check Backend** performs selection again and reports the active mode and version.

For Remote SSH, Docker or npm installed only on the laptop is invisible to the remote extension host. Install Docker or `codebase-memory-mcp` on the DGX/remote host, then configure `ragit.backendMode` in that remote VS Code window.
