# Issue 010: Tool Gateway Audit And Redaction

## Background

Tool Gateway is now the only tool execution boundary and permission preflight
records permission metadata in the gateway response. The platform needs a
gateway-level audit trail that is independent from Agent execution summaries,
and sensitive credentials must never be written to logs.

## Goals

- Add persistent Tool Gateway audit logs.
- Redact sensitive fields before writing request params, results, errors, or
  user context to storage.
- Record gateway metadata: system, tool, permission checked/allowed, fallback
  used, outcome, error, duration, and request identity summary.
- Extend `/logs` so operators can inspect gateway audit records alongside
  existing execution logs.

## Scope

- Add `gateway_audit_logs` table with id, requestId, system/tool identity,
  sanitized params/result previews, permission metadata, outcome, error,
  duration, and timestamp.
- Add a shared redaction helper for audit-safe JSON previews.
- Write one audit row for every Tool Gateway target call, including failures.
- Respect System `auditEnabled`: disabled systems skip target-call audit rows,
  while unresolved-tool failures are still logged without a system decision.
- Extend `/api/logs` to return gateway audit logs.
- Extend `/logs` page to display gateway audit metadata.
- Add smoke tests for token redaction and gateway metadata persistence.

## Non-goals

- No rate limiting.
- No fallback execution.
- No RAG scope filtering.
- No full-text log search or pagination beyond the current limit parameter.
- No external audit sink.

## Implementation Plan

1. Add `gateway_audit_logs` schema and list/create helpers.
2. Implement recursive redaction for keys such as `authorization`, `cookie`,
   `token`, `accessToken`, `refreshToken`, `password`, `secret`, and `apiKey`.
3. Wrap Tool Gateway returns so success and failure paths write audit rows.
4. Include permission and identity summary metadata in audit rows.
5. Return gateway logs from `/api/logs`.
6. Display gateway audit rows on `/logs`.
7. Add `scripts/gateway-audit-smoke.ts` and `npm run smoke:audit`.
8. Verify smoke tests and build.

## Acceptance Criteria

- Every audited Tool Gateway call creates a gateway audit row.
- Audit rows include `systemId`, `toolId`, `toolName`, `requestId`,
  `permissionChecked`, `permissionAllowed`, `fallbackUsed`, `ok`, error fields,
  and `durationMs`.
- Tokens and other sensitive fields do not appear in stored params, results,
  errors, or user context previews.
- `/logs` displays gateway audit metadata.
- `npm run smoke:audit` passes.
- `npm run build` passes.

## Risks

- Result previews can become large; cap serialized preview length.
- Audit logging must not make tool execution fail if the audit insert fails.
- Permission tool calls currently run inside Gateway preflight without recursive
  Gateway dispatch, so this issue audits target Gateway calls only.

## PR Workflow

- GitHub Issue: #21 https://github.com/wangmxian/RAGent-OS/issues/21
- Branch: `issue/010-tool-gateway-audit-redaction`
- PR: create after implementation and verification.
