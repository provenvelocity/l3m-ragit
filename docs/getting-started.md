# Getting started

L3M Ragit runs in the VS Code workspace extension host. Install the backend on that same machine: your laptop for a local folder, the DGX Spark for Remote SSH, or the remote Linux host for a Dev Container or Codespace.

The native installation is the recommended setup. The Docker setup is useful when a team wants a pinned, isolated runtime.

## 1. Install the VS Code extension

Download `l3m-ragit-0.1.0.vsix` from the latest successful GitHub Actions run, or package it from a clone:

```bash
git clone https://github.com/provenvelocity/l3m-ragit.git
cd l3m-ragit
npm ci
npm run package
code --install-extension ./l3m-ragit-0.1.0.vsix
```

When using VS Code Remote SSH, run the `code --install-extension` command through the remote VS Code window or choose **Install in SSH: host** from the Extensions view.

## 2A. Recommended: native backend through npm

The npm package is a launcher and installer for the verified native `codebase-memory-mcp` executable. Node does not perform the indexing.

```bash
npm install --global codebase-memory-mcp@0.11.0
codebase-memory-mcp --version
```

Ragit does not require `codebase-memory-mcp install`; it invokes the executable directly. That extra command configures other detected coding clients and is optional:

```bash
codebase-memory-mcp install
```

Leave the VS Code setting at its default:

```json
{
  "l3mRagit.backendPath": "codebase-memory-mcp"
}
```

You can instead use the upstream native installer on macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
codebase-memory-mcp --version
```

Review downloaded installation scripts before running them when required by your organization.

## 2B. Alternative: Docker backend

The repository includes a multi-architecture image pinned to `codebase-memory-mcp` 0.11.0. The build verifies the upstream release checksum for Linux amd64 or arm64.

```bash
git clone https://github.com/provenvelocity/l3m-ragit.git
cd l3m-ragit
docker build \
  --file docker/Dockerfile \
  --tag l3m-ragit/codebase-memory-mcp:0.11.0 \
  .
chmod +x "$PWD/docker/cbm-docker"
"$PWD/docker/cbm-docker" --version
```

Set Ragit's backend path to the wrapper's absolute path:

```json
{
  "l3mRagit.backendPath": "/absolute/path/to/l3m-ragit/docker/cbm-docker"
}
```

The wrapper starts one persistent container per workspace. It mounts the workspace read-only at the same absolute path and stores the graph under `~/.cache/l3m-ragit/cbm`. Keeping the container alive allows the upstream coordination daemon to work across indexing and query calls. A separate `docker run --rm` for every call is not supported because it discards that process namespace and can leave unusable daemon sockets in a shared cache.

Useful container commands:

```bash
# Show Ragit backend containers
docker ps --filter label=l3m-ragit.workspace

# Stop them; the wrapper restarts a stopped container when needed
docker ps -q --filter label=l3m-ragit.workspace | while read -r id; do docker stop "$id"; done

# Remove them; indexes remain in ~/.cache/l3m-ragit/cbm
docker ps -aq --filter label=l3m-ragit.workspace | while read -r id; do docker rm -f "$id"; done
```

On macOS, Docker Desktop must be allowed to share the directory containing the workspace. On Linux, the developer must be allowed to use the Docker daemon. The wrapper is a POSIX shell script for macOS, Linux, and WSL; use the native installation for a Windows workspace host without WSL.

## 3. Verify and use Ragit

1. Reload VS Code after installing the extension.
2. Open a trusted repository folder.
3. Run **L3M Ragit: Check Backend** from the Command Palette.
4. Run **L3M Ragit: Show Index Status** and wait for `ready`.
5. Ask Copilot Chat:

   ```text
   @ragit Explain the authentication flow and cite the relevant files and symbols.
   ```

The initial pass indexes the current files. Later save/create/delete events are combined for 1.5 seconds and trigger another index pass. Ragit sends nothing continuously to the model: `@ragit` or a Ragit tool waits for saved changes, retrieves relevant graph results and source snippets, and adds only that bounded context to the current model request.

## Troubleshooting

Use **L3M Ragit: Show Logs** for backend output. Confirm the configured executable from a terminal on the workspace host:

```bash
codebase-memory-mcp --version
# or
/absolute/path/to/l3m-ragit/docker/cbm-docker --version
```

For Remote SSH, a backend installed only on the laptop is invisible to the remote extension host. Install or build it on the DGX/remote host and configure `l3mRagit.backendPath` in that remote VS Code window.
