# Issue 008A: Identity And Policy Context

## Background

The platform will usually receive enterprise identity from an upstream SSO, API
Gateway, or reverse proxy instead of owning a login system. The scheduler needs a
standard identity and policy context before permission preflight, audit, and RAG
scope can be implemented.

This issue adds context normalization only. It does not decide business
permissions.

## Goals

- Add a pluggable `IdentityContextResolver`.
- Support current personal/local mode without requiring login.
- Support trusted upstream headers behind an explicit environment flag.
- Support forwarded token context without parsing the token.
- Pass resolved `userContext` and `policyContext` into Tool Gateway calls.
- Expose a safe identity summary in gateway metadata and execution outputs.

## Scope

- Add `lib/identity-context.ts`.
- Parse recommended `x-rag-*` headers when trusted header mode is enabled.
- Use comma-separated parsing for `x-rag-role-ids` and `x-rag-kb-role-ids`.
- Treat client body identity fields as untrusted and ignore them.
- Add identity context to chat and public MCP route Gateway requests.
- Preserve personal mode default context for current local usage.
- Add smoke coverage for personal context, trusted headers, and forwarded token.

## Non-goals

- No permission preflight.
- No ACL decision.
- No platform login/session implementation.
- No audit log table changes.
- No RAG scope filtering.
- No prompt layering.

## Implementation Plan

1. Define identity source/trust/user/policy context types.
2. Implement resolver helpers for personal, trusted headers, and forwarded token.
3. Wire resolved context into chat `mcp_call`, Skill execution runtime, and public
   MCP route calls.
4. Include identity summary in Tool Gateway metadata.
5. Add `scripts/identity-context-smoke.ts` and `npm run smoke:identity`.
6. Verify gateway, skill, RAG contract, and build.

## Acceptance Criteria

- Personal mode returns local identity context without login.
- Trusted headers are ignored unless explicitly enabled.
- Enabled trusted headers parse `x-rag-user-id`, `x-rag-tenant-id`,
  `x-rag-session-user-id`, `x-rag-user-name`, `x-rag-role-ids`, and
  `x-rag-kb-role-ids`.
- `authorization` can be forwarded as credential context without exposing it to
  Planner or gateway metadata.
- Gateway metadata includes a non-sensitive identity summary.
- `npm run smoke:identity` passes.
- `npm run smoke:gateway` passes.
- `npm run build` passes.

## Risks

- Trusted header mode is only safe behind a trusted upstream that strips spoofed
  client headers first. It must remain disabled by default.
- Forwarded token alone does not prove user or tenant identity; permission and
  RAG ACL issues must fail closed unless an external tool validates scope.

## PR Workflow

- GitHub Issue: #17
- Branch: `issue/008a-identity-policy-context`
- PR: #18
