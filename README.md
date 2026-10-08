# Nutrequine Pro

El código de la aplicación, sus dependencias, migraciones, pruebas y documentación técnica se encuentran en [`app/`](app/README.md).

## Desarrollo

Se requiere Node.js 22.13 o posterior. Desde la raíz del proyecto:

```powershell
cd app
npm.cmd ci
npm.cmd run build
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --file drizzle/0000_nervous_silver_fox.sql --persist-to .wrangler/state --config dist/server/wrangler.json
npm.cmd run dev
```

Aplicar la migración inicial solo una vez a una base local vacía. Consultar `app/README.md` para las migraciones posteriores, arquitectura y configuración de acceso.

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
