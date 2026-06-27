import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Wallet, BarChart3,
  Settings, Users, Coins, LogOut, Menu, Landmark, IdCard, ReceiptText,
  Truck,
} from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";
const logo = logoAsset.url;
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const items: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/app/sell", label: "Vender", icon: ShoppingCart },
  { to: "/app/inventory", label: "Inventario", icon: Package },
  { to: "/app/cash", label: "Caja", icon: Wallet },
  { to: "/app/payroll", label: "Mi nómina", icon: ReceiptText },
  { to: "/app/reports", label: "Reportes", icon: BarChart3, adminOnly: true },
  { to: "/app/commissions", label: "Comisiones", icon: Coins },
  { to: "/app/finance", label: "Finanzas", icon: Landmark, adminOnly: true },
  { to: "/app/suppliers", label: "Proveedores", icon: Truck, adminOnly: true },
  { to: "/app/hr", label: "RRHH", icon: IdCard, adminOnly: true },
  { to: "/app/users", label: "Usuarios", icon: Users, adminOnly: true },
  { to: "/app/settings", label: "Configuración", icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const visible = items.filter((i) => !i.adminOnly || isAdmin);
  const mobileItems = visible.slice(0, 5);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth", replace: true });
  };

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1 p-2">
      {visible.map((item) => {
        const active = pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 p-4 border-b border-sidebar-border">
          <img src={logo} alt="CAsitakin" width={36} height={36} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">CAsitakin</p>
            <p className="text-xs text-muted-foreground">Punto de venta</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto"><NavList /></div>
        <div className="border-t border-sidebar-border p-3">
          <div className="px-2 mb-2">
            <p className="text-sm font-medium truncate">{profile?.name || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{isAdmin ? "Administrador" : "Vendedor"}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card/95 backdrop-blur px-3 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="CAsitakin" width={32} height={32} className="h-8 w-8" />
            <span className="font-semibold truncate">CAsitakin</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-72">
              <div className="p-4 border-b">
                <p className="font-semibold">{profile?.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{isAdmin ? "Administrador" : "Vendedor"}</p>
              </div>
              <NavList />
              <div className="p-3 border-t">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 min-w-0 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-30 grid border-t bg-card/95 backdrop-blur ${mobileItems.length === 3 ? "grid-cols-3" : "grid-cols-5"}`}>
          {mobileItems.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
