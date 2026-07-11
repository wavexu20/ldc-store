# Cloudflare Workers 部署

本分支使用 `@opennextjs/cloudflare` 将 Next.js 16 部署到 Workers。前端、App Router、Server Actions、ISR 和 Route Handlers 均保留。数据库第一阶段继续使用 PostgreSQL，因为发卡库存和余额账本依赖事务与行锁；可直接连接 Neon/Supabase，也可在生产环境配置 Cloudflare Hyperdrive。

## 1. 数据库迁移

在本机或 CI 中设置 `DATABASE_URL` 后执行：

```bash
pnpm install
pnpm db:migrate
```

迁移 `0006_silly_molten_man.sql` 会新增统一用户、OAuth 账号、充值单和钱包流水，并为订单支付方式加入 `balance`；`0007_outstanding_prima.sql` 新增邮箱验证码表。

## 2. OAuth 回调地址

在各平台登记以下回调（将域名替换为实际域名）：

```text
https://game3dtech.com/api/auth/callback/google
https://game3dtech.com/api/auth/callback/github
https://game3dtech.com/api/auth/callback/linux-do
```

未配置 Client ID/Secret 的 OAuth 按钮不会显示。Email 注册不依赖 OAuth。

## 3. Cloudflare Email Service

Email 注册使用 Wrangler 的 `EMAIL` Send Binding 发送 6 位验证码，未完成验证的 Email 账号不能登录。生产环境需要：

1. 在 Cloudflare `Compute > Email Service > Email Sending` 中接入发件域名。
2. 按 Cloudflare 提示完成 SPF/DKIM 等 DNS 验证。
3. 确认账户已开通 Email Sending（向任意用户发送事务邮件需要 Workers Paid 计划）。
4. 发件地址已配置为 `noreply@game3dtech.com`。

`wrangler.jsonc` 已配置：

```jsonc
"send_email": [{ "name": "EMAIL" }]
```

`EMAIL_FROM` 是公开发件地址，已作为 Wrangler 普通变量保存，不需要作为 Secret。

## 4. 本地 Workers 预览

Email 注册同时启用了 Cloudflare Turnstile。请在 Cloudflare 控制台创建 Managed Widget，并将 `game3dtech.com` 加入允许的 Hostname：

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY="公开的 Site Key"
TURNSTILE_SECRET_KEY="服务端 Secret Key"
```

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 必须同时配置为 Workers Builds 的构建变量，因为 Next.js 会在构建期将它写入注册页面；`TURNSTILE_SECRET_KEY` 必须使用 Secret：

```bash
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

注册提交会在服务端调用 Cloudflare Siteverify，并校验 `action=register`。Turnstile Token 只能使用一次且 5 分钟后过期，失败后前端会重新生成挑战。

复制 `.dev.vars.example` 为 `.dev.vars` 并填写密钥，然后运行：

```bash
pnpm preview
```

普通界面开发仍可使用 `pnpm dev`。涉及运行时兼容性的改动必须用 `pnpm preview` 再验证一次。

## 5. 生产密钥

至少配置以下 Workers secrets：

```bash
pnpm wrangler secret put DATABASE_URL
pnpm wrangler secret put AUTH_SECRET
pnpm wrangler secret put ADMIN_PASSWORD
pnpm wrangler secret put LDC_CLIENT_ID
pnpm wrangler secret put LDC_CLIENT_SECRET
```

按需继续写入 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`LINUXDO_CLIENT_ID` 和 `LINUXDO_CLIENT_SECRET`。

如果使用 Hyperdrive，在 `wrangler.jsonc` 增加：

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "your-hyperdrive-config-id"
  }
]
```

代码会优先使用 `HYPERDRIVE.connectionString`，否则回退到 `DATABASE_URL`。数据库客户端按请求创建，连接池上限为 1，并设置极短生命周期，避免 Workers 跨请求复用 TCP 连接。

## 6. 支付与充值回调

Linux DO Credit 的 Notify URL 仍为：

```text
https://game3dtech.com/api/payment/notify
```

商品订单号使用 `LD` 前缀，余额充值单使用 `RC` 前缀。回调统一校验商户号、金额和 MD5 签名；充值通过唯一幂等键写入钱包流水，支付平台重复通知不会重复增加余额。

## 7. 部署

```bash
pnpm deploy
```

发布前建议依次运行：

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
pnpm preview
```

## 授权提醒

上游仓库当前没有附带 `LICENSE` 文件。没有明确许可证并不等于可任意复制或再发布。对外商用或公开分发前，应取得上游作者授权，或只保留经过独立重写的界面结构与交互思路，并替换原项目的图片、品牌和代码资产。
