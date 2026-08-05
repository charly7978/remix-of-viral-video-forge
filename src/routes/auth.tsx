import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso | Radar Viral AR" },
      {
        name: "description",
        content:
          "Ingresá al panel de producción de shorts virales para YouTube y TikTok en Argentina.",
      },
      { property: "og:title", content: "Acceso | Radar Viral AR" },
      {
        property: "og:description",
        content: "Panel privado de producción automatizada de shorts virales.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Ya podés entrar.");
        setMode("login");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la operación");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-8">
        <p className="label-caps">Sala de control</p>
        <h1 className="mt-2 text-3xl font-bold">Radar viral AR</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acceso restringido al equipo de producción.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vos@ejemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Procesando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "login" ? "No tengo cuenta todavía" : "Ya tengo cuenta"}
        </button>
      </div>
    </main>
  );
}
