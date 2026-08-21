import { createClient } from '@supabase/supabase-js';

// Admin client - uses service_role key to bypass RLS
// Used ONLY in backend for server-side operations (auth verification, user sync)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabase;