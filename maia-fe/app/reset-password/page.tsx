import { Suspense } from "react";
import AuthFrame from "@/components/auth-frame";
import ResetPassword from "./reset-password";

export const metadata = { title: "Nuova password · MAIA" };

export default function Page() {
  return (
    <AuthFrame>
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    </AuthFrame>
  );
}
