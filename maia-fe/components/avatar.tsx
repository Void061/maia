import type { Profile } from "@/lib/mock";

// Profile avatar: the initial on a soft colour field derived from the
// profile's hue, so every profile is recognisable at a glance from the sofa.
export default function Avatar({ profile, size = 160 }: { profile: Profile; size?: number }) {
  const h = profile.hue;
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-[28%] font-display font-bold text-ink"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `radial-gradient(circle at 30% 25%, hsl(${h} 90% 82%), hsl(${h} 65% 58%) 70%)`,
      }}
    >
      {profile.name[0]}
    </span>
  );
}
