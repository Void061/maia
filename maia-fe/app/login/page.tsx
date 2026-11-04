import AuthFrame from "@/components/auth-frame";
import LoginEntry from "./login-entry";

export const metadata = { title: "Accedi · MAIA" };

export default function LoginPage() {
  return (
    <AuthFrame>
      <LoginEntry />
    </AuthFrame>
  );
}
