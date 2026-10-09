# Nutrequine Pro

El código de la aplicación, sus dependencias, migraciones, pruebas y documentación técnica se encuentran en [`app/`](app/README.md).

## Desarrollo

Se requiere Node.js 22.13 o posterior. Desde la raíz del proyecto:

```powershell
cd app
npm.cmd ci
npm.cmd run dev
```

`dev` prepara D1 local automáticamente, conserva las bases existentes y aplica solo migraciones pendientes. Consultar la [guía de desarrollo](app/docs/GUIA_DESARROLLO.md) para usar bases de pruebas separadas, migraciones y configuración local.

## Verificación

Desde `app/`:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run lint
npm.cmd run build
npm.cmd run format:check
```

## Git

El repositorio Git está en la raíz del proyecto y el remoto `origin` es `https://github.com/VicWaltzO/NutrequinePro.git`. Seguir `AGENTS.md` antes de crear commits y sincronizar. Las credenciales y los datos locales deben configurarse por separado y no versionarse.

Para ejecutar todas las verificaciones en orden, usar `npm.cmd run verify` desde `app/`. Ver [CONTRIBUTING.md](CONTRIBUTING.md), [arquitectura](app/docs/ARQUITECTURA.md) e [informe de refactorización](app/docs/REFACTORIZACION_RESULTADOS.md). La rama `codex/refactorizacion-integral` conserva `main` y la versión alojada sin cambios.
