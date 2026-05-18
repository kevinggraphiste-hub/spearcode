---
name: spearcode-git
description: >
  SpearCode-specific git rules. Invoke for any git/release action in the
  SpearCode repo. Extends the global git-hygiene skill; the rules here win
  on conflict.
---

# SpearCode git

Builds on `git-hygiene`. SpearCode = public, Apache-2.0, distributed as
self-contained binaries.

## Identity (mandatory)

- Author/committer email **must** be the GitHub noreply
  `265141657+kevinggraphiste-hub@users.noreply.github.com`
  (name `kevinggraphiste-hub`). The gmail address is blocked by GitHub
  email privacy → push rejected otherwise.
- Remote: `github.com/kevinggraphiste-hub/spearcode`, default branch `main`.

## Versioning & release

- Version source of truth = `package.json` `version`; mirror every bump in
  `CHANGELOG.md` (newest section on top, dated, grouped by
  Distribution/Changed/Fixed) in the **same commit**.
- Release = annotated tag `vX.Y.Z` pushed to origin → `release.yml` matrix
  builds Linux + macOS arm64/x64 + Windows installers and attaches them to
  the GitHub Release. Only tag a commit whose `npm run build:bin` works.
- A published release/tag is outward-facing: never delete/move it without
  explicit user consent. If a release is partial/broken, prefer shipping a
  new patch version (e.g. v0.1.0 broken → ship v0.1.1) over rewriting it.
- Licence is **Apache-2.0** — never reintroduce MIT.

## Artifacts (never commit)

`.gitignore` must keep ignoring: `node_modules/`, `dist/`, `build/`,
`release/`, `*.db*`, `.env`, `.spearcode/`, `scripts/.tools/`.
Before any `git add -A`, confirm none of these (nor API keys) are staged.

## Commit scope conventions

Use scopes that match the codebase: `build` (bin pipeline), `ci`,
`fix(build)`, `feat(cli|gungnir|tools)`, `docs`, `release`. Keep the
optional Gungnir bridge changes isolated in their own commits.

## Hygiene pass

When asked to tidy the SpearCode git: run the global periodic-hygiene
checklist, plus verify README/INSTALL/CHANGELOG version references and the
`install.sh`/`install.bat` repo slug stay consistent with `package.json`.
