export interface PaymentFormData {
  actionUrl: string;
  params: Record<string, string>;
  redirectUrl?: never;
}

export interface PaymentRedirectData {
  redirectUrl: string;
  actionUrl?: never;
  params?: never;
}

export type PaymentLaunchData = PaymentFormData | PaymentRedirectData;
