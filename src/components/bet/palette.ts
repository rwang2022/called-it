const MULTI = ["#8e7dff", "#5ccbff", "#fbbf24", "#f472b6", "#34d399", "#fb923c", "#2dd4bf", "#a3e635"];

/** Colour for option `index` of a bet. Yes/No get semantic green/rose. */
export function optionColor(kind: string, index: number) {
  if (kind === "binary") return index === 0 ? "#34d399" : "#fb7185";
  return MULTI[index % MULTI.length];
}
