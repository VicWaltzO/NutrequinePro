# Nutrequine Pro

El código de la aplicación, sus dependencias, migraciones, pruebas y documentación técnica se encuentran en [`app/`](app/README.md).

## Desarrollo

Se requiere Node.js 22.13 o posterior. Desde la raíz del proyecto:

```powershell
cd app
npm.cmd ci
npm.cmd run dev
```

Abrir http://127.0.0.1:5173 e iniciar sesión con la identidad de prueba local. `npm.cmd run dev` prepara la base y aplica las migraciones pendientes antes de arrancar. No requiere Docker ni una compilación previa. Los datos SQLite se conservan en `app/.wrangler/state/`, separados de producción. Consultar `app/README.md` para más detalles.

## Verificación

Desde `app/`:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run lint
npm.cmd run build
```

## Git

El repositorio Git está en la raíz del proyecto y el remoto `origin` es `https://github.com/VicWaltzO/NutrequinePro.git`. Seguir `AGENTS.md` antes de crear commits y sincronizar. Las credenciales y los datos locales deben configurarse por separado y no versionarse.
