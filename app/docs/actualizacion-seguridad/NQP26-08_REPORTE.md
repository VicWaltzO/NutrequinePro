# NQP26-08 · Aviso global de faltantes netos

2026-10-29, America/Bogota. Calendario operativo: America/Lima.
Estado: validación local conforme para Capa 1; CI y entrega en curso. Aceptación empresarial pendiente de Capa 2.

## Base y diagnóstico

Se revisó primero NQP26-07_REVISION_TECNICA, después la matriz A08-01–22 y la orden 08, contrastadas con ALERTA-01, R20–R27 y contratos/código 04–07. La revisión 07 no habilita reservas ni completa E07-14.

GitHub confirmó #18 abierto/borrador, sin fusión, cabeza `7f987c547968a0c555adaa13cbac694755cfbfee`. `origin/main` sigue en `2219f98fea2db06fc341e9b0c7e383f657aac89e`. La rama `codex/nqp26-08-aviso-global` se apila sobre `codex/nqp26-07-entrega-ux`, por dependencia del detalle moderno de venta de 07 (SaleDetail/SaleSupplyStatus), al que enlaza el aviso, y sus regresiones. En main ese detalle todavía no presenta cobertura K/N ni la guarda moderna de entrega. Worktree aislado; modificaciones y eliminaciones ajenas del checkout original preservadas.

Diagnóstico previo local: `03_REPORTES/NQP26-08_DIAGNOSTICO.md`. `useAdminOperations` ya reemplaza el estado después de comandos y recarga. `AdminWorkspace` es común a navegación y roles. El dominio valida acumuladores y enlaces de cobertura; no hay proyección global. El servidor ordinario rechaza bases modernas y el experimental rechaza servir frontend. Estas guardas permanecen intactas.

## Implementación

`pendingStock` es una proyección pura de estado comercial validado: solo ventas coverage_version=1, CONFIRMED/RECTIFIED y PENDING, y líneas vigentes con coverage.version=1. Deriva N=max(0,q−K) desde cobertura vinculada; no consulta committed ni saldo de movimientos, no asigna y no adopta históricos. Ventas únicas globalmente y dentro de cada grupo.

Agrupa por producto, unidad, peso real, peso nominal, política de peso y mecanismo. NUCLEUS_PRODUCTION explícito en saco suma al resumen por producir. DIRECT_STOCK se desglosa por presentación sin agregar a fabricación. El maestro explícito es fiable porque PRODUCT_SAVE impide cambiar presentación/modalidad con historial. No se aplica el default de productPresentation a maestros ambiguos: quedan informativos, por determinar. Los snapshots de línea conservan precedencia; no se reescriben ni convierten frascos, unidades o pesos.

`PendingStockBanner` monta una franja en flujo normal, antes del título operativo, con resumen textual, desplegable nativo, detalle por producto/presentación y ventas ordenadas según fecha de entrega, antigüedad e ID. Abrir venta reutiliza sale-detail existente. Resumen aria-live polite/atomic; teclado y foco nativos; enlaces de lectura para ADMIN, OPERATOR y VIEWER. La franja desaparece sin N>0, aunque la entrega siga pendiente. Microinsumos permanecen separados.

No cambia comandos, permisos, persistencia, esquemas, HTTP, fechas, pagos, lotes, precios o movimientos. No hay flag de entorno/URL/UI/configuración para reservas. No hay adopción legacy, fusión, despliegue ni datos empresariales.

## Evidencia y límites

Los escenarios de dominio usan comandos reales de la composición aislada en memoria y SQLite. El ensayo de navegador empieza con un servidor ordinario y una venta legacy, comprueba ausencia de aviso K/N y luego utiliza transporte simulado solo dentro de Playwright para leer otro estado sintético persistido. Bloquea cualquier comando del navegador en esa fase. No hay ruta de fixture en la aplicación ni enlace del servidor ordinario al motor experimental.

