import { describe, expect, it } from "vitest";
import { cnyToDisplayAmount, formatCnyAmount, normalizeUsdCnyRate } from "@/lib/currency";

describe("currency display", () => {
  it("keeps CNY unchanged and converts USD with the configured rate", () => {
    expect(cnyToDisplayAmount(72, "CNY", 7.2)).toBe(72);
    expect(cnyToDisplayAmount(72, "USD", 7.2)).toBe(10);
  });

  it("falls back when the configured rate is invalid", () => {
    expect(normalizeUsdCnyRate(0)).toBe(7.2);
    expect(normalizeUsdCnyRate("bad")).toBe(7.2);
  });

  it("formats both supported display currencies", () => {
    expect(formatCnyAmount(72, "CNY", 7.2, "zh-CN")).toContain("72.00");
    expect(formatCnyAmount(72, "USD", 7.2, "en-US")).toBe("$10.00");
  });
});
