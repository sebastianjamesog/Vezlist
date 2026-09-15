import { redirect } from "next/navigation";

/** Unknown paths went to "/" before file routing, and still do. */
export default function NotFound() {
  redirect("/");
}
