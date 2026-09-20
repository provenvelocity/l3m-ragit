# Security

L3M Ragit reads source code from the open workspace and passes retrieved excerpts to the model selected in VS Code. Teams must configure model providers according to their source-code handling policies.

The extension:

- runs only in trusted, filesystem-backed workspaces;
- starts backend commands without a shell;
- sets `CBM_ALLOWED_ROOT` for extension-owned backend calls;
- does not bundle or silently download codebase-memory-mcp;
- does not include unsaved buffers in the index;
- does not send model requests merely because a file was saved.

Direct native MCP registration is disabled by default because those calls bypass the extension-owned freshness queue.

Report vulnerabilities privately through the repository's GitHub security advisory feature. Do not include confidential source code in a public issue.
