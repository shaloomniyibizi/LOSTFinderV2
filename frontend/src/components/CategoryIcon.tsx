import {
  Backpack, BookOpen, CreditCard, Gem, Glasses, Headphones, KeyRound, Laptop, Package,
  Shirt, Smartphone, Tablet, Umbrella, Wallet, Watch, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  phone: Smartphone,
  laptop: Laptop,
  tablet: Tablet,
  wallet: Wallet,
  bag: Backpack,
  keys: KeyRound,
  "id card": CreditCard,
  documents: BookOpen,
  jewelry: Gem,
  watch: Watch,
  glasses: Glasses,
  clothing: Shirt,
  headphones: Headphones,
  umbrella: Umbrella,
};

export default function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category] ?? Package;
  return <Icon className={className} />;
}
