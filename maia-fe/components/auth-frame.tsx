import Logo from "./logo";

// Shared frame for login, sign-up and account-status screens: one centred
// column on the night wash, the wordmark above it.
export default function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="night flex min-h-dvh flex-col items-center justify-center px-6 py-14">
      <Logo size="md" />
      <div className="mt-10 w-full max-w-md">{children}</div>
    </main>
  );
}
