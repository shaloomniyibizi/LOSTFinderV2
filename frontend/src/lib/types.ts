export type ItemType = "LOST" | "FOUND";
export type ItemStatus = "OPEN" | "MATCHED" | "CLAIMED" | "RETURNED";
export type Role = "user" | "staff" | "admin";

export interface Item {
  id: string;
  type: ItemType;
  category: string;
  colour: string | null;
  title: string;
  description: string;
  location: string;
  event_date: string;
  photo_hash: string | null;
  verification_question: string | null;
  status: ItemStatus;
  home_branch: string;
  version: number;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemPage {
  total: number;
  items: Item[];
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  branch_id: string | null;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Health {
  branch: string;
  name: string;
  status: "ok" | "degraded";
  database: "ok" | "down";
  photo_storage?: string;
  time: string;
}

export interface ReplicationStatus {
  branch: string;
  replication_enabled: boolean;
  publisher_connected: boolean;
  consumer_connected: boolean;
  events_sent: number;
  events_received: number;
  last_error: string | null;
  outbox_pending: number;
  items_by_home_branch: Record<string, number>;
  users: number;
  websocket_clients?: number;
}

export interface Match {
  id: string;
  score: number;
  created_at: string;
  item: Item; // the other item of the pair
}

export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Claim {
  id: string;
  item_id: string;
  claimant_id: string;
  answer: string;
  status: ClaimStatus;
  staff_note: string | null;
  home_branch: string;
  version: number;
  created_at: string;
  decided_at: string | null;
  handed_over_at: string | null;
  item_title: string | null;
  item_question: string | null;
  claimant_name: string | null;
  claimant_email: string | null;
  claimant_phone: string | null;
}

export interface Activity {
  kind: "match" | "claim" | "claim_on_my_item";
  title: string;
  message: string;
  link: string;
  at: string;
}

export interface LiveMessage {
  type: "hello" | "match" | "claim";
  title?: string;
  message?: string;
  link?: string;
  score?: number;
}
