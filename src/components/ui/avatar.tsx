import { initials } from "@/lib/format";

export type AvatarUser = { id: string; name: string; image: string | null; isBot?: boolean };

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-20 text-2xl",
  "2xl": "size-28 text-3xl",
} as const;

function hueFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Claude's player token. CSS gradient (no SVG ids) so it renders anywhere, any number of times. */
export function ClaudeGlyph({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block size-full overflow-hidden rounded-full ${className}`}
      style={{ background: "radial-gradient(90% 90% at 35% 30%, #f6a27f, #c9603c)" }}
    >
      <svg viewBox="0 0 32 32" className="block size-full">
        <path d="M16 6.5c.6 4.6 2.9 6.9 9.5 9.5-6.6 2.6-8.9 4.9-9.5 9.5-.6-4.6-2.9-6.9-9.5-9.5 6.6-2.6 8.9-4.9 9.5-9.5Z" fill="#fff7f2" />
      </svg>
    </span>
  );
}

export function Avatar({
  user,
  size = "md",
  ring = false,
  className = "",
}: {
  user: AvatarUser;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  const ringCls = ring ? "ring-2 ring-ink-900" : "";
  if (user.isBot || user.id === "claude") {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full ${SIZES[size]} ${ringCls} ${className}`} title="Claude">
        <ClaudeGlyph />
      </span>
    );
  }
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Google avatars; no optimisation needed
      <img
        src={user.image}
        alt={user.name}
        title={user.name}
        referrerPolicy="no-referrer"
        className={`inline-block shrink-0 rounded-full bg-ink-700 object-cover ${SIZES[size]} ${ringCls} ${className}`}
      />
    );
  }
  const h = hueFor(user.id);
  return (
    <span
      title={user.name}
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white/95 ${SIZES[size]} ${ringCls} ${className}`}
      style={{
        background: `linear-gradient(135deg, oklch(0.68 0.15 ${h}), oklch(0.5 0.17 ${(h + 50) % 360}))`,
      }}
    >
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = "sm",
}: {
  users: AvatarUser[];
  max?: number;
  size?: "xs" | "sm" | "md";
}) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <span key={u.id} className={i === 0 ? "" : size === "xs" ? "-ml-1.5" : "-ml-2"}>
          <Avatar user={u} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`-ml-2 inline-grid place-items-center rounded-full bg-ink-700 font-semibold text-soft ring-2 ring-ink-900 ${SIZES[size]}`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
