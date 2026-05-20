import assert from "node:assert/strict";
import { getDb } from "../lib/db";
import { createMcpTool, deleteMcpTool } from "../lib/mcp/tool-config";
import { createSkill, deleteSkill } from "../lib/skills";
import { createSystem, updateSystem } from "../lib/systems";
import { renderLayeredAgentPrompt } from "../lib/agent-prompt";

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ids: { systems: string[]; tools: string[]; skills: string[] } = {
    systems: [],
    tools: [],
    skills: [],
  };

  try {
    const relevantSystem = createSystem({
      id: `prompt-system-${suffix}`,
      name: "Prompt Layer Smoke System",
      mode: "personal",
      permissionMode: "none",
      prompt: "SYSTEM_PROMPT_RELEVANT_MARKER",
      enabled: true,
    });
    ids.systems.push(relevantSystem.id);

    const unrelatedSystem = createSystem({
      id: `prompt-unrelated-${suffix}`,
      name: "Prompt Layer Unrelated System",
      mode: "personal",
      permissionMode: "none",
      prompt: "SYSTEM_PROMPT_UNRELATED_MARKER",
      enabled: true,
    });
    ids.systems.push(unrelatedSystem.id);

    const tool = createMcpTool({
      name: `promptLayerTool_${suffix}`,
      pathSuffix: "prompt-layer",
      description: "Prompt layering smoke tool.",
      handlerType: "local",
      systemId: relevantSystem.id,
      permissionMode: "inherit",
      enabled: true,
    });
    ids.tools.push(tool.id);

    const unrelatedTool = createMcpTool({
      name: `promptLayerUnrelatedTool_${suffix}`,
      pathSuffix: "prompt-layer-unrelated",
      description: "Prompt layering unrelated tool.",
      handlerType: "local",
      systemId: unrelatedSystem.id,
      permissionMode: "inherit",
      enabled: true,
    });
    ids.tools.push(unrelatedTool.id);

    const skill = createSkill({
      name: `Prompt Layer Skill ${suffix}`,
      description: "Prompt layering smoke skill.",
      systemPrompt: "SKILL_PROMPT_MARKER",
      steps: [{ tool: tool.name, params: { query: "$input.query" } }],
      toolIds: [tool.name],
    });
    ids.skills.push(skill.id);

    const preview = renderLayeredAgentPrompt({
      selectedSkillId: skill.id,
    });

    assert.match(preview.prompt, /Return strict JSON only/);
    assert.match(preview.prompt, /SYSTEM_PROMPT_RELEVANT_MARKER/);
    assert.match(preview.prompt, /SKILL_PROMPT_MARKER/);
    assert.doesNotMatch(preview.prompt, /SYSTEM_PROMPT_UNRELATED_MARKER/);
    assert.deepEqual(preview.relevantSystemIds, [relevantSystem.id]);

    updateSystem(relevantSystem.id, { enabled: false });
    const disabledPreview = renderLayeredAgentPrompt({
      selectedSkillId: skill.id,
    });
    assert.doesNotMatch(disabledPreview.prompt, /SYSTEM_PROMPT_RELEVANT_MARKER/);

    console.log("Prompt layering smoke OK");
  } finally {
    for (const id of ids.skills.reverse()) {
      try {
        deleteSkill(id);
      } catch {}
    }
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
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
