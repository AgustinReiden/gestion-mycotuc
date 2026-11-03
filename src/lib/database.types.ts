/**
 * Tipos de la base de datos (schema `public`) con la forma que espera @supabase/supabase-js.
 *
 * Como se generaron: a partir del catalogo real del proyecto Supabase (solo SELECT sobre
 * information_schema y pg_catalog), equivalente a
 *   npx supabase gen types typescript --project-id <id> --schema public
 * - Tablas/vistas: information_schema.columns (tipo, nullability, default) + information_schema.tables.
 * - Enums: pg_type/pg_enum. Relationships: pg_constraint (FKs hacia tablas de `public`; los FKs a
 *   auth.users se omiten, igual que hace el generador oficial).
 * - Funciones: pg_proc (todas las RPC de negocio reciben `payload jsonb`).
 * - Las vistas se marcan con todas las columnas nullable (Postgres no infiere nulabilidad en vistas).
 * Para regenerar tras un cambio de esquema, correr el comando oficial de arriba y reemplazar este archivo.
 *
 * Agregado a mano (migracion 20261104120000_admin_costs_and_initial_stock_cost): tabla
 * average_cost_changes y funciones get_*_costs, set_average_cost, upsert_product_core y
 * upsert_supply_core. Ojo: authenticated ya no tiene SELECT de las columnas de costo
 * (avg_cost, unit_cost, total_cost, purchase_items.line_total); siguen en Row porque existen,
 * pero solo se leen con las funciones get_*_costs (admin).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      average_cost_changes: {
        Row: {
          id: string;
          entity_type: Database["public"]["Enums"]["entity_type"];
          entity_id: string;
          source: "stock_adjustment" | "manual_correction";
          previous_avg_cost: number;
          new_avg_cost: number;
          quantity: number | null;
          unit_cost: number | null;
          inventory_movement_id: string | null;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: Database["public"]["Enums"]["entity_type"];
          entity_id: string;
          source: "stock_adjustment" | "manual_correction";
          previous_avg_cost: number;
          new_avg_cost: number;
          quantity?: number | null;
          unit_cost?: number | null;
          inventory_movement_id?: string | null;
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: Database["public"]["Enums"]["entity_type"];
          entity_id?: string;
          source?: "stock_adjustment" | "manual_correction";
          previous_avg_cost?: number;
          new_avg_cost?: number;
          quantity?: number | null;
          unit_cost?: number | null;
          inventory_movement_id?: string | null;
          reason?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "average_cost_changes_inventory_movement_id_fkey";
            columns: ["inventory_movement_id"];
            isOneToOne: false;
            referencedRelation: "inventory_movements";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          id: string;
          type: Database["public"]["Enums"]["contact_type"];
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: Database["public"]["Enums"]["contact_type"];
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: Database["public"]["Enums"]["contact_type"];
          name?: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expense_categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          concept: string;
          category_id: string;
          amount: number;
          source: Database["public"]["Enums"]["expense_source"];
          notes: string | null;
          linked_purchase_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: {
          id?: string;
          expense_date?: string;
          concept: string;
          category_id: string;
          amount: number;
          source?: Database["public"]["Enums"]["expense_source"];
          notes?: string | null;
          linked_purchase_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Update: {
          id?: string;
          expense_date?: string;
          concept?: string;
          category_id?: string;
          amount?: number;
          source?: Database["public"]["Enums"]["expense_source"];
          notes?: string | null;
          linked_purchase_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_linked_purchase_id_fkey";
            columns: ["linked_purchase_id"];
            isOneToOne: true;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: string;
          entity_type: Database["public"]["Enums"]["entity_type"];
          entity_id: string;
          movement_type: Database["public"]["Enums"]["inventory_movement_type"];
          quantity: number;
          movement_date: string;
          reference_type: string;
          reference_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: Database["public"]["Enums"]["entity_type"];
          entity_id: string;
          movement_type: Database["public"]["Enums"]["inventory_movement_type"];
          quantity: number;
          movement_date?: string;
          reference_type: string;
          reference_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: Database["public"]["Enums"]["entity_type"];
          entity_id?: string;
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"];
          quantity?: number;
          movement_date?: string;
          reference_type?: string;
          reference_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      product_bundle_items: {
        Row: {
          id: string;
          bundle_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          bundle_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          bundle_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_bundles: {
        Row: {
          id: string;
          name: string;
          sale_price: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sale_price: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sale_price?: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      product_price_tiers: {
        Row: {
          id: string;
          product_id: string;
          min_qty: number;
          unit_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          min_qty: number;
          unit_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          min_qty?: number;
          unit_price?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      production_batch_inputs: {
        Row: {
          id: string;
          batch_id: string;
          supply_id: string;
          quantity: number;
          created_at: string;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          batch_id: string;
          supply_id: string;
          quantity: number;
          created_at?: string;
          unit_cost?: number | null;
        };
        Update: {
          id?: string;
          batch_id?: string;
          supply_id?: string;
          quantity?: number;
          created_at?: string;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_batch_inputs_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "production_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_batch_inputs_supply_id_fkey";
            columns: ["supply_id"];
            isOneToOne: false;
            referencedRelation: "supplies";
            referencedColumns: ["id"];
          },
        ];
      };
      production_batch_outputs: {
        Row: {
          id: string;
          batch_id: string;
          product_id: string;
          quantity: number;
          created_at: string;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          batch_id: string;
          product_id: string;
          quantity: number;
          created_at?: string;
          unit_cost?: number | null;
        };
        Update: {
          id?: string;
          batch_id?: string;
          product_id?: string;
          quantity?: number;
          created_at?: string;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_batch_outputs_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "production_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_batch_outputs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      production_batches: {
        Row: {
          id: string;
          product_id: string;
          status: Database["public"]["Enums"]["batch_status"];
          started_at: string;
          completed_at: string | null;
          expected_qty: number | null;
          actual_qty: number | null;
          notes: string | null;
          inventory_posted_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          total_cost: number | null;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          status?: Database["public"]["Enums"]["batch_status"];
          started_at?: string;
          completed_at?: string | null;
          expected_qty?: number | null;
          actual_qty?: number | null;
          notes?: string | null;
          inventory_posted_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          total_cost?: number | null;
          unit_cost?: number | null;
        };
        Update: {
          id?: string;
          product_id?: string;
          status?: Database["public"]["Enums"]["batch_status"];
          started_at?: string;
          completed_at?: string | null;
          expected_qty?: number | null;
          actual_qty?: number | null;
          notes?: string | null;
          inventory_posted_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          total_cost?: number | null;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          unit: string;
          sale_price: number;
          min_stock: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          avg_cost: number;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          unit: string;
          sale_price?: number;
          min_stock?: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          avg_cost?: number;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          unit?: string;
          sale_price?: number;
          min_stock?: number;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          avg_cost?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Relationships: [];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          supply_id: string;
          quantity: number;
          unit_cost: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          supply_id: string;
          quantity: number;
          unit_cost: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          supply_id?: string;
          quantity?: number;
          unit_cost?: number;
          line_total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_supply_id_fkey";
            columns: ["supply_id"];
            isOneToOne: false;
            referencedRelation: "supplies";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          id: string;
          supplier_id: string | null;
          purchase_date: string;
          notes: string | null;
          total_amount: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: {
          id?: string;
          supplier_id?: string | null;
          purchase_date?: string;
          notes?: string | null;
          total_amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Update: {
          id?: string;
          supplier_id?: string | null;
          purchase_date?: string;
          notes?: string | null;
          total_amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_payments: {
        Row: {
          id: string;
          sales_order_id: string;
          amount: number;
          payment_method: string | null;
          paid_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sales_order_id: string;
          amount: number;
          payment_method?: string | null;
          paid_at: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sales_order_id?: string;
          amount?: number;
          payment_method?: string | null;
          paid_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_payments_sales_order_id_fkey";
            columns: ["sales_order_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_channels: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_order_items: {
        Row: {
          id: string;
          sales_order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
          bundle_id: string | null;
          list_price: number | null;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          sales_order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at?: string;
          bundle_id?: string | null;
          list_price?: number | null;
          unit_cost?: number | null;
        };
        Update: {
          id?: string;
          sales_order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          created_at?: string;
          bundle_id?: string | null;
          list_price?: number | null;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_order_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "product_bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey";
            columns: ["sales_order_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_orders: {
        Row: {
          id: string;
          contact_id: string;
          channel_id: string;
          sale_date: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          payment_method: string | null;
          paid_at: string | null;
          notes: string | null;
          subtotal_amount: number;
          total_amount: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          amount_paid: number;
        };
        Insert: {
          id?: string;
          contact_id: string;
          channel_id: string;
          sale_date?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          payment_method?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          subtotal_amount?: number;
          total_amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          amount_paid?: number;
        };
        Update: {
          id?: string;
          contact_id?: string;
          channel_id?: string;
          sale_date?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          payment_method?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          subtotal_amount?: number;
          total_amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          amount_paid?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_orders_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "sales_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      supplies: {
        Row: {
          id: string;
          name: string;
          unit: string;
          min_stock: number;
          notes: string | null;
          last_purchase_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          avg_cost: number;
        };
        Insert: {
          id?: string;
          name: string;
          unit: string;
          min_stock?: number;
          notes?: string | null;
          last_purchase_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          avg_cost?: number;
        };
        Update: {
          id?: string;
          name?: string;
          unit?: string;
          min_stock?: number;
          notes?: string | null;
          last_purchase_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          avg_cost?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      inventory_movement_details: {
        Row: {
          id: string | null;
          entity_type: Database["public"]["Enums"]["entity_type"] | null;
          entity_id: string | null;
          entity_name: string | null;
          entity_unit: string | null;
          movement_type: Database["public"]["Enums"]["inventory_movement_type"] | null;
          quantity: number | null;
          movement_date: string | null;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          created_at: string | null;
          created_by_name: string | null;
        };
        Relationships: [];
      };
      product_inventory_overview: {
        Row: {
          id: string | null;
          name: string | null;
          category: string | null;
          unit: string | null;
          sale_price: number | null;
          min_stock: number | null;
          notes: string | null;
          is_active: boolean | null;
          created_at: string | null;
          current_stock: number | null;
        };
        Relationships: [];
      };
      supply_inventory_overview: {
        Row: {
          id: string | null;
          name: string | null;
          unit: string | null;
          min_stock: number | null;
          notes: string | null;
          last_purchase_at: string | null;
          is_active: boolean | null;
          created_at: string | null;
          current_stock: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      apply_stock_adjustment: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["inventory_movements"]["Row"];
      };
      apply_stock_adjustment_impl: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["inventory_movements"]["Row"];
      };
      assert_admin_for_price_change: {
        Args: never;
        Returns: never;
      };
      assert_payment_consistency: {
        Args: { p_status: Database["public"]["Enums"]["payment_status"]; p_method: string; p_paid_at: string };
        Returns: undefined;
      };
      assert_product_category: {
        Args: never;
        Returns: never;
      };
      assign_first_admin: {
        Args: never;
        Returns: never;
      };
      backfill_profiles_from_auth_users: {
        Args: never;
        Returns: number;
      };
      create_manual_expense: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["expenses"]["Row"];
      };
      create_production_batch: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["production_batches"]["Row"];
      };
      create_production_batch_core: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["production_batches"]["Row"];
      };
      create_sale_order: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["sales_orders"]["Row"];
      };
      create_sale_order_core: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["sales_orders"]["Row"];
      };
      current_inventory_stock: {
        Args: { p_entity_type: Database["public"]["Enums"]["entity_type"]; p_entity_id: string };
        Returns: number;
      };
      ensure_current_user_profile: {
        Args: never;
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      get_batch_costs: {
        Args: never;
        Returns: { id: string; total_cost: number | null; unit_cost: number | null }[];
      };
      get_batch_input_costs: {
        Args: never;
        Returns: { id: string; batch_id: string; unit_cost: number | null }[];
      };
      get_product_costs: {
        Args: never;
        Returns: { id: string; avg_cost: number }[];
      };
      get_purchase_item_costs: {
        Args: never;
        Returns: { id: string; purchase_id: string; unit_cost: number; line_total: number }[];
      };
      get_sale_item_costs: {
        Args: never;
        Returns: { id: string; unit_cost: number | null }[];
      };
      get_supply_costs: {
        Args: never;
        Returns: { id: string; avg_cost: number }[];
      };
      is_admin: {
        Args: never;
        Returns: boolean;
      };
      register_supply_purchase: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      register_supply_purchase_core: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      require_admin: {
        Args: never;
        Returns: string;
      };
      require_operating_user: {
        Args: never;
        Returns: string;
      };
      resolve_product_price: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: number;
      };
      resolve_profile_name: {
        Args: { p_email: string; p_meta: Json; p_existing?: string };
        Returns: string;
      };
      reverse_production_batch: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["production_batches"]["Row"];
      };
      reverse_production_batch_impl: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["production_batches"]["Row"];
      };
      reverse_sale_order: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["sales_orders"]["Row"];
      };
      reverse_sale_order_impl: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["sales_orders"]["Row"];
      };
      reverse_supply_purchase: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      reverse_supply_purchase_impl: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      rls_auto_enable: {
        Args: never;
        Returns: never;
      };
      run_sql: {
        Args: { query: string };
        Returns: Json;
      };
      save_price_tiers: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["product_price_tiers"]["Row"][];
      };
      set_average_cost: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["average_cost_changes"]["Row"];
      };
      set_row_updated_at: {
        Args: never;
        Returns: never;
      };
      sync_profile_from_auth_user_row: {
        Args: never;
        Returns: never;
      };
      update_sale_payment_status: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["sales_orders"]["Row"];
      };
      upsert_bundle: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["product_bundles"]["Row"];
      };
      upsert_contact: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["contacts"]["Row"];
      };
      /** Para quien no es admin, avg_cost viene en null. */
      upsert_product: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["products"]["Row"];
      };
      upsert_product_core: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["products"]["Row"];
      };
      /** Para quien no es admin, avg_cost viene en null. */
      upsert_supply: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["supplies"]["Row"];
      };
      upsert_supply_core: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["supplies"]["Row"];
      };
    };
    Enums: {
      app_role: "admin" | "operator";
      batch_status: "draft" | "active" | "completed" | "cancelled";
      contact_type: "client" | "supplier";
      entity_type: "product" | "supply";
      expense_source: "manual" | "purchase";
      inventory_movement_type: "purchase_in" | "sale_out" | "production_in" | "production_out" | "adjustment";
      payment_status: "pending" | "partial" | "paid";
    };
    CompositeTypes: Record<string, never>;
  };
};
