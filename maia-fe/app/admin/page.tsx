import { Suspense } from "react";
import AdminPanel from "./admin-panel";

export const metadata = { title: "Amministrazione · MAIA" };

// The open tab lives in the URL (?tab=services), read with useSearchParams:
// Cache Components wants that inside a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={<main className="night min-h-dvh" />}>
      <AdminPanel />
    </Suspense>
  );
}
