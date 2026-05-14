# Issue 004: Agent Prompt Configuration Page

## Background

The routing Agent prompt was embedded directly in `/api/chat`. The target system
requires an independent Prompt configuration page so routing rules can be
managed from the UI while preserving strict JSON output constraints.

## Goals

- Add a persisted Agent Prompt configuration.
- Add API endpoints to read, save, and reset the prompt.
- Add an independent `/prompt` page.
- Make the routing Agent use the configured prompt.
- Preserve required decision rules and strict JSON output formats.

## Scope

- Add `prompt_configs` database table.
- Add `lib/agent-prompt.ts`.
- Add `/api/prompts/agent`.
- Add `app/prompt/page.tsx`.
- Add a Chat header link to `/prompt`.

## Non-goals

- No prompt version history.
- No model/provider configuration.
- No A/B testing.

## Implementation Plan

1. Persist prompt configuration by key.
2. Move the default routing prompt into a reusable helper.
3. Render prompt placeholders for `{{skills}}` and `{{mcpTools}}`.
4. Update chat routing to use configured prompt.
5. Build the independent prompt editor page.
6. Verify with build.

## Acceptance Criteria

- `/prompt` renders as an independent page.
- Prompt can be saved and reset.
- Chat routing uses the configured prompt.
- Default prompt includes chat, mcp_call, and skill_call JSON formats.
- `npm run build` passes.

## PR Workflow

- GitHub Issue: #7
- Branch: `issue/004-agent-prompt-page`
- PR: created after implementation and verification.
