# Issue 012: Tool Fallback

## Background

Tool Gateway now owns MCP execution, permission preflight, audit, and rate
limit checks. The next platform capability is explicit tool-level fallback: if
a primary tool execution fails after Gateway policy checks, the configured
backup tool may run through the same Gateway boundary.

## Goals

- Add Tool-level fallback configuration.
- Invoke explicitly configured fallback tools after primary target execution
  fails.
- Preserve Gateway structured failures when fallback is missing, recursive, or
  fails.
- Record `fallbackUsed=true` in Gateway metadata and audit logs.
- Expose fallback configuration through `/api/mcp-tools` and `/mcp`.

## Scope

- Add `mcp_tools.fallback` JSON config with
  `{ enabled, fallbackToolId, fallbackParams }`.
- Merge original params with optional fallback params when calling the backup
  tool.
- Execute fallback through Tool Gateway so system state, tool enablement,
  permission, rate limit, and audit checks still apply.
- Keep the caller-facing Gateway metadata anchored to the primary tool while
  marking `fallbackUsed=true`.
- Limit fallback recursion to one level and reject recursive chains.

## Non-goals

- No automatic fallback by matching tool names.
- No RAG scope filtering.
- No fallback ranking or health-based selection.
- No distributed retry/fallback orchestration.

## Acceptance Criteria

- Primary tool failure invokes configured fallback.
- Successful fallback returns `ok=true` with `fallbackUsed=true`.
- Fallback failure returns structured `FallbackFailed`.
- Cross-System fallback is only possible by explicit `fallbackToolId`.
- Fallback tool execution still runs through Gateway checks.
- Gateway audit logs record fallback usage.
- `npm run smoke:fallback` passes.
- `npm run build` passes.

## Verification

- `npm run smoke:fallback`
- `npm run smoke:gateway`
- `npm run smoke:rate-limit`
- `npx tsc --noEmit`
- `npm run build`
