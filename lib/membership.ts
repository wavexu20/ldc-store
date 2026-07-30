export const RECHARGE_BONUS_BPS = 100;
export const MAX_POINTS_DISCOUNT_BPS = 1_000;
export const POINTS_PER_YUAN = 1;
export const POINTS_PER_DISCOUNT_YUAN = 200;

export const MEMBERSHIP_TIERS = [
  { key: "starter", name: "黑铁会员", minSpendCents: 0 },
  { key: "silver", name: "银耀会员", minSpendCents: 50_000 },
  { key: "gold", name: "金耀会员", minSpendCents: 200_000 },
  { key: "obsidian", name: "黑曜会员", minSpendCents: 500_000 },
] as const;

export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

/** Membership is cosmetic for now: it reflects completed lifetime spending and makes no pricing promise. */
export function getMembershipStatus(totalSpentCents: number) {
  const total = Math.max(0, Math.floor(totalSpentCents));
  const tierIndex = MEMBERSHIP_TIERS.reduce((current, tier, index) => total >= tier.minSpendCents ? index : current, 0);
  const tier = MEMBERSHIP_TIERS[tierIndex];
  const nextTier = MEMBERSHIP_TIERS[tierIndex + 1] ?? null;
  const progress = nextTier
    ? Math.min(100, Math.max(0, ((total - tier.minSpendCents) / (nextTier.minSpendCents - tier.minSpendCents)) * 100))
    : 100;
  return { tier, nextTier, totalSpentCents: total, progress, amountToNextCents: nextTier ? Math.max(0, nextTier.minSpendCents - total) : 0 };
}

export function createMemberNo(userId: string) {
  return `G3D-${userId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

export function calculateRechargeBonus(amountCents: number) {
  return Math.floor((Math.max(0, amountCents) * RECHARGE_BONUS_BPS) / 10_000);
}

export function calculatePointsEarned(paidCents: number) {
  return Math.floor(Math.max(0, paidCents) / 100) * POINTS_PER_YUAN;
}

export function calculatePointsRedemption(totalCents: number, availablePoints: number) {
  const maxDiscountCents = Math.floor((Math.max(0, totalCents) * MAX_POINTS_DISCOUNT_BPS) / 10_000);
  const maxPoints = maxDiscountCents * (POINTS_PER_DISCOUNT_YUAN / 100);
  const points = Math.max(0, Math.min(Math.floor(availablePoints), Math.floor(maxPoints)));
  const discountCents = Math.floor((points * 100) / POINTS_PER_DISCOUNT_YUAN);
  return { points: discountCents * (POINTS_PER_DISCOUNT_YUAN / 100), discountCents };
}

export function splitBalancePayment(payableCents: number, cashCents: number, bonusCents: number) {
  const payable = Math.max(0, payableCents);
  const cash = Math.max(0, cashCents);
  const bonus = Math.max(0, bonusCents);
  if (payable > cash + bonus) return null;
  const bonusSpentCents = Math.min(bonus, payable);
  return { bonusSpentCents, cashSpentCents: payable - bonusSpentCents };
}
