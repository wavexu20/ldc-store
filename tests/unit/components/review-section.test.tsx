import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(), update: vi.fn(), remove: vi.fn(), load: vi.fn(), refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/reviews", () => ({
  submitProductReview: (...args: unknown[]) => mocks.submit(...args),
  updateOwnProductReview: (...args: unknown[]) => mocks.update(...args),
  deleteOwnProductReview: (...args: unknown[]) => mocks.remove(...args),
  getProductReviewData: (...args: unknown[]) => mocks.load(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReviewSection } from "@/app/(store)/product/[slug]/review-section";

const baseData = {
  summary: { total: 1, average: 5, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
  reviews: [{ id: "r1", rating: 5, content: "真实体验非常不错", adminReply: "感谢支持", adminRepliedAt: "2026-07-19T00:00:00.000Z", createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z", userName: "测试用户", userImage: null, variantName: "Pro" }],
  page: 1, totalPages: 1,
  eligibleOrders: [{ id: "11111111-1111-4111-8111-111111111111", orderNo: "ORDER-1", variantName: "Pro", completedAt: "2026-07-19T00:00:00.000Z", createdAt: "2026-07-19T00:00:00.000Z" }],
  ownReviews: [], isLoggedIn: true,
};

beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); });

describe("ReviewSection", () => {
  it("renders verified reviews, summary and merchant reply", () => {
    render(<ReviewSection productId="p1" initialData={baseData} />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("测试用户")).toBeInTheDocument();
    expect(screen.getByText("已购")).toBeInTheDocument();
    expect(screen.getByText("真实体验非常不错")).toBeInTheDocument();
    expect(screen.getByText("感谢支持")).toBeInTheDocument();
  });

  it("submits a review for an eligible completed order", async () => {
    mocks.submit.mockResolvedValue({ success: true, message: "评价已发布" });
    render(<ReviewSection productId="p1" initialData={baseData} />);
    fireEvent.change(screen.getByPlaceholderText("分享真实使用体验（5–1000 个字符）"), { target: { value: "这是一次真实购买评价" } });
    fireEvent.click(screen.getByRole("button", { name: "发布评价" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ orderId: baseData.eligibleOrders[0].id, rating: 5, content: "这是一次真实购买评价" })));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("explains eligibility when no completed order is available", () => {
    render(<ReviewSection productId="p1" initialData={{ ...baseData, eligibleOrders: [], reviews: [], summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } }} />);
    expect(screen.getByText("完成该商品订单后即可发表评价。")).toBeInTheDocument();
    expect(screen.getByText("暂无评价")).toBeInTheDocument();
  });
});
