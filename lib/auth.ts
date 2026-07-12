import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import HuggingFace from "next-auth/providers/huggingface";
import { compare } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, oauthAccounts, users } from "@/lib/db";
import { verifySteamTicket } from "@/lib/auth/steam";
import { createMemberNo } from "@/lib/membership";
import { isPlaceholderEmail } from "@/lib/email-address";
import { beginSecondFactorLogin } from "@/lib/security/two-factor-session";

const adminLoginSchema = z.object({ password: z.string().min(1) });
const emailLoginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

function getAdminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

const LinuxDoProvider = {
  id: "linux-do",
  name: "Linux DO",
  type: "oauth" as const,
  authorization: {
    url: process.env.LINUXDO_AUTHORIZATION_URL || "https://connect.linux.do/oauth2/authorize",
    params: { scope: "user" },
  },
  token: { url: process.env.LINUXDO_TOKEN_URL || "https://connect.linux.do/oauth2/token" },
  userinfo: { url: process.env.LINUXDO_USERINFO_URL || "https://connect.linux.do/api/user" },
  clientId: process.env.LINUXDO_CLIENT_ID,
  clientSecret: process.env.LINUXDO_CLIENT_SECRET,
  profile(profile: {
    id: number;
    username: string;
    name?: string;
    avatar_template?: string;
    active?: boolean;
    trust_level?: number;
    silenced?: boolean;
  }) {
    const username = profile.username.toLowerCase();
    return {
      id: String(profile.id),
      name: profile.name || profile.username,
      email: null,
      image: profile.avatar_template?.replace("{size}", "120"),
      username: profile.username,
      trustLevel: profile.trust_level,
      active: profile.active,
      silenced: profile.silenced,
    };
  },
};

type AuthUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  username?: string;
  role?: "user" | "admin";
  provider?: string;
  trustLevel?: number;
  active?: boolean;
  silenced?: boolean;
};

