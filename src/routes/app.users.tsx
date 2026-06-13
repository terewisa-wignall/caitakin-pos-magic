import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/users")({
  head: () => ({ meta: [{ title: "Usuarios · CAsitakin" }] }),
  component: UsersPage,
});

type Role = "admin" | "seller";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  commission_rate: number;
  is_active: boolean;
  roles: Role[];
};

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

function displayUsername(email: string, name: string) {
  if (email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`)) {
    return email.replace(`@${INTERNAL_EMAIL_DOMAIN}`, "");
  }
  return name || email;
}

function UsersPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "seller" as Role,
    commissionRate: "5",
  });
  const [creating, setCreating] = useState(false);

  const users = useQuery<ManagedUser[]>({
    queryKey: ["users-all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name,email,commission_rate,is_active")
        .order("name");
      if (profilesError) throw profilesError;
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id,role");
      if (rolesError) throw rolesError;
      const rolesByUser = new Map<string, Role[]>();
      (roles ?? []).forEach((r) => {
        const role = r.role as Role;
        rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) || []), role]);
      });
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) || [],
      }));
    },
  });

  const updateCommission = async (id: string, rate: number) => {
    const { error } = await supabase
      .from("profiles")
      .update({ commission_rate: rate })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Comisión actualizada");
      qc.invalidateQueries({ queryKey: ["users-all"] });
    }
  };

  const createUser = async () => {
    const username = form.username.trim();
    const commissionRate = Number(form.commissionRate);
    if (!username || form.password.length < 6) {
      toast.error("Usuario y clave de 6 caracteres mínimo");
      return;
    }
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      toast.error("Comisión inválida");
      return;
    }
    setCreating(true);
    try {
      const adminSession = (await supabase.auth.getSession()).data.session;
      const email = usernameToEmail(username);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: { name: username, managed_by_admin: true },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("No se pudo crear el usuario");

      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        name: username,
        email,
        commission_rate: commissionRate,
        is_active: true,
      });
      if (profileError) throw profileError;

      await supabase.from("user_roles").delete().eq("user_id", data.user.id);
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: data.user.id, role: form.role });
      if (roleError) throw roleError;

      toast.success("Usuario creado");
      setForm({ username: "", password: "", role: "seller", commissionRate: "5" });
      qc.invalidateQueries({ queryKey: ["users-all"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const updateRole = async (userId: string, role: Role) => {
    try {
      if (userId === user?.id && role !== "admin") {
        toast.error("No puedes quitarte admin a ti misma");
        return;
      }
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      toast.success("Rol actualizado");
      qc.invalidateQueries({ queryKey: ["users-all"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const removeUser = async (userId: string) => {
    try {
      if (userId === user?.id) {
        toast.error("No puedes quitar tu propio acceso");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Usuario desactivado");
      qc.invalidateQueries({ queryKey: ["users-all"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const restoreUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ is_active: true }).eq("id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success("Usuario activado");
      qc.invalidateQueries({ queryKey: ["users-all"] });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">Solo administradores</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Altas, roles y comisiones</p>
      </header>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Agregar usuario</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_150px_120px_auto] md:items-end">
          <div>
            <Label>Usuario</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Ej. maria"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Clave</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={form.role} onValueChange={(role: Role) => setForm({ ...form, role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">Vendedora</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comisión %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
              className="font-numeric"
            />
          </div>
          <Button onClick={createUser} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />
            {creating ? "Creando..." : "Agregar"}
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {(users.data ?? []).map((u) => {
            const role = u.roles.includes("admin") ? "admin" : "seller";
            const isSelf = u.id === user?.id;
            return (
              <li
                key={u.id}
                className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_140px_140px_auto] gap-3 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {u.name || displayUsername(u.email, u.name)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {displayUsername(u.email, u.name)} · {role === "admin" ? "Admin" : "Vendedora"}
                    {!u.is_active ? " · Inactiva" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    defaultValue={u.commission_rate}
                    className="h-9 font-numeric w-24"
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== Number(u.commission_rate)) updateCommission(u.id, n);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <Select value={role} onValueChange={(nextRole: Role) => updateRole(u.id, nextRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Vendedora</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  {u.is_active ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      disabled={isSelf}
                      onClick={() => removeUser(u.id)}
                      aria-label={`Desactivar ${u.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => restoreUser(u.id)}
                      aria-label={`Activar ${u.name}`}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                  {u.is_active && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Activo" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
