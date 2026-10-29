# NQP26-05 · Reposición y redistribución de reservas

29 de octubre de 2026, America/Bogota. **PARCIAL PROTEGIDA / EN REVISIÓN.**

## Resultado y fronteras

El prototipo ahora asigna automáticamente las entradas compatibles a los faltantes,
con prioridad por entrega, antigüedad UTC e ID ordinal. En el caso 35/40, una
entrada de 10 completa 5 de A y asigna 5 a B. Con prioridad inversa B recibe los
10 sin quitar los 35 firmes de A. Pago, orden de interfaz y entrega son independientes.

Cancelar antes de entrega libera solo K y redistribuye. Reducir cantidad libera
solo el excedente; cambiar precio conserva K. Cambiar presentación o producto
libera la cobertura reemplazada y asigna únicamente existencias compatibles.
Cada versión conserva snapshots anteriores y la cadena completa de movimientos.
La devolución física RETURN_IN alimenta la cola una sola vez; entregar no repite
SALE_OUT. No se inventa costo de venta ni se modifica recepción de producción.

La adopción SALE_COVERAGE_ADOPT exige ADMIN, motivo, fecha propia, antigüedad válida,
presentación completa y ausencia de cargos/devoluciones previos. Con evidencia
ambigua se rechaza todo. No concilia automáticamente históricos ambiguos.
La aplicación nunca adopta al leer, iniciar o recibir producción.

**Siguen bloqueados:** create_production desde reservas, cancelación y rectificación
comercial de pedidos ya entregados. Para estos últimos se utiliza devolución física
expresa, conservando el pedido original. El bloqueo no se acredita como cancelación
funcional de entregados. R05-21 y R05-28 permanecen parciales; planificación y
valoración requieren coordinación con 28–33 y política comercial integrada.

**Reservas empresariales deshabilitadas.** Sin botón, bandera, entorno o parámetro
HTTP para activarlas. Sin fusión, despliegue, datos reales o credenciales privadas.
No hay modificaciones de interfaz ni aviso global de 08/38. C no certifica F física.

## Orden aplicado y base

Solicitud humana: analizar y ejecutar revisión técnica 06 → matriz 05 → flujo
conceptual → orden de ejecución 05. Se contrastaron sus instrucciones con el código
actual y AGENTS.md; no se tomaron sus estados históricos como estado actual.
El contrato 01 y la decisión 04 conservan la semántica comercial de SALE_OUT.

GitHub consultado: #15 fusionado; #16 abierto, draft, cabeza
c094a2e2959d65247099d07e1d2f3d3b4974f84d, base main ead53fa.
CI de esa cabeza: workflow 40815563688 success. Worktree aislado y rama
codex/nqp26-05-cola-reservas desde esa cabeza exacta. Checkout original conservado.
El PR de 05 se apila contra codex/nqp26-06-fecha-entrega. Cuando el responsable
integre #16, actualizar la base contra main y comprobar el diff antes de continuar;
esta tarea no fusiona #16 ni reimplementa sus cambios.

## Persistencia y trazabilidad

coverage_version=1 sigue siendo legible. coverage.events añade los enlaces a cada
cargo y compensación sin cambiar movement_id inicial. Un documento anterior sin
events conserva su forma hasta su primera modificación. Los movimientos guardan
presentación, línea, actor, request_id, causa y enlace de reversión. La cadena de
versiones usa previous_item_id; las liberaciones de líneas retiradas permanecen
en sucesores inactivos. No hay migración ni tablas nuevas.

La cola corre después del handler y antes de auditoría/revisión, dentro del batch
SQLite con revisión optimista. Las ventas y rectificaciones asignan en su contexto;
la pasada final es inerte si N o C son cero. Nunca corre entre elementos de una
compensación batch ni recurre desde SALE_OUT. Se validan acumuladores, ledger y
unicidad de enlaces activos. Cambiar fecha o cobrar sin movimientos no asigna.

## Verificación y fallos conservados

