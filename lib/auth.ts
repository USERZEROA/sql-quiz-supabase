import { createClient } from "@supabase/supabase-js";
import { bearerToken, HttpError } from "./input";

export async function requireUser(request: Request) {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, "Supabase configuration is missing.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) }
  });
  // Validate with Supabase Auth; never authorize a decoded-but-unverified JWT.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session is invalid or expired. Please sign in again.");
  return { user: data.user, supabase };
}
