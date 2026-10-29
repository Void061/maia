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
      <span className="mb-2 block text-sm text-moon">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        className="lamp h-14 w-full rounded-xl border border-line bg-ink/70 px-4 text-lg text-paper placeholder:text-moon/50 focus:border-transparent"
      />
    </label>
  );
}

const variants = {
  primary: "bg-lamp text-ink font-semibold hover:bg-[#ffc76b]",
  ghost: "border border-line text-paper hover:bg-haze",
  quiet: "text-moon hover:text-paper",
};

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
    <button
      type={type}
      onClick={onClick}
      className={`lamp inline-flex h-14 items-center justify-center gap-2 rounded-xl px-6 text-lg ${variants[variant]} ${className}`}
    >
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
    <Link
      href={href}
      className={`lamp inline-flex h-14 items-center justify-center gap-2 rounded-xl px-6 text-lg ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
