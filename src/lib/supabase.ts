import { createClient } from "@supabase/supabase-js";

/**
 * The HealthOS Supabase project. The publishable key is public by design (it ships in every
 * browser bundle); what keeps data private is row level security — every row belongs to the
 * signed-in user (`supabase/migrations/0001_init.sql`). Env vars override for another project.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ubfvaewfdbmecowoeuni.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_yN86P7x08XORkRDCtr7sbw_If6orfsW";

export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A reset link must work on whatever device opens the email (Tempo learned this the hard way).
    flowType: "implicit",
  },
});

/**
 * Accounts that get the dev tools: any address with "+test" before the @, e.g.
 * lukacsarnold9+healthtest@gmail.com. Your personal account never sees them.
 */
export const isTester = (email: string | undefined | null) => !!email && /\+[^@]*test[^@]*@/i.test(email);
