export function validateBasePath(value) {
  if (typeof value !== "string" || value.length > 120 || !/^\/(?:[a-z][a-z0-9-]*\/)*$/.test(value))
    throw new Error("La ruta debe ser / o segmentos ASCII en minúsculas terminados en /.");
  return value;
}
