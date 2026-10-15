# Guía de desarrollo

La arquitectura principal es React/Vite y Fastify/Node con SQLite local.
Requiere Node 24.18+, npm y Git. Consultar [instalación](INSTALACION_LOCAL.md)
antes del primer arranque; la provisión y los datos son explícitos y privados.

## Flujo de trabajo

Git se ejecuta desde la raíz del repositorio; npm desde `app/`.

```powershell
npm.cmd ci
npm.cmd run dev -- --config "D:\NutrequinePrivado\desarrollo.json"
```

La configuración selecciona `database`, `auth_database` y `port`; en operación
compilada incluye `frontend_directory`. Son rutas absolutas privadas. En desarrollo
el build público se sustituye por Vite middleware. Navegador, cookies, API y HMR
usan la misma dirección `http://127.0.0.1:PUERTO`; no abrir otro origen ni CORS.
No reutilizar datos operativos para desarrollo.

## Comandos

| Comando                                         | Propósito                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm ci`                                        | Instalación reproducible desde el lockfile.                                   |
| `npm run dev -- --config RUTA`                  | React con HMR y backend real bajo un mismo origen.                            |
| `npm run build`                                 | Reconstruye cliente, Node y distribución `dist-node/`.                        |
| `npm run build:client` / `build:node`           | Compilación parcial; para distribuir usar build completo.                     |
| `npm start -- --config RUTA`                    | Servidor compilado; requiere build, bases y credenciales previos.             |
| `npm test`                                      | Dominio, store, SQLite, HTTP real, sesiones, recuperación, UI y arquitectura. |
| `npm run test:e2e`                              | Flujos del cliente independiente y ensayo de desarrollo.                      |
| `npm run check` / `check:client` / `check:node` | TypeScript general y por entrada.                                             |
| `npm run lint` / `format:check` / `format`      | ESLint, verificación de estilo y formato explícito.                           |
| `npm run verify`                                | Batería completa salvo navegador; termina auditando la distribución.          |
| `npm run check:distribution`                    | Rechaza paquetes retirados, fuentes privadas y datos en el artefacto.         |
| `npm run db:admin -- COMANDO ...`               | Directorios, init, inspect, migrate, verify, backup y restore SQLite.         |
| `npm run auth:prepare -- OPCIONES`              | Provisión autorizada mediante JSON privado por stdin.                         |
| `npm run db:generate`                           | Generar futuras migraciones para revisión; nunca regenerar las aplicadas.     |

## Organización

Trabajar en `client/` para composición y sesión de interfaz; en `server/` para
transporte, autenticación y configuración. Las funcionalidades conservan
`features/<nombre>/components`, `hooks` y `domain`; los contratos están en
`shared/types` y `lib/persistence-port.ts`. No duplicar operaciones del servidor.
Las previsualizaciones usan `lib/domain-preview.mjs`; los comandos autoritativos
se ejecutan exclusivamente por API. El alias `@/` solo representa la raíz de
fuentes; no sustituye módulos ni modifica código al compilar.

Los builds reemplazan únicamente `dist-client/` y `dist-node/`, dentro de app.
No colocar datos en esas carpetas. La distribución incluye herramientas SQLite
y avisos legales; no contiene credenciales ni la base de pruebas.

## Pruebas y evidencia

Preparar Chromium con `npx.cmd playwright install chromium`. Para Chrome instalado,
seleccionar `REGRESSION_BROWSER_CHANNEL=chrome`. Los tests utilizan exclusivamente
estados y archivos sintéticos externos al código. No se instala una herramienta
de navegador desde un paquete multimedia ajeno a la aplicación.

Los hashes HTML independientes proceden del commit funcional Tarea 08 y fueron
capturados antes de consolidar; la referencia anterior también se conserva.
No regenerar snapshots para ocultar diferencias. Evidencias en `outputs/` y
bases temporales permanecen ignoradas; revisar capturas antes de aprobar cambios.

La suite E2E incluye L01–L15, desarrollo y una validación final con métricas,
concurrencia, bloqueo, copia fría de autenticación y teclado. Ejecutarla después
del build; no reconstruir `dist-node/` mientras un test lo copia. Para repetir
solo las mediciones: `node --test tests/local-e2e/final-validation.test.mjs`.
Las muestras sintéticas y sus límites se describen en el
[reporte final](REPORTE_11_VALIDACION_FINAL.md); no constituyen una prueba de carga
empresarial ni una certificación de seguridad.

El CI usa Node 24.18.0, npm ci, verify y navegador Chromium. La preparación puede
descargar paquetes; el ensayo de distribución bloquea red externa mediante
instrumentación de tests. No equivale a una certificación de firewall del SO.

Para bloqueos, esquema desconocido o sesión expirada conservar el formulario y
el request_id; corregir la causa y reintentar manualmente. No inicializar otra
base para ocultar un error. Ver [recuperación](RESPALDO_RESTAURACION.md) y
[arquitectura](ARQUITECTURA.md). Los reportes previos son antecedentes, no requisitos
operativos de plataforma.
