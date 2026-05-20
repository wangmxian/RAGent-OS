import type { UserContext } from "./identity-context";
import type { SystemMode } from "./systems";

export type RagVisibility = "system" | "skill" | "user";

export interface RagScopeMetadata {
  systemId: string;
  skillId?: string | null;
  visibility: RagVisibility;
  userId?: string | null;
  tenantId?: string | null;
  kbRoleIds: string[];
}

export interface RagScopeFilter {
  systemId: string;
  skillId?: string;
  userContext?: Pick<
    UserContext,
    "userId" | "tenantId" | "roleIds" | "kbRoleIds" | "trustLevel"
  >;
  mode?: SystemMode;
}

export function normalizeVisibility(value: unknown): RagVisibility {
  return value === "skill" || value === "user" || value === "system"
    ? value
    : "system";
}

export function normalizeScopeMetadata(input: {
  systemId?: unknown;
  skillId?: unknown;
  visibility?: unknown;
  userId?: unknown;
  tenantId?: unknown;
  kbRoleIds?: unknown;
}): RagScopeMetadata {
  const systemId =
    typeof input.systemId === "string" && input.systemId.trim()
      ? input.systemId.trim()
      : "default";
  return {
    systemId,
    skillId: stringOrNull(input.skillId),
    visibility: normalizeVisibility(input.visibility),
    userId: stringOrNull(input.userId),
    tenantId: stringOrNull(input.tenantId),
    kbRoleIds: stringArray(input.kbRoleIds),
  };
}

export function parseScopeMetadata(value: string | null): RagScopeMetadata {
  if (!value) {
    return normalizeScopeMetadata({});
  }
  try {
    const parsed = JSON.parse(value);
    return normalizeScopeMetadata(
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {},
    );
  } catch {
    return normalizeScopeMetadata({});
  }
}

export function stringifyScopeMetadata(scope: RagScopeMetadata): string {
  return JSON.stringify(normalizeScopeMetadata(scope));
}

export function canReadRagScope(
  scope: RagScopeMetadata,
  filter: RagScopeFilter,
): boolean {
  if (!filter.systemId || scope.systemId !== filter.systemId) return false;

  if (scope.visibility === "skill") {
    if (!filter.skillId || scope.skillId !== filter.skillId) return false;
  } else if (filter.skillId && scope.skillId && scope.skillId !== filter.skillId) {
    return false;
  }

  if (scope.tenantId && scope.tenantId !== filter.userContext?.tenantId) {
    return false;
  }

  if (scope.visibility === "user") {
    if (!scope.userId || scope.userId !== filter.userContext?.userId) {
      return false;
    }
  }

  if (scope.kbRoleIds.length > 0) {
    const userKbRoles = new Set(filter.userContext?.kbRoleIds ?? []);
    if (!scope.kbRoleIds.some((role) => userKbRoles.has(role))) {
      return false;
    }
  } else if (filter.mode === "enterprise") {
    return false;
  }

  return true;
}

export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
