import { callUnifiedMcpTool, type ToolRuntimeContext } from "./mcp/dispatcher";
import { getMcpTool, getMcpToolByName, type McpToolRow } from "./mcp/tool-config";
import { getSystem, type SystemPermissionMode, type SystemRow } from "./systems";
import { createGatewayAuditLog } from "./gateway-audit";
import { checkRateLimit } from "./rate-limit";
import {
  summarizeIdentity,
  type PlannerIdentitySummary,
  type PolicyContext,
  type UserContext,
} from "./identity-context";

export type ToolGatewayErrorType =
  | "PermissionDenied"
  | "RateLimited"
  | "ToolNotFound"
  | "SystemDisabled"
  | "ToolFailed"
  | "FallbackFailed"
  | "RagScopeDenied";

export interface ToolGatewayRequest {
  toolName: string;
  params: Record<string, unknown>;
  userContext?: UserContext;
  policyContext?: PolicyContext;
  executionContext: {
    mode: "mcp_call" | "skill_call";
    skillId?: string;
    stepIndex?: number;
    conversationId?: string | null;
    requestId: string;
  };
}

export interface ToolGatewayMetadata {
  systemId: string;
  toolId: string;
  permissionChecked: boolean;
  permissionAllowed?: boolean;
  fallbackUsed: boolean;
  durationMs: number;
  identity?: PlannerIdentitySummary;
}

export type ToolGatewayResponse =
  | {
      ok: true;
      result: unknown;
      gateway: ToolGatewayMetadata;
    }
  | {
      ok: false;
      error: {
        type: ToolGatewayErrorType;
        message: string;
      };
      gateway: ToolGatewayMetadata;
    };

export class ToolGatewayError extends Error {
  constructor(public response: ToolGatewayResponse & { ok: false }) {
    super(response.error.message);
    this.name = "ToolGatewayError";
  }
}

interface GatewayInternalOptions {
  fallbackDepth?: number;
  fallbackChain?: string[];
}

export async function callToolGateway(
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext = {},
): Promise<ToolGatewayResponse> {
  return callToolGatewayInternal(request, runtime, {});
}

async function callToolGatewayInternal(
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext,
  options: GatewayInternalOptions,
): Promise<ToolGatewayResponse> {
  const startedAt = Date.now();
  const tool = getMcpToolByName(request.toolName);
  if (!tool) {
    const response = failure("ToolNotFound", `MCP tool not found: ${request.toolName}`, {
      startedAt,
      systemId: "unknown",
      toolId: request.toolName,
    }, request);
    auditGatewayCall(request, response, request.toolName, true);
    return response;
  }

  const baseMeta = {
    startedAt,
    systemId: tool.systemId,
    toolId: tool.id,
  };

  const system = getSystem(tool.systemId);
  if (!system || !system.enabled) {
    const response = failure("SystemDisabled", `System disabled: ${tool.systemId}`, baseMeta, request);
    auditGatewayCall(request, response, tool.name, true);
    return response;
  }
  if (!tool.enabled) {
    const response = failure("ToolNotFound", `MCP tool disabled: ${tool.name}`, baseMeta, request);
    auditGatewayCall(request, response, tool.name, system.auditEnabled);
    return response;
  }

  const rateLimit = checkGatewayRateLimit(system, tool, request);
  if (!rateLimit.allowed) {
    const response = failure(
      "RateLimited",
      rateLimit.message,
      baseMeta,
      request,
    );
    auditGatewayCall(request, response, tool.name, system.auditEnabled);
    return response;
  }

  const permission = await checkPermission(system, tool, request, runtime, baseMeta);
  if (!permission.allowed) {
    const response = failure(
      "PermissionDenied",
      permission.message,
      baseMeta,
      request,
      permission.checked,
      false,
    );
    auditGatewayCall(request, response, tool.name, system.auditEnabled);
    return response;
  }

  try {
    const result = await callUnifiedMcpTool(tool.name, request.params, runtime);
    const response: ToolGatewayResponse = {
      ok: true,
      result,
      gateway: metadata(baseMeta, request, permission.checked, permission.allowed),
    };
    auditGatewayCall(request, response, tool.name, system.auditEnabled);
    return response;
  } catch (e: any) {
    const fallback = await callConfiguredFallback(
      tool,
      request,
      runtime,
      {
        ...baseMeta,
        permissionChecked: permission.checked,
        permissionAllowed: permission.allowed,
        primaryErrorMessage: e?.message || String(e),
      },
      options,
    );
    if (fallback) {
      auditGatewayCall(request, fallback, tool.name, system.auditEnabled);
      return fallback;
    }

    const response = failure(
      "ToolFailed",
      e?.message || String(e),
      baseMeta,
      request,
      permission.checked,
      permission.allowed,
    );
    auditGatewayCall(request, response, tool.name, system.auditEnabled);
    return response;
  }
}

