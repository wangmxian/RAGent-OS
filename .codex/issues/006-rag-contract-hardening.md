# Issue 006: RAG Contract Hardening

## Background

The target architecture fixes RAG as a local vector store exposed through MCP.
Knowledge retrieval in the scheduler path must use the `ragSearch` MCP tool with
default `topK = 5`.

## Goals

- Ensure `ragSearch` is the configured MCP tool for knowledge retrieval.
- Ensure default Skill templates use `ragSearch` with `topK: 5`.
- Remove the legacy direct `knowledge_search` tool from the tool registry.
- Add a smoke check for the RAG contract.

## Scope

- Update `lib/tools/registry.ts` to stop exposing direct RAG retrieval.
- Add `scripts/rag-contract-smoke.ts`.
- Add `npm run smoke:rag-contract`.

## Non-goals

- No embedding or vector-store rewrite.
- No ingestion changes.
- No UI changes.

## Acceptance Criteria

- `ragSearch` is present in configured MCP tools.
- Legacy direct `knowledge_search` is not exposed through `/api/tools`.
- `kb_qa` starts with `ragSearch` and uses `topK: 5`.
- `npm run build` passes.
- `npm run smoke:rag-contract` passes.

## PR Workflow

- GitHub Issue: #11
- Branch: `issue/006-rag-contract-hardening`
- PR: created after implementation and verification.