- Rojo inicial: 4 fallos esperados (reposición y cancelación en memoria y SQLite).
- Contrato pendiente R05-28: 1 fallo funcional conservado fuera del repositorio;
  create_production continúa bloqueado. No se contabiliza como prueba aprobada.
- Primera dirigida contra 04: expectativas de bloqueo transitorio ya obsoletas;
  se sustituyeron por transferencias reales y comprobaciones de pagos/presentación.
- verify-01: 335 aprobadas, 2 fallidas, 6 todo. Fallos EPERM al limpiar dos ensayos
  después de comprobaciones funcionales correctas: se corrigió el orden de cierre
  de conexiones antes de eliminar temporales, sin modificar timeouts.
- directed-05: 76 aprobadas, 2 fallidas, 6 todo. Un nuevo ensayo intentaba cambiar
  una política con historial, correctamente impedido por el dominio. Ahora verifica
  ese rechazo y usa un fixture histórico sintético para probar compatibilidad.
- directed-06: una aserción de estado de anulación estaba colocada en rectificación;
  se corrigió su ubicación y se comprueba PENDING_STOCK en presentación pendiente.
- verify-02: 343 aprobadas, 2 fallidas por esa aserción y 6 todo; no fue verde.
- verify-03: 344 aprobadas, 1 fallida y 6 todo. El ensayo Node autonomía agotó
  30 segundos de arranque mostrando TEST_NETWORK_GUARD_ACTIVE, sin LISTENING.
  Había corridas superpuestas; no se demuestra causalidad. No se amplió el timeout
  ni se modificó el ensayo. No se declara resuelto el incidente antiguo de NQP26-01.
- directed-08: 39/39 aprobadas, incluidos los caminos de cancelación y rectificación
  de entregadas legacy dentro del prototipo. Ambos se bloquean sin alimentar la cola.
  Este cerrojo adicional se encontró al revisar el diff; verify-04 valida el conjunto final.
- verify-04: pruebas completas con 347 aprobadas, 6 todo, cero fallidas,
  canceladas u omitidas. Tres comprobaciones TypeScript, lint, formato, build
  completo y auditoría de distribución correctos. Salida 0: 2078 archivos,
  69 paquetes runtime, cero privados y cero paquetes retirados.
- Dirigidas finales de cola: directed-08, 39/39 aprobadas. Invariantes reforzados:
  16 aprobadas y los 6 todo futuros; no se suman como pruebas distintas a verify.
- E2E-01 Chrome completa después del build final: 31/31 aprobadas en una corrida,
  cero fallidas, canceladas, omitidas o todo.
- CI de código c1aa50e5051d1118d85771461a9d197457f1e624: workflow
  [40886602114](https://github.com/VicWaltzO/NutrequinePro/actions/runs/40886602114),
  Calidad de Nutrequine Pro, completed/success. Incluye verify y E2E en Linux.

Matriz final: **28 aprobados de 30 y 2 parciales (R05-21/R05-28)**, sin controles
pendientes. Esto no constituye aceptación empresarial ni habilita las reservas.

GitHub sincronizado: [PR #17](https://github.com/VicWaltzO/NutrequinePro/pull/17)
abierto en borrador, base codex/nqp26-06-fecha-entrega; sin conflictos al verificar.
Commit funcional c1aa50e5051d1118d85771461a9d197457f1e624. El cierre documental
posterior conserva exactamente ese código y sus pruebas; su SHA queda en la bitácora.

I03, I04, I06 e I11 tienen escenarios ejecutables reales en memoria y SQLite.
I14, I15, I16, I17, I18 e I19 permanecen todo intactos. Las pruebas dirigidas no
se suman a verify como si fueran casos distintos. Los E2E validan la aplicación
ordinaria; SQLite y HTTP adicionales acreditan exclusivamente el prototipo.

Informes versionados aquí por app/AGENTS.md. Copias en 03_REPORTES, logs sintéticos
en 04_EVIDENCIAS y fila NQP26-05 en 05_BITACORA/REGISTRO_TAREAS.csv del directorio
local Actualizacion_2026-10-24_Codex. Logs, bases y capturas quedan fuera del commit.
