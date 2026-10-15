# Nutrequine Pro

Aplicación empresarial local de producción, ventas, inventario y cobranza.
Usa React 19, TypeScript, Vite, Node.js, Fastify y SQLite. Cliente y API comparten
un origen restringido a `127.0.0.1`; las credenciales y los datos residen fuera
del código. No requiere una cuenta de plataforma para operar.

El código está en [`app/`](app/README.md). Git se ejecuta desde esta raíz y npm
desde `app/`. Se requiere Node.js **24.18 o superior**.

## Preparación y ejecución

Seguir la [instalación local](app/docs/INSTALACION_LOCAL.md) para crear un directorio
privado, preparar SQLite, provisionar credenciales y seleccionar la configuración.
El arranque no crea bases ni usuarios de forma silenciosa.

```powershell
cd app
npm.cmd ci
npm.cmd run build
npm.cmd start -- --config "D:\NutrequinePrivado\servidor.json"
```

Para desarrollar: `npm.cmd run dev -- --config RUTA_PRIVADA_ABSOLUTA`.
Vite funciona como middleware de Fastify, con HMR y API en el mismo puerto.

## Verificación y colaboración

`npm.cmd run verify` ejecuta pruebas, TypeScript de cliente y servidor, ESLint,
Prettier, compilación completa y auditoría de la distribución. Después ejecutar
`npm.cmd run test:e2e`; preparar Chromium con `npx.cmd playwright install chromium`
o seleccionar Chrome instalado mediante `REGRESSION_BROWSER_CHANNEL=chrome`.

Consultar [arquitectura](app/docs/ARQUITECTURA.md),
[desarrollo](app/docs/GUIA_DESARROLLO.md),
[respaldo y restauración](app/docs/RESPALDO_RESTAURACION.md),
[consolidación y evidencias](app/docs/REPORTE_09_CONSOLIDACION.md) y
[colaboración](CONTRIBUTING.md). Los informes 01–08 describen antecedentes históricos.

Para incorporar el módulo a otro repositorio, seguir la
[guía de integración](app/integration/README.md): enlace independiente prioritario,
proxy local opcional, paquete verificable y mantenimiento con datos externos.

Trabajar en la rama indicada para cada tarea; seguir ambos `AGENTS.md`.
No versionar contraseñas, bases, configuración privada, capturas o distribuciones.
El remoto es `https://github.com/VicWaltzO/NutrequinePro.git`. La historia permanece
recuperable; esta consolidación no publica cambios en producción.
