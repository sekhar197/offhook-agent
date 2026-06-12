# Security notes

## Known dependency advisories

### `tar` (via `fastembed` → `onnxruntime-node`)

`npm audit` flags `tar@<=7.5.10` (path-traversal family, e.g. GHSA-34x7-hfp2-rc4v).
`fastembed` requires tar v6's default export, and the patched tar (`>7.5.10`)
removed it, so we pin `tar@6.2.1` via `overrides` until fastembed updates.

**Why this is acceptable for now:** the advisories require extracting a
*malicious* archive. In offhook, tar is only invoked by fastembed to extract
its own embedding-model archive, downloaded from fastembed's pinned model
source — never user-supplied or caller-supplied archives. There is no code
path that extracts untrusted tarballs.

**Exit plan:** remove the override the moment fastembed ships a release
compatible with tar ≥7.5.11 (tracked by the monthly dependency canary).
Setting `EMBEDDING_PROVIDER=openai` avoids fastembed entirely.
