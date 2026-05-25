import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "placeholder-anon-key";

/**
 * Browser-side Supabase client using the anon key.
 * Safe to import in Client Components.
 */
export const supabaseBrowserClient = createClient(supabaseUrl, supabaseAnonKey);
