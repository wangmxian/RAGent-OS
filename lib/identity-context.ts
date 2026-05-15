export type IdentitySource =
  | "personal"
  | "trusted_headers"
  | "session"
  | "forwarded_token";

export type IdentityTrustLevel = "none" | "local" | "trusted" | "forwarded";

export interface IdentityContext {
  source: IdentitySource;
  trustLevel: IdentityTrustLevel;
  userId?: string;
  tenantId?: string;
  sessionUserId?: string;
  roleIds?: string[];
  kbRoleIds?: string[];
  displayName?: string;
}

export interface ForwardedCredentialContext {
  accessToken?: string;
  headers?: Record<string, string>;
}

export type UserContext = IdentityContext & ForwardedCredentialContext;

export interface PolicyContext {
  systemId?: string;
  skillId?: string;
  conversationId?: string | null;
  requestId: string;
  source: "chat" | "api" | "skill" | "system";
}

export interface ResolvedIdentityContext {
  userContext: UserContext;
  policyContext: PolicyContext;
  missingFields: string[];
  summary: PlannerIdentitySummary;
}

export interface PlannerIdentitySummary {
  userKnown: boolean;
  tenantKnown: boolean;
  trustLevel: IdentityTrustLevel;
  source: IdentitySource;
  mode: "personal" | "enterprise";
  roleCount: number;
  kbRoleCount: number;
}

export interface ResolveIdentityOptions {
  headers?: Headers | Record<string, string | string[] | undefined>;
  requestId: string;
  conversationId?: string | null;
  source: PolicyContext["source"];
  mode?: "personal" | "enterprise";
  skillId?: string;
  systemId?: string;
}

const TRUSTED_HEADERS_ENABLED = "TRUSTED_IDENTITY_HEADERS_ENABLED";

export function resolveIdentityContext(
  options: ResolveIdentityOptions,
): ResolvedIdentityContext {
  const mode = options.mode ?? "personal";
  const policyContext: PolicyContext = {
    requestId: options.requestId,
    conversationId: options.conversationId,
    source: options.source,
    skillId: options.skillId,
    systemId: options.systemId,
  };

  const authHeader = headerValue(options.headers, "authorization");
  const trusted = trustedHeadersEnabled()
    ? identityFromTrustedHeaders(options.headers)
    : null;
  const credentials = authHeader
    ? {
        accessToken: stripBearer(authHeader),
        headers: { authorization: authHeader },
      }
    : {};

  const userContext: UserContext = trusted
    ? { ...trusted, ...credentials }
    : authHeader && mode === "enterprise"
      ? {
          source: "forwarded_token",
          trustLevel: "forwarded",
          ...credentials,
        }
      : {
          source: "personal",
          trustLevel: "local",
          sessionUserId: options.conversationId ?? "local-session",
          ...credentials,
        };

  const missingFields = missingIdentityFields(userContext, mode);
  return {
    userContext,
    policyContext,
    missingFields,
    summary: summarizeIdentity(userContext, mode),
  };
}

export function summarizeIdentity(
  userContext: UserContext | undefined,
  mode: "personal" | "enterprise" = "personal",
): PlannerIdentitySummary {
  return {
    userKnown: !!userContext?.userId,
    tenantKnown: !!userContext?.tenantId,
    trustLevel: userContext?.trustLevel ?? "none",
    source: userContext?.source ?? "personal",
    mode,
    roleCount: userContext?.roleIds?.length ?? 0,
    kbRoleCount: userContext?.kbRoleIds?.length ?? 0,
  };
}

function identityFromTrustedHeaders(
  headers: ResolveIdentityOptions["headers"],
): IdentityContext | null {
  const userId = headerValue(headers, envName("USER_ID", "x-rag-user-id"));
  const tenantId = headerValue(headers, envName("TENANT_ID", "x-rag-tenant-id"));
  const sessionUserId = headerValue(
    headers,
    envName("SESSION_USER_ID", "x-rag-session-user-id"),
  );
  const displayName = headerValue(headers, envName("USER_NAME", "x-rag-user-name"));
  const roleIds = csvHeader(headers, envName("ROLE_IDS", "x-rag-role-ids"));
  const kbRoleIds = csvHeader(headers, envName("KB_ROLE_IDS", "x-rag-kb-role-ids"));

  if (!userId && !tenantId && !sessionUserId && !roleIds.length && !kbRoleIds.length) {
    return null;
  }

  return {
    source: "trusted_headers",
    trustLevel: "trusted",
    userId,
    tenantId,
    sessionUserId,
    displayName,
    roleIds,
    kbRoleIds,
  };
}

function missingIdentityFields(
  userContext: UserContext,
  mode: "personal" | "enterprise",
): string[] {
  if (mode === "personal") return [];
  const missing: string[] = [];
  if (!userContext.userId && userContext.trustLevel !== "forwarded") {
    missing.push("userId");
  }
  if (!userContext.tenantId && userContext.trustLevel !== "forwarded") {
    missing.push("tenantId");
  }
  return missing;
}

function trustedHeadersEnabled(): boolean {
  return process.env[TRUSTED_HEADERS_ENABLED] === "true";
}

function envName(key: string, fallback: string): string {
  return process.env[`TRUSTED_IDENTITY_HEADER_${key}`] || fallback;
}

function csvHeader(
  headers: ResolveIdentityOptions["headers"],
  name: string,
): string[] {
  const value = headerValue(headers, name);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function headerValue(
  headers: ResolveIdentityOptions["headers"],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (Array.isArray(value)) return value[0];
    return value;
  }
  return undefined;
}

function stripBearer(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}
