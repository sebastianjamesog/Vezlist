import { redirect } from "next/navigation";

export const metadata = { title: "In-review listings" };
export default async function Page({ searchParams }) {
  const { site } = await searchParams;
  const query = new URLSearchParams({ status: "PENDING_REVIEW" });
  if (["marketplace", "personals"].includes(site)) query.set("site", site);
  redirect(`/listings?${query}`);
}
