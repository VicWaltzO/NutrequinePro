# Tarea 12 — Preparación como módulo integrable

Fecha: 15/10/2026. Rama: `feat/integracion-modulo-erp`.
Base: `5238e6f817d6e8003008d7c95c3abdd5649ea961`, main consolidado tras PR #2.
No se modifica main ni se autoriza una fusión automática de esta entrega.

## Alcance y documentación examinada

Se aplicó `programacion-clara` y se consultaron [arquitectura](ARQUITECTURA.md),
[consolidación 09](REPORTE_09_CONSOLIDACION.md),
[preparación corporativa 10](REPORTE_10_PREPARACION_CORPORATIVA.md),
[diseño ERP](ARQUITECTURA_ERP_CORPORATIVO.md),
[validación 11](REPORTE_11_VALIDACION_FINAL.md) y los procedimientos de instalación,
recuperación y operación. Se inspeccionaron entradas, build, servidor de estáticos,
seguridad HTTP, sesión, transporte comercial y harness de regresión.

Nutrequine conserva React/Vite, Node/Fastify, SQLite, dominio, autenticación y API.
Se entrega una frontera de integración por proceso/HTTP, no una biblioteca que
fusiona entidades. No hay identidad corporativa, multiempresa ni Control Granja.
La eliminación local previa de un vídeo en showcase queda excluida de la tarea.

## Modos preparados

| Modo           | Implementación                                                | Condiciones                                                                                          |
| -------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A, prioritario | Portal mínimo con enlace a la URL configurada de Nutrequine.  | Backend, origen, sesión y bases propios; sin cambios comerciales.                                    |
| B, opcional    | Frontend compilado con prefijo y proxy local de demostración. | Mismo prefijo en build/proxy, confianza explícita en el portal del mismo origen; solo HTTP loopback. |

```mermaid
flowchart LR
  User[Usuario] --> Portal[Portal de ejemplo]
  Portal -->|A enlace| App[React y API locales]
  Portal -->|B ruta| Proxy[Proxy loopback]
  Proxy -->|Host y Origin internos| App
  App --> Auth[Sesión y permisos locales]
  Auth --> Domain[Dominio Nutrequine]
  Domain --> Data[SQLite comercial privado]
  Auth --> Access[SQLite de acceso privado]
  Release[Paquete reemplazable] -. código .-> App
```

El frontend usa metadatos de build para resolver rutas HTTP e imágenes. Vite genera
URLs de JS/CSS/recursos con `--base`; el valor predeterminado sigue siendo `/`.
No se añade `<base>` y se conserva CSP `base-uri 'none'`. La navegación por hash,
formularios y contratos comerciales permanecen iguales. No hay un identificador
de empresa, un endpoint de ERP ni selección de base enviada desde el frontend.

El backend no cambia: continúa verificando Host/Origin exactos, cookies locales,
CSRF, actividad/rol y los mismos comandos. El proxy B valida primero su Host/origen,
rechaza cabeceras de identidad/proxy, rutas ambiguas y cuerpos excesivos, y después
traduce únicamente autoridad/ruta y Cookie Path. No inventa CSRF, no concede rol y
no reintenta escrituras. Conserva errores de negocio y filtra cookies del portal.

Un prefijo **no aísla** aplicaciones del mismo origen. El anfitrión podría leer
sesión/CSRF por HTTP si ejecuta código en ese origen: B exige confianza en todo ese
código. No se habilita LAN/Internet, TLS remoto, HMR a través del proxy, CORS abierto
ni SSO. La adaptación de un proxy/ERP real exige conocer y probar su topología,
identidad, política de cookies y administración de secretos. A sigue siendo preferido.

## Distribución y mantenimiento

`npm run build` crea la distribución A. `npm run build -- --base-path
/modulos/nutrequine/` crea B. `npm run package:module -- --destination RUTA_ABSOLUTA`
audita, copia y verifica una entrega nueva fuera del repositorio. No sobrescribe
destinos. Su contenedor incluye `app/` y un manifiesto SHA-256 de rutas relativas,
tamaños y contenido, sin fecha variable ni rutas privadas.

