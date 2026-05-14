# Issue 002: Independent MCP Tool Configuration Page

## Background

The final architecture requires MCP tools to come from page configuration.
The important configurable object is the tool call contract: name, description,
path suffix, parameter schema, enabled state, handler type, and optional MCP
connection. The previous implementation still exposed most MCP tools through
hardcoded `RAG_TOOLS` definitions.

## Goals

- Add an independent `/mcp` tool configuration page.
- Persist MCP tool call definitions in the database.
- Let users configure tool name, description, `pathSuffix`, parameter schema,
  handler type, enabled state, and optional MCP connection.
- Make Agent and Skill tool discovery read from page-configured tools.
- Keep MCP HTTP connection configuration available as supporting data.
- Make the Chat page MCP button navigate to `/mcp`; do not show the old drawer.

## Scope

- Add a Next.js page at `app/mcp/page.tsx`.
- Add an `mcp_tools` table and seed existing built-in tool contracts.
- Add `/api/mcp-tools` CRUD.
- Update the unified MCP dispatcher to discover and call tools from `mcp_tools`.
- Add `PATCH /api/mcp` for connection updates.
- Update the Chat header MCP button to navigate to `/mcp`.

## Non-goals

- No generic stdio/sse runtime implementation.
- No Skill orchestration changes.
- No replacement of the RAG HTTP adapter; configured tools still use the
  existing HTTP caller by `pathSuffix`.

## Implementation Plan

1. Add the `mcp_tools` schema and seed current tool definitions.
2. Add CRUD helpers and `/api/mcp-tools`.
3. Update `/api/tools` and the dispatcher path through `listUnifiedMcpTools`.
4. Build the `/mcp` page around tool configuration.
5. Keep MCP HTTP connection editing as a secondary panel.
6. Verify with `npm run build`.

## Acceptance Criteria

- `/mcp` renders as an independent page.
- The page creates, edits, enables, disables, and deletes MCP tool configs.
- Tool configs include name, description, path suffix, parameter schema, handler
  type, enabled state, and optional connection.
- Agent and Skill discovery read configured tools instead of hardcoded lists.
- The Chat MCP button navigates to `/mcp` and does not open a drawer.
- `npm run build` passes.

## Verification

- `npm run build`

## PR Workflow

- GitHub Issue: #3
- Branch: `issue/002-mcp-management-page`
- PR: created after implementation and verification.
