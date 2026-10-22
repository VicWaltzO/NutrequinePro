# Exportación documental local

Segunda parte del brief, sobre `main` después de integrar PR #5
(`77b4ea598729fe419f73b569b149ad87a25864b8`). La navegación, el perfil integral,
las sedes y su persistencia ya existían en esa integración; esta entrega agrega
cuatro exportaciones reales. No cambia reglas financieras, inventario, fórmulas
originales, confirmaciones, conciliaciones ni el deslizamiento de 440 ms.

## Uso

- **Producción:** `Exportar lote PDF` en cada borrador de la lista y en el detalle.
  Hoja planificada con núcleos, sacos por núcleo, sacos, kg comerciales, kg de
  fórmula e insumos consolidados. Los estados posteriores tienen hoja histórica
  rotulada. La salida operativa omite precios y costos.
- **Venta:** `Descargar nota de venta PDF` en el detalle. Usa partidas e importes
  vigentes, condición, sede, estados, devoluciones y aplicaciones. Destaca
  `COMPROBANTE INTERNO` y `NO VÁLIDO COMO COMPROBANTE DE PAGO TRIBUTARIO`.
  No genera series fiscales, QR ni datos de fabricación.
- **Cliente:** `Exportar historial PDF` en su ficha, con el intervalo Desde/Hasta
  seleccionado. El filtro de estado de la tabla no limita el historial integral.
  Los cobros aparecen una vez; sus aplicaciones se presentan aparte. Cobros
  revertidos no cuentan como recibidos vigentes. Movimientos vinculados externos
  al intervalo se identifican como referencia. Borradores no generan saldo exigible.
- **Balance:** selector `Mes del PDF` y `Exportar balance mensual PDF`. La vista
  previa indica primer/último día y cifras del mes, independientemente de los
  filtros generales de la pantalla. Incluye variación absoluta frente al mes previo
  cuando hay actividad comparable y gráfico vectorial de ventas/cobros.

Los controles deshabilitan descargas duplicadas, anuncian generación/resultado
y permiten reintentar errores sin perder formularios. El navegador descarga un
archivo local, con nombre saneado por código y fecha; no abre servicios externos.

## Contrato y cifras

`GET /api/documents/{production|sale|customer|balance}/{id}.pdf`, donde balance
usa `AAAA-MM` como id. Solo cliente admite `?from=AAAA-MM-DD&to=AAAA-MM-DD`.
Registros inexistentes: 404; filtros inválidos: 422; sesión inválida: 401/403.
La autenticación y la política de lectura se verifican en el servidor: ADMIN,
OPERATOR y VIEWER activos, igual que `/api/state`. Esos roles ya tienen acceso
a los mismos datos operativos y financieros en la aplicación. Ningún endpoint
acepta importes calculados por el navegador ni rutas a archivos.

Una única instantánea autorizada alimenta modelos de documento puros. Se usan
`productionSummary`, `saleSummary`, `paymentSummary`, `customerSummary` y
`balanceSummary`. Exportar no invoca comandos ni escribe revisión, auditoría,
stock o asientos. El transporte conserva las reglas de sesión y soporta prefijos
de frontend mediante `frontendPath`.
El portal de integración conserva `Content-Disposition`, incluido el nombre del
archivo, cuando monta el módulo bajo un prefijo.

Los totales del periodo y saldos actuales se rotulan por separado. El historial
y el balance reflejan el estado vigente de las operaciones: **no reconstruyen
un cierre histórico**. En balance, ventas incorporan devoluciones vigentes;
cobros siguen fecha de recepción menos reversiones fechadas en el mes. Costos
y caja mantienen exactamente las reglas del dominio, incluido costo estimado
por producción registrada, sin inventar un margen por saco vendido. El resultado
comercial se presenta expresamente como estimado.

## Implementación y distribución

- `features/documentos/domain/`: selección de campos y periodos, sin Node ni UI.
- `server/reports.mts`, `report-layout.mts`, `report-format.mts`: PDF A4, tablas
  con encabezados repetidos, filas ordinarias indivisibles, texto seleccionable,
  acentos, pesos en kg, PEN con dos decimales, fechas en español y pie numerado.
  Un campo excepcional mayor que una página continúa como texto rotulado, sin
  cortar datos. Nombres y notas largos se envuelven, incluidos identificadores
  sin espacios. Contactos de empresa excepcionalmente largos se amplían en el
  cuerpo; el encabezado repetido conserva una versión abreviada.
- `features/documentos/components/`: descarga reutilizable y selección mensual.
- `assets/reports/`: logo local existente y Noto Sans Regular/Bold con SIL OFL.

PDFKit **0.20.2**, MIT, genera en Node sin navegador de impresión, CDN ni servicio
remoto. Se eligió por soporte de fuentes incrustadas, tablas/paginación controladas
y distribución offline. Agrega 18 paquetes de runtime, unos 22,2 MB instalados,
más 1,15 MB de fuentes/logo/licencia; el build contiene 69 paquetes en total.
No se agrega PDFKit al bundle del navegador. `build-node.mjs` copia dependencias,
licencias y recursos; la instalación compilada se prueba fuera del árbol de
desarrollo y con bloqueo de conexiones externas. El proceso local debe estar
iniciado para exportar, igual que para consultar los datos.

## Ejemplos y comprobación

Los cuatro archivos de [ejemplos](ejemplos/) usan únicamente transacciones
sintéticas aisladas. El lote usa producto e insumos nuevos de demostración,
sin modificar maestros originales. El catálogo comercial de referencia puede
conservar nombres originales del repositorio; no hay clientes ni operaciones reales.

Regenerar desde `app/`:

```powershell
node scripts/generate-document-examples.mjs
node scripts/generate-document-examples.mjs --stress
```

El segundo comando además escribe casos extremos en `outputs/report-stress/`
(excluido de Git). El reloj de generación de los ejemplos está fijado al
22/10/2026; las marcas de auditoría de los comandos sintéticos corresponden
al momento de ejecutar el script.

Pruebas específicas: `tests/document-reports.test.mjs` y
`tests/local-e2e/document-export.test.mjs`. La primera contrasta importes,
variantes de estado, crédito entre ventas, reversión, rangos/vacíos y ausencia
de efectos. La segunda descarga los cuatro tipos en una distribución instalada,
prueba errores/reintento, carga, permisos de los tres roles, sesión revocada y
conservación completa de estado. Captura escritorio/móvil, claro/oscuro.

Revisión PDF con Poppler, pypdf y pdfplumber: lote 1 página, venta 1, historial 2,
balance 1; historial extenso 12 y texto extremo de venta 3. Se verifica texto
extraíble con acentos, páginas sin hojas vacías, pies `Página x de y`, márgenes,
encabezados repetidos y conservación de los 130 registros/notas extensas.
Las evidencias auxiliares permanecen en `outputs/`; los ejemplos finales y
capturas seleccionadas están en este directorio. El antecedente visual anterior
de navegación/perfil se conserva en `docs/navegacion-clientes/` (PR #5).

Diez huellas HTML corporativas se actualizan únicamente por los controles PDF
y el selector mensual; las demás se conservan. No se cambian fixtures para
ocultar una regresión. El informe de cierre registra la batería completa y la
revisión independiente de Impeccable.

Resultado y trazabilidad de las comprobaciones: [informe de QA](QA.md).
