import { describe, expect, it } from "vitest";

import { createSupportToken, verifySupportToken } from "@/lib/support/token";

describe("support websocket token", () => {
  it("signs and verifies a scoped session", async () => {
    const token = await createSupportToken(
      { conversationId: "conversation-1", role: "visitor", actorId: "guest-1" },
      "test-secret"
    );
    const payload = await verifySupportToken(token, "test-secret");
    expect(payload).toMatchObject({ conversationId: "conversation-1", role: "visitor", actorId: "guest-1" });
  });

  it("rejects tampered and incorrectly signed tokens", async () => {
    const token = await createSupportToken(
      { conversationId: "conversation-1", role: "admin", actorId: "admin-1" },
      "test-secret"
    );
    expect(await verifySupportToken(`${token}x`, "test-secret")).toBeNull();
    expect(await verifySupportToken(token, "different-secret")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await createSupportToken(
      { conversationId: "conversation-1", role: "visitor", actorId: "guest-1" },
      "test-secret",
      -1
    );
    expect(await verifySupportToken(token, "test-secret")).toBeNull();
  });
});
