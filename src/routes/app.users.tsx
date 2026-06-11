import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/users")({
  head: () => ({ meta: [{ title: "Usuarios · CAsitakin" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["users-all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id,name,email,commission_rate,is_active");
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const rolesByUser = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) || []), r.role]);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: rolesByUser.get(p.id) || [] }));
    },
  });

  const updateCommission = async (id: string, rate: number) => {
    const { error } = await supabase.from("profiles").update({ commission_rate: rate }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["users-all"] }); }
  };

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    if (isCurrentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) toast.error(error.message); else { toast.success("Removido como admin"); qc.invalidateQueries({ queryKey: ["users-all"] }); }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) toast.error(error.message); else { toast.success("Promovido a admin"); qc.invalidateQueries({ queryKey: ["users-all"] }); }
    }
  };

  if (!isAdmin) return <div className="p-6"><Card className="p-6"><p className="text-muted-foreground">Solo administradores</p></Card></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header><h1 className="text-2xl md:text-3xl font-bold">Usuarios</h1><p className="text-sm text-muted-foreground">Roles y comisiones</p></header>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {(users.data ?? []).map((u: any) => {
            const isAdminUser = u.roles.includes("admin");
            return (
              <li key={u.id} className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email} · {isAdminUser ? "Admin" : "Vendedor"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" step="0.5" defaultValue={u.commission_rate} className="h-9 font-numeric w-20"
                    onBlur={(e) => { const n = Number(e.target.value); if (n !== Number(u.commission_rate)) updateCommission(u.id, n); }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <Button size="sm" variant={isAdminUser ? "outline" : "default"} onClick={() => toggleAdmin(u.id, isAdminUser)}>
                  {isAdminUser ? "Quitar admin" : "Hacer admin"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-xs text-muted-foreground">Los usuarios se crean al registrarse en la pantalla de login.</p>
    </div>
  );
}
