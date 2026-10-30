/** The three branch offices. Each one is a separate back-end server with its own database. */
export interface Branch {
  id: "A" | "B" | "C";
  name: string;
  place: string;
  url: string;
}

export const BRANCHES: Branch[] = [
  { id: "A", name: "Campus", place: "University campus", url: process.env.NEXT_PUBLIC_BRANCH_A_URL ?? "http://localhost:8001" },
  { id: "B", name: "Bus Park", place: "Nyabugogo bus park", url: process.env.NEXT_PUBLIC_BRANCH_B_URL ?? "http://localhost:8002" },
  { id: "C", name: "Airport", place: "Kigali airport", url: process.env.NEXT_PUBLIC_BRANCH_C_URL ?? "http://localhost:8003" },
];

export function branchById(id: string | null | undefined): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}

export function branchName(id: string | null | undefined): string {
  return branchById(id)?.name ?? `Branch ${id ?? "?"}`;
}

export const CATEGORIES = [
  "phone", "laptop", "tablet", "wallet", "bag", "keys", "id card", "documents",
  "jewelry", "watch", "glasses", "clothing", "headphones", "umbrella", "other",
];

export const COLOURS = [
  "black", "white", "grey", "silver", "gold", "blue", "red", "green",
  "yellow", "orange", "brown", "pink", "purple", "multicolour",
];
