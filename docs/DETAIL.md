# Jev planning

This plugin adds staged plan review through the Jev judge to DeepSeek Harness. It is a Host-only bundle: it registers three tools, a prompt section that explains the workflow, a gate over consequential tool calls, and a `/jev` slash command for a local status report. It has no interface of its own and no browser-side code.

## The workflow

Planning is optional until it starts. Ordinary work needs no judge call at all; the prompt only says that consequential changes become held once `jev_requirements` is called.

The workflow has four stages:

1. `jev_requirements` submits the owner's request and one item per requirement, each with the quote of the request it derives from. The judge rates coverage of the request, every item, and any owner need you suspect was omitted. Coverage and each item need a probability of at least 0.7, and every candidate omitted need must sit at 0.3 or below. Approval stores the exact requirement text.
2. `jev_plan_review` with `phase=outline` submits the complete ordered step list. Each step cites one approved requirement verbatim. The judge asks whether the steps cover each requirement and whether each new step is a useful unit within the approved task.
3. `phase=detail` submits one approved step and one section of the written plan artifact, selected by a unique complete heading, title or full text. The section itself must name a concrete operation and an observable check; a task, another section or the evidence cannot fill either missing part. Only the chosen category `ready` at confidence 0.6 or above approves the detail.
4. `phase=finalize` submits the whole artifact after every step has an accepted detail. The judge checks cross-section consistency and whether the remaining material stays inside the approved task, then the approval binds the task, the artifact path and the artifact's exact bytes.

`jev_consult` is independent of the workflow. It asks the judge one decision as a choice between submitted alternatives, a score on a submitted rubric, or a Boolean answered as a probability, and returns the typed answer rather than invented reasoning.

## The gate

After `jev_requirements` runs, the session has a development task under supervision. Consequential tool calls are refused while no final plan is approved: file writes and edits outside the artifact directory, mutating shell commands, delegation, worktree creation and plugin management. Read-only inspection and writes inside the artifact directory stay allowed, so the plan can be written while the gate is closed.

The refusal names the current stage and the next call the stage needs. Repeating the same call unchanged changes nothing: an identical refused submission is refused locally without spending a judge call.

Once a final plan is approved, the artifact is re-read before each consequential call. If its bytes changed or the file disappeared, the approval is dropped and the call is refused until `finalize` runs again; details whose sections changed must be reviewed again.

## Provider keys

The judge is reached through the provider chain the Jevstice extension uses: OpenCode first, OpenRouter second, TypeSafe last. Each provider looks for its key in the Host process environment, then in the resolver command variable, then in the DeepSeek Harness credential store under the same reference name; the OpenCode step also accepts the `OPENCODE_GO_API_KEY` reference that the subscription provider stores. A provider without a key is skipped without a call. Keys are never logged and never written to disk by this plugin, and a stored credential is re-read on each call.

When no provider answers, the tool reports unavailability and the submission is not an approval. After three consecutive availability failures the gate opens as unjudged continuation until the next planning call, so a session without any credential can still work; the tool text says so explicitly.

## Limits

State lives in memory for one session. A restart, a fork or a resumed session starts with no approvals and a closed gate, because approvals are never restored from disk or inferred.

The gate covers the calls of the planning session. A subagent runs in a different session with its own empty state, so delegated work is not held by the parent's plan; delegate after approval.

This port keeps the fail-closed floors and the judge questions, but not the OMP-specific pieces: there is no stronger-executor fallback when one boundary reaches five refusals, no completion gate over the end of a turn, no triage or course checks, and no per-call statistics file. A refusal budget that runs out never approves anything; the agent is told to submit a materially different decision with new evidence.
