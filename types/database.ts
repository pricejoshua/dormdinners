/**
 * types/database.ts
 *
 * Hand-written TypeScript types mirroring the Supabase schema.
 * Column names use snake_case to match Supabase's default JSON output so
 * that rows can be used directly without transformation.
 *
 * Import the `Database` type to get a fully typed Supabase client:
 *   import { createClient } from '@supabase/supabase-js'
 *   import type { Database } from '@/types/database'
 *   const supabase = createClient<Database>(url, key)
 */

// ---------------------------------------------------------------------------
// Row types — shape of a row returned from SELECT *
// ---------------------------------------------------------------------------

export interface PantryItemRow {
  id: string;
  name: string;
  notes: string | null;
  quantity_amount: number | null;
  quantity_unit: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MealRow {
  id: string;
  title: string;
  week_of: string | null;   // ISO date string, e.g. "2025-01-06"
  day_of_week: number | null; // 0 = Monday … 4 = Friday
  headcount: number | null;
  serves: number | null;          // recipe's canonical yield
  scale_override: number | null;  // manual scale factor; null = derive from headcount/serves
  created_at: string;
}

export interface MealIngredientRow {
  id: string;
  meal_id: string | null;
  name: string;
  quantity: string | null;
  created_at: string;
}

export interface FlippCacheRow {
  id: string;
  ingredient_query: string | null;
  merchant_name: string | null;
  item_name: string | null;
  current_price: number | null;   // numeric in Postgres, number in JS
  post_price_text: string | null;
  valid_from: string | null;
  valid_to: string | null;
  fetched_at: string | null;
}

export type OptimizationSuggestionStatus = 'pending' | 'accepted' | 'dismissed';
export type OptimizationSuggestionType =
  | 'bulk_buy'
  | 'substitution'
  | 'overlap'
  | 'pantry_use';

export interface OptimizationSuggestionRow {
  id: string;
  meal_ids: string[] | null;
  suggestion_type: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

export interface ShoppingListItemRow {
  id: string;
  week_of: string | null;
  name: string;
  quantity: string | null;
  assigned_store: string | null;
  flipp_cache_id: string | null;
  pantry_match: boolean;
  checked_off: boolean;
  created_at: string;
}

export interface ReferencePriceRow {
  id: string;
  name: string;                  // staple, e.g. "chicken thighs"
  store: string;
  price: number;                 // pack price (numeric in Postgres)
  size_amount: number | null;    // pack size quantity
  size_unit: string | null;      // e.g. "kg", "g", "L", "ml", "ea", "pack"
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;     // soft delete; NULL means active
}

// ---------------------------------------------------------------------------
// Insert types — fields required / optional when inserting a new row.
// `id` and timestamp defaults are omitted (Postgres provides them).
// ---------------------------------------------------------------------------

export interface PantryItemInsert {
  id?: string;
  name: string;
  notes?: string | null;
  quantity_amount?: number | null;
  quantity_unit?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface MealInsert {
  id?: string;
  title: string;
  week_of?: string | null;
  day_of_week?: number | null;
  headcount?: number | null;
  serves?: number | null;
  scale_override?: number | null;
  created_at?: string;
}

export interface MealIngredientInsert {
  id?: string;
  meal_id?: string | null;
  name: string;
  quantity?: string | null;
  created_at?: string;
}

export interface FlippCacheInsert {
  id?: string;
  ingredient_query?: string | null;
  merchant_name?: string | null;
  item_name?: string | null;
  current_price?: number | null;
  post_price_text?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  fetched_at?: string | null;
}

export interface OptimizationSuggestionInsert {
  id?: string;
  meal_ids?: string[] | null;
  suggestion_type?: string | null;
  description?: string | null;
  status?: string;
  created_at?: string;
}

export interface ShoppingListItemInsert {
  id?: string;
  week_of?: string | null;
  name: string;
  quantity?: string | null;
  assigned_store?: string | null;
  flipp_cache_id?: string | null;
  pantry_match?: boolean;
  checked_off?: boolean;
  created_at?: string;
}

export interface ReferencePriceInsert {
  id?: string;
  name: string;
  store: string;
  price: number;
  size_amount?: number | null;
  size_unit?: string | null;
  notes?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

// ---------------------------------------------------------------------------
// Update types — all fields optional for PATCH semantics
// ---------------------------------------------------------------------------

export type PantryItemUpdate = Partial<PantryItemInsert>;
export type MealUpdate = Partial<MealInsert>;
export type MealIngredientUpdate = Partial<MealIngredientInsert>;
export type FlippCacheUpdate = Partial<FlippCacheInsert>;
export type OptimizationSuggestionUpdate = Partial<OptimizationSuggestionInsert>;
export type ShoppingListItemUpdate = Partial<ShoppingListItemInsert>;
export type ReferencePriceUpdate = Partial<ReferencePriceInsert>;

// ---------------------------------------------------------------------------
// Database interface — pass to createClient<Database>() for full type safety
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      pantry_items: {
        Row: PantryItemRow;
        Insert: PantryItemInsert;
        Update: PantryItemUpdate;
      };
      meals: {
        Row: MealRow;
        Insert: MealInsert;
        Update: MealUpdate;
      };
      meal_ingredients: {
        Row: MealIngredientRow;
        Insert: MealIngredientInsert;
        Update: MealIngredientUpdate;
      };
      flipp_cache: {
        Row: FlippCacheRow;
        Insert: FlippCacheInsert;
        Update: FlippCacheUpdate;
      };
      optimization_suggestions: {
        Row: OptimizationSuggestionRow;
        Insert: OptimizationSuggestionInsert;
        Update: OptimizationSuggestionUpdate;
      };
      shopping_list_items: {
        Row: ShoppingListItemRow;
        Insert: ShoppingListItemInsert;
        Update: ShoppingListItemUpdate;
      };
      reference_prices: {
        Row: ReferencePriceRow;
        Insert: ReferencePriceInsert;
        Update: ReferencePriceUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
