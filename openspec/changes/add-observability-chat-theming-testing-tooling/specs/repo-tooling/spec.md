# Spec Delta

## Purpose

Keeps the repository's conventions and its dead code under an automatic check, so a broken file layout, an unused
export or an unused dependency fails locally and on a pull request instead of waiting for a reviewer to notice.

## ADDED Requirements

### Requirement: R-TOOL-1 The check fails on dead code and on a broken convention
`pnpm check` SHALL fail on an unused file, an unused export, an unused dependency, and on a broken structural
convention. A real finding SHALL be fixed or removed; it SHALL NOT be silenced by an ignore entry.

#### Scenario: A locale file that does not export itself
- **WHEN** `packages/chat/src/locales/fr.ts` is added and does not export `fr`
- **THEN** `pnpm konsistent` exits non-zero and names the file and the missing export

#### Scenario: An export nothing uses
- **WHEN** a package source file gains an export that no entry, test or other workspace imports
- **THEN** `pnpm knip` exits non-zero and names the file and the export

#### Scenario: A dependency nothing imports
- **WHEN** a `package.json` lists a dependency that no file of that workspace imports
- **THEN** `pnpm knip` exits non-zero and names the package and the dependency

#### Scenario: A package missing a required file
- **WHEN** a directory under `packages/` has no `README.md`, `tsdown.config.ts`, `vitest.config.ts` or `src/index.ts`
- **THEN** `pnpm konsistent` exits non-zero and names the directory and the missing file

#### Scenario: A clean tree
- **WHEN** `pnpm check` runs on the repository with no finding
- **THEN** both tools exit zero and the remaining checks (Biome, typecheck, test, build, size, registry) run

#### Scenario: An invalid configuration
- **WHEN** `konsistent.json` holds a rule type or a placeholder helper the tool does not know
- **THEN** `konsistent validate` exits non-zero and names the rule, and `pnpm check` does not pass

### Requirement: R-TOOL-2 CI runs both tools and annotates the pull request
The CI workflow SHALL run konsistent and Knip on every push to `main` and every pull request, each with its GitHub
reporter, so a finding appears as an annotation on the file it concerns.

#### Scenario: A finding on a pull request
- **WHEN** a pull request adds an unused export
- **THEN** the checks job fails and the finding is shown as an annotation on that file in the pull request

#### Scenario: A clean pull request
- **WHEN** a pull request has no finding
- **THEN** both steps pass and add no annotation
