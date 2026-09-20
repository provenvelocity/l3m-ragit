# Architecture

```text
saved file events ──> per-workspace queue ──> codebase-memory-mcp index
                                                  │
Copilot tool or @ragit request ──freshness gate───┤
                                                  ▼
                                      relevant graph/source context
                                                  │
                                                  ▼
                                    selected VS Code chat model
```

The extension runs in the VS Code workspace extension host. Each filesystem-backed workspace folder receives its own queue, backend boundary, and project identity. The project identity is derived from the absolute checkout path.

The saved-change queue is an ordering mechanism rather than a filesystem snapshot transaction. A successful pass acknowledges changes observed before it began. If another watched event arrives during the pass, the queue performs another pass before retrieval proceeds.

The `@ragit` participant controls the context path: it flushes the queue, retrieves context, fits it to the selected model's token budget, and calls `request.model`. Contributed language-model tools provide the same freshness gate to Copilot agent mode, though tool selection remains Copilot's decision.

Native MCP registration is optional. It starts upstream codebase-memory-mcp as a stdio server with the workspace as its working directory and `CBM_ALLOWED_ROOT` set. Native calls do not transit the extension-owned queue.

## Backend compatibility

The extension currently uses these upstream tools:

- `index_repository`
- `search_graph`
- `get_code_snippet`

Release 0.2.0 is integration-tested with codebase-memory-mcp 0.11.0. A future release should add explicit capability/version negotiation before widening backend compatibility.

The managed launcher defaults to Docker, maintains one long-lived container per workspace, bind-mounts that workspace read-only at the same absolute path, and persists the CBM cache. Each CLI or MCP invocation enters that container with `docker exec`, preserving the upstream coordination daemon across calls. If Docker cannot run, auto mode delegates to an installed `codebase-memory-mcp` command or the pinned npm package through `npx`; selection fails only when Docker and npm/native execution are unavailable.
