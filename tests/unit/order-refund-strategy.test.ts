import { describe, expect, it } from "vitest";

import {
  canApproveRefund,
  shouldUseClientRefund,
} from "@/app/(admin)/admin/orders/order-meta";

describe("order refund strategy", () => {
  it("always handles balance refunds on the server", () => {
    expect(shouldUseClientRefund("balance", "client")).toBe(false);
    expect(canApproveRefund("balance", false)).toBe(true);
  });

  it("uses the client window only for external payments in client mode", () => {
    expect(shouldUseClientRefund("ldc", "client")).toBe(true);
    expect(shouldUseClientRefund("ldc", "proxy")).toBe(false);
    expect(canApproveRefund("ldc", false)).toBe(false);
    expect(canApproveRefund("ldc", true)).toBe(true);
  });
});
