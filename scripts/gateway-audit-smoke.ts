import assert from "node:assert/strict";
import { callToolGateway } from "../lib/tool-gateway";
import { listGatewayAuditLogs } from "../lib/gateway-audit";

async function main() {
  const requestId = `audit-smoke-${Date.now()}`;
  const response = await callToolGateway({
    toolName: "ragSearch",
    params: {
      query: "gateway audit smoke",
      topK: 1,
      accessToken: "plain-param-token",
      nested: {
        authorization: "Bearer nested-secret",
        apiKey: "nested-api-key",
      },
    },
    userContext: {
      source: "personal",
      trustLevel: "local",
      sessionUserId: "audit-smoke-session",
      accessToken: "plain-user-token",
      headers: {
        authorization: "Bearer user-secret",
        cookie: "sid=user-cookie",
      },
    },
    policyContext: {
      requestId,
      conversationId: "audit-smoke-conversation",
      source: "chat",
    },
    executionContext: {
      mode: "mcp_call",
      requestId,
      conversationId: "audit-smoke-conversation",
    },
  });

  assert.equal(response.ok, true, "gateway call should succeed");

  const audit = listGatewayAuditLogs(20).find((log) => log.requestId === requestId);
  assert(audit, "gateway audit log should be persisted");
  assert.equal(audit.systemId, "default", "audit should include system id");
  assert.equal(audit.toolId, "tool-rag-search", "audit should include tool id");
  assert.equal(audit.toolName, "ragSearch", "audit should include tool name");
  assert.equal(audit.permissionChecked, false, "personal mode should skip permission");
  assert.equal(audit.fallbackUsed, false, "fallback is not part of issue 010");

  const serialized = JSON.stringify(audit);
  for (const secret of [
    "plain-param-token",
    "nested-secret",
    "nested-api-key",
    "plain-user-token",
    "user-secret",
    "user-cookie",
  ]) {
    assert(!serialized.includes(secret), `audit log should redact ${secret}`);
  }
  assert(serialized.includes("[REDACTED]"), "audit log should include redaction marker");

  console.log("Gateway audit smoke OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
