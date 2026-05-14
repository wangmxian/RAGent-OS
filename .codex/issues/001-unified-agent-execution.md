# Issue 001: Unified Agent Execution Modes

## Background

The target architecture requires a single execution path:

User input -> Agent decision -> chat / mcp_call / skill_call -> execution layer -> response.

The current implementation only decides between chat and skill_call in `app/api/chat/route.ts`.
It does not support a single MCP tool decision, and the decision prompt does not require the
three strict JSON formats.

## Goals

- Make the Agent choose one of `chat`, `mcp_call`, or `skill_call`.
- Make the Agent prompt include the required decision rules.
- Execute single MCP calls through the unified MCP dispatcher.
- Keep Skill execution through the existing `executeSkill` path.
- Keep RAG access behind the `ragSearch` MCP wrapper.

## Scope

- Update the chat API decision and dispatch logic.
- Reuse existing MCP and Skill registries.
- Preserve the current SSE response contract used by the chat UI.

## Non-goals

- No visual drag-and-drop Skill editor in this issue.
- No independent admin pages in this issue.
- No rewrite of MCP server management.
- No replacement of the existing local vector store.

## Implementation Plan

1. Extend `AgentDecision` to include strict `mcp_call` and `chat.content`.
2. Provide the Agent with enabled MCP tool descriptors and executable Skill descriptors.
3. Update the decision prompt with the required rules:
   - direct answer -> `chat`
   - one tool -> `mcp_call`
   - multiple dependent steps -> `skill_call`
4. Add an MCP execution branch in `/api/chat`.
5. Emit the same SSE `decision`, `tool`, `sources`, `delta`, and `done` events where applicable.

## Acceptance Criteria

- `npm run build` passes.
- `npm run smoke:skill` passes.
- A decision JSON with `mcp_call` can be parsed and dispatched.
- Skill calls still execute through `executeSkill`.
- Chat calls do not call tools.

## Risks

- Some configured external MCP tools may have duplicate names. Existing dispatcher behavior chooses
  the first enabled matching RAG HTTP server; this issue does not change that.
- The LLM may still output malformed JSON. The parser falls back to `chat`.
