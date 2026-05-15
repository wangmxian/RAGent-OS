# Issue 009: Permission Preflight

## Background

Tool Gateway is now the only tool execution entry, and identity context is
normalized before execution. Enterprise systems need fail-closed permission
preflight before target tools execute, while the platform must not store or
calculate business permissions.

## Goals

- Apply System `permissionMode` in Tool Gateway.
- Add Tool-level permission override: `inherit`, `none`, `preflight`, `inline`.
- Call configured System permission tool for preflight.
- Fail closed for enterprise systems with missing identity, missing permission
  tool, permission tool errors, or explicit denial.
- Record permission result in gateway metadata.

## Scope

- Extend MCP tool config schema with `permissionMode`.
- Extend `/api/mcp-tools` and `/mcp` page to read/write permission override.
- Add Tool Gateway preflight logic.
- Add permission check request/response contract parsing.
- Add smoke tests for personal allow, enterprise missing identity deny, explicit
  permission deny, and explicit permission allow.

## Non-goals

- No audit log table changes.
- No sensitive field redaction implementation.
- No rate limiting.
- No fallback execution.
- No RAG scope filtering.
- No inline permission behavior beyond treating it as requiring external system
  enforcement later.

## Implementation Plan

1. Add `permission_mode` to `mcp_tools` with default `inherit`.
2. Surface `permissionMode` in tool config APIs and MCP UI.
3. Resolve effective permission mode in Tool Gateway.
4. Add preflight contract and call the configured permission tool without
   recursive permission checks.
5. Stop target tool execution when preflight denies or fails.
6. Add `scripts/permission-preflight-smoke.ts` and `npm run smoke:permission`.
7. Verify identity, gateway, skill, RAG contract, and build.

## Acceptance Criteria

- Personal/default system with `permissionMode=none` executes normally.
- Enterprise system with missing trusted/forwarded identity is denied before the
  target tool executes.
- Enterprise preflight with no permission tool is denied.
- Permission tool returning `{ allowed: false }` denies target execution.
- Permission tool returning `{ allowed: true }` allows target execution.
- Permission tool failure denies target execution.
- Gateway metadata includes `permissionChecked` and `permissionAllowed`.
- Platform does not store roles, menus, departments, or data-scope permissions.
- `npm run smoke:permission` passes.
- `npm run build` passes.

## Risks

- Permission tools are normal configured tools. Gateway must avoid recursive
  preflight when invoking them.
- Tool-level `none` override can disable preflight, so later UI/ops guidance must
  restrict who can configure enterprise tools.

## PR Workflow

- GitHub Issue: #19 https://github.com/wangmxian/RAGent-OS/issues/19
- Branch: `issue/009-permission-preflight`
- PR: create after implementation and verification.
