"use client";

import { useState } from "react";
import { useMouse, useTv } from "@/lib/tv-device";
import LoginForm from "./login-form";
import PhoneLogin from "./phone-login";

// A TV starts from the QR, everything else from email and password. A computer
// can move to the QR too; a phone cannot frame its own screen.
export default function LoginEntry() {
  const tv = useTv();
  const mouse = useMouse();
  const [chosen, setChosen] = useState<"phone" | "password" | null>(null);
  const phone = chosen ? chosen === "phone" : tv;
  if (phone) return <PhoneLogin tv={tv} onPassword={() => setChosen("password")} />;
  return <LoginForm onPhone={tv || mouse ? () => setChosen("phone") : undefined} />;
}
