import AuthFrame from "@/components/auth-frame";
import ForgotPassword from "./forgot-password";

export const metadata = { title: "Password dimenticata · MAIA" };

export default function Page() {
  return (
    <AuthFrame>
      <ForgotPassword />
    </AuthFrame>
  );
}
