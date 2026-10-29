import Link from "next/link";

export function Field({
  label,
  type = "text",
  name,
  autoComplete,
  defaultValue,
  value,
  onChange,
  required,
  minLength,
  maxLength,
  readOnly,
}: {
  label: string;
  type?: string;
  name: string;
  autoComplete?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        readOnly={readOnly}
        className="focusable h-14 w-full rounded-xl bg-white/[0.08] px-4 text-lg text-label placeholder:text-faint read-only:bg-white/[0.04] read-only:text-muted"
      />
    </label>
  );
}

// Error or confirmation under a form, announced to screen readers.
export function Notice({ tone = "error", children }: { tone?: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-base ${tone === "error" ? "bg-[#3a1d1d] text-[#ffb4b4]" : "bg-[#18301f] text-[#a8e6b8]"}`}
    >
      {children}
    </p>
  );
}

// Pill buttons, tvOS style: primary is solid white; secondary is translucent
// and turns white when focused.
const variants = {
  primary: "bg-accent text-canvas font-semibold disabled:opacity-60",
  // Translucent white, so it reads both on black and inside grey cards.
  secondary: "bg-white/[0.14] text-label font-medium pill-focus backdrop-blur-md",
  quiet: "text-muted hover:text-label",
  danger: "bg-[#3a1d1d] text-[#ffb4b4] font-semibold pill-focus",
};

const shape =
  "focusable inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-base sm:h-14 sm:px-8 sm:text-lg";

export function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${shape} ${variants[variant]} ${className}`}>
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

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="focusable rounded text-label underline underline-offset-4">
      {children}
    </Link>
  );
}
