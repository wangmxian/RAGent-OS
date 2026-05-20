# Issue 013: Prompt Layering

## Background

Agent routing currently uses one configurable prompt with `skills` and
`mcpTools` placeholders. Systems already have prompt fields and Skills already
store a system prompt column, but those layers are not consistently rendered
into the Agent prompt.

## Goals

- Render Agent Prompt as global rules + relevant system prompts + optional
  selected skill prompt + runtime tool context.
- Inject only relevant System prompts.
- Keep global hard rules above System and Skill content.
- Expose prompt preview/debug data.
- Allow Skill prompt editing from the Skill page.

## Scope

- Extend the default routing prompt with `{{systemPrompts}}` and
  `{{skillPrompt}}` placeholders.
- Add a layered prompt renderer that resolves relevant Systems from candidate
  tools and selected Skill steps.
- Add `/api/prompts/agent` preview output.
- Add Skill Prompt editing to `/skills`.
- Add smoke coverage for relevant System prompt injection and unrelated System
  exclusion.

## Non-goals

- No prompt budget allocator.
- No RAG scope filtering.
- No skill toolId migration.
- No LLM-based prompt validation.

## Acceptance Criteria

- Agent prompt includes global hard rules, relevant system prompts, skill
  prompt, skills, and MCP tool context.
- Unrelated System prompts are not injected for a selected Skill preview.
- Disabled Systems are excluded.
- Skill Prompt can be saved and rendered.
- `npm run smoke:prompt-layering` passes.
- `npm run build` passes.

## Verification

- `npm run smoke:prompt-layering`
- `npm run smoke:gateway`
- `npx tsc --noEmit`
- `npm run build`
