import { redirect } from "next/navigation";
import { getSecurityOverview } from "@/lib/actions/security";
import { SecuritySettings } from "@/components/account/security-settings";

export default async function SecurityPage() {
  try {
    const overview = await getSecurityOverview();
    return <SecuritySettings overview={overview} />;
  } catch {
    redirect("/login?callbackUrl=/account/security");
  }
}
