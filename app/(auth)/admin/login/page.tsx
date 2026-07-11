import { Suspense } from "react"
import { LoginForm } from "@/components/login-form"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Lock } from "lucide-react"

function LoginFormFallback() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-7">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Lock className="h-7 w-7 text-white" />
                </div>
                <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex flex-col gap-3">
                <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                <div className="h-11 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-11 animate-pulse rounded-md bg-muted" />
              <div className="h-11 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
          <div className="bg-muted relative hidden md:block" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function AdminLoginPage() {
  const linuxDoOAuthEnabled = Boolean(
    process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET
  )

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-muted p-4">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm linuxDoOAuthEnabled={linuxDoOAuthEnabled} />
        </Suspense>
      </div>
    </div>
  )
}
