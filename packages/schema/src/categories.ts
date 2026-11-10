export const CATEGORIES = [
  'groceries',
  'dining',
  'health',
  'shopping',
  'transportation',
  'rent',
  'fun',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Transaction = {
  id: number;
  daysAgo: number; // convert to Date when loaded in the app
  category: Category;
  merchant: string;
  amount: number; // cents, i.e., 3456 means $34.56
};
