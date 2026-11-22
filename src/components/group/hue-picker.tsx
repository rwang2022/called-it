"use client";

const HUES = [268, 230, 200, 165, 140, 95, 60, 30, 5, 330];

export function HuePicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group colour">
      {HUES.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={value === h}
          onClick={() => onChange(h)}
          className={`size-9 rounded-xl transition-transform ${value === h ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-ink-900" : "hover:scale-105"}`}
          style={{ background: `linear-gradient(135deg, oklch(0.84 0.13 ${h}), oklch(0.64 0.17 ${(h + 40) % 360}))` }}
          aria-label={`Hue ${h}`}
        />
      ))}
    </div>
  );
}
