"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

/** Accepts a full invite URL or a bare code and navigates to the join page. */
export function JoinByCode() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const code = (value.match(/join\/([A-Za-z0-9]+)/)?.[1] ?? value).trim().toUpperCase();
  const valid = /^[A-Z0-9]{6,16}$/.test(code);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/join/${code}`);
      }}
    >
      <input className="input" placeholder="Paste invite link" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-ghost h-12 shrink-0" disabled={!valid} aria-label="Join">
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
