# Changesets

Describe a change to a published `@webmcp-agents/*` package with `pnpm changeset` (pick the packages and the bump).
Releases run locally, from `main` (`scripts/release.mjs`; no CI job publishes):

- `pnpm release` versions the packages from the pending changesets, runs the gate, commits, publishes and pushes the tags.
- `pnpm release patch|minor|major` does the same when no changeset was written: it generates one from the commits
  since the last release.
- `pnpm release:version` / `pnpm release:publish` split it in two (`publish` again after a half-failed publish:
  versions already on npm are skipped). `pnpm release:snapshot [tag]` publishes a throwaway prerelease (`next`).
- `--dry-run` changes nothing; `--otp=<code>` for npm 2FA; `--skip-checks`, `--no-push`, `--allow-branch`.
The public packages are versioned together (`fixed`); the apps and `@webmcp-agents/vercel-api` are never published.
