# LDC Store - Automated Card Delivery System

A virtual goods automated card delivery platform built on Next.js 16, supporting Linux DO Credit payments.

> 📖 [中文文档 README](./docs/README.zh-CN.md)

> ☁️ **Cloudflare deployment guide**: [docs/CLOUDFLARE.md](./docs/CLOUDFLARE.md)

## ✨ Features

### 🛒 Storefront
- **Product Display** - Grid layout product listings, category navigation, client-side category filtering (no page reload)
- **Product Details** - Markdown rich text support, popular tags, discount pricing, image carousel
- **Stock Status** - Real-time inventory count display, sales statistics
- **Announcement System** - Homepage announcement carousel banner (supports Markdown, scheduled publish/unpublish)
- **Full-Text Search** - Header search entry + results page filtering / multiple sort options / pagination
- **Restock Request** - Users can request restocking when out of stock, showing request count and recent requester avatars
- **Leaderboard** - TOP 50 customer spending leaderboard (`/leaderboard`), showing cumulative spending and order count
- **My Orders** - View personal order history, order details, card key information (`/order/my`)
- **Payment Receipt** - Generate shareable payment success receipts (`/order/receipt/:orderNo`), no sensitive info included
- **ISR Cache** - 60-second Incremental Static Regeneration for improved page load performance

### 🔐 Login & Permissions
- **User Accounts** - Email registration with verification and password policy, plus Google, GitHub and Linux DO OAuth2
- **Bot Protection** - Cloudflare Turnstile protects Email registration
- **Admin Panel** - Admin password login (`ADMIN_PASSWORD`), or configure `ADMIN_USERNAMES` to allow specific Linux DO usernames to log in as admin
- **Session Management** - JWT session strategy based on NextAuth v5

### 💳 Automated Card Delivery
- Uses the self-hosted Game3DTech Pay checkout (Stripe, ZPAY and NowPayments)
- Automatic card key delivery upon successful payment
- Auto-release of locked inventory on order timeout (lazy load + throttle strategy)
- Idempotent payment callback handling to prevent duplicate deliveries
- Card key locking, wallet debit and delivery use atomic Cloudflare D1 batches

### 🔄 Refund System
- Users can apply for refunds (with reason), reviewed by admin
- **Client Mode** (default): Bypasses CORS/CF restrictions via browser form submission (no proxy needed)
- **Proxy Mode**: Calls LDC Credit refund API via server-side proxy
- **Disabled Mode**: Refund feature can be turned off
- Automatic card key reclamation on successful refund (status restored to available)

### 📦 Inventory Management
- **Bulk Import** - Supports newline/comma-separated input, optional auto-deduplication
- **Duplicate Detection** - Input dedup + database dedup, import summary report
- **Stock Alerts** - Automatic alerts for products below threshold (default < 10)
- **Card Key Editing** - Modify card key content (available status only)
- **Bulk Delete** - Delete unsold card keys
- **Reset Locked** - Release card keys in locked status
- **Export** - Export card key list by status (CSV)
- **Clean Duplicates** - Automatically clean duplicate card keys (keeps earliest created)

### 📊 Admin Panel
- **Dashboard** - Today's sales/orders (day-over-day growth), to-dos, 7-day sales trend chart, recent orders, stock alerts
- **Product Management** - Create/edit/copy products, bulk publish/unpublish/delete, set price/original price, popular marking, purchase quantity limit, sort weight
- **Category Management** - Add/edit/delete categories, enable/disable, sort, product count stats
- **Order Management** - Order list, multi-dimensional filtering (status/payment method/search), order details, manual order completion, bulk delete, CSV export (up to 5,000 records)
- **Refund Review** - View refund application details, approve/reject refunds, admin notes
- **Card Key Management** - View inventory by product, bulk import/delete/export, status filtering
- **Announcement Management** - Add/edit/delete announcements, Markdown content, effective time range, enable/disable, sort
- **Customer Management** - Customer list, order count and cumulative spending stats
- **System Config** - Site name/description/icon, order expiration time, Telegram notification settings

