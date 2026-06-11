import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "seller";

export interface ProfileInfo {
  id: string;
  name: string;
  email: string;
  commission_rate: number;
  is_active: boolean;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadExtras = async (uid: string) => {
      const [{ data: prof }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,commission_rate,is_active").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!mounted) return;
      setProfile(prof as ProfileInfo | null);
      setRoles(((rs ?? []) as { role: Role }[]).map((r) => r.role));
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadExtras(data.session.user.id).finally(() => mounted && setLoading(false));
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadExtras(s.user.id);
      else { setProfile(null); setRoles([]); }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const isAdmin = roles.includes("admin");
  const isSeller = roles.includes("seller") || isAdmin;

  return { session, user, profile, roles, isAdmin, isSeller, loading };
}
