import {
  Clapperboard,
  Cpu,
  Dumbbell,
  FlaskConical,
  Heart,
  Landmark,
  Sparkles,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { categoryOf, type Category } from "@/lib/categories";

const ICONS: Record<Category["icon"], LucideIcon> = {
  dumbbell: Dumbbell,
  "trending-up": TrendingUp,
  landmark: Landmark,
  trophy: Trophy,
  cpu: Cpu,
  clapperboard: Clapperboard,
  "flask-conical": FlaskConical,
  heart: Heart,
  sparkles: Sparkles,
};

export const categoryColor = (id: string, l = 0.78, c = 0.13) => `oklch(${l} ${c} ${categoryOf(id).hue})`;

export function CategoryIcon({ id, className = "size-4" }: { id: string; className?: string }) {
  const Icon = ICONS[categoryOf(id).icon];
  return <Icon className={className} style={{ color: categoryColor(id) }} aria-hidden />;
}

export function CategoryChip({ id }: { id: string }) {
  const c = categoryOf(id);
  return (
    <span
      className="chip"
      style={{
        background: `oklch(0.78 0.13 ${c.hue} / 0.1)`,
        borderColor: `oklch(0.78 0.13 ${c.hue} / 0.22)`,
        color: `oklch(0.86 0.09 ${c.hue})`,
      }}
    >
      <CategoryIcon id={id} className="size-3.5" />
      {c.label}
    </span>
  );
}
