# Enterprise AI Scheduler Issue Plan

## Requirement Understanding

The final system must use one execution path:

User input -> Agent -> execution mode -> chat / mcp_call / skill_call -> result.

MCP tools must come from page-managed configuration. Skills must come from visual orchestration.
RAG must be exposed as MCP through `ragSearch` with `topK = 5`. The Agent must return strict JSON.

## Uncertainties

- Whether the public MCP route should be `/api/mcp/rag/tools/{pathSuffix}` in this Next.js app,
  or proxied as `/mcp/rag/tools/{pathSuffix}` at deployment time.
- Which drag-and-drop library should be accepted for the Skill orchestration page.
- Whether existing drawer-based settings should remain as shortcuts after independent admin pages are added.

## Issues

1. `001-unified-agent-execution`: Implement the unified Agent decision and execution path.
2. `002-mcp-management-page`: Replace drawer-only MCP configuration with an independent MCP management page and full tool configuration.
3. `003-skill-visual-orchestration`: Build an independent Skill orchestration page with visual step editing and parameter references.
4. `004-agent-prompt-page`: Add an independent Agent prompt configuration page persisted in storage and used by the routing Agent.
5. `005-execution-logs-page`: Add an independent logs page for chat, MCP calls, Skill runs, step inputs, outputs, errors, and timings.
6. `006-rag-contract-hardening`: Verify `ragSearch` is the only knowledge retrieval path and enforce `topK = 5` defaults in API and Skill templates.

## Verification Strategy

- Keep every issue independently buildable.
- Run `npm run build` after each issue.
- Run `npm run smoke:skill` after Skill executor changes.
- Run `npm run smoke` only when vector-store or embedding behavior changes.
