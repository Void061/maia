import Link from "next/link";

export function Field({
  label,
  type = "text",
  name,
  autoComplete,
}: {
  label: string;
  type?: string;
  name: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={label}
        autoComplete={autoComplete}
        className="focusable h-14 w-full rounded-xl bg-surface px-4 text-lg text-label placeholder:text-faint"
      />
    </label>
  );
}

// Pill buttons, tvOS style: primary is solid white; secondary is translucent
// and turns white when focused.
const variants = {
  primary: "bg-accent text-canvas font-semibold",
  secondary: "glass text-label font-medium pill-focus",
  quiet: "text-muted hover:text-label",
};

const shape =
  "focusable inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-base sm:h-14 sm:px-8 sm:text-lg";

export function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type={type} onClick={onClick} className={`${shape} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link href={href} className={`${shape} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
