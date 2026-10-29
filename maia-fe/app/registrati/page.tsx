import AuthFrame from "@/components/auth-frame";
import SignupForm from "./signup-form";

export const metadata = { title: "Registrati · MAIA" };

export default function SignupPage() {
  return (
    <AuthFrame>
      <SignupForm />
    </AuthFrame>
  );
}
