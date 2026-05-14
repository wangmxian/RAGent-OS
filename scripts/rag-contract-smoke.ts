import "dotenv/config";
import { getSkill } from "../lib/skills";
import { getMcpToolByName } from "../lib/mcp/tool-config";
import { listUnifiedMcpTools } from "../lib/mcp/dispatcher";
import { listToolDescriptors } from "../lib/tools/registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const ragTool = getMcpToolByName("ragSearch");
  assert(ragTool, "ragSearch MCP tool must be configured");
  assert(ragTool.enabled, "ragSearch MCP tool must be enabled");
  assert(ragTool.handlerType === "local", "ragSearch must use local handler");
  assert(ragTool.pathSuffix === "rag-search", "ragSearch pathSuffix must be rag-search");
  assert(ragTool.schema.topK === "number", "ragSearch schema must include topK");

  const unified = listUnifiedMcpTools();
  assert(
    unified.some((tool) => tool.name === "ragSearch" && tool.enabled),
    "ragSearch must be exposed through unified MCP tools",
  );

  const legacyDirectRag = listToolDescriptors().find(
    (tool) => tool.id === "knowledge_search",
  );
  assert(!legacyDirectRag, "legacy direct knowledge_search tool must not be exposed");

  const kbSkill = getSkill("kb_qa");
  assert(kbSkill, "kb_qa skill must exist");
  const firstStep = kbSkill.steps[0];
  assert(firstStep?.tool === "ragSearch", "kb_qa first step must call ragSearch");
  assert(firstStep.params.topK === 5, "kb_qa ragSearch topK must be 5");

  console.log("RAG contract smoke OK");
}

main();
