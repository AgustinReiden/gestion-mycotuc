/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LooseRow = Record<string, any>;
type LooseTable = {
  Row: LooseRow;
  Insert: LooseRow;
  Update: LooseRow;
  Relationships: [];
};
type LooseFunction = {
  Args: Record<string, any>;
  Returns: any;
};

export type Database = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, { Row: LooseRow; Relationships: [] }>;
    Functions: Record<string, LooseFunction>;
    Enums: {
      batch_status: "draft" | "active" | "completed" | "cancelled";
      contact_type: "client" | "supplier";
      entity_type: "product" | "supply";
      expense_source: "manual" | "purchase";
      inventory_movement_type:
        | "purchase_in"
        | "sale_out"
        | "production_in"
        | "production_out"
        | "adjustment";
      payment_status: "pending" | "partial" | "paid";
    };
    CompositeTypes: Record<string, never>;
  };
};
