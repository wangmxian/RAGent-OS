import { tool } from "@langchain/core/tools";
import {
  getMcpServer,
  listEnabledMcpServers,
  type McpServerRow,
} from "../mcp";
import { RAG_TOOL_CATEGORY, RAG_TOOLS } from "./rag-tools";
import { callRagHttpTool } from "./http-client";

/**
 * 工具 id 形如 `mcp:<serverId>:<toolName>`，便于：
 *   - 在 skill 的 tool_ids 数组里直接保存
 *   - 在 chat 路由里按 id 反查 server + tool name
 */
export function mcpToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`;
}

export function parseMcpToolId(
  id: string,
): { serverId: string; toolName: string } | null {
  if (!id.startsWith("mcp:")) return null;
  const rest = id.slice(4);
  const idx = rest.indexOf(":");
  if (idx < 0) return null;
  return {
    serverId: rest.slice(0, idx),
    toolName: rest.slice(idx + 1),
  };
}

export interface McpToolDescriptor {
  id: string;
  name: string;
  description: string;
  category: typeof RAG_TOOL_CATEGORY;
  /** 来自的 server */
  server_id: string;
  server_name: string;
  /** rag-http / generic 等 */
  kind: McpServerRow["kind"];
}

/** 列出所有已启用 MCP server 上可用的工具描述（供 SkillsPanel / /api/tools 使用） */
export function listMcpToolDescriptors(): McpToolDescriptor[] {
  const out: McpToolDescriptor[] = [];
  for (const s of listEnabledMcpServers()) {
    if (s.kind === "rag-http") {
      for (const t of RAG_TOOLS) {
        out.push({
          id: mcpToolId(s.id, t.name),
          name: `${t.name}`,
          description: `[MCP·${s.name}] ${t.description}`,
          category: RAG_TOOL_CATEGORY,
          server_id: s.id,
          server_name: s.name,
          kind: s.kind,
        });
      }
    }
    // 其它 kind 的 MCP server 待后续接入
  }
  return out;
}

/** 列某个 server 上的可用工具（连接测试 / UI 详情用） */
export function listToolsOfServer(
  server: McpServerRow,
): Array<{ name: string; description: string }> {
  if (server.kind === "rag-http") {
    return RAG_TOOLS.map((t) => ({ name: t.name, description: t.description }));
  }
  return [];
}

/**
 * 把 ids（形如 mcp:<serverId>:<toolName>）解析并实例化为 LangChain tool。
 * 未知 id / 已删除 server / 未启用 server 都会被静默跳过。
 */
export function buildMcpTools(ids: string[]): any[] {
  const tools: any[] = [];
  for (const id of ids) {
    const parsed = parseMcpToolId(id);
    if (!parsed) continue;
    const server = getMcpServer(parsed.serverId);
    if (!server || !server.enabled) continue;

    if (server.kind === "rag-http") {
      const def = RAG_TOOLS.find((t) => t.name === parsed.toolName);
      if (!def) continue;
      tools.push(buildRagHttpTool(server, def));
    }
  }
  return tools;
}

export function buildEnabledMcpTools(): any[] {
  return buildMcpTools(
    listMcpToolDescriptors().map((descriptor) => descriptor.id),
  );
}

function buildRagHttpTool(
  server: McpServerRow,
  def: (typeof RAG_TOOLS)[number],
) {
  return tool(
    async (args: Record<string, unknown>) => {
      try {
        const out = await callRagHttpTool(server, def.name, args);
        return out || "(empty)";
      } catch (e: any) {
        return `ERROR: ${e?.message || String(e)}`;
      }
    },
    {
      name: def.name,
      description: def.description,
      schema: def.schema,
    },
  );
}
