// Wordmark: "maia" in tight bold type, filled with the blue→violet brand gradient.
export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl" }[size];
  return (
    <span
      className={`font-display font-extrabold ${text} bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent`}
      style={{ letterSpacing: "-0.05em" }}
    >
      maia
    </span>
  );
}
