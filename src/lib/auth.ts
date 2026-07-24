import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ValidAuth = {
  session: Session;
  user: User;
};

/**
 * getSession() reads the persisted session and can return an expired/revoked
 * session. Validate it with the Auth server before allowing protected routes.
 * Invalid local credentials are removed so the next login starts cleanly.
 */
export async function getValidAuth(): Promise<ValidAuth | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    if (sessionError) await clearLocalAuth();
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    await clearLocalAuth();
    return null;
  }

  return {
    session: sessionData.session,
    user: userData.user,
  };
}

export async function clearLocalAuth() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Local storage is best-effort here. A subsequent login replaces it.
  }
}
