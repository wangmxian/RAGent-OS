import "dotenv/config";
import http from "node:http";
import assert from "node:assert/strict";
import { createMcpServer, deleteMcpServer } from "../lib/mcp";
import { createMcpTool, deleteMcpTool } from "../lib/mcp/tool-config";
import { callToolGateway } from "../lib/tool-gateway";
import { listGatewayAuditLogs } from "../lib/gateway-audit";

async function main() {
  const server = await startFallbackServer();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ids: { tools: string[]; servers: string[] } = { tools: [], servers: [] };

  try {
    const mcpServer = createMcpServer({
      name: `fallback-smoke-server-${suffix}`,
      kind: "rag-http",
      transport: "http",
      baseUrl: server.baseUrl,
      enabled: true,
    });
    ids.servers.push(mcpServer.id);

    const backup = createMcpTool({
      name: `fallbackSmokeBackup_${suffix}`,
      pathSuffix: "backup",
      description: "Fallback smoke backup tool.",
      handlerType: "rag-http",
      systemId: "default",
      permissionMode: "inherit",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(backup.id);

    const failBackup = createMcpTool({
      name: `fallbackSmokeFailBackup_${suffix}`,
      pathSuffix: "fail-backup",
      description: "Fallback smoke failing backup tool.",
      handlerType: "rag-http",
      systemId: "default",
      permissionMode: "inherit",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(failBackup.id);

    const primary = createMcpTool({
      name: `fallbackSmokePrimary_${suffix}`,
      pathSuffix: "primary",
      description: "Fallback smoke primary tool.",
      handlerType: "rag-http",
      systemId: "default",
      permissionMode: "inherit",
      fallback: {
        enabled: true,
        fallbackToolId: backup.id,
        fallbackParams: { route: "fallback" },
      },
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(primary.id);

    const requestId = `fallback-smoke-ok-${suffix}`;
    const ok = await callToolGateway({
      toolName: primary.name,
      params: { route: "primary", value: 7 },
      executionContext: {
        mode: "mcp_call",
        requestId,
      },
    });

    assert.equal(ok.ok, true, "fallback success should return ok");
    assert.equal(ok.gateway.fallbackUsed, true, "fallbackUsed should be true");
    assert.equal(ok.gateway.toolId, primary.id, "gateway should keep primary tool id");
    assert.match(JSON.stringify(ok.result), /backup/, "result should come from backup");

    const audit = listGatewayAuditLogs(100).find(
      (log) => log.requestId === requestId && log.toolId === primary.id,
    );
    assert(audit, "fallback success should be audited");
    assert.equal(audit.fallbackUsed, true, "audit should mark fallbackUsed");
    assert.equal(audit.toolId, primary.id, "audit should keep primary tool id");

    const failingPrimary = createMcpTool({
      name: `fallbackSmokePrimaryFail_${suffix}`,
      pathSuffix: "primary",
      description: "Fallback smoke primary with failing backup.",
      handlerType: "rag-http",
      systemId: "default",
      permissionMode: "inherit",
      fallback: {
        enabled: true,
        fallbackToolId: failBackup.id,
      },
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(failingPrimary.id);

    const failed = await callToolGateway({
      toolName: failingPrimary.name,
      params: { route: "primary" },
      executionContext: {
        mode: "mcp_call",
        requestId: `fallback-smoke-failed-${suffix}`,
      },
    });

    assert.equal(failed.ok, false, "fallback failure should fail structurally");
    assert(
      !failed.ok && failed.error.type === "FallbackFailed",
      "fallback failure should return FallbackFailed",
    );
    assert.equal(failed.gateway.fallbackUsed, true, "failed fallback should mark fallbackUsed");

    console.log("Tool fallback smoke OK");
  } finally {
    for (const id of ids.tools.reverse()) {
      try {
        deleteMcpTool(id);
      } catch {}
    }
    for (const id of ids.servers.reverse()) {
      try {
        deleteMcpServer(id);
      } catch {}
    }
    await server.close();
  }
}

async function startFallbackServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(async (req, res) => {
    const path = req.url ?? "";
    const body = await readJson(req);
    res.setHeader("Content-Type", "application/json");

    if (path.endsWith("/primary")) {
      res.end(JSON.stringify({ code: 500, msg: "primary failed" }));
      return;
    }
    if (path.endsWith("/backup")) {
      res.end(JSON.stringify({ code: 200, data: { source: "backup", body } }));
      return;
    }
    if (path.endsWith("/fail-backup")) {
      res.end(JSON.stringify({ code: 500, msg: "backup failed" }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ code: 404, msg: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object", "fallback smoke server failed to bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
