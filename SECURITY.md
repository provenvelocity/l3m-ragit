# Security

Ragit reads source code from the open workspace and passes retrieved excerpts to the model selected in VS Code. Teams must configure model providers according to their source-code handling policies.

The extension:

- runs only in trusted, filesystem-backed workspaces;
- starts backend commands without a shell;
- sets `CBM_ALLOWED_ROOT` for extension-owned backend calls;
- builds the Docker backend only when auto/Docker mode needs it, pins version 0.11.0, and verifies the official release checksum;
- uses the exact npm package version 0.11.0 when npm fallback must fetch a runtime;
- mounts source read-only in managed containers and keeps graph data in a separate cache;
- does not include unsaved buffers in the index;
- does not send model requests merely because a file was saved.

Direct native MCP registration is disabled by default because those calls bypass the extension-owned freshness queue.

Report vulnerabilities privately through the repository's GitHub security advisory feature. Do not include confidential source code in a public issue.
