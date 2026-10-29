import { redirect } from "next/navigation";

// No session yet in the prototype: everything starts from the login.
export default function Home() {
  redirect("/login");
}