### 🔔 Notification System
- **Telegram Notifications** - Real-time push for restock requests (product name, stock, requesting user, time)
- **Test Function** - Test Telegram configuration from the admin panel
- **Async Delivery** - Non-blocking, silent failure does not affect business flow

### 🎨 Modern UI
- Built on Shadcn/UI + Tailwind CSS v4
- Dark/light mode toggle
- Responsive design, mobile-friendly
- 30+ general-purpose UI components

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router, Server Actions)
- **Language:** TypeScript
- **Runtime:** Cloudflare Workers via OpenNext
- **Database:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle ORM
- **UI:** Shadcn/UI + Tailwind CSS
- **Auth:** NextAuth.js v5
- **Payment:** Game3DTech Pay hosted checkout

## 🚀 Deploy to Cloudflare Workers

1. Create a D1 database and update its ID in `wrangler.jsonc`.
2. Configure Worker Secrets described in [docs/CLOUDFLARE.md](./docs/CLOUDFLARE.md).
3. Run `pnpm db:migrate && pnpm db:seed`.
4. Run `pnpm deploy`.

## 📦 Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/gptkong/ldc-store.git
cd ldc-store
pnpm install
```

### 2. Configure Environment Variables

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# NextAuth secret (generate: openssl rand -base64 32)
AUTH_SECRET="your-auth-secret"
AUTH_TRUST_HOST=true

# Admin password
ADMIN_PASSWORD="your-admin-password"

# Admin username whitelist (optional, comma-separated; grants admin role on match)
ADMIN_USERNAMES="admin1,admin2"

# Game3DTech Pay
PAYMENT_GATEWAY_URL="https://pay.game3dtech.com"
PAYMENT_GATEWAY_APP_ID="game3dtech"
PAYMENT_GATEWAY_API_KEY="your_app_api_key"

# Linux DO OAuth2 login (required for user orders/queries)
LINUXDO_CLIENT_ID="your_linuxdo_client_id"
LINUXDO_CLIENT_SECRET="your_linuxdo_client_secret"

# Site name (optional, shown in header title and page titles)
NEXT_PUBLIC_SITE_NAME="LDC Store"

# Site description (optional, used for SEO)
NEXT_PUBLIC_SITE_DESCRIPTION="Virtual goods automated card delivery platform powered by Linux DO Credit"

# Order expiration time (minutes)
ORDER_EXPIRE_MINUTES=5

# Stats timezone (optional, default Asia/Shanghai / UTC+8)
# Used for the day boundary in "Today's Sales" and similar dashboard stats
STATS_TIMEZONE="Asia/Shanghai"
```

### 3. Initialize the Database

```bash
# New database: run migrations to create schema
pnpm db:migrate

# Seed example data (optional)
pnpm db:seed
```

### 4. Start the Development Server

```bash
pnpm dev
```

Visit:
- Storefront: http://localhost:3000
- Admin panel: http://localhost:3000/admin

### 5. Testing (Optional)

```bash
pnpm test
pnpm test:coverage
```

More testing info and coverage baseline thresholds: `docs/TESTING_PLAN.md` (CI uploads `coverage/` artifacts; open `coverage/index.html` locally to view the report)

### Admin Login

