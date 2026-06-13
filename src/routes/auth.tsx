import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logoAsset from "@/assets/logo.png.asset.json";
const logo = logoAsset.url;
const INTERNAL_EMAIL_DOMAIN = "casitakin.local";

function usernameToEmail(username: string) {
  if (username.includes("@")) return username.trim();
  const clean = username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${clean}@${INTERNAL_EMAIL_DOMAIN}`;
}

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Iniciar sesión · CAsitakin" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) throw error;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("id", userId)
          .maybeSingle();
        if (profile && !profile.is_active) {
          await supabase.auth.signOut();
          throw new Error("Este usuario está desactivado");
        }
      }
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logo} alt="CAsitakin" width={88} height={88} className="h-22 w-22" />
          <h1 className="mt-2 text-2xl font-bold tracking-tight">CAsitakin</h1>
          <p className="text-sm text-muted-foreground">Punto de venta · Artesanía</p>
        </div>
        <Card className="p-6 shadow-elevated">
          <h2 className="text-lg font-semibold mb-1">Iniciar sesión</h2>
          <p className="text-sm text-muted-foreground mb-5">Entra a tu cuenta para vender.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : "Entrar"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Las cuentas las crea una administradora.
        </p>
      </div>
    </div>
  );
}