export async function callToolGatewayOrThrow(
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext = {},
): Promise<unknown> {
  const response = await callToolGateway(request, runtime);
  if (!response.ok) throw new ToolGatewayError(response);
  return response.result;
}

function failure(
  type: ToolGatewayErrorType,
  message: string,
  base: { startedAt: number; systemId: string; toolId: string },
  request?: ToolGatewayRequest,
  permissionChecked = false,
  permissionAllowed?: boolean,
  fallbackUsed = false,
): ToolGatewayResponse & { ok: false } {
  return {
    ok: false,
    error: { type, message },
    gateway: metadata(
      base,
      request,
      permissionChecked,
      permissionAllowed,
      fallbackUsed,
    ),
  };
}

function metadata(base: {
  startedAt: number;
  systemId: string;
  toolId: string;
}, request?: ToolGatewayRequest, permissionChecked = false, permissionAllowed?: boolean, fallbackUsed = false): ToolGatewayMetadata {
  const mode = request?.userContext?.source === "personal" ? "personal" : "enterprise";
  return {
    systemId: base.systemId,
    toolId: base.toolId,
    permissionChecked,
    permissionAllowed,
    fallbackUsed,
    durationMs: Date.now() - base.startedAt,
    identity: request ? summarizeIdentity(request.userContext, mode) : undefined,
  };
}

async function callConfiguredFallback(
  tool: McpToolRow,
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext,
  base: {
    startedAt: number;
    systemId: string;
    toolId: string;
    permissionChecked: boolean;
    permissionAllowed?: boolean;
    primaryErrorMessage: string;
  },
  options: GatewayInternalOptions,
): Promise<ToolGatewayResponse | null> {
  if (!tool.fallback.enabled || !tool.fallback.fallbackToolId) return null;

  const depth = options.fallbackDepth ?? 0;
  const chain = options.fallbackChain ?? [tool.id];
  if (depth >= 1 || chain.includes(tool.fallback.fallbackToolId)) {
    return failure(
      "FallbackFailed",
      "Fallback chain is invalid or recursive",
      base,
      request,
      base.permissionChecked,
      base.permissionAllowed,
      true,
    );
  }

  const fallbackTool = getMcpTool(tool.fallback.fallbackToolId);
  if (!fallbackTool) {
    return failure(
      "FallbackFailed",
      `Fallback tool not found: ${tool.fallback.fallbackToolId}`,
      base,
      request,
      base.permissionChecked,
      base.permissionAllowed,
      true,
    );
  }

  const fallbackResponse = await callToolGatewayInternal(
    {
      ...request,
      toolName: fallbackTool.name,
      params: {
        ...request.params,
        ...(tool.fallback.fallbackParams ?? {}),
      },
    },
    runtime,
    {
      fallbackDepth: depth + 1,
      fallbackChain: [...chain, fallbackTool.id],
    },
  );

  if (fallbackResponse.ok) {
    return {
      ok: true,
      result: fallbackResponse.result,
      gateway: metadata(
        base,
        request,
        base.permissionChecked || fallbackResponse.gateway.permissionChecked,
        fallbackResponse.gateway.permissionAllowed ?? base.permissionAllowed,
        true,
      ),
    };
  }

  return failure(
    "FallbackFailed",
    `Primary tool failed: ${base.primaryErrorMessage}; fallback failed: ${fallbackResponse.error.message}`,
    base,
    request,
    base.permissionChecked || fallbackResponse.gateway.permissionChecked,
    fallbackResponse.gateway.permissionAllowed ?? base.permissionAllowed,
    true,
  );
}

function auditGatewayCall(
  request: ToolGatewayRequest,
  response: ToolGatewayResponse,
  toolName: string,
  auditEnabled: boolean,
) {
  if (!auditEnabled) return;
  try {
    createGatewayAuditLog({
      requestId:
        request.policyContext?.requestId || request.executionContext.requestId,
      conversationId:
        request.policyContext?.conversationId ??
        request.executionContext.conversationId ??
        null,
      systemId: response.gateway.systemId,
      toolId: response.gateway.toolId,
      toolName,
      userContext: request.userContext,
      identity: response.gateway.identity,
      params: request.params,
      result: response.ok ? response.result : null,
      permissionChecked: response.gateway.permissionChecked,
      permissionAllowed: response.gateway.permissionAllowed,
      fallbackUsed: response.gateway.fallbackUsed,
      ok: response.ok,
      errorType: response.ok ? null : response.error.type,
      errorMessage: response.ok ? null : response.error.message,
      durationMs: response.gateway.durationMs,
    });
  } catch (e) {
    console.error("[tool-gateway] audit log failed", e);
  }
}

