import "dotenv/config";
import http from "node:http";
import { createMcpServer, deleteMcpServer } from "../lib/mcp";
import { createMcpTool, deleteMcpTool } from "../lib/mcp/tool-config";
import { getDb } from "../lib/db";
import { createSystem, updateSystem } from "../lib/systems";
import { callToolGateway } from "../lib/tool-gateway";
import type { UserContext } from "../lib/identity-context";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const server = await startPermissionServer();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ids: { systems: string[]; tools: string[]; servers: string[] } = {
    systems: [],
    tools: [],
    servers: [],
  };

  try {
    const personal = await callToolGateway({
      toolName: "ragSearch",
      params: { query: "permission smoke personal", topK: 1 },
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-personal",
      },
    });
    assert(personal.ok, "personal default system should execute normally");
    assert(
      personal.gateway.permissionChecked === false,
      "personal default system should not check permission",
    );

    const mcpServer = createMcpServer({
      name: `permission-smoke-server-${suffix}`,
      kind: "rag-http",
      transport: "http",
      baseUrl: server.baseUrl,
      enabled: true,
    });
    ids.servers.push(mcpServer.id);

    const missingSystem = createSystem({
      id: `perm-smoke-missing-${suffix}`,
      name: "Permission Smoke Missing Tool",
      mode: "enterprise",
      permissionMode: "preflight",
      enabled: true,
    });
    ids.systems.push(missingSystem.id);
    const missingTarget = createMcpTool({
      name: `permissionSmokeMissingTarget_${suffix}`,
      pathSuffix: "target",
      description: "Permission smoke target without configured permission tool.",
      handlerType: "rag-http",
      systemId: missingSystem.id,
      permissionMode: "inherit",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(missingTarget.id);

    const missingPermission = await callToolGateway({
      toolName: missingTarget.name,
      params: { value: 1 },
      userContext: trustedUser,
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-missing-tool",
      },
    });
    assert(!missingPermission.ok, "missing permission tool should deny");
    assert(
      !missingPermission.ok && missingPermission.error.type === "PermissionDenied",
      "missing permission tool should return PermissionDenied",
    );
    assert(
      !missingPermission.ok && missingPermission.gateway.permissionChecked === true,
      "missing permission tool should set permissionChecked",
    );

    const system = createSystem({
      id: `perm-smoke-system-${suffix}`,
      name: "Permission Smoke System",
      mode: "enterprise",
      permissionMode: "preflight",
      enabled: true,
    });
    ids.systems.push(system.id);

    const allowTool = createMcpTool({
      name: `permissionSmokeAllow_${suffix}`,
      pathSuffix: "permission-allow",
      description: "Permission smoke allow tool.",
      handlerType: "rag-http",
      systemId: system.id,
      permissionMode: "none",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(allowTool.id);
    const denyTool = createMcpTool({
      name: `permissionSmokeDeny_${suffix}`,
      pathSuffix: "permission-deny",
      description: "Permission smoke deny tool.",
      handlerType: "rag-http",
      systemId: system.id,
      permissionMode: "none",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(denyTool.id);
    const failTool = createMcpTool({
      name: `permissionSmokeFail_${suffix}`,
      pathSuffix: "permission-fail",
      description: "Permission smoke failing tool.",
      handlerType: "rag-http",
      systemId: system.id,
      permissionMode: "none",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(failTool.id);
    const target = createMcpTool({
      name: `permissionSmokeTarget_${suffix}`,
      pathSuffix: "target",
      description: "Permission smoke target tool.",
      handlerType: "rag-http",
      systemId: system.id,
      permissionMode: "inherit",
      serverId: mcpServer.id,
      enabled: true,
    });
    ids.tools.push(target.id);

    updateSystem(system.id, { permissionToolId: allowTool.id });

    const missingIdentity = await callToolGateway({
      toolName: target.name,
      params: { value: 2 },
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-missing-identity",
      },
    });
    assert(!missingIdentity.ok, "enterprise system without identity should deny");
    assert(
      !missingIdentity.ok && missingIdentity.error.type === "PermissionDenied",
      "missing identity should return PermissionDenied",
    );
    assert(
      !missingIdentity.ok && missingIdentity.gateway.permissionChecked === false,
      "missing identity should deny before external permission preflight",
    );

    updateSystem(system.id, { permissionToolId: denyTool.id });
    const denied = await callToolGateway({
      toolName: target.name,
      params: { value: 3 },
      userContext: trustedUser,
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-denied",
      },
    });
    assert(!denied.ok, "permission tool denial should block target");
    assert(
      !denied.ok && denied.gateway.permissionChecked === true,
      "permission denial should set permissionChecked",
    );
    assert(
      !denied.ok && denied.gateway.permissionAllowed === false,
      "permission denial should set permissionAllowed=false",
    );

    updateSystem(system.id, { permissionToolId: failTool.id });
    const failed = await callToolGateway({
      toolName: target.name,
      params: { value: 4 },
      userContext: trustedUser,
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-failed",
      },
    });
    assert(!failed.ok, "permission tool failure should fail closed");
    assert(
      !failed.ok && failed.gateway.permissionChecked === true,
      "permission failure should set permissionChecked",
    );

    updateSystem(system.id, { permissionToolId: allowTool.id });
    const allowed = await callToolGateway({
      toolName: target.name,
      params: { value: 5 },
      userContext: trustedUser,
      executionContext: {
        mode: "mcp_call",
        requestId: "permission-smoke-allowed",
      },
    });
    assert(allowed.ok, "permission allow should execute target");
    assert(
      allowed.gateway.permissionChecked === true,
      "permission allow should set permissionChecked",
    );
    assert(
      allowed.gateway.permissionAllowed === true,
      "permission allow should set permissionAllowed=true",
    );
    assert(
      typeof allowed.result === "object" && allowed.result !== null,
      "allowed target should return a structured result wrapper",
    );

    console.log("Permission preflight smoke OK");
  } finally {
    cleanup(ids);
    await server.close();
  }
}

const trustedUser: UserContext = {
  source: "trusted_headers",
  trustLevel: "trusted",
  userId: "user-permission-smoke",
  tenantId: "tenant-permission-smoke",
  sessionUserId: "session-permission-smoke",
  roleIds: ["role-a"],
  kbRoleIds: ["kb-role-a"],
};

function cleanup(ids: { systems: string[]; tools: string[]; servers: string[] }) {
  for (const id of ids.tools.reverse()) {
    try {
      deleteMcpTool(id);
    } catch {}
  }
  const db = getDb();
  for (const id of ids.systems.reverse()) {
    try {
      db.prepare(`DELETE FROM systems WHERE id = ?`).run(id);
    } catch {}
  }
  for (const id of ids.servers.reverse()) {
    try {
      deleteMcpServer(id);
    } catch {}
  }
}

async function startPermissionServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(async (req, res) => {
    const path = req.url ?? "";
    const body = await readJson(req);
    res.setHeader("Content-Type", "application/json");

    if (path.endsWith("/permission-allow")) {
      res.end(JSON.stringify({ code: 200, data: { allowed: true } }));
      return;
    }
    if (path.endsWith("/permission-deny")) {
      res.end(
        JSON.stringify({
          code: 200,
          data: { allowed: false, reason: "Denied by smoke permission tool" },
        }),
      );
      return;
    }
    if (path.endsWith("/permission-fail")) {
      res.end(JSON.stringify({ code: 500, msg: "permission tool failed" }));
      return;
    }
    if (path.endsWith("/target")) {
      res.end(JSON.stringify({ code: 200, data: { ok: true, body } }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ code: 404, msg: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object", "permission smoke server failed to bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
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

main();
