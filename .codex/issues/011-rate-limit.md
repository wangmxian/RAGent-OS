# Issue 011: Rate Limit

## Background

Tool Gateway is the single execution boundary for MCP tools and now records
gateway audit logs. Systems already support a `rateLimit` configuration shape,
but Gateway does not enforce it yet. Enterprise deployments need fail-closed,
structured rate limit behavior before expensive or sensitive tool calls run.

## Goals

- Enforce System-level and Tool-level rate limit configuration in Tool Gateway.
- Return structured `RateLimited` failures before permission preflight and
  target tool execution.
- Record rate-limited Gateway calls in audit logs.
- Surface Tool-level rate limit configuration through `/api/mcp-tools` and
  `/mcp`.

## Scope

- Add Tool `rateLimit` config with `{ enabled, perMinute, perHour }`.
- Add database migration for `mcp_tools.rate_limit`.
- Add in-memory fixed-window counters for this process.
- Rate limit key uses `systemId + toolId + user/session identity`.
- Check Tool override first when enabled, then System limit when enabled.
- Add smoke tests for limited and non-limited calls.

## Non-goals

- No Redis or distributed rate limit backend.
- No fallback execution.
- No RAG scope filtering.
- No per-tenant admin dashboard for rate counters.
- No rate limit reset API.

## Implementation Plan

1. Extend MCP tool config schema with `rateLimit`.
2. Add API and MCP page fields for Tool-level rate limits.
3. Add a small in-memory rate limiter module.
4. Invoke rate limit checks in Tool Gateway before permission preflight.
5. Return `RateLimited` with Gateway metadata and audit row.
6. Add `scripts/rate-limit-smoke.ts` and `npm run smoke:rate-limit`.
7. Verify smoke tests and build.

## Acceptance Criteria

- System `rateLimit.enabled=true` with `perMinute=1` allows first call and
  returns `RateLimited` for the second call in the same window.
- Tool `rateLimit.enabled=true` enforces the tool limit.
- Unlimited systems/tools continue to execute normally.
- Rate-limited calls do not execute the target tool.
- Gateway audit logs record `ok=false`, `errorType=RateLimited`, and Gateway
  metadata for limited calls.
- `npm run smoke:rate-limit` passes.
- `npm run build` passes.

## Risks

- In-memory counters are per process and not suitable for clustered deployment.
- Fixed windows are simpler than rolling windows and can allow bursts at window
  boundaries.
- Existing long-running dev servers can hold `.next` files on Windows and block
  build output cleanup.

## PR Workflow

- GitHub Issue: #23 https://github.com/wangmxian/RAGent-OS/issues/23
- Branch: `issue/011-rate-limit`
- PR: #24 https://github.com/wangmxian/RAGent-OS/pull/24
