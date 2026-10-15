# Guía de desarrollo

## Requisitos e instalación

Node.js 22.13 o posterior, npm y Git. La validación de esta refactorización se
ejecutó en Windows con Node.js 24.18.0; CI utiliza Node.js 24 en Ubuntu. Git se
ejecuta desde la raíz; npm desde `app/`. No se requiere una cuenta Cloudflare para
la vista previa local portable ni credenciales de producción.

```powershell
git clone https://github.com/VicWaltzO/NutrequinePro.git
cd NutrequinePro
git switch codex/reestructuracion-arquitectonica
cd app
npm.cmd ci
npm.cmd run dev
```

En macOS/Linux usar `npm`. El panel responde en
[http://127.0.0.1:5173](http://127.0.0.1:5173). El inicio de sesión local portable
usa la identidad de prueba del starter. Esa identidad solo tiene autoridad en la
base local; no habilita usuarios del sitio alojado. Una base nueva contiene los
maestros documentados y ninguna venta, pago o producción ficticia.

`dev` portable inspecciona y prepara D1 automáticamente antes de iniciar Vinext. No es
necesario compilar ni ejecutar manualmente la migración inicial. Puede ejecutarse
`npm.cmd run db:prepare` para preparar o comprobar D1 sin iniciar el servidor.
`db:migrate:local` conserva el mismo alias incorporado desde main. El perfil Linux
administrado conserva el mecanismo de arranque del helper de Sites.

## Configuración local y bases de pruebas

Los defaults son `DB`, la identidad de `wrangler.local.json` y `.wrangler/state`.
`vite.config.ts` comparte esos valores. No cambiar un binding o una ruta de forma
aislada: migraciones y servidor deben leer la misma base.

Para probar operaciones sin modificar la base habitual:

```powershell
$env:NUTREQUINE_LOCAL_STATE_DIR='.wrangler/prueba-desarrollador'
npm.cmd run dev
```

En otra sesión, establecer el mismo valor permite recuperar esa base. Detener el
servidor antes de cambiar la ruta. Para volver al default:

```powershell
Remove-Item Env:NUTREQUINE_LOCAL_STATE_DIR -ErrorAction SilentlyContinue
```

En macOS/Linux:

```sh
NUTREQUINE_LOCAL_STATE_DIR=.wrangler/prueba-desarrollador npm run dev
```

Los tests automatizados usan estados sintéticos, SQLite en memoria y archivos
aislados, además de D1 local de pruebas; no usan las
bases de desarrollo ni de producción. Nunca versionar bases, volcados, `.env`,
IDs privados de usuarios, logs o capturas con datos reales.

## Comandos

### Backend Node y autenticación local

El backend independiente requiere Node 24.18+, una base SQLite preparada y un
archivo privado de credenciales vinculado explícitamente. Consultar
[el procedimiento completo de Tarea 07](REPORTE_07_BACKEND_NODE.md) para el primer
administrador y la vinculación histórica. No utiliza el usuario simulado de `dev`.

`npm.cmd run check:node` verifica sus tipos; `npm.cmd run build:node` genera
`dist-node/` con las dependencias operativas. Iniciar mediante
`node dist-node/server/main.mjs --config RUTA_ABSOLUTA_PRIVADA`. El archivo JSON
elige ambas bases y puerto; solo se escucha en 127.0.0.1. El frontend original
sigue usando sus comandos anteriores y todavía no se conecta a este backend.

### Administración SQLite independiente

Con Node 24.18+, `node scripts/sqlite-admin.mjs` ofrece `directory`, `init`,
`inspect`, `migrate`, `verify`, `backup`, `verify-backup` y `restore`. Requiere
rutas absolutas, directorios privados y selección explícita; no usa Wrangler ni
modifica la persistencia de `dev`. La inicialización crea únicamente esquema y
ledger, sin usuarios o maestros. Consultar
[la guía operativa SQLite](REPORTE_06_MIGRACIONES_SQLITE.md) antes de adoptar,
actualizar o recuperar archivos. `npm run db:prepare` continúa siendo el comando D1.

### Aplicación actual

| Comando                    | Propósito                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm.cmd ci`               | Instalar las versiones del lockfile                                                                |
| `npm.cmd run dev`          | Preparar D1 local y servir con HMR                                                                 |
| `npm.cmd run db:prepare`   | Inspeccionar y aplicar solo migraciones locales pendientes                                         |
| `npm.cmd test`             | Regresión comercial, persistencia, interfaz y arquitectura                                         |
| `npm.cmd run check`        | TypeScript estricto sin emitir archivos                                                            |
| `npm.cmd run lint`         | ESLint; advertencias hacen fallar el comando                                                       |
| `npm.cmd run format`       | Prettier 3.6.2, dos espacios, LF, ancho orientativo 110                                            |
| `npm.cmd run format:check` | Comprobar formato sin modificar archivos                                                           |
| `npm.cmd run build`        | Compilar las rutas y el Worker                                                                     |
| `npm.cmd run verify`       | Pruebas, tipos generales/Node, lint, formato y ambas compilaciones; detenerse ante el primer fallo |
| `npm.cmd run db:generate`  | Generar una migración futura desde `db/schema.ts`                                                  |
| `npm.cmd start`            | Servir el Worker compilado local con `.wrangler/state`                                             |

`start` requiere `build` y D1 ya preparado. Su ruta sigue siendo el default;
para una prueba aislada con `NUTREQUINE_LOCAL_STATE_DIR` utilizar `dev`.
Los archivos generados, migraciones históricas, recursos originales y componentes
de terceros se excluyen de Prettier. No desactivar reglas para resolver errores de
la aplicación; revisar las exclusiones existentes del código vendorizado.

## Migraciones

Antes de cambios de arquitectura o esquema, consultar el
[estado base registrado](ESTADO_BASE_ARQUITECTURA.md) y el
[procedimiento de respaldo y restauración](RESPALDO_RESTAURACION.md).

Las migraciones aplicadas son inmutables. Modificar el esquema Drizzle, generar una
migración nueva y revisar SQL y datos afectados antes de incorporarla. Ejecutar
`db:prepare` sobre una base aislada; volver a ejecutarlo debe no repetir cambios.
Después ejecutar `verify` y los escenarios afectados. La publicación alojada
continúa usando su mecanismo existente; `db:prepare` nunca incluye `--remote`.

La preparación reconoce cuatro situaciones:

- Base sin tablas de aplicación: aplica las migraciones versionadas.
- Esquema inicial completo sin ledger: compara tablas e índices, registra la migración
  inicial como aplicada y conserva registros; solo ejecuta posteriores pendientes.
- Ledger conocido: valida el orden y aplica únicamente pendientes.
- Esquema parcial/ajeno sin ledger, ledger desconocido o ledger sin esquema:
  se detiene con diagnóstico; no intenta borrar ni reparar datos automáticamente.

Para consultar el esquema default sin mutaciones:

```powershell
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config wrangler.local.json --persist-to .wrangler/state --command "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
```

Si se usa una ruta de pruebas, sustituir `--persist-to` por esa misma ruta. No
imprimir ni compartir resultados con datos personales de tablas operativas.

## Regresión y comprobación manual

Consultar [ACEPTACION.md](ACEPTACION.md). La suite cubre A–F, permisos, snapshots,
crédito, reversiones, stock, devoluciones, costos, precisión, rollback y concurrencia.
Los 66 fingerprints de HTML se capturaron antes de extraer la interfaz, en
`2f7c03b`, con datos sintéticos deterministas. No actualizar sus hashes para ocultar
una diferencia: determinar primero si cambia comportamiento, markup o diseño.
Este control de SSR no sustituye pruebas de interacción ni comparación visual.

En una base aislada verificar sesión, panel y navegación; abrir un formulario;
registrar venta futura con pago parcial y lote; confirmar lote; entregar; registrar
un cobro excedente y aplicar crédito a otra venta; revisar inventario y balance;
rectificar y devolver con motivo; conciliar y cerrar producción. Recargar y
reiniciar `dev` sobre la misma ruta: los datos deben conservarse. No hacer estas
pruebas sobre la web alojada. Las pruebas manuales de esta rama se documentan en
[REFACTORIZACION_RESULTADOS.md](REFACTORIZACION_RESULTADOS.md).

## Errores frecuentes

**`D1_ERROR: no such table: settings` / `/api/state` 503.** Se reprodujo con una base
aislada sin migrar. `loadState` necesita el esquema antes de `ensureState`.
Ejecutar `dev` o `db:prepare`; comprobar la ruta compartida y binding. No volver a
ejecutar el SQL inicial a ciegas ni borrar `.wrangler`.

**Esquema parcial o historial desconocido.** Conservar la base, revisar las
migraciones y la ruta correcta. Preparar un procedimiento de recuperación revisado
si hay alteraciones manuales. Cambiar de ruta no recupera datos de otra base.

**Otra operación actualizó los datos.** Es el guard de revisión: recargar y
reintentar. No desactivarlo ni repetir ingresos manualmente para sortearlo.

**Binario faltante.** Esperar a que termine `npm ci`; no ejecutar compilaciones
contra una instalación aún incompleta. Reinstalar con el lockfile si falló.

**EPERM / EACCES en un entorno aislado.** Distinguir permisos de ejecución/red
del entorno de errores de código. Repetir el comando autorizado con los permisos
necesarios; no desactivar validaciones de negocio.

**Puerto ocupado.** Detener únicamente el servidor de esta tarea. No terminar
procesos de otro desarrollador. Puede pasarse otro puerto con
`npm.cmd run dev -- --port 5174` y usarlo consistentemente en las comprobaciones.
