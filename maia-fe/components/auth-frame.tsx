import Logo from "./logo";

// Shared frame for login, sign-up and account-status screens: the wordmark
// on the left (top on phones), the form on the right, a single lamp glow behind.
export default function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh overflow-hidden lg:grid-cols-[1fr_minmax(0,32rem)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-1/3 size-[42rem] rounded-full bg-lamp/10 blur-[120px]"
      />
      <section className="relative flex flex-col justify-between gap-10 px-6 pt-10 sm:px-12 lg:py-14">
        <Logo size="md" />
        <p className="hidden max-w-md font-display text-5xl leading-[1.05] font-semibold text-paper/90 lg:block">
          Tutto quello che guardate in casa, in un posto solo.
        </p>
      </section>
      <section className="relative flex items-center px-6 pb-12 pt-6 sm:px-12 lg:bg-dusk/60 lg:py-14">
        <div className="w-full">{children}</div>
      </section>
    </main>
  );
}