Navegación/recarga/actualización modernas, roles y render del banner son evidencia sintética protegida. No acreditan actualización comercial ordinaria tras reposición. A08-15/16 se mantienen PARCIALES por esa frontera; los resultados de SSR nunca se presentan como integración empresarial. I14–I19 y E07-14 siguen pendientes/parcial según sus contratos.

## Ejecuciones

- Rojo inicial: prueba no ejecutable por selector aún inexistente; 0 aprobadas, 1 fallida, sin ocultar el intento.
- Dirigida 01: 3 aprobadas, 2 fallidas. El fixture histórico no tenía modalidad explícita: se preparó la ficha antes de historial, sin relajar clasificación.
- Dirigida 02: 3 aprobadas, 2 fallidas. El dominio rechazó anular una venta con pago; el ensayo ahora revierte expresamente el pago antes de cancelar.
- Dirigida 03: 5/5 aprobadas, cero fallidas/todo/omitidas/canceladas. Incluye memoria y SQLite. Están incluidas en verify, no se suman aparte.
- Comprobación adicional exact-seven: RECTIFIED, q=14/K=7/N=7 y una venta. No se suma al total de pruebas.
- verify-01: salida 0; 355 aprobadas, seis todo I14–I19, cero fallidas/omitidas/canceladas. Tres TypeScript, lint, formato, compilación y auditoría correctos: 2078 archivos, 69 paquetes runtime, cero privados/retirados.
- UI-01 dirigida: 1/1 aprobada. Navegación/recarga, roles, teclado, aria, retiro tras reposición/cancelación y cuatro capturas 1440/390 claro/oscuro. El estado ordinario legacy no muestra aviso K/N. Se conserva distinción de transporte sintético.
- E2E-01 completo: 33/33 aprobadas en una corrida después del build final; cero fallidas/omitidas/canceladas/todo, salida 0. Incluye flujos ordinarios de fechas, Entrega legacy, lote, pagos, reapertura, CascoPlus+, BASE no vendible y formularios; el control nuevo A08 declara explícitamente su segmento sintético. No se suman UI-01 ni dirigidas al total.
- Después de verify, el único cambio de prueba fue capturar fullPage en lugar del viewport; el E2E completo usa esa línea final. Lint y formato del ensayo repetidos correctamente. Código funcional sin cambios desde 17e8836.
- CI: pendiente de publicación del borrador.

Logs completos de todos los intentos y capturas sintéticas en `04_EVIDENCIAS`, fuera de Git. No se cambian timeouts ni huellas de regresión HTML.

## Revisión

Revisión estática independiente del SHA funcional `17e88365cad71c40dd5d6c2d99d0a6caa04c9000` contra 7f987c5: sin hallazgos P0–P2. Alcance: código y pruebas escritas; no ejecución ni aprobación empresarial/formal de GitHub. Revisión independiente de documentación visual: extensión compatible con tokens y reglas existentes; DESIGN.md conservado. Deuda preexistente design.json no reparada ni canonizada.

Revisión visual independiente final: **ship** para esta extensión operativa, sin correcciones materiales. Cuatro capturas fullPage desde el inicio del documento: 1440×1000 y 390×844, claro/oscuro, estado desplegado con foco visible. Franja en flujo normal y acciones posteriores alcanzables; sin desbordamiento del cuerpo. El desplegable comienza cerrado. Detector Impeccable sobre targets modificados: [] (una ejecución). No equivale a prueba en teléfono físico ni lector de pantalla real.

## Archivos de la entrega

- app/features/ventas/domain/pending-stock.mjs
- app/features/ventas/components/PendingStockBanner.tsx
- app/client/pending-stock.css
- app/client/admin/AdminWorkspace.tsx
- app/client/main.tsx
- app/tests/pending-stock.test.mjs
- app/tests/local-e2e/pending-stock.test.mjs
- app/docs/actualizacion-seguridad/NQP26-08_REPORTE.md
- app/docs/actualizacion-seguridad/NQP26-08_MATRIZ_ACEPTACION.csv

El cierre se calificará conforme para Capa 1 solo después de las comprobaciones reales; sin aceptación empresarial ni activación del motor.
