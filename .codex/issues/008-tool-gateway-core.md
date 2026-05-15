# Issue 008: Tool Gateway Core

## Background

The platform now has a System registry and every MCP tool belongs to a System.
The next step is to make Tool Gateway the only execution entry for MCP tools so
later permission, audit, rate limit, fallback, prompt, and RAG-scope work has a
single enforcement point.

## Goals

- Add a `ToolGateway` internal module.
- Route direct `mcp_call` execution through Tool Gateway.
- Route every `skill_call` step through Tool Gateway.
- Keep Tool Gateway internally using the existing MCP dispatcher for actual tool
  behavior.
- Return basic gateway metadata for successful and failed calls.
- Use structured gateway errors instead of letting raw dispatcher errors become
  invented tool results.

## Scope

- Add Tool Gateway request/response types and `callToolGateway`.
- Resolve tools by configured tool name for compatibility with current Agent and
  Skill steps.
- Resolve `systemId` from the configured MCP tool and check System/tool enabled
  state.
- Update chat `mcp_call`, public MCP route, and Skill executor to use Tool
  Gateway.
- Add smoke coverage that proves tool calls are routed through the Gateway.

## Non-goals

- No permission preflight implementation.
- No audit log table or redaction implementation.
- No rate limiting.
- No fallback execution.
- No identity resolver.
- No RAG scope filtering.
- No Skill `toolId` migration.

## Implementation Plan

1. Add `lib/tool-gateway.ts` with structured request/response types.
2. Add gateway metadata to Skill step logs.
3. Replace direct `callUnifiedMcpTool` calls in chat and Skill execution.
4. Keep discovery APIs using `listUnifiedMcpTools` unchanged.
5. Add `scripts/tool-gateway-smoke.ts` and `npm run smoke:gateway`.
6. Verify build and existing smoke checks.

## Acceptance Criteria

- `mcp_call` uses Tool Gateway.
- `skill_call` uses Tool Gateway for every step.
- Public MCP route uses Tool Gateway.
- Gateway response includes `systemId`, `toolId`, `permissionChecked=false`,
  `fallbackUsed=false`, and `durationMs`.
- Disabled or missing System/tool returns a structured gateway error.
- `npm run smoke:gateway` passes.
- `npm run smoke:skill` passes.
- `npm run build` passes.

## Risks

- Current Agent and Skill steps still identify tools by name. This issue keeps
  name compatibility and leaves `toolId` migration to Issue 015.
- Existing execution logs do not have gateway-specific columns. This issue only
  includes gateway metadata in execution outputs; audit persistence is Issue 010.

## PR Workflow

- GitHub Issue: #15
- Branch: `issue/008-tool-gateway-core`
- PR: #16
