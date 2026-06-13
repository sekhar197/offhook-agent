# Security notes

## Known dependency advisories

### `tar` (via `fastembed` → `onnxruntime-node`)

`npm audit` flags `tar@<=7.5.10` (path-traversal family, e.g. GHSA-34x7-hfp2-rc4v).
`fastembed` requires tar v6's default export, and the patched tar (`>7.5.10`)
removed it, so we pin `tar@6.2.1` via `overrides` until fastembed updates.

The advisory range (`tar <=7.5.10`) now includes 6.2.1 itself, so `npm audit`
reports it even with the pin — but the pin is still correct, because the only
fix is tar 7.x, which fastembed cannot use.

**Why this is acceptable:** the advisories all require extracting a *malicious*
archive. In offhook, tar is invoked **only** to extract trusted model archives
from pinned sources (fastembed's BGE-small download; the LiveKit Silero VAD
model). No code path extracts user-supplied or caller-supplied tarballs, so the
hardlink/symlink-traversal class does not apply to our threat model. The CI
security stage (B4) allowlists this specific advisory set with this reference,
rather than failing the build or pretending it's gone.

**Exit plan:** remove the override the moment fastembed ships a release
compatible with tar ≥7.5.11 (tracked by the monthly dependency canary).
Setting `EMBEDDING_PROVIDER=openai` avoids fastembed entirely.
