import { Suspense } from "react";
import AuthFrame from "@/components/auth-frame";
import VerifyEmail from "./verify-email";

export const metadata = { title: "Conferma email · MAIA" };

export default function Page() {
  return (
    <AuthFrame>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthFrame>
  );
}
