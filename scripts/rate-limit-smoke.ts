import assert from "node:assert/strict";
import { getSystem, updateSystem } from "../lib/systems";
import { getMcpToolByName, updateMcpTool } from "../lib/mcp/tool-config";
import { callToolGateway } from "../lib/tool-gateway";
import { listGatewayAuditLogs } from "../lib/gateway-audit";
import { clearRateLimitCounters } from "../lib/rate-limit";

async function main() {
  clearRateLimitCounters();
  const suffix = Date.now();
  const system = getSystem("default");
  const tool = getMcpToolByName("ragSearch");
  assert(system, "default system should exist");
  assert(tool, "ragSearch tool should exist");

  try {
    updateSystem("default", { rateLimit: { enabled: true, perMinute: 1 } });
    updateMcpTool(tool.id, { rateLimit: { enabled: false } });

    const first = await callToolGateway({
      toolName: "ragSearch",
      params: { query: "rate limit smoke", topK: 1 },
      userContext: {
        source: "personal",
        trustLevel: "local",
        sessionUserId: "rate-limit-session",
      },
      executionContext: {
        mode: "mcp_call",
        requestId: `rate-limit-first-${suffix}`,
      },
    });
    assert.equal(first.ok, true, "first system-limited call should pass");

    const secondRequestId = `rate-limit-second-${suffix}`;
    const second = await callToolGateway({
      toolName: "ragSearch",
      params: { query: "rate limit smoke", topK: 1 },
      userContext: {
        source: "personal",
        trustLevel: "local",
        sessionUserId: "rate-limit-session",
      },
      executionContext: {
        mode: "mcp_call",
        requestId: secondRequestId,
      },
    });
    assert.equal(second.ok, false, "second system-limited call should fail");
    assert(
      !second.ok && second.error.type === "RateLimited",
      "second call should return RateLimited",
    );

    clearRateLimitCounters();
    updateSystem("default", { rateLimit: { enabled: false } });
    updateMcpTool(tool.id, { rateLimit: { enabled: true, perMinute: 1 } });

    const firstTool = await callToolGateway({
      toolName: "ragSearch",
      params: { query: "rate limit smoke", topK: 1 },
      userContext: {
        source: "personal",
        trustLevel: "local",
        sessionUserId: "rate-limit-tool-session",
      },
      executionContext: {
        mode: "mcp_call",
        requestId: `rate-limit-tool-first-${suffix}`,
      },
    });
    assert.equal(firstTool.ok, true, "first tool-limited call should pass");

    const secondTool = await callToolGateway({
      toolName: "ragSearch",
      params: { query: "rate limit smoke", topK: 1 },
      userContext: {
        source: "personal",
        trustLevel: "local",
        sessionUserId: "rate-limit-tool-session",
      },
      executionContext: {
        mode: "mcp_call",
        requestId: `rate-limit-tool-second-${suffix}`,
      },
    });
    assert.equal(secondTool.ok, false, "second tool-limited call should fail");
    assert(
      !secondTool.ok && secondTool.error.type === "RateLimited",
      "tool-limited call should return RateLimited",
    );

    const audit = listGatewayAuditLogs(50).find(
      (log) => log.requestId === secondRequestId,
    );
    assert(audit, "rate-limited call should be audited");
    assert.equal(audit.ok, false, "audit should record failed call");
    assert.equal(audit.errorType, "RateLimited", "audit should record RateLimited");

    console.log("Rate limit smoke OK");
  } finally {
    updateSystem("default", { rateLimit: system.rateLimit });
    updateMcpTool(tool.id, { rateLimit: tool.rateLimit });
    clearRateLimitCounters();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
