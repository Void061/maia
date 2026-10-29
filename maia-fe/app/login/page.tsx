import AuthFrame from "@/components/auth-frame";
import LoginForm from "./login-form";

export const metadata = { title: "Accedi · MAIA" };

export default function LoginPage() {
  return (
    <AuthFrame>
      <LoginForm />
    </AuthFrame>
  );
}
