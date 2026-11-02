Use available agent skills proactively whenever a request matches their purpose; the user does not need to name a skill explicitly. Briefly state which skill you are using and why. Do not use Superpowers unless the user explicitly requests it.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Npm publishing & Github release

Publish releases with `npm publish --access public`. The maintainer completes npm browser authentication manually in their terminal. Do not request, accept, or pass an OTP through the agent. After the maintainer reports success, verify the published version and `latest` dist-tag before pushing the release commit and Git tag.

Tag a new release on github at the end. 

## Tone

Keep your response tone concise, technical, and straightforward. Do not include any flair or prose.

## Tests

Do not write any unit tests or e2e tests associated with TUI changes. Instead, give the user a TODO list to manually verify the TUI changes. 

Give the user a CLI command to open a temporal Pi agent session to check TUI changes. It should only open with the updated pi-atelier extension, otherwise there would result in a conflict with the locally installed pi-atelier. 

## Git

- For non-trivial changes, always work on a separate git branch.
- Always use conventional commit.
- For non-trivial changes, ask the user whether we should open an issue or not.
- Your issue/PR description should be concise and simple. keep it short, concrete, and worth reading.
- Prefer `squash merge` for PRs. 
- If a PR is large (like more than thousands lines), you may prefer to separate them. You have the rights to decide. 
- If you are a Claude model, do not add a "Co-Authored-By" line to any commit message or PR description, and do not end PRs with the "Generated with Claude Code" line.

## Changlog

- Always update the changelog after you made changes. 
- Follow the structure in `CHANGELOG.md`.