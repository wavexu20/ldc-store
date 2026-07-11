import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ProfileSettings } from "@/components/account/profile-settings";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") redirect("/login?callbackUrl=/account/profile");
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { name: true, email: true, image: true, avatarSource: true } });
  if (!user) redirect("/login");
  return <ProfileSettings profile={{ name: user.name || "", email: user.email, image: user.image, avatarSource: user.avatarSource }} />;
}
