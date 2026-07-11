import { redirect } from "next/navigation";
import { getWalletOverview } from "@/lib/actions/wallet";
import { WalletView } from "@/components/store/wallet-view";

export default async function WalletPage() {
  const data = await getWalletOverview();
  if (!data.success) redirect("/login?callbackUrl=/account/wallet");
  return <WalletView data={data} />;
}
