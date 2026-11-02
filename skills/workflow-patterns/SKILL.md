---
name: workflow-patterns
description: Argument shapes for five recurring multi-agent patterns — deep-research, adversarial-review, code-review, multi-perspective, codebase-audit — authored as SubagentWorkflow scripts with agent()/parallel(). Use for requests like "research X", "fact-check/adversarially review this", "review this diff/PR", "analyze from multiple perspectives", or "audit the codebase for Y". Not for authoring a new workflow script — see workflow-authoring.
metadata:
  version: "1.0.0"
---

# Recurring workflow patterns

The `SubagentWorkflow` tool runs a JavaScript script that fans work out across
subagents. opensec-pi-subagents does **not** ship these five patterns as
built-ins or slash commands, so treat the table below as a recipe list: write
the script with `agent()`/`parallel()`/`pipeline()` (see the
`workflow-authoring` skill), or save it under `.pi/workflows/<name>.js` and run
it later with `{ name: "<name>" }`.

Prefer a saved workflow over re-authoring a pattern once it repeats. A project
or user saved workflow of the same name takes precedence over any other source.

## Patterns

| Pattern | When to reach for it | Shape |
| --- | --- | --- |
| `deep-research` | Research a question across the web with cross-checked sources | Parallel searches over N angles (`args.angles`, default 4), then keep only claims seen in at least `args.minSupport` (default 2) distinct sources |
| `adversarial-review` | Investigate a task/claim, then cross-check each finding with skeptical reviewers | One investigator, then `args.reviewers` parallel skeptics per finding; keep findings that pass `args.threshold` |
| `code-review` | Multi-angle review of a diff (correctness, reuse, simplification, efficiency, altitude) | `args.diff` supplied by the caller (this does not fetch it); one reviewer per angle in `parallel()`, then synthesize |
| `multi-perspective` | Analyze a topic from several independent perspectives in parallel, then synthesize | `args.perspectives` (default: technical, product, security, user experience, maintainability), one agent each, then a synthesizer |
| `codebase-audit` | Run parallel checks against a codebase scope, then cross-validate and report | `args.scope` + `args.checks`, one agent per check in `parallel()`, then a cross-validator that reports only corroborated findings |

## Example

```js
export const meta = {
  name: 'code-review',
  description: 'Review a diff from several angles, then synthesize',
};

phase('Review');
const angles = ['correctness', 'reuse', 'simplification', 'efficiency'];
const findings = await parallel(angles.map(angle => () =>
  agent(`Review this diff for ${angle}:\n\n${args.diff}`, { label: `review-${angle}` })));

phase('Synthesize');
return await agent(
  `Synthesize these findings into one review:\n${JSON.stringify(findings)}`,
  { label: 'synthesize' },
);
```

Call `SubagentWorkflow` with `{ script: "<source>" }`, or save the file and
call `{ name: "code-review", args: { diff } }`.

## Writing a new workflow instead

If the request doesn't fit one of these shapes, author a script with `script`
as usual — see the workflow-authoring skill.
