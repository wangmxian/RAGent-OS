import "dotenv/config";
import { listMcpTools } from "../lib/mcp/tool-config";
import { getSystem, listSystems } from "../lib/systems";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const defaultSystem = getSystem("default");
  assert(defaultSystem, "default system must exist");
  assert(defaultSystem.mode === "personal", "default system must be personal");
  assert(
    defaultSystem.permissionMode === "none",
    "default system permission mode must be none",
  );
  assert(defaultSystem.auditEnabled, "default system audit must be enabled");

  const systems = listSystems();
  assert(systems.length >= 1, "at least one system must exist");

  const tools = listMcpTools();
  for (const tool of tools) {
    assert(tool.systemId, `tool ${tool.name} must have systemId`);
    assert(getSystem(tool.systemId), `tool ${tool.name} system must exist`);
  }

  console.log("System registry smoke OK");
}

main();
