# Cloudflare Workers 部署

本项目使用 `@opennextjs/cloudflare` 在 Workers 上运行 Next.js 16，并使用 Cloudflare D1、Email Service 与 Turnstile。发卡库存、余额扣款、充值与退款通过 D1 Batch 和条件 SQL 原子提交，不依赖 PostgreSQL 或外部数据库。

## 1. D1 数据库

`wrangler.jsonc` 中的 `DB` Binding 已指向生产 D1。首次部署或新增迁移时执行：

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
```

本地 Workers 预览使用独立的本地 D1：

```bash
pnpm db:migrate:local
pnpm exec wrangler d1 execute ldc-store-production --local --file lib/db/d1-seed.sql
pnpm preview
```

## 2. OAuth 回调地址

在各平台登记：

```text
https://game3dtech.com/api/auth/callback/google
https://game3dtech.com/api/auth/callback/github
https://game3dtech.com/api/auth/callback/linux-do
```

未配置 Client ID/Secret 的 OAuth 按钮不会显示。Email 注册不依赖 OAuth。

## 3. Email Service 与 Turnstile

Email 注册通过 `EMAIL` Send Binding 发送验证码。Cloudflare 账户必须先完成 Email Sending onboarding，并验证 `game3dtech.com` 发件域名；默认发件地址是 `noreply@game3dtech.com`。

注册页使用 Managed Turnstile Widget。公开的 Site Key 需要作为构建变量与 Worker 普通变量提供，Secret Key 必须保存为 Worker Secret：

```bash
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

注册提交会在服务端校验 Turnstile 的 `action=register`。Token 只能使用一次且会过期，失败后页面会重新生成挑战。

## 4. 生产密钥

部署基础功能至少需要：

```bash
pnpm wrangler secret put AUTH_SECRET
pnpm wrangler secret put ADMIN_PASSWORD
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

支付与充值启用时再配置 `LDC_CLIENT_ID`、`LDC_CLIENT_SECRET`；OAuth 按需配置 `GOOGLE_*`、`GITHUB_*`、`LINUXDO_*`。所有 Secret 只能放在 Worker Secrets，不能在后台页面或 Git 仓库中保存。

## 5. 支付与充值回调

Linux DO Credit Notify URL：

```text
https://game3dtech.com/api/payment/notify
```

商品订单号使用 `LD` 前缀，余额充值单使用 `RC` 前缀。回调会校验商户号、金额与签名，并通过唯一幂等键防止重复入账。

## 6. 验证与部署

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm lint
pnpm deploy
```

部署完成后需验证首页、Email 注册/验证、三种 OAuth 登录、余额充值、余额下单、卡密交付、退款与后台管理。

## 授权提醒

上游仓库没有附带 `LICENSE` 文件。对外商用或公开分发前，应取得作者授权，或只保留独立重写的界面结构与交互思路，并替换原项目品牌和资产。
