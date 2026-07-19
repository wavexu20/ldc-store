import type { Metadata } from "next";
import { LegalPage } from "@/components/store/legal-page";
import { getLocale } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Refund Policy" };

export default async function RefundPolicyPage() {
  const zh = (await getLocale()) === "zh";
  return <LegalPage
    title={zh ? "退款与售后" : "Refund and Support Policy"}
    intro={zh ? "数字商品具有即时交付和可复制的特性，售后将结合商品状态与实际交付情况处理。" : "Because digital goods may be delivered instantly and can be copied, support requests are reviewed against product and delivery status."}
    updated={zh ? "更新日期：2026 年 7 月 19 日" : "Updated: July 19, 2026"}
    backLabel={zh ? "返回商城" : "Back to store"}
    sections={zh ? [
      { title: "提交申请", paragraphs: ["登录后可在“我的订单”中选择对应订单提交退款申请，并说明具体原因；也可以通过在线客服补充订单号和问题描述。"] },
      { title: "尚未交付", paragraphs: ["未完成支付或尚未交付的订单，将根据支付状态、库存占用和订单进度进行核验处理。"] },
      { title: "已经交付", paragraphs: ["已展示、复制或发送的卡密及数字权益通常无法直接恢复。若存在无法使用、与描述不符或重复扣款等情况，请尽快提交证据，我们会逐单核验。"] },
      { title: "处理结果", paragraphs: ["审核进度与结果会记录在订单中。获批退款将按实际支付渠道或账户余额处理，具体到账时间取决于支付渠道。"] },
    ] : [
      { title: "Submit a request", paragraphs: ["Open the relevant order under My orders and submit a refund request with the reason. You may also provide the order number and details through support."] },
      { title: "Not yet delivered", paragraphs: ["Unpaid or undelivered orders are reviewed based on payment status, inventory reservation, and fulfillment progress."] },
      { title: "Already delivered", paragraphs: ["Keys and digital entitlements that have been displayed, copied, or sent generally cannot be recovered. Report unusable, misdescribed, or duplicate-charge cases promptly with supporting evidence for individual review."] },
      { title: "Outcome", paragraphs: ["Review progress and results are recorded with the order. Approved refunds are returned through the applicable payment channel or account balance; timing depends on the provider."] },
    ]}
  />;
}
