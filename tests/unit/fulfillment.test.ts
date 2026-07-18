import { describe, expect, it } from "vitest";

import {
  getFulfillmentDueAt,
  getLocalizedFulfillmentLabel,
  isManualFulfillment,
} from "@/lib/fulfillment";

describe("fulfillment", () => {
  it("keeps automatic delivery out of the manual queue", () => {
    expect(isManualFulfillment("auto")).toBe(false);
    expect(isManualFulfillment(undefined)).toBe(false);
    expect(getFulfillmentDueAt("auto", new Date("2026-07-19T00:00:00Z"))).toBeNull();
  });

  it("calculates the promised deadline from payment time", () => {
    const paidAt = new Date("2026-07-19T00:00:00Z");
    expect(getFulfillmentDueAt("manual_30m", paidAt)?.toISOString()).toBe("2026-07-19T00:30:00.000Z");
    expect(getFulfillmentDueAt("manual_24h", paidAt)?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("provides storefront labels in supported locales", () => {
    expect(getLocalizedFulfillmentLabel("manual_10m", "zh")).toBe("10 分钟内发货");
    expect(getLocalizedFulfillmentLabel("manual_10m", "en")).toBe("Within 10 min");
  });
});

