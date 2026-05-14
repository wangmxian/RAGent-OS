# Issue 005: Execution Logs Page

## Background

The target architecture requires an independent logs page that shows the
execution chain. The app previously persisted Skill run logs, but it did not
persist a unified log for chat, single MCP calls, and Skill calls.

## Goals

- Add unified execution log persistence.
- Log all `/api/chat` execution modes.
- Add an API for reading logs.
- Add an independent `/logs` page.
- Add Chat navigation to logs.

## Scope

- Add `execution_logs` table.
- Add `lib/execution-logs.ts`.
- Add `/api/logs`.
- Update `/api/chat` to write logs for `chat`, `mcp_call`, and `skill_call`.
- Add `app/logs/page.tsx`.
- Add Chat header link.

## Non-goals

- No external observability integration.
- No retention policy.
- No advanced query/filter UI.

## Implementation Plan

1. Add execution log persistence helpers.
2. Add database schema.
3. Add logs API.
4. Write logs from each chat execution branch.
5. Build independent logs page.
6. Verify with build.

## Acceptance Criteria

- `/logs` renders as an independent page.
- Chat, MCP, and Skill paths all write execution logs.
- Logs include mode, target, input, decision, output/error, duration, and result status.
- `npm run build` passes.

## PR Workflow

- GitHub Issue: #9
- Branch: `issue/005-execution-logs-page`
- PR: created after implementation and verification.
