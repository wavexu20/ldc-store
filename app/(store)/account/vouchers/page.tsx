import { redirect } from "next/navigation";
import { getVoucherOverview } from "@/lib/actions/vouchers";
import { VoucherRedeemView } from "@/components/account/voucher-redeem-view";

export default async function VouchersPage() {
  const data = await getVoucherOverview();
  if (!data.success) redirect("/login?callbackUrl=/account/vouchers");
  return <VoucherRedeemView items={data.items as Parameters<typeof VoucherRedeemView>[0]["items"]} />;
}
