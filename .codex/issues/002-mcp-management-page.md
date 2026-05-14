# Issue 002: Independent MCP Management Page

## Background

The final architecture requires MCP management to be available as an independent page.
The previous UI only exposed MCP configuration as a drawer inside the chat page.

## Goals

- Add an independent `/mcp` management page.
- Show configured MCP servers from `/api/mcp`.
- Show available MCP tools from `/api/tools`.
- Allow creating, editing, enabling, disabling, and deleting MCP server configs.
- Keep existing chat drawer behavior intact as a shortcut.

## Scope

- Add a Next.js page at `app/mcp/page.tsx`.
- Add `PATCH /api/mcp` for server updates.
- Add a chat header link to `/mcp`.
- Reuse the existing MCP server storage and tool registry.

## Non-goals

- No generic stdio/sse runtime implementation.
- No Skill orchestration changes.
- No replacement of the RAG HTTP MCP adapter.

## Implementation Plan

1. Extend `/api/mcp` with PATCH support using the existing `updateMcpServer`.
2. Build the `/mcp` page with server configuration and tool visibility.
3. Add navigation from the chat header to the independent page.
4. Verify with `npm run build`.

## Acceptance Criteria

- `/mcp` renders as an independent page.
- The page lists MCP server configs and available tools.
- Server configs can be saved, toggled, and deleted.
- `npm run build` passes.

## Verification

- `npm run build`

## PR Workflow

- GitHub Issue: #3
- Branch: `issue/002-mcp-management-page`
- PR: created after implementation and verification.
