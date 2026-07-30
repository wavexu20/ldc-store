import { PasswordResetForm } from "@/components/account/password-reset-form";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <><PasswordResetForm /><Toaster position="top-center" richColors /></>;
}
