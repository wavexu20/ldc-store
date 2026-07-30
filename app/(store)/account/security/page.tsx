import { redirect } from "next/navigation";
import { getSecurityOverview } from "@/lib/actions/security";
import { SecuritySettings } from "@/components/account/security-settings";

export default async function SecurityPage() {
  let overview;

  try {
    overview = await getSecurityOverview();
  } catch {
    redirect("/login?callbackUrl=/account/security");
  }

  return <SecuritySettings overview={overview} />;
}
