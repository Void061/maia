import type { Profile } from "@/lib/mock";

// Profile avatar: a circle with the initial on a soft gradient derived from
// the profile's hue, recognisable at a glance from the sofa.
export default function Avatar({ profile, size = 160 }: { profile: Profile; size?: number }) {
  const h = profile.hue;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(160deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 60% 38%))`,
      }}
    >
      {profile.name[0]}
    </span>
  );
}
