"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { setBetCategory } from "@/lib/actions/bets";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { CategoryIcon } from "../ui/category";
import { useAction } from "../ui/use-action";

/** The bet's category chip, with a native dropdown over it to fix a wrong category. */
export function CategoryPicker({ betId, category }: { betId: string; category: string }) {
  const [pending, exec] = useAction();
  const [value, setValue] = useState(category);
  const c = categoryOf(value);

  return (
    <label
      className={`chip relative cursor-pointer gap-1.5 transition-opacity hover:brightness-125 focus-within:ring-2 focus-within:ring-iris/60 ${pending ? "opacity-60" : ""}`}
      style={{
        background: `oklch(0.78 0.13 ${c.hue} / 0.1)`,
        borderColor: `oklch(0.78 0.13 ${c.hue} / 0.22)`,
        color: `oklch(0.86 0.09 ${c.hue})`,
      }}
      title="Change category"
    >
      <CategoryIcon id={value} className="size-3.5" />
      {c.label}
      <ChevronDown className="size-3 opacity-70" aria-hidden />
      <select
        aria-label="Category"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          exec(
            async () => {
              const r = await setBetCategory(betId, next);
              if (!r.ok) setValue(prev);
              return r;
            },
            { success: `Moved to ${categoryOf(next).label}` },
          );
        }}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.label}
          </option>
        ))}
      </select>
    </label>
  );
}
