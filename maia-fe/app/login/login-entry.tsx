"use client";

import { useState } from "react";
import { useTv } from "@/lib/tv-device";
import LoginForm from "./login-form";
import TvLogin from "./tv-login";

// A TV starts from the QR, everything else from email and password.
export default function LoginEntry() {
  const tv = useTv();
  const [password, setPassword] = useState(false);
  return tv && !password ? <TvLogin onPassword={() => setPassword(true)} /> : <LoginForm />;
}
