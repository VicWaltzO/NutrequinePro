# NQP26-40 · Auditoría técnica y transferencia local

Base integrada `18bfba0068a9281c340e9e38949ec6b7e27b6437`. Incluye NQP26-38 en el PR
#51 y NQP26-39 en el PR #52. Esta auditoría corresponde a las 41 fichas del plan y
sus matrices complementarias. La matriz oficial y las evidencias se entregan
localmente en `Actualizacion_2026-10-24_Codex`.

## Correcciones verificables

- La rectificación de ventas conserva el mismo estado financiero final en el
  snapshot y en los campos de auditoría. La comprobación cruza el registro
  persistido, los pagos y los movimientos.
- Los movimientos de ajuste individual y el stock resultante conservan al menos
  un gramo por unidad registrada. Se admite una diferencia de gramos sin
  unidades vendibles. Se conservan los pesos variables históricos y el mensaje
  previo cuando falta peso para la propia entrega.
- Un reintento exacto de `USER_SAVE` conserva las sesiones creadas después del
  comando original. El cambio original revoca el acceso anterior y el contrato
  HTTP permanece igual.
- La persistencia contrasta los sacos, fecha y autorización del cierre de molino
  con el movimiento y la auditoría. Un estado inconsistente se rechaza antes de
  escribir. Las migraciones históricas de SQLite permanecen intactas.

La prueba dirigida se ejecuta con
`node --test tests/nqp26-final-audit.test.mjs tests/node-backend.test.mjs` desde
`app/`. La validación global usa `npm ci`, `npm run verify` y
`npm run test:e2e` después del build. El resumen local conserva resultados, fallos
reproducidos y comprobaciones sobre el módulo empaquetado.

## Límites del alcance

Se conservan I14–I19 como seis TODO históricos. La composición experimental de
reservas comerciales parciales sigue aislada de la aplicación ordinaria. Las
pruebas del prototipo no certifican reposición automática en el flujo operativo.
Los costos de molino se proyectan con alcance informativo. La auditoría no
incluye precios, dosificaciones o registros empresariales reales.

El código, la base de negocio y el acceso se mantienen en directorios separados.
La actualización se ensaya sobre copias sintéticas. Véanse [instalación local](../INSTALACION_LOCAL.md),
[respaldo y restauración](../RESPALDO_RESTAURACION.md) y
[operación local](../GUIA_OPERATIVA_FINAL.md). El responsable externo autoriza y
ejecuta cualquier intervención posterior. La revisión técnica de ChatGPT y la
autorización humana siguen siendo condiciones del cierre.