function checkGatewayRateLimit(
  system: SystemRow,
  tool: McpToolRow,
  request: ToolGatewayRequest,
): { allowed: boolean; message: string } {
  const subject = rateLimitSubject(request);
  const baseKey = `${system.id}:${tool.id}:${subject}`;

  const toolDecision = checkRateLimit(`tool:${baseKey}`, tool.rateLimit);
  if (!toolDecision.allowed) {
    return {
      allowed: false,
      message: rateLimitMessage("Tool", toolDecision.unit, toolDecision.resetAt),
    };
  }

  const systemDecision = checkRateLimit(`system:${baseKey}`, system.rateLimit);
  if (!systemDecision.allowed) {
    return {
      allowed: false,
      message: rateLimitMessage("System", systemDecision.unit, systemDecision.resetAt),
    };
  }

  return { allowed: true, message: "Rate limit allowed" };
}

function rateLimitSubject(request: ToolGatewayRequest): string {
  const user = request.userContext;
  return (
    user?.userId ||
    user?.sessionUserId ||
    request.executionContext.conversationId ||
    request.executionContext.requestId ||
    "anonymous"
  );
}

function rateLimitMessage(scope: string, unit?: string, resetAt?: number): string {
  const reset = resetAt ? ` Reset at ${new Date(resetAt).toISOString()}.` : "";
  return `${scope} rate limit exceeded${unit ? ` for this ${unit}` : ""}.${reset}`;
}

async function checkPermission(
  system: SystemRow,
  tool: McpToolRow,
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext,
  baseMeta: { startedAt: number; systemId: string; toolId: string },
): Promise<{ checked: boolean; allowed: boolean; message: string }> {
  const mode = effectivePermissionMode(system.permissionMode, tool.permissionMode);
  if (mode === "none") {
    return { checked: false, allowed: true, message: "Permission not required" };
  }

  if (system.mode === "enterprise" && !hasEnterpriseIdentity(request.userContext)) {
    return {
      checked: false,
      allowed: false,
      message: "Enterprise identity is required",
    };
  }

  if (mode === "inline") {
    return {
      checked: true,
      allowed: false,
      message: "Inline permission mode is not supported yet",
    };
  }

  if (mode !== "preflight") {
    return { checked: false, allowed: true, message: "Permission not required" };
  }

  if (!system.permissionToolId) {
    return {
      checked: true,
      allowed: false,
      message: "Permission tool is not configured",
    };
  }

  if (system.permissionToolId === tool.id) {
    return { checked: false, allowed: true, message: "Permission tool self-call" };
  }

  const permissionTool = getMcpToolById(system.permissionToolId);
  if (!permissionTool || !permissionTool.enabled) {
    return {
      checked: true,
      allowed: false,
      message: "Permission tool is not available",
    };
  }

  try {
    const result = await callUnifiedMcpTool(
      permissionTool.name,
      {
        action: "call_tool",
        userContext: safeUserContext(request.userContext),
        systemId: system.id,
        toolId: tool.id,
        toolName: tool.name,
        params: request.params,
      },
      runtime,
    );
    const parsed = parsePermissionResult(result);
    return {
      checked: true,
      allowed: parsed.allowed,
      message: parsed.allowed ? "Permission allowed" : parsed.reason || "Permission denied",
    };
  } catch (e: any) {
    return {
      checked: true,
      allowed: false,
      message: e?.message || String(e),
    };
  }
}

function effectivePermissionMode(
  systemMode: SystemPermissionMode,
  toolMode: string,
): SystemPermissionMode {
  if (toolMode === "none" || toolMode === "preflight" || toolMode === "inline") {
    return toolMode;
  }
  return systemMode;
}

function hasEnterpriseIdentity(userContext: UserContext | undefined): boolean {
  if (!userContext) return false;
  if (userContext.trustLevel === "trusted") {
    return !!userContext.userId && !!userContext.tenantId;
  }
  return userContext.trustLevel === "forwarded" && !!userContext.accessToken;
}

function safeUserContext(userContext: UserContext | undefined) {
  return {
    userId: userContext?.userId,
    tenantId: userContext?.tenantId,
    sessionUserId: userContext?.sessionUserId,
    roleIds: userContext?.roleIds,
    kbRoleIds: userContext?.kbRoleIds,
  };
}

function parsePermissionResult(result: unknown): { allowed: boolean; reason?: string } {
  const value = unwrapResult(result);
  if (typeof value === "string") {
    try {
      return parsePermissionResult(JSON.parse(value));
    } catch {
      return { allowed: false, reason: "Invalid permission response" };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { allowed: false, reason: "Invalid permission response" };
  }
  const row = value as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    reason: typeof row.reason === "string" ? row.reason : undefined,
  };
}

function unwrapResult(result: unknown): unknown {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const row = result as Record<string, unknown>;
    if ("result" in row) return row.result;
  }
  return result;
}

function getMcpToolById(id: string): McpToolRow | null {
  return getMcpTool(id);
}
