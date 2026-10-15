# Instalación y ejecución local

Requiere Node.js **24.18 o superior**, npm, Git y un navegador moderno. Usar una
cuenta del sistema operativo controlada. Los datos deben quedar en un directorio
privado fuera del checkout y de la carpeta reemplazable de instalación.
La preparación de paquetes y navegador de pruebas puede descargar archivos;
el servidor y el cliente compilados operan por loopback sin descargas al arrancar.

## Preparar código y herramientas

Desde la raíz del repositorio:

```powershell
git switch codex/reestructuracion-arquitectonica
cd app
npm.cmd ci
npm.cmd run verify
```

En Linux/macOS usar `npm`. Las rutas siguientes son ejemplos que debe seleccionar
el responsable de la instalación; no apuntan a bases operativas predeterminadas.
Los comandos rechazan destinos existentes o inseguros en lugar de sobrescribirlos.

## Crear una instalación nueva

La CLI crea el último nivel del directorio con permisos privados. Su padre debe
existir. Seleccionar una ruta nueva; no cambiar permisos de un directorio ajeno.

```powershell
npm.cmd run db:admin -- directory --directory "D:\NutrequinePrivado"
npm.cmd run db:admin -- init --database "D:\NutrequinePrivado\negocio.sqlite"
npm.cmd run db:admin -- verify --database "D:\NutrequinePrivado\negocio.sqlite"
```

`init` prepara las tablas sin crear identidades ni registros comerciales. No es
un paso para abrir una base existente. Para adoptar una copia histórica autorizada,
inspeccionar y respaldar primero, detener el servidor y seguir el procedimiento
de [base de datos](RESPALDO_RESTAURACION.md). No importar datos reales en pruebas.

Crear mediante el procedimiento seguro de la organización un archivo privado
JSON con `user_id`, `name`, `login` y `password`. La contraseña necesita al menos
15 caracteres y hasta 1024 bytes UTF-8. Nunca escribirla en argumentos, Git,
capturas o logs. Enviar ese archivo exclusivamente por stdin:

```powershell
Get-Content -Raw -LiteralPath "D:\NutrequinePrivado\provision.json" | npm.cmd run auth:prepare -- --database "D:\NutrequinePrivado\negocio.sqlite" --auth-database "D:\NutrequinePrivado\acceso.sqlite" --mode new
```

El modo `new` requiere un negocio vacío; no crea maestros ficticios ni usuarios
predeterminados. `link` es para vincular un ADMIN histórico activo con autorización
expresa del responsable, conservando su ID; exige `--authorize-link`. La base de
acceso de destino debe ser nueva. No usar el modo new para recuperar una cuenta.
La gestión posterior de credenciales y revocación usa la API ADMIN autenticada
descrita en el [reporte 07](REPORTE_07_BACKEND_NODE.md).

Crear `D:\NutrequinePrivado\servidor.json` con permisos privados:

```json
{
  "database": "D:\\NutrequinePrivado\\negocio.sqlite",
  "auth_database": "D:\\NutrequinePrivado\\acceso.sqlite",
  "port": 4317,
  "frontend_directory": "C:\\NutrequineLocal\\app\\public-client"
}
```

## Compilar y ejecutar

```powershell
npm.cmd run build
```

Copiar el contenido de `dist-node/` a una nueva carpeta de instalación, por ejemplo
`C:\NutrequineLocal\app`. Conservar la carpeta contenedora y la subcarpeta app;
el control de datos privados excluye ese árbol de código completo. La distribución
contiene dependencias de runtime, recursos, SQL histórico, avisos y herramientas
administrativas. No necesita node_modules del checkout ni herramientas de desarrollo.

```powershell
node C:\NutrequineLocal\app\server\main.mjs --config "D:\NutrequinePrivado\servidor.json"
```

Acceder a `http://127.0.0.1:4317`. Se admite exactamente ese Host/origen y el
servidor escucha exclusivamente en loopback. No sustituir por una dirección LAN
ni abrir CORS. Cliente, API y cookies comparten origen; CSRF permanece en memoria.
Salir desde el panel revoca la sesión. Ctrl+C cierra el proceso; reiniciar con
la misma configuración conserva datos y sesiones vigentes.

Desde el checkout, `npm.cmd start -- --config RUTA_PRIVADA_ABSOLUTA` inicia el
servidor compilado. `npm.cmd run dev -- --config RUTA_PRIVADA_ABSOLUTA` usa Vite
como middleware de Fastify con HMR bajo el mismo origen. En desarrollo se ignora
`frontend_directory`. La base y credenciales deben existir antes del arranque.
Las opciones TLS `tls_certificate`/`tls_key` siguen disponibles; no desactivar
validaciones de certificados para operar.

## Pruebas y recuperación

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

La instalación de Chromium es preparación de desarrollo, no una dependencia de
operación. Para usar Chrome instalado, establecer `REGRESSION_BROWSER_CHANNEL=chrome`.
Los E2E crean bases y contraseñas sintéticas aisladas. Capturas, trazas y logs son
locales ignorados. No ejecutar esta batería contra bases o credenciales reales.

Consultar [respaldo y restauración](RESPALDO_RESTAURACION.md),
[arquitectura](ARQUITECTURA.md) y [desarrollo](GUIA_DESARROLLO.md). No sustituir una
base por una copia sin verificar su manifiesto, relaciones e historial; no copiar
manualmente una base activa ni inicializar silenciosamente una ruta ausente.
