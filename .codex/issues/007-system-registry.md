# Issue 007: System Registry

## Background

The next platform phase introduces a System layer so multiple business systems
can connect their own MCP tools. The platform remains a consumer and scheduler:
it stores system and tool routing configuration, but it does not store business
permissions or maintain a business permission model.

This issue establishes the registry required by later Tool Gateway, permission,
prompt, audit, and RAG-scope issues.

## Goals

- Add a `systems` registry table with a default personal system.
- Add `/api/systems` for listing, creating, updating, and disabling systems.
- Add a `/systems` management page.
- Associate every MCP tool with a required `systemId`.
- Keep existing MCP tool behavior compatible by assigning old tools to
  `default`.

## Scope

- SQLite schema migration and seed data for `systems`.
- System registry library functions.
- System API route.
- Systems admin UI.
- MCP tool model, API, and MCP page updates to read/write `systemId`.

## Non-goals

- No Tool Gateway execution path changes.
- No permission preflight execution.
- No rate limiting.
- No fallback routing.
- No prompt layering.
- No RAG scope filtering.

## Implementation Plan

1. Add the `systems` table and seed `default`.
2. Add a system registry module with validation and CRUD helpers.
3. Extend `mcp_tools` with `system_id`, defaulting existing rows to `default`.
4. Extend MCP tool APIs and UI to select and display System.
5. Add `/api/systems` and `/systems`.
6. Verify build and smoke checks.

## Acceptance Criteria

- Users can create, edit, enable, and disable Systems.
- The default personal System exists after migration.
- Every MCP tool has a `systemId`.
- MCP tool creation/editing requires and persists a System selection.
- Existing tools remain assigned to `default`.
- `npm run build` passes.
- `npm run smoke:systems` passes.

## Risks

- Existing SQLite files may not have `system_id`; migration must be idempotent.
- Existing MCP UI has unrelated local edits in the worktree; changes must avoid
  reverting them.
- Later issues will add permission behavior, so this issue must avoid implying
  authorization decisions in Agent or UI logic.

## PR Workflow

- GitHub Issue: #14
- Branch: `issue/007-system-registry`
- PR: #13
