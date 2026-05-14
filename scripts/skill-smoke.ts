import "dotenv/config";
import { resolveParams } from "../lib/skill-executor";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label} failed\nactual: ${a}\nexpected: ${e}`);
  }
}

function main() {
  const context = {
    input: {
      query: "查询 NGFAI",
      time: "本月",
      nested: { value: 42 },
    },
    steps: {
      step1: { result: "2026-05" },
      step2: { chunks: [{ content: "片段" }] },
    },
  };

  const resolved = resolveParams(
    {
      q: "$input.query",
      t: "$input.time",
      n: "$input.nested.value",
      month: "$step1.result",
      chunks: "$step2.chunks",
      arr: ["$input.query", "literal"],
    },
    context,
  );

  assertEqual(
    resolved,
    {
      q: "查询 NGFAI",
      t: "本月",
      n: 42,
      month: "2026-05",
      chunks: [{ content: "片段" }],
      arr: ["查询 NGFAI", "literal"],
    },
    "resolveParams",
  );

  let failed = false;
  try {
    resolveParams("$step3.missing", context);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("missing step should fail");

  console.log("Skill resolver smoke OK");
}

main();
