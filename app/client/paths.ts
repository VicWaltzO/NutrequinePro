/** Build metadata keeps assets and HTTP requests in the same local mount, without a base element. */
export function frontendPath(path: string) {
  const base =
    typeof document === "undefined"
      ? "/"
      : (document.querySelector<HTMLMetaElement>('meta[name="nutrequine-base-path"]')?.content ?? "/");
  if (!/^\/(?:[a-z][a-z0-9-]*\/)*$/.test(base)) throw new Error("Ruta pública inválida.");
  return base + path.replace(/^\//, "");
}
