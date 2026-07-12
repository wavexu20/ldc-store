import { describe, expect, it } from "vitest";
import { summarizeAvailableInventory } from "@/lib/inventory";

describe("summarizeAvailableInventory", () => {
  const rows = [
    { variantId: null, count: 4 },
    { variantId: "monthly", count: 3 },
    { variantId: "yearly", count: 2 },
    { variantId: "disabled", count: 5 },
  ];

  it("单规格模式只把公共卡密计入可售库存", () => {
    expect(summarizeAvailableInventory(rows, [])).toEqual({
      saleableStock: 4,
      publicStock: 4,
      variantStock: {},
      inactiveStock: 10,
    });
  });

  it("多规格模式只把启用规格卡密计入可售库存", () => {
    expect(summarizeAvailableInventory(rows, ["monthly", "yearly"])).toEqual({
      saleableStock: 5,
      publicStock: 4,
      variantStock: { monthly: 3, yearly: 2 },
      inactiveStock: 9,
    });
  });
});
