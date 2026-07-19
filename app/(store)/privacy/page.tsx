import type { Metadata } from "next";
import { LegalPage } from "@/components/store/legal-page";
import { getLocale } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const zh = (await getLocale()) === "zh";
  return <LegalPage
    title={zh ? "隐私说明" : "Privacy Notice"}
    intro={zh ? "我们只处理提供账户、订单、支付、交付与客服所需的信息。" : "We process information needed to provide accounts, orders, payments, delivery, and support."}
    updated={zh ? "更新日期：2026 年 7 月 19 日" : "Updated: July 19, 2026"}
    backLabel={zh ? "返回商城" : "Back to store"}
    sections={zh ? [
      { title: "收集的信息", paragraphs: ["包括登录标识、已验证邮箱、订单和余额记录、客服会话，以及保障服务安全所需的基础技术日志。第三方登录只获取授权页面明确展示的信息。"] },
      { title: "使用目的", paragraphs: ["用于身份验证、订单履行、支付核验、重要通知、售后支持、防止欺诈和改进服务。未经单独同意，不会用于发送营销垃圾邮件。"] },
      { title: "保存与保护", paragraphs: ["我们会根据业务、安全和合规需要保留必要记录，并采用访问控制等措施限制未授权访问。请勿在客服消息中发送密码、完整支付凭证或其他不必要的敏感信息。"] },
      { title: "你的选择", paragraphs: ["你可以在账户页面维护个人资料与安全设置；如需查询、更正或删除相关信息，可通过在线客服提交请求。"] },
    ] : [
      { title: "Information collected", paragraphs: ["This may include sign-in identifiers, verified email, order and balance records, support conversations, and basic security logs. Third-party sign-in only provides information shown on its authorization screen."] },
      { title: "How it is used", paragraphs: ["We use information for authentication, fulfillment, payment verification, essential notifications, support, fraud prevention, and service improvement. We do not send marketing spam without separate consent."] },
      { title: "Retention and protection", paragraphs: ["Necessary records are retained for operational, security, and compliance needs, with access controls to limit unauthorized access. Do not send passwords or unnecessary sensitive data in support messages."] },
      { title: "Your choices", paragraphs: ["Manage profile and security settings from your account. Contact support to request access, correction, or deletion where applicable."] },
    ]}
  />;
}
