"use client";

import type { PaymentLaunchData } from "@/lib/payment/types";

export function launchPayment(payment: PaymentLaunchData): void {
  if (payment.redirectUrl) {
    window.location.assign(payment.redirectUrl);
    return;
  }

  if (!payment.actionUrl || !payment.params) {
    throw new Error("支付链接无效，请稍后重试");
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = payment.actionUrl;
  form.style.display = "none";

  Object.entries(payment.params).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
