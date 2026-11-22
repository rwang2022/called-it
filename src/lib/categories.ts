export type CategoryId =
  | "fitness"
  | "markets"
  | "politics"
  | "sports"
  | "tech"
  | "culture"
  | "science"
  | "life"
  | "other";

export type Category = {
  id: CategoryId;
  label: string;
  /** Public-knowledge categories default to letting Claude play. */
  publicByDefault: boolean;
  /** OKLCH hue for the category accent. */
  hue: number;
  icon: "dumbbell" | "trending-up" | "landmark" | "trophy" | "cpu" | "clapperboard" | "flask-conical" | "heart" | "sparkles";
  examples: string[];
};

export const CATEGORIES: Category[] = [
  { id: "fitness", label: "Fitness", publicByDefault: false, hue: 150, icon: "dumbbell", examples: ["Will Sam do a pull-up by Dec 31?", "Who runs a sub-25 5K first?"] },
  { id: "markets", label: "Markets", publicByDefault: true, hue: 85, icon: "trending-up", examples: ["Will NVDA close above $200 on Mar 1?", "Will BTC be above $150k at year end?"] },
  { id: "politics", label: "Politics", publicByDefault: true, hue: 25, icon: "landmark", examples: ["Who wins the next mayoral race?", "Will the bill pass the Senate by June?"] },
  { id: "sports", label: "Sports", publicByDefault: true, hue: 55, icon: "trophy", examples: ["Who wins the Super Bowl?", "Will the Knicks make the conference finals?"] },
  { id: "tech", label: "Tech", publicByDefault: true, hue: 265, icon: "cpu", examples: ["Will Apple ship a foldable this year?", "Will the IPO price above range?"] },
  { id: "culture", label: "Pop culture", publicByDefault: true, hue: 330, icon: "clapperboard", examples: ["Best Picture winner?", "Will the album debut at #1?"] },
  { id: "science", label: "Science & weather", publicByDefault: true, hue: 210, icon: "flask-conical", examples: ["Will it snow in NYC on Christmas?", "Will Starship reach orbit by Q2?"] },
  { id: "life", label: "Life", publicByDefault: false, hue: 0, icon: "heart", examples: ["Will Jo actually move to Lisbon?", "Will Ben finish the book by Friday?"] },
  { id: "other", label: "Other", publicByDefault: false, hue: 290, icon: "sparkles", examples: ["Anything goes"] },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryOf = (id: string): Category => BY_ID.get(id as CategoryId) ?? BY_ID.get("other")!;
export const isCategory = (id: string): id is CategoryId => BY_ID.has(id as CategoryId);
