import { logout } from "./session-api";
import { useState } from "react";
import { frontendPath } from "./paths";
export default function LoadingScreen({ reload, error }: { reload: () => Promise<void>; error: string }) {
  const [logoutError, setLogoutError] = useState("");
  return (
    <div className="loading">
      <img width={150} height={150} src={frontendPath("/brand/logo.jpg")} alt="Nutrequine Pro" />
      <h1>Nutrequine Pro</h1>
      {error ? (
        <>
          <p role="alert">{logoutError || error}</p>
          <button onClick={reload}>Volver a intentar</button>
          <button
            onClick={() => {
              void logout().catch(() => setLogoutError("No se pudo cerrar la sesión. Vuelva a intentar."));
            }}
          >
            Salir de la cuenta actual
          </button>
        </>
      ) : (
        <p>Cargando operaciones…</p>
      )}
    </div>
  );
}
