// Generates a deterministic sample dataset of expenses at data/expenses.csv.
// Usage: pnpm generate:data
import { writeFileSync } from 'node:fs';
import type { Category, Transaction } from '@ai-ledger/schema/categories';

const COUNT = 500;
const DAYS = 180;
const OUTPUT = new URL('../data/expenses.csv', import.meta.url);

// mulberry32: tiny seeded PRNG so the output is reproducible
let seed = 20261111;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;
const between = (min: number, max: number): number => Math.round(min + rnd() * (max - min));

type Profile = { weight: number; merchants: string[]; amount: [min: number, max: number] };

// rent is handled separately as a fixed monthly payment
const PROFILES: Record<Exclude<Category, 'rent'>, Profile> = {
  groceries: {
    weight: 22,
    merchants: ['Whole Foods', "Trader Joe's", 'Safeway', 'Costco', 'Kroger', 'Aldi'],
    amount: [1500, 18000],
  },
  dining: {
    weight: 22,
    merchants: [
      'Starbucks',
      'Chipotle',
      'Sweetgreen',
      'Shake Shack',
      'Olive Garden',
      'Local Pizzeria',
      'Sushi House',
      'Blue Bottle Coffee',
    ],
    amount: [450, 9500],
  },
  health: {
    weight: 6,
    merchants: ['CVS Pharmacy', 'Walgreens', 'Planet Fitness', 'City Dental', 'One Medical'],
    amount: [1000, 25000],
  },
  shopping: {
    weight: 14,
    merchants: ['Amazon', 'Target', 'Best Buy', 'IKEA', 'Uniqlo', 'Home Depot'],
    amount: [1200, 30000],
  },
  transportation: {
    weight: 18,
    merchants: ['Uber', 'Lyft', 'Shell', 'Chevron', 'Metro Transit', 'City Parking'],
    amount: [275, 7500],
  },
  fun: {
    weight: 9,
    merchants: ['Netflix', 'Spotify', 'AMC Theatres', 'Steam', 'Ticketmaster', 'Bowling Alley'],
    amount: [999, 15000],
  },
  other: {
    weight: 9,
    merchants: ['USPS', 'Comcast', 'PG&E', 'Verizon', 'Dry Cleaners', 'Venmo'],
    amount: [500, 20000],
  },
};

const entries = Object.entries(PROFILES) as [Category, Profile][];
const totalWeight = entries.reduce((sum, [, p]) => sum + p.weight, 0);

function pickCategory(): [Category, Profile] {
  let r = rnd() * totalWeight;
  for (const entry of entries) {
    r -= entry[1].weight;
    if (r < 0) return entry;
  }
  return entries.at(-1)!;
}

const rows: Omit<Transaction, 'id'>[] = [];

for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo -= 30) {
  rows.push({ daysAgo, category: 'rent', merchant: 'Parkside Apartments', amount: 245000 });
}

while (rows.length < COUNT) {
  const [category, profile] = pickCategory();
  rows.push({
    daysAgo: Math.floor(rnd() * DAYS),
    category,
    merchant: pick(profile.merchants),
    amount: between(...profile.amount),
  });
}

// oldest first (stable sort keeps insertion order within a day)
rows.sort((a, b) => b.daysAgo - a.daysAgo);

const transactions: Transaction[] = rows.map((row, i) => ({ id: i + 1, ...row }));

const escape = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const columns = [
  'id',
  'daysAgo',
  'category',
  'merchant',
  'amount',
] as const satisfies (keyof Transaction)[];
const csv = [
  columns.join(','),
  ...transactions.map((t) => columns.map((c) => escape(t[c])).join(',')),
].join('\n');

writeFileSync(OUTPUT, `${csv}\n`);
console.log(`Wrote ${transactions.length} transactions to ${OUTPUT.pathname}`);
