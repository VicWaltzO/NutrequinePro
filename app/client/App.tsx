import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import AdminApp from "../app/ui/AdminApp";
import { ApiError, login, onSessionRequired, recoverSession } from "./session-api";
import type { LocalSession } from "./session-api";

export default function App() {
  const loginDialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const accept = (value: LocalSession) => {
    setSession(value);
    setWorkspace(value.actor.id + ":" + value.actor.role);
    setError("");
  };
  useLayoutEffect(() => {
    if (!session && !checking && !loginDialog.current?.open) loginDialog.current?.showModal();
  }, [session, checking]);
  useEffect(() => {
    let active = true;
    recoverSession()
      .then((value) => {
        if (active) accept(value);
      })
      .catch((failure: unknown) => {
        if (active && (!(failure instanceof ApiError) || failure.status !== 401))
          setError(failure instanceof Error ? failure.message : "No se pudo recuperar la sesión.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    const unsubscribe = onSessionRequired((message, discard) => {
      setSession(null);
      setError(message);
      if (discard) setWorkspace(null);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      accept(await login(name, password));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo iniciar sesión.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  };
  if (checking)
    return (
      <div className="loading">
        <img src="/brand/logo.jpg" width={150} height={150} alt="Nutrequine Pro" />
        <p>Recuperando sesión…</p>
      </div>
    );
  return (
    <>
      {!session && (
        <dialog
          ref={loginDialog}
          className="local-login"
          aria-label="Autenticación local"
          onCancel={(event) => event.preventDefault()}
        >
          <form onSubmit={signIn} aria-label="Inicio de sesión local">
            <img src="/brand/logo.jpg" width={100} height={100} alt="Nutrequine Pro" />
            <span className="eyebrow">NUTREQUINE PRO</span>
            <h1>Iniciar sesión</h1>
            <p>Administración local · Producción, ventas e inventario</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <label>
              Usuario
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Iniciando sesión…" : "Entrar"}
            </button>
            <small>El administrador de esta instalación gestiona sus credenciales.</small>
          </form>
        </dialog>
      )}
      {workspace && (
        <div style={{ display: session ? "contents" : "none" }} inert={!session}>
          <AdminApp key={workspace} />
        </div>
      )}
    </>
  );
}
