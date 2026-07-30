import { describe, expect, it } from "vitest";
import { calculatePointsEarned, calculatePointsRedemption, calculateRechargeBonus, getMembershipStatus, splitBalancePayment } from "@/lib/membership";

describe("membership rules", () => {
  it("grants a one-percent recharge bonus in whole cents", () => {
    expect(calculateRechargeBonus(13_500)).toBe(135);
    expect(calculateRechargeBonus(1_050)).toBe(10);
  });

  it("earns one point per full yuan paid", () => {
    expect(calculatePointsEarned(13_500)).toBe(135);
    expect(calculatePointsEarned(199)).toBe(1);
  });

  it("caps point redemption at ten percent", () => {
    expect(calculatePointsRedemption(13_500, 10_000)).toEqual({ points: 2700, discountCents: 1350 });
    expect(calculatePointsRedemption(13_500, 201)).toEqual({ points: 200, discountCents: 100 });
  });

  it("spends bonus balance before cash without exceeding either asset", () => {
    expect(splitBalancePayment(10_000, 8_000, 3_000)).toEqual({ bonusSpentCents: 3_000, cashSpentCents: 7_000 });
    expect(splitBalancePayment(12_000, 8_000, 3_000)).toBeNull();
  });

  it("derives the membership tier and progress from completed lifetime spending", () => {
    expect(getMembershipStatus(0)).toMatchObject({ tier: { key: "starter" }, nextTier: { key: "silver" }, amountToNextCents: 50_000 });
    expect(getMembershipStatus(75_000)).toMatchObject({ tier: { key: "silver" }, nextTier: { key: "gold" }, amountToNextCents: 125_000 });
    expect(getMembershipStatus(500_000)).toMatchObject({ tier: { key: "obsidian" }, nextTier: null, progress: 100 });
  });
});
