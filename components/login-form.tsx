"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Lock, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldError,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LinuxDoLogo } from "@/components/icons/linuxdo-logo"
import { adminLogin } from "@/lib/actions/auth"

const loginSchema = z.object({
  password: z.string().min(1, "请输入密码"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginForm({
  linuxDoOAuthEnabled = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { linuxDoOAuthEnabled?: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/admin"

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      password: "",
    },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true)
    setLoginError(null)

    try {
      const result = await adminLogin(values.password)

      if (!result.success) {
        setLoginError(result.message)
        setIsBlocked(result.blocked || false)
        toast.error("登录失败", {
          description: result.message,
        })
      } else {
        toast.success("登录成功")
        router.push(callbackUrl)
        router.refresh()
      }
    } catch {
      toast.error("登录失败", {
        description: "发生未知错误",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinuxDoLogin = async () => {
    setIsOAuthLoading(true)
    try {
      await signIn("linux-do", { callbackUrl })
    } catch {
      toast.error("登录失败", {
        description: "OAuth 登录发生错误",
      })
      setIsOAuthLoading(false)
    }
  }

  const isDisabled = isLoading || isOAuthLoading || isBlocked

  return (
    <div className={cn("flex flex-col", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="bg-muted relative hidden md:block">
            <img
              src="/login-side.webp"
              alt="LinuxDo Community"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6">
            <FieldGroup className="gap-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Lock className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-2xl font-bold">管理员登录</h1>
                <p className="text-muted-foreground text-balance">
                  {linuxDoOAuthEnabled
                    ? "请使用管理密码或 Linux DO 账号登录"
                    : "请使用管理密码登录"}
                </p>
              </div>
              {/* 锁定警告 */}
              {isBlocked && loginError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium">账户已被临时锁定</p>
                    <p className="mt-1 text-red-600 dark:text-red-400">{loginError}</p>
                  </div>
                </div>
              )}

              <Field>
                <FieldLabel htmlFor="password">管理密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="输入管理密码"
                  className={cn(
                    "h-11",
                    loginError && !isBlocked && "border-red-500 focus-visible:ring-red-500"
                  )}
                  autoFocus
                  disabled={isDisabled}
                  {...form.register("password", {
                    onChange: () => {
                      if (loginError && !isBlocked) setLoginError(null)
                    }
                  })}
                />
                {form.formState.errors.password && (
                  <FieldError>
                    {form.formState.errors.password.message}
                  </FieldError>
                )}
                {loginError && !isBlocked && (
                  <FieldError>{loginError}</FieldError>
                )}
              </Field>
              <Field>
                <Button type="submit" className="h-11" disabled={isDisabled}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    "登录"
                  )}
                </Button>
              </Field>
              {linuxDoOAuthEnabled ? (
                <>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    或
                  </FieldSeparator>
                  <Field>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={isDisabled}
                      onClick={handleLinuxDoLogin}
                    >
                      {isOAuthLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          跳转中...
                        </>
                      ) : (
                        <>
                          <LinuxDoLogo className="mr-2 h-4 w-4" />
                          使用 Linux DO 账号登录
                        </>
                      )}
                    </Button>
                  </Field>
                </>
              ) : null}
              <FieldDescription className="text-center text-muted-foreground">
                仅限管理员账号登录后台管理系统
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
