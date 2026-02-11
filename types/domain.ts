export type TeamRole = "admin" | "member";

export type Person = {
  id: string;
  name: string;
  is_active: boolean;
};

export type PurchaseSplitInput = {
  person_id: string;
  percentage?: number;
  amount?: number;
};
