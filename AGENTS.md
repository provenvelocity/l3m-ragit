# Repository expectations

- Preserve the distinction between indexing and model requests: saved changes update the index but never call a model.
- Do not claim unsaved buffers, all Copilot requests, or inline completions receive Ragit context.
- Keep separate checkout paths isolated with distinct project identities.
- Launch backend commands without a shell and keep extension-owned access within the workspace root.
- A failed or cancelled indexing pass must never be reported as fresh.
- Run `npm run check`, `npm test`, `npm run build`, and the backend smoke test after changing indexing or backend behavior.