export async function resolveOAuthUser(
  user: AuthUser,
  provider: string,
  providerAccountId: string
) {
  const existingAccount = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, provider),
      eq(oauthAccounts.providerAccountId, providerAccountId)
    ),
    with: { user: true },
  });

  if (existingAccount) {
    const providerEmail = user.email && !isPlaceholderEmail(user.email) ? user.email.toLowerCase() : null;
    const emailOwner = providerEmail
      ? await db.query.users.findFirst({ where: eq(users.email, providerEmail), columns: { id: true } })
      : null;
    const mayAdoptEmail = Boolean(providerEmail && isPlaceholderEmail(existingAccount.user.email) && (!emailOwner || emailOwner.id === existingAccount.user.id));
    const shouldSyncName = existingAccount.user.nameSource !== "custom";
    const shouldSyncAvatar = existingAccount.user.avatarSource !== "custom";
    await db.update(users).set({
      name: shouldSyncName ? user.name || existingAccount.user.name : existingAccount.user.name,
      image: shouldSyncAvatar ? user.image || existingAccount.user.image : existingAccount.user.image,
      nameSource: shouldSyncName && user.name ? "oauth" : existingAccount.user.nameSource,
      avatarSource: shouldSyncAvatar && user.image ? "oauth" : existingAccount.user.avatarSource,
      ...(mayAdoptEmail ? { email: providerEmail!, emailVerifiedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, existingAccount.user.id));
    return { ...existingAccount.user, ...(mayAdoptEmail ? { email: providerEmail!, emailVerifiedAt: new Date() } : {}) };
  }

  const providerEmail = user.email && !isPlaceholderEmail(user.email) ? user.email.toLowerCase() : null;
  const email = providerEmail || `${provider}-${providerAccountId}@oauth.local`;
  let localUser = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (!localUser) {
    const id = crypto.randomUUID();
    const [created] = await db.insert(users).values({
      id,
      email,
      name: user.name,
      image: user.image,
      nameSource: "oauth",
      avatarSource: "oauth",
      memberNo: createMemberNo(id),
      emailVerifiedAt: providerEmail ? new Date() : null,
    }).onConflictDoNothing({ target: users.email }).returning();
    localUser = created || await db.query.users.findFirst({ where: eq(users.email, email) });
  }

  if (!localUser) throw new Error("无法创建本地用户");

  await db.insert(oauthAccounts).values({
    userId: localUser.id,
    provider,
    providerAccountId,
    username: user.username,
  }).onConflictDoNothing();

  return localUser;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? [Discord({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET })]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
    ...(process.env.HUGGINGFACE_CLIENT_ID && process.env.HUGGINGFACE_CLIENT_SECRET
      ? [HuggingFace({
          clientId: process.env.HUGGINGFACE_CLIENT_ID,
          clientSecret: process.env.HUGGINGFACE_CLIENT_SECRET,
          authorization: { params: { scope: "openid profile email" } },
        })]
      : []),
    ...(process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET ? [LinuxDoProvider] : []),
    ...(process.env.STEAM_WEB_API_KEY && process.env.AUTH_SECRET
      ? [Credentials({
          id: "steam",
          name: "Steam",
          credentials: { ticket: { label: "Steam ticket", type: "text" } },
          async authorize(credentials) {
            const ticket = typeof credentials.ticket === "string"
              ? await verifySteamTicket(credentials.ticket, process.env.AUTH_SECRET || "")
              : null;
            if (!ticket) return null;
            const localUser = await resolveOAuthUser({
              name: ticket.name,
              image: ticket.image,
              username: ticket.name,
            }, "steam", ticket.steamId);
            if (localUser.status !== "active") return null;
            return {
              id: localUser.id,
              email: localUser.email,
              name: localUser.name,
              image: localUser.image,
              role: localUser.role,
              provider: "steam",
            };
          },
        })]
      : []),
    Credentials({
      id: "email-password",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = emailLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const localUser = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });
        if (!localUser?.passwordHash || localUser.status !== "active" || !localUser.emailVerifiedAt) return null;
        if (!(await compare(parsed.data.password, localUser.passwordHash))) return null;
        return {
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          image: localUser.image,
          role: localUser.role,
          provider: "email-password",
        };
      },
    }),
    Credentials({
      id: "credentials",
      name: "Admin password",
      credentials: { password: { label: "密码", type: "password" } },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success || !process.env.ADMIN_PASSWORD) return null;
        if (parsed.data.password !== process.env.ADMIN_PASSWORD) return null;
        return {
          id: "admin",
          email: "admin@localhost",
          name: "管理员",
          role: "admin",
          provider: "credentials",
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.type === "credentials") return true;
      const authUser = user as AuthUser;
      const localUser = await resolveOAuthUser(authUser, account.provider, account.providerAccountId);
      authUser.id = localUser.id;
      authUser.role = localUser.role;
      authUser.provider = account.provider;
      if (account.provider === "linux-do" && authUser.username &&
          getAdminUsernames().includes(authUser.username.toLowerCase())) {
        authUser.role = "admin";
        await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, localUser.id));
      }
      return localUser.status === "active";
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        const authUser = user as AuthUser;
        token.id = authUser.id;
        token.sub = authUser.id;
        token.role = authUser.role || "user";
        token.provider = account?.provider || authUser.provider;
        token.username = authUser.username || user.name || user.email?.split("@")[0];
        token.trustLevel = authUser.trustLevel;
        token.active = authUser.active;
        token.silenced = authUser.silenced;
      }
      if (trigger === "update" && token.id && token.id !== "admin") {
        const current = await db.query.users.findFirst({ where: eq(users.id, token.id as string) });
      if (current) {
        token.email = current.email;
        token.name = current.name;
        token.picture = current.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id || token.sub) as string;
        session.user.email = (token.email || "") as string;
        const sessionUser = session.user as AuthUser;
        sessionUser.role = token.role as "user" | "admin";
        sessionUser.provider = token.provider as string;
        sessionUser.username = token.username as string;
        sessionUser.trustLevel = token.trustLevel as number;
        sessionUser.active = token.active as boolean;
        sessionUser.silenced = token.silenced as boolean;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id || user.id === "admin") return;
      const localUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { twoFactorEnabledAt: true },
      });
      if (localUser?.twoFactorEnabledAt) await beginSecondFactorLogin(user.id);
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
});
