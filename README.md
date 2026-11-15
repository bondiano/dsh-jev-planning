# Jev planning

Staged planning through the Jev judge, ported from the Jevstice OMP extension.

## What it adds

Three model-facing tools:

- `jev_requirements` — the owner's request is broken into individually checkable requirements and judged against the request itself. Coverage and every item need probability at least 0.7; every candidate omitted need must be at most 0.3. Approval stores the exact requirement text that outline steps must cite.
- `jev_plan_review` — three phases over a written Markdown artifact. `outline` submits the complete ordered step list, each step citing one approved requirement. `detail` submits one approved step and a unique non-empty section of the artifact that must name a concrete operation and an observable check. `finalize` checks cross-section consistency and the artifact remainder, then binds the approval to the artifact's exact bytes.
- `jev_consult` — one typed decision in the shape that fits it: a choice between submitted alternatives, a score on a submitted rubric, or a Boolean answered as a probability.

A gate holds consequential tool calls once requirements have been submitted: `write`, `edit`, mutating shell commands, delegation, worktrees and plugin management are refused until a final plan is approved. Read-only inspection stays allowed, and so do writes to the plan artifact itself, so a session can plan before it changes anything. After approval the artifact is re-read before each consequential call; if its bytes changed, the approval is dropped and the gate closes again.

`/jev status` prints the local stage, the task fingerprint, the approval state and judge health. It makes no judge call and reads no artifact.

## Where plans live

Plan artifacts are Markdown files under the row's `planDir`, `.dsh/jev` by default, relative to the session working directory. Write them with the ordinary file tools; the gate allows that directory while planning is open.

## Judge providers

The judge is called in the Jevstice order, and the first usable answer wins:

1. OpenCode — `OPENCODE_API_KEY` or `OPENCODE_API_KEY_COMMAND`, then the `OPENCODE_API_KEY` or `OPENCODE_GO_API_KEY` reference in the DSH credential store
2. OpenRouter — `OPENROUTER_API_KEY` or `OPENROUTER_API_KEY_COMMAND`, then the `OPENROUTER_API_KEY` reference
3. TypeSafe — `TYPESAFE_API_KEY` or `TYPESAFE_API_KEY_COMMAND`, then the `TYPESAFE_API_KEY` reference (`TYPESAFE_BASE_URL` overrides the host)

A provider without a key is skipped without a call. Keys are read from the Host process environment or the DSH credential store, never logged, and never stored by this plugin; a stored credential is re-read on each call, so changing it reaches the next attempt without a restart. Three consecutive availability failures are reported as unjudged continuation, which is not an approval: the gate opens until the next planning call rather than deadlocking a session without credentials.

## Configuration

The bundle's patch inserts one row; override its config in your profile patch the same way:

```yaml
- insert:
    - id: jev-planning
      name: '@local/dsh-jev-planning'
      config:
        planDir: .dsh/jev    # workspace-relative artifact directory
        gateMutation: true   # false disables the mutation gate, keeping the tools
```

## Limits

- State is in memory per session. A Host restart, a fork or a resumed session starts without approvals and therefore with the gate closed; approvals are never inferred from disk.
- The gate covers the planning session's own tool calls. Work delegated to a subagent runs in another session with its own empty state, so delegate only after the plan is approved.
- This port has no stronger-executor fallback and no completion gate: an exhausted refusal budget never releases the boundary, and the agent is told to submit a materially different decision.
- Requirements, outline, detail and finalize phases are judged by the external Jev providers; without a key the tools report unavailability instead of inventing an approval.
