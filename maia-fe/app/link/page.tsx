import { Suspense } from "react";
import AuthFrame from "@/components/auth-frame";
import LinkForm from "./link-form";

export const metadata = { title: "Accedi sulla TV · MAIA" };

export default function LinkPage() {
  return (
    <AuthFrame>
      <Suspense>
        <LinkForm />
      </Suspense>
    </AuthFrame>
  );
}
