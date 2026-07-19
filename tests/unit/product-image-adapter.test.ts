import { describe, expect, it } from "vitest";

import {
  calculateContainRect,
  calculateCoverRect,
  isNearProductAspectRatio,
  PRODUCT_IMAGE_HEIGHT,
  PRODUCT_IMAGE_WIDTH,
} from "@/lib/product-image-adapter";

describe("product image adapter layout", () => {
  it("keeps a portrait image complete inside the 4:3 canvas", () => {
    const rect = calculateContainRect(
      { width: 800, height: 1200 },
      { width: PRODUCT_IMAGE_WIDTH, height: PRODUCT_IMAGE_HEIGHT },
      0.035
    );

    expect(rect.height).toBeCloseTo(PRODUCT_IMAGE_HEIGHT * 0.93);
    expect(rect.width / rect.height).toBeCloseTo(800 / 1200);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
  });

  it("covers the entire 4:3 canvas for the extended background", () => {
    const rect = calculateCoverRect(
      { width: 800, height: 1200 },
      { width: PRODUCT_IMAGE_WIDTH, height: PRODUCT_IMAGE_HEIGHT }
    );

    expect(rect.width).toBe(PRODUCT_IMAGE_WIDTH);
    expect(rect.height).toBeGreaterThan(PRODUCT_IMAGE_HEIGHT);
    expect(rect.y).toBeLessThan(0);
  });

  it("recognizes standard and near-standard 4:3 images", () => {
    expect(isNearProductAspectRatio({ width: 1200, height: 900 })).toBe(true);
    expect(isNearProductAspectRatio({ width: 1600, height: 1200 })).toBe(true);
    expect(isNearProductAspectRatio({ width: 1200, height: 675 })).toBe(false);
    expect(isNearProductAspectRatio({ width: 800, height: 1200 })).toBe(false);
    expect(isNearProductAspectRatio({ width: 1000, height: 1000 })).toBe(false);
  });
});
