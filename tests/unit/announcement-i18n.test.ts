import { describe, expect, it } from "vitest";
import { localizeAnnouncement } from "@/lib/announcement-i18n";

const announcement = {
  title: "购买与发货",
  content: "查看购买和交付说明。",
  translations: {
    en: { title: "Purchasing and delivery", content: "Read the purchasing and delivery guide." },
    es: { title: "Compra y entrega", content: "Lee la guía de compra y entrega." },
  },
};

describe("announcement localization", () => {
  it("uses the requested translation", () => {
    expect(localizeAnnouncement(announcement, "es")).toMatchObject({
      title: "Compra y entrega",
      content: "Lee la guía de compra y entrega.",
    });
  });

  it("uses English when the requested translation is unavailable", () => {
    expect(localizeAnnouncement(announcement, "ja")).toMatchObject({
      title: "Purchasing and delivery",
      content: "Read the purchasing and delivery guide.",
    });
  });

  it("keeps the Chinese source for Chinese", () => {
    expect(localizeAnnouncement(announcement, "zh")).toBe(announcement);
  });
});
