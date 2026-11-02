import { redirect } from "next/navigation";

// Old route, kept so existing links still land somewhere sensible.
export default function Page() {
  redirect("/");
}
