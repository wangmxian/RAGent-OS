import "dotenv/config";
import { resolveIdentityContext } from "../lib/identity-context";
import { callToolGateway } from "../lib/tool-gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const personal = resolveIdentityContext({
    requestId: "identity-personal",
    conversationId: "conv-local",
    source: "chat",
    mode: "personal",
  });
  assert(personal.userContext.source === "personal", "personal source expected");
  assert(personal.userContext.trustLevel === "local", "personal trust expected");
  assert(personal.userContext.sessionUserId === "conv-local", "conversation id should seed local session");

  const ignored = resolveIdentityContext({
    requestId: "identity-ignored",
    source: "api",
    mode: "enterprise",
    headers: {
      "x-rag-user-id": "spoofed-user",
      "x-rag-tenant-id": "spoofed-tenant",
    },
  });
  assert(
    ignored.userContext.source !== "trusted_headers",
    "trusted headers must be disabled by default",
  );

  const previous = process.env.TRUSTED_IDENTITY_HEADERS_ENABLED;
  process.env.TRUSTED_IDENTITY_HEADERS_ENABLED = "true";
  const trusted = resolveIdentityContext({
    requestId: "identity-trusted",
    source: "api",
    mode: "enterprise",
    headers: {
      "x-rag-user-id": "u123",
      "x-rag-tenant-id": "t001",
      "x-rag-session-user-id": "s789",
      "x-rag-user-name": "Zhang San",
      "x-rag-role-ids": "role-a, role-b",
      "x-rag-kb-role-ids": "kb-a,kb-b",
      authorization: "Bearer SECRET_TOKEN",
    },
  });
  process.env.TRUSTED_IDENTITY_HEADERS_ENABLED = previous;

  assert(trusted.userContext.source === "trusted_headers", "trusted header source expected");
  assert(trusted.userContext.userId === "u123", "user id header expected");
  assert(trusted.userContext.tenantId === "t001", "tenant id header expected");
  assert(trusted.userContext.roleIds?.length === 2, "role ids should parse CSV");
  assert(trusted.userContext.kbRoleIds?.[1] === "kb-b", "kb role ids should parse CSV");
  assert(trusted.userContext.accessToken === "SECRET_TOKEN", "bearer token should be stripped for forwarding");
  assert(trusted.summary.roleCount === 2, "summary should include role count only");

  const gateway = await callToolGateway({
    toolName: "ragSearch",
    params: { query: "identity gateway smoke", topK: 1 },
    userContext: trusted.userContext,
    policyContext: trusted.policyContext,
    executionContext: {
      mode: "mcp_call",
      requestId: "identity-gateway",
    },
  });
  assert(gateway.ok, "gateway should accept identity context without permission checks in 008A");
  assert(gateway.gateway.identity?.source === "trusted_headers", "gateway metadata should include identity source");
  assert(gateway.gateway.identity?.kbRoleCount === 2, "gateway metadata should include kb role count");

  console.log("Identity context smoke OK");
}

main();
