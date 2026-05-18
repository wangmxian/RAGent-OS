import { callUnifiedMcpTool, type ToolRuntimeContext } from "./mcp/dispatcher";
import { getMcpTool, getMcpToolByName, type McpToolRow } from "./mcp/tool-config";
import { getSystem, type SystemPermissionMode, type SystemRow } from "./systems";
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

export async function callToolGateway(
  request: ToolGatewayRequest,
  runtime: ToolRuntimeContext = {},
): Promise<ToolGatewayResponse> {
  const startedAt = Date.now();
  const tool = getMcpToolByName(request.toolName);
  if (!tool) {
    return failure("ToolNotFound", `MCP tool not found: ${request.toolName}`, {
      startedAt,
      systemId: "unknown",
      toolId: request.toolName,
    }, request);
  }

  const baseMeta = {
    startedAt,
    systemId: tool.systemId,
    toolId: tool.id,
  };

  const system = getSystem(tool.systemId);
  if (!system || !system.enabled) {
    return failure("SystemDisabled", `System disabled: ${tool.systemId}`, baseMeta, request);
  }
  if (!tool.enabled) {
    return failure("ToolNotFound", `MCP tool disabled: ${tool.name}`, baseMeta, request);
  }

  const permission = await checkPermission(system, tool, request, runtime, baseMeta);
  if (!permission.allowed) {
    return failure(
      "PermissionDenied",
      permission.message,
      baseMeta,
      request,
      permission.checked,
      false,
    );
  }

  try {
    const result = await callUnifiedMcpTool(tool.name, request.params, runtime);
    return {
      ok: true,
      result,
      gateway: metadata(baseMeta, request, permission.checked, permission.allowed),
    };
  } catch (e: any) {
    return failure(
      "ToolFailed",
      e?.message || String(e),
      baseMeta,
      request,
      permission.checked,
      permission.allowed,
    );
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
): ToolGatewayResponse & { ok: false } {
  return {
    ok: false,
    error: { type, message },
    gateway: metadata(base, request, permissionChecked, permissionAllowed),
  };
}

function metadata(base: {
  startedAt: number;
  systemId: string;
  toolId: string;
}, request?: ToolGatewayRequest, permissionChecked = false, permissionAllowed?: boolean): ToolGatewayMetadata {
  const mode = request?.userContext?.source === "personal" ? "personal" : "enterprise";
  return {
    systemId: base.systemId,
    toolId: base.toolId,
    permissionChecked,
    permissionAllowed,
    fallbackUsed: false,
    durationMs: Date.now() - base.startedAt,
    identity: request ? summarizeIdentity(request.userContext, mode) : undefined,
  };
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