Visit `/admin`:
- Password login: enter `ADMIN_PASSWORD`
- Linux DO login (optional): configure `ADMIN_USERNAMES` to allow whitelisted users to log in as admin

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | ✅ | - | NextAuth encryption key (run `openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | ✅ | `true` | Trust host header (must be true for Vercel) |
| `ADMIN_PASSWORD` | ✅ | - | Admin login password |
| `PAYMENT_GATEWAY_URL` | ✅ | `https://pay.game3dtech.com` | Hosted payment gateway URL |
| `PAYMENT_GATEWAY_APP_ID` | ✅ | `game3dtech` | Dedicated gateway application ID |
| `PAYMENT_GATEWAY_API_KEY` | ✅ | - | Dedicated gateway application secret |
| `LDC_CLIENT_ID` | ❌ | - | Legacy Linux DO Credit Client ID |
| `LDC_CLIENT_SECRET` | ❌ | - | Legacy Linux DO Credit Client Secret |
| `LDC_GATEWAY` | ❌ | `https://credit.linux.do/epay` | Payment gateway URL |
| `LDC_REFUND_MODE` | ❌ | `client` | Refund mode: `client` / `proxy` / `disabled` |
| `LDC_PROXY_URL` | ❌ | - | LDC API proxy URL (proxy mode, bypasses Cloudflare) |
| `ADMIN_USERNAMES` | ❌ | - | Linux DO admin username whitelist (comma-separated), grants `admin` role |
| `LINUXDO_CLIENT_ID` | ✅ | - | Linux DO OAuth2 Client ID (required for user orders/queries) |
| `LINUXDO_CLIENT_SECRET` | ✅ | - | Linux DO OAuth2 Client Secret (required for user orders/queries) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ❌ | - | Google OAuth credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | ❌ | - | GitHub OAuth credentials |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | ❌ | - | Discord OAuth credentials |
| `STEAM_WEB_API_KEY` | ❌ | - | Steam Web API key used after OpenID verification |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ✅ | - | Public Turnstile widget key |
| `TURNSTILE_SECRET_KEY` | ✅ | - | Turnstile server-side secret |
| `EMAIL_FROM` | ✅ | - | Sender onboarded in Cloudflare Email Service |
| `LINUXDO_AUTHORIZATION_URL` | ❌ | - | Custom OAuth2 authorization endpoint |
| `LINUXDO_TOKEN_URL` | ❌ | - | Custom OAuth2 token endpoint |
| `LINUXDO_USERINFO_URL` | ❌ | - | Custom OAuth2 user info endpoint |
| `NEXT_PUBLIC_SITE_NAME` | ❌ | - | Site name (shown in header and page titles) |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | ❌ | - | Site description (for SEO) |
| `ORDER_EXPIRE_MINUTES` | ❌ | `5` | Order expiration time (minutes) |
| `STATS_TIMEZONE` | ❌ | `Asia/Shanghai` | Stats timezone for "today" reports (IANA timezone name recommended) |

### 🕒 Time & Statistics

- D1 stores timestamps as Unix seconds with UTC semantics
- Frontend displays times in the user's local browser timezone (e.g., order list timestamps)
- "Today" dashboard stats use the day boundary defined by `STATS_TIMEZONE`, defaulting to China time (`Asia/Shanghai`)

## 📝 Linux DO Credit Configuration

1. Visit the [Linux DO Credit Console](https://credit.linux.do)
2. Create a new application to get your `pid` and `key`
3. Configure callback addresses:
   - **Notify URL:** `https://your-domain.com/api/payment/notify`
   - **Return URL:** `https://your-domain.com/order/result`

## 🔄 Refund Configuration

Because the Linux DO Credit API is protected by Cloudflare, direct server-side calls from Vercel and similar hosts will be blocked. This project supports two refund modes:

### Refund Modes

| Mode | Environment Variable | Description |
|------|---------------------|-------------|
| **Client Mode** | `LDC_REFUND_MODE=client` (default) | Bypasses CORS/CF via browser form submission, no proxy needed |
| **Proxy Mode** | `LDC_REFUND_MODE=proxy` + `LDC_PROXY_URL` | Calls LDC API via server-side proxy |
| **Disabled** | `LDC_REFUND_MODE=disabled` | Disables the refund feature |

### Client Mode (Recommended)

Enabled by default, no extra configuration needed. How it works:

1. Admin clicks "Approve Refund", which opens a new window
2. The new window POSTs to the LDC API via an HTML form (form submission is not subject to CORS restrictions)
3. The window displays the LDC API response
4. After admin confirms the refund, the system updates the order status

> 💡 **Tip**: If you encounter a Cloudflare challenge, the admin should first visit `credit.linux.do` in the browser to pass verification, then retry the refund.

### Proxy Mode (Optional)

If client mode doesn't meet your needs, you can configure a proxy service:

1. Deploy [gin-flaresolverr-proxy](https://github.com/gptkong/gin-flaresolverr-proxy)
2. Configure the environment variables:

```env
LDC_REFUND_MODE=proxy
LDC_PROXY_URL="https://your-proxy-domain.com/api"
```

> ⚠️ **Note**: Proxy functionality may break if the Linux DO Credit API changes. Monitor the upstream repository for updates.

## 🔑 Linux DO OAuth2 Login Configuration

Users must log in with a Linux DO account (OAuth2) to place or view orders.

### Apply for Access

1. Visit the [Linux DO Connect](https://connect.linux.do) console
2. Click **My App Integrations** → **Apply for New Integration**
3. Fill in app information; set **Callback URL** to: `https://your-domain.com/api/auth/callback/linux-do`
4. After approval, obtain your `Client ID` and `Client Secret`

### Environment Variables

Add to `.env`:

```env
LINUXDO_CLIENT_ID="your_client_id"
LINUXDO_CLIENT_SECRET="your_client_secret"
```

### Available User Fields

| Field | Description |
|-------|-------------|
| `id` | Unique user identifier (immutable) |
| `username` | Forum username |
| `name` | Forum display name (mutable) |
| `avatar_template` | User avatar template URL (multiple sizes supported) |
| `active` | Account active status |
| `trust_level` | Trust level (0–4) |
| `silenced` | Silenced status |

### OAuth2 Endpoints (Defaults, usually no change needed)

| Endpoint | URL |
|----------|-----|
| Authorization | `https://connect.linux.do/oauth2/authorize` |
| Token | `https://connect.linux.do/oauth2/token` |
| User Info | `https://connect.linux.do/api/user` |

To customize endpoints, configure:
- `LINUXDO_AUTHORIZATION_URL`
- `LINUXDO_TOKEN_URL`
- `LINUXDO_USERINFO_URL`

## 📁 Project Structure

```
ldc-store/
├── app/
│   ├── (store)/          # Storefront
│   ├── (admin)/          # Admin panel
│   └── api/              # API routes
├── components/
│   ├── ui/               # Shadcn UI
│   ├── store/            # Storefront components
│   └── admin/            # Admin components
├── lib/
│   ├── db/               # Database config
│   ├── actions/          # Server Actions
│   ├── payment/          # Payment integration
│   └── validations/      # Zod validations
└── ...
```

## 🗃️ Database Commands

```bash
# Generate migration files
pnpm db:generate

# Baseline existing database (use when you previously used db:push with no migration history)
pnpm db:baseline

# Push schema (not recommended; bypasses migration history, may break future migrates)
pnpm db:push

# Run migrations (recommended for new and production databases)
pnpm db:migrate

# Open database visualization tool
pnpm db:studio

# Seed example data
pnpm db:seed

# Reset database (DANGEROUS!)
pnpm db:reset
```

## 🖼️ Brand Icon & Favicon

The repository includes a generation script: provide a **square PNG** and it outputs brand icons and `favicon.ico`:

- Output: `public/ldc-mart.png`, `app/favicon.ico`
- Dependency: `sharp` (declared in devDependencies)

```bash
# Use a custom input image (square PNG)
pnpm tsx scripts/generate-favicon.ts path/to/icon.png

# Without an argument, tries to use the built-in image (e.g. public/ldc-mart.png)
pnpm tsx scripts/generate-favicon.ts
```

## 📄 License

MIT
