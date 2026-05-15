import { callUnifiedMcpTool, type ToolRuntimeContext } from "./mcp/dispatcher";
import { getMcpToolByName } from "./mcp/tool-config";
import { getSystem } from "./systems";

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
  userContext?: {
    userId?: string;
    tenantId?: string;
    sessionUserId?: string;
    accessToken?: string;
    headers?: Record<string, string>;
  };
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
    });
  }

  const baseMeta = {
    startedAt,
    systemId: tool.systemId,
    toolId: tool.id,
  };

  const system = getSystem(tool.systemId);
  if (!system || !system.enabled) {
    return failure("SystemDisabled", `System disabled: ${tool.systemId}`, baseMeta);
  }
  if (!tool.enabled) {
    return failure("ToolNotFound", `MCP tool disabled: ${tool.name}`, baseMeta);
  }

  try {
    const result = await callUnifiedMcpTool(tool.name, request.params, runtime);
    return {
      ok: true,
      result,
      gateway: metadata(baseMeta),
    };
  } catch (e: any) {
    return failure(
      "ToolFailed",
      e?.message || String(e),
      baseMeta,
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
): ToolGatewayResponse & { ok: false } {
  return {
    ok: false,
    error: { type, message },
    gateway: metadata(base),
  };
}

function metadata(base: {
  startedAt: number;
  systemId: string;
  toolId: string;
}): ToolGatewayMetadata {
  return {
    systemId: base.systemId,
    toolId: base.toolId,
    permissionChecked: false,
    fallbackUsed: false,
    durationMs: Date.now() - base.startedAt,
  };
}
