# dsh-jev-planning Contributor Guide

Staged planning plugin (`@local/dsh-jev-planning`) for DeepSeek Harness, ported from OMP Jevstice (`jev_requirements`, `jev_plan_review`, `jev_consult`, `/jev status`). See [README.md](README.md), [docs/DETAIL.md](docs/DETAIL.md), and [../AGENTS.md](../AGENTS.md).

## Layout

- `index.ts`: Cordis plugin `apply`, tool/command/gate wiring, and judge provider chain.
- `lib/plan-review.machine.ts`: `jevPlanReview` XState v5 machine governing planning stages.
- `locale/`: `en.json`, `ru.json`.
- `test/`: `plan-review.machine.test.ts`, `selfcheck.ts`.
- `dist/`: compiled TypeScript output (`tsc`).

## Invariants

- **Byte-exact artifact binding:** `finalize` binds plan approval to the exact bytes of the Markdown artifact under `planDir` (`.dsh/jev` default). Before each consequential tool call (`write`, `edit`, mutating shell, delegation, worktrees, plugin management), the artifact is re-read; any byte drift drops approval and re-closes the gate.
- **Session-only memory:** State is strictly in-memory per session (restart, fork, or resume starts unapproved). Delegate only after plan approval.
- **Judge chain & availability:** Resolves keys lazily in order OpenCode -> OpenRouter -> TypeSafe without logging or storing secrets. Three consecutive availability failures open the gate as unjudged continuation (never forged approval). No stronger-executor fallback or completion gate exists in this port.

## Verification

```sh
npm ci
npm run check     # tsc --noEmit && tsc && node --test dist/test/*.test.js
```

Sync `../machines` if `lib/plan-review.machine.ts` changes, and update `../repositories.json` snapshot metadata when files here change.
