import { Suspense } from "react";
import Appeals from "@vezlist/shared/admin/Appeals.jsx";
import Loading from "../loading.jsx";

export const metadata = { title: "Review queue", description: "Review pending listing submissions." };
export default function Page() {
  return <Suspense fallback={<Loading />}><Appeals kind="SUBMISSION" /></Suspense>;
}
