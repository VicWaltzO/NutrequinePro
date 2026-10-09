"use client";
import Image from "next/image";
import AuthenticatedId from "@/shared/ui/AuthenticatedId";
export default function LoadingScreen({
  reload,
  error,
  authenticatedId,
}: {
  reload: () => Promise<void>;
  error: string;
  authenticatedId: string | null;
}) {
  return (
    <div className="loading">
      <Image width={150} height={150} unoptimized src="/brand/logo.jpg" alt="Nutrequine Pro" />
      <h1>Nutrequine Pro</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          {authenticatedId && <AuthenticatedId id={authenticatedId} />}
          <button onClick={reload}>Volver a intentar</button>
          <a href="/signout-with-chatgpt?return_to=%2F" target="_top">
            Salir de la cuenta actual
          </a>
        </>
      ) : (
        <p>Cargando operaciones…</p>
      )}
    </div>
  );
}
