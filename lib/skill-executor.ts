import type { SkillRow } from "./skills";
import type { ToolRuntimeContext } from "./mcp/dispatcher";
import {
  callToolGateway,
  type ToolGatewayMetadata,
  type ToolGatewayResponse,
} from "./tool-gateway";

export interface SkillStepLog {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  ok: boolean;
  error: string | null;
  durationMs: number;
  gateway?: ToolGatewayMetadata;
}

export interface SkillExecutionResult {
  skill: string;
  args: Record<string, unknown>;
  result: unknown;
  steps: SkillStepLog[];
  ok: boolean;
  error: string | null;
  durationMs: number;
}

interface ResolveContext {
  input: Record<string, unknown>;
  steps: Record<string, unknown>;
}

export async function executeSkill(
  skill: SkillRow,
  input: Record<string, unknown>,
  runtime: ToolRuntimeContext = {},
): Promise<SkillExecutionResult> {
  if (!skill.steps.length) {
    throw new Error(`Skill ${skill.name} has no executable steps`);
  }

  const startedAt = Date.now();
  const context: ResolveContext = { input, steps: {} };
  const logs: SkillStepLog[] = [];

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i];
    const stepNo = i + 1;
    const stepStartedAt = Date.now();
    let resolved: Record<string, unknown>;
    try {
      resolved = resolveParams(step.params, context) as Record<string, unknown>;
      const response = await callToolGateway(
        {
          toolName: step.tool,
          params: resolved,
          userContext: runtime.userContext,
          policyContext: runtime.policyContext,
          executionContext: {
            mode: "skill_call",
            skillId: skill.id,
            stepIndex: stepNo,
            requestId: runtime.requestId ?? `${skill.id}-${startedAt}`,
          },
        },
        runtime,
      );
      if (!response.ok) throwGatewayFailure(response);
      const output = response.result;
      context.steps[`step${stepNo}`] = output;
      logs.push({
        step: stepNo,
        tool: step.tool,
        input: resolved,
        output,
        ok: true,
        error: null,
        durationMs: Date.now() - stepStartedAt,
        gateway: response.gateway,
      });
    } catch (e: any) {
      const error = e?.message || String(e);
      const gateway = e?.gateway as ToolGatewayMetadata | undefined;
      logs.push({
        step: stepNo,
        tool: step.tool,
        input: resolvedOrEmpty(step.params, context),
        output: null,
        ok: false,
        error,
        durationMs: Date.now() - stepStartedAt,
        gateway,
      });
      return {
        skill: skill.id,
        args: input,
        result: null,
        steps: logs,
        ok: false,
        error,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  return {
    skill: skill.id,
    args: input,
    result: context.steps[`step${skill.steps.length}`],
    steps: logs,
    ok: true,
    error: null,
    durationMs: Date.now() - startedAt,
  };
}

function throwGatewayFailure(response: ToolGatewayResponse & { ok: false }): never {
  const err = new Error(`${response.error.type}: ${response.error.message}`) as Error & {
    gateway?: ToolGatewayMetadata;
  };
  err.gateway = response.gateway;
  throw err;
}

export function resolveParams(value: unknown, context: ResolveContext): unknown {
  if (typeof value === "string") return resolveString(value, context);
  if (Array.isArray(value)) return value.map((item) => resolveParams(item, context));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = resolveParams(inner, context);
    }
    return out;
  }
  return value;
}

function resolveString(value: string, context: ResolveContext): unknown {
  if (!value.startsWith("$")) return value;
  if (value.startsWith("$input.")) {
    return getPath(context.input, value.slice("$input.".length), value);
  }
  const stepMatch = value.match(/^\$(step\d+)\.(.+)$/);
  if (stepMatch) {
    const [, stepKey, path] = stepMatch;
    if (!(stepKey in context.steps)) {
      throw new Error(`Missing step output: ${stepKey}`);
    }
    return getPath(context.steps[stepKey], path, value);
  }
  return value;
}

function getPath(root: unknown, path: string, expr: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur = root as any;
  for (const part of parts) {
    if (cur == null || !(part in Object(cur))) {
      throw new Error(`Cannot resolve ${expr}`);
    }
    cur = cur[part];
  }
  return cur;
}

function resolvedOrEmpty(
  params: Record<string, unknown>,
  context: ResolveContext,
): Record<string, unknown> {
  try {
    const resolved = resolveParams(params, context);
    return resolved && typeof resolved === "object" && !Array.isArray(resolved)
      ? (resolved as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
