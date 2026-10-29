// Wordmark: "maia" set in the display face, with the dot of the i as a lit lamp.
export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl" }[size];
  return (
    <span className={`font-display font-bold tracking-tight ${text} relative inline-flex items-baseline`}>
      ma
      <span className="relative">
        ı
        <span
          aria-hidden
          className="absolute left-1/2 top-[0.12em] size-[0.2em] -translate-x-1/2 rounded-full bg-lamp shadow-[0_0_0.5em_0.15em_rgb(245_184_86/0.7)]"
        />
      </span>
      a
    </span>
  );
}
