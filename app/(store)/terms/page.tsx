import type { Metadata } from "next";
import { LegalPage } from "@/components/store/legal-page";
import { getLocale } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const zh = (await getLocale()) === "zh";
  return <LegalPage
    title={zh ? "服务条款" : "Terms of Service"}
    intro={zh ? "本页面说明在 Game3DTech 浏览、购买数字商品及使用账户服务时适用的基本规则。" : "These terms explain the basic rules for browsing, purchasing digital goods, and using account services on Game3DTech."}
    updated={zh ? "更新日期：2026 年 7 月 19 日" : "Updated: July 19, 2026"}
    backLabel={zh ? "返回商城" : "Back to store"}
    sections={zh ? [
      { title: "账户与信息", paragraphs: ["请提供真实、有效的账户和联系方式，并妥善保管登录凭证。账户内发生的操作以平台记录为准。"] },
      { title: "商品与交付", paragraphs: ["商品页面会展示价格、规格、预计交付方式和库存状态。付款前请确认商品说明；数字商品一经交付，请及时核验并安全保存。"] },
      { title: "支付与余额", paragraphs: ["支付、余额充值和消费记录可在账户页面查询。若订单状态与实际支付不一致，请保留订单号并联系在线客服核验。"] },
      { title: "合理使用", paragraphs: ["不得利用本站从事欺诈、滥用、攻击系统或侵犯第三方权益的行为。违规操作可能导致订单暂停或账户限制。"] },
    ] : [
      { title: "Accounts and information", paragraphs: ["Provide accurate account and contact information and keep your credentials secure. Platform records are used to verify account activity."] },
      { title: "Products and delivery", paragraphs: ["Product pages show pricing, variants, estimated delivery, and availability. Review the description before payment and verify delivered digital goods promptly."] },
      { title: "Payments and balance", paragraphs: ["Payments, top-ups, and balance activity are available in your account. Keep your order number and contact support if payment and order status differ."] },
      { title: "Acceptable use", paragraphs: ["Do not use the service for fraud, abuse, system attacks, or infringement of third-party rights. Violations may result in order or account restrictions."] },
    ]}
  />;
}
