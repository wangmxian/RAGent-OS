# Issue 014: RAG Scope By System/Skill/User

## Background

RAG retrieval currently works as the local `ragSearch` MCP tool, but indexed
documents do not carry enough scope metadata to isolate results by System,
Skill, user, tenant, or knowledge-base role. Enterprise mode must fail closed
for knowledge-base role visibility.

## Goals

- Persist RAG document scope metadata on uploaded files and indexed chunks.
- Filter local vector search by `systemId`, optional `skillId`, user/tenant
  context, and `kbRoleIds`.
- Keep RAG execution behind Tool Gateway.
- Default personal documents to `default` System scope.
- Make enterprise documents without `kbRoleIds` invisible.

## Scope

- Add file scope columns: `system_id`, `skill_id`, `visibility`, `user_id`,
  `tenant_id`, and `kb_role_ids`.
- Store normalized scope metadata into chunk `meta.scope` at indexing time.
- Add scope helpers for metadata normalization and read checks.
- Apply scope filtering in local `vectorSearch`/`retrieve`.
- Pass Gateway user/policy context into local `ragSearch`.
- Add file upload scope inputs and a scope update endpoint.
- Add smoke coverage for System isolation and enterprise `kbRoleIds` behavior.

## Non-goals

- No full document management UI for complex ACL workflows.
- No external ACL/permission tool integration for RAG.
- No skill toolId migration.
- No distributed vector store migration.

## Acceptance Criteria

- Personal mode filters RAG results by System scope.
- Enterprise mode hides documents without `kbRoleIds`.
- Enterprise mode returns role-bound documents only when user `kbRoleIds`
  overlap and tenant constraints match.
- `ragSearch` still runs through Tool Gateway.
- `npm run smoke:rag-scope` passes.
- `npm run build` passes.

## Verification

- `npm run smoke:rag-scope`
- `npm run smoke:rag-contract`
- `npm run smoke:gateway`
- `npm run smoke:fallback`
- `npx tsc --noEmit`
- `npm run build`
