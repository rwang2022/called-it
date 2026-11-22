"use client";

import { useState } from "react";
import { createGroup } from "@/lib/actions/groups";
import { useAction } from "../ui/use-action";
import { HuePicker } from "./hue-picker";

const SUGGESTIONS = ["The Group Chat", "Gym Rats", "Roommates", "Fantasy League", "Work Friends", "Family"];

export function NewGroupForm() {
  const [pending, exec] = useAction();
  const [name, setName] = useState("");
  const [hue, setHue] = useState(268);
  return (
    <form
      className="surface space-y-6 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => createGroup({ name, hue }));
      }}
    >
      <div className="flex items-center gap-4">
        <span
          className="grid size-16 shrink-0 place-items-center rounded-2xl text-3xl font-bold text-ink-950 transition-all"
          style={{ background: `linear-gradient(135deg, oklch(0.84 0.13 ${hue}), oklch(0.64 0.17 ${(hue + 40) % 360}))`, boxShadow: `0 14px 36px -12px oklch(0.7 0.17 ${hue})` }}
        >
          {(name.trim()[0] ?? "?").toUpperCase()}
        </span>
        <input className="input display !h-14 !text-2xl" autoFocus maxLength={40} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip h-8 px-3 hover:text-fg" onClick={() => setName(s)}>
            {s}
          </button>
        ))}
      </div>
      <div>
        <p className="label">Colour</p>
        <HuePicker value={hue} onChange={setHue} />
      </div>
      <button className="btn btn-primary btn-lg w-full" disabled={pending || name.trim().length < 2}>
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
