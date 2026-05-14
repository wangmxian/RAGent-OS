# Issue 003: Independent Skill Orchestration Page

## Background

Skills must come from visual orchestration. The existing UI exposes Skill editing
inside a chat drawer and primarily edits raw Steps JSON. That is not sufficient
for composing multi-step MCP workflows from configured tools.

## Goals

- Add an independent `/skills` orchestration page.
- Let users create and edit Skill metadata.
- Let users add, remove, and reorder ordered steps.
- Let every step select a configured MCP tool and edit params JSON.
- Preserve `$input.xxx` and `$stepN.xxx` parameter reference semantics.
- Make the Chat page Skill button navigate to `/skills`.

## Scope

- Add `app/skills/page.tsx`.
- Reuse existing `/api/skills` and `/api/tools`.
- Keep the existing Skill executor and persistence format.
- Keep the drawer component in the codebase for now, but remove the Chat entry
  point that opens it.

## Non-goals

- No new Skill execution semantics.
- No canvas library dependency.
- No changes to `resolveParams`.

## Implementation Plan

1. Build the `/skills` page with Skill metadata editing.
2. Add visible ordered step rows with tool selection and params JSON.
3. Add step add/remove/reorder controls.
4. Save to the existing Skill API using the existing `steps` shape.
5. Update Chat Skill button to navigate to `/skills`.
6. Verify with `npm run build` and `npm run smoke:skill`.

## Acceptance Criteria

- `/skills` renders as an independent page.
- Users can create/edit Skills without editing a single raw steps array.
- Each step can select a configured MCP tool.
- Step params support JSON with `$input.xxx` and `$stepN.xxx`.
- Chat Skill configuration navigates to `/skills`.
- `npm run build` passes.
- `npm run smoke:skill` passes.

## PR Workflow

- GitHub Issue: #5
- Branch: `issue/003-skill-orchestration-page`
- PR: created after implementation and verification.
