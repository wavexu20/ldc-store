import { cn } from "@/lib/utils";
import type { MembershipTier } from "@/lib/membership";

type MembershipTierBadgeProps = {
  tier: MembershipTier["key"];
  className?: string;
};

/** A compact, tier-specific crest designed to stay recognizable at card and avatar sizes. */
export function MembershipTierBadge({ tier, className }: MembershipTierBadgeProps) {
  const common = { className: cn("shrink-0", className), viewBox: "0 0 32 32", fill: "none", "aria-hidden": true };

  if (tier === "starter") return <svg {...common}>
    <defs><linearGradient id="black-iron" x1="5" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#F3D0A5" /><stop offset=".45" stopColor="#B47645" /><stop offset="1" stopColor="#623C24" /></linearGradient></defs>
    <path d="M16 2.75 25 6v7.24c0 6.4-3.8 12.17-9 15.01-5.2-2.84-9-8.61-9-15.01V6l9-3.25Z" fill="url(#black-iron)" />
    <path d="M16 5.2 22.7 7.6v5.63c0 4.87-2.76 9.22-6.7 11.68-3.94-2.46-6.7-6.81-6.7-11.68V7.6L16 5.2Z" stroke="#281A12" strokeWidth="1.35" />
    <path d="m10.8 14.1 5.2-3.1 5.2 3.1-5.2 3.08-5.2-3.08Zm0 3.8L16 21l5.2-3.1" stroke="#FFF1DF" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;

  if (tier === "silver") return <svg {...common}>
    <defs><linearGradient id="silver-tier" x1="5" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF" /><stop offset=".45" stopColor="#CBD5E1" /><stop offset="1" stopColor="#64748B" /></linearGradient></defs>
    <path d="M16 3.25 25.5 8.7v10.6L16 28.75 6.5 19.3V8.7L16 3.25Z" fill="url(#silver-tier)" />
    <path d="m16 7.3 5.7 3.28v6.84L16 22.7l-5.7-5.28v-6.84L16 7.3Z" stroke="#334155" strokeWidth="1.35" />
    <path d="m16 9.7 1.32 3.32 3.56.21-2.74 2.28.88 3.47L16 17.1l-3.02 1.88.88-3.47-2.74-2.28 3.56-.21L16 9.7Z" fill="#F8FAFC" stroke="#64748B" strokeWidth=".7" strokeLinejoin="round" />
  </svg>;

  if (tier === "gold") return <svg {...common}>
    <defs><linearGradient id="gold-tier" x1="5" y1="3" x2="25" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF1A6" /><stop offset=".48" stopColor="#EAB308" /><stop offset="1" stopColor="#A16207" /></linearGradient></defs>
    <path d="M5 9.1 9.5 6l3.3 4.25L16 4.4l3.2 5.85L22.5 6 27 9.1l-2.35 12.2H7.35L5 9.1Z" fill="url(#gold-tier)" />
    <path d="M8.4 21.3h15.2v4.05H8.4z" fill="#FDE68A" stroke="#92400E" strokeWidth="1.2" />
    <path d="M9.2 13.4h13.6M16 9.5v8.3" stroke="#FFF8D3" strokeWidth="1.25" strokeLinecap="round" />
    <circle cx="16" cy="13.65" r="1.75" fill="#FDE68A" stroke="#92400E" strokeWidth=".8" />
  </svg>;

  return <svg {...common}>
    <defs><linearGradient id="obsidian-tier" x1="7" y1="3" x2="25" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#D8B4FE" /><stop offset=".45" stopColor="#7C3AED" /><stop offset="1" stopColor="#1E1B4B" /></linearGradient></defs>
    <path d="m16 2.7 10.1 8.12-3.86 13.06H9.76L5.9 10.82 16 2.7Z" fill="url(#obsidian-tier)" />
    <path d="m16 6.05 6.4 5.13-2.44 8.28h-7.92l-2.44-8.28L16 6.05Z" stroke="#F5F3FF" strokeOpacity=".8" strokeWidth="1.25" />
    <path d="m16 8.65 1.17 3.25 3.06.1-2.39 1.91.84 3.05L16 15.2l-2.68 1.76.84-3.05-2.39-1.91 3.06-.1L16 8.65Z" fill="#FFF" />
    <path d="m16 20.8 3.05-3.05M16 20.8l-3.05-3.05" stroke="#C4B5FD" strokeWidth="1.15" strokeLinecap="round" />
  </svg>;
}