Se conservan Node compilado, React compilado, recursos, dependencias de ejecución,
SQL histórico/CLI, provisión, licencias y documentación/ejemplo de integración.
Se añaden expresamente las licencias de React, React DOM y Lucide al artefacto;
no se añade ninguna dependencia npm. Los archivos de integración se copian por
lista explícita. La auditoría rechaza bases, claves, configuración inesperada,
logs, capturas, source maps, fuentes TS privadas y paquetes de plataforma retirada.
El manifiesto acredita integridad respecto al artefacto comprobado, no una firma
de procedencia ni por sí solo ausencia universal de secretos.

Las bases y configuración permanecen fuera de todo el contenedor reemplazable y
del repositorio anfitrión. La base de acceso conserva su vínculo a la ruta canónica
del negocio. El ejemplo de actualización detiene el proceso, preserva el código
anterior, instala una entrega limpia con las mismas rutas privadas, arranca y
verifica estado y nuevas escrituras tras otro reinicio. No implementa actualizador,
migraciones nuevas ni downgrade automático de esquemas.

## Archivos de entrega y cambios

- [Guía de integración](../integration/README.md): clonación anidada, build,
  empaquetado, provisión segura, ejecución, copia y actualización.
- [Contrato](../integration/CONTRATO_INTEGRACION.md): proceso/puerto, endpoints
  existentes, sesión, CSRF, permisos, errores, reintentos y responsabilidades.
- [Portal](../integration/EJEMPLO_PORTAL.md): comandos y límites A/B.
- `integration/portal.mjs`, `integration/paths.mjs`: demostración y validación
  local del montaje; sin dependencias externas ni API corporativa simulada.
- `client/paths.ts`, sesión e imágenes: resolución del prefijo por metadatos de build.
- Scripts de build y paquete: parámetro explícito, licencias/documentos e inventario.
- Pruebas del cliente/proxy y E2E de integración; harness ampliado solo para
  seleccionar una distribución y un frontend de prueba reales.

No cambian `features/`, reglas, persistencia, esquema, SQL, autenticación ni controles
HTTP del backend. Las fixtures comerciales/visuales históricas no se regeneran.

## Verificaciones de esta entrega

Resultados en preparación: esta sección se completará con las ejecuciones finales,
incluido el clon anidado limpio, antes del commit de cierre y el Pull Request.
No se consideran aprobados todavía por la sola existencia de pruebas o documentos.

Las pruebas adicionales evalúan componentes implementados:

| Área              | Evidencia prevista                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Cliente prefijado | Login, ruta comercial, CSRF y mismo cuerpo/request_id.                                                                          |
| Proxy real HTTP   | Host/Origin, cabeceras, rutas, tamaño, cookies, error 422 sin reintento.                                                        |
| Paquete           | Destino nuevo externo, rechazo de sobrescritura, dos manifiestos idénticos, copia hash verificada.                              |
| Navegador A       | Enlace, login real, formulario, escenario portable, reemplazo del código, datos y sesión conservados, nueva escritura/reinicio. |
| Navegador B       | JS/CSS/imágenes, login, Cookie Path/HttpOnly/SameSite, CSRF/Host/Origin, rechazo privado, escenario portable, reinicio/logout.  |
| Clon anidado      | Instalación desde lockfile, build y ejecución con configuración/datos externos, sin herramientas de plataforma.                 |

El escenario portable conserva las mismas expectativas de céntimos, gramos,
inventario, crédito, cobranza, idempotencia e historial de la regresión existente.
Las pruebas solo usan datos sintéticos. PNG y JSON se conservan como evidencia local
ignorada, sin introducir snapshots nuevos ni archivos privados en el paquete.

## Pendiente del anfitrión real

Elegir administración de procesos y versiones, puerto/rutas, entrega de Node,
topología/orígenes, custodia de secretos, política de copias/recuperación y aceptación
operativa. Definir un contrato de identidad antes de SSO; no duplicar usuarios ni
interpretar cabeceras como identidad. Control Granja sigue pendiente de auditoría.

No hay prueba de integración con un ERP desconocido, exposición remota, múltiples
empresas o migración de una versión futura. El ensayo de sustitución usa el mismo
esquema y no demuestra compatibilidad con cualquier versión futura. El bloqueo de
red de los tests no es certificación de firewall del sistema operativo. Se conservan
las reservas operativas y de dependencias de desarrollo documentadas en Tarea 11.
