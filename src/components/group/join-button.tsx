"use client";

import { joinGroup } from "@/lib/actions/groups";
import { useAction } from "../ui/use-action";

export function JoinButton({ code }: { code: string }) {
  const [pending, exec] = useAction();
  return (
    <button className="btn btn-primary btn-lg w-full" disabled={pending} onClick={() => exec(() => joinGroup(code))}>
      {pending ? "Joining…" : "Join the group"}
    </button>
  );
}
