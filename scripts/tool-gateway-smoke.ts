import "dotenv/config";
import { callToolGateway } from "../lib/tool-gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const ok = await callToolGateway({
    toolName: "ragSearch",
    params: { query: "tool gateway smoke", topK: 1 },
    executionContext: {
      mode: "mcp_call",
      requestId: "gateway-smoke-ok",
    },
  });

  assert(ok.ok, "ragSearch should execute through Tool Gateway");
  assert(ok.gateway.systemId === "default", "ragSearch should resolve default system");
  assert(ok.gateway.toolId === "tool-rag-search", "ragSearch should resolve tool id");
  assert(ok.gateway.permissionChecked === false, "permission is not part of issue 008");
  assert(ok.gateway.fallbackUsed === false, "fallback is not part of issue 008");

  const missing = await callToolGateway({
    toolName: "missingToolForGatewaySmoke",
    params: {},
    executionContext: {
      mode: "mcp_call",
      requestId: "gateway-smoke-missing",
    },
  });

  assert(!missing.ok, "missing tool should fail structurally");
  assert(
    !missing.ok && missing.error.type === "ToolNotFound",
    "missing tool should return ToolNotFound",
  );
  assert(
    !missing.ok && missing.gateway.permissionChecked === false,
    "missing tool failure should include gateway metadata",
  );

  console.log("Tool Gateway smoke OK");
}

main();
