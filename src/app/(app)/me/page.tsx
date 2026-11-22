import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";

export default async function Me() {
  const user = await requireUser();
  redirect(`/u/${user.id}`);
}
