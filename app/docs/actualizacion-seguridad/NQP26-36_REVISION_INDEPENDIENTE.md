# NQP26-36 — Revisión independiente inicial

Fecha: 2026-11-15. Revisión del cambio local respecto de `origin/main`. Evidencia únicamente sintética; no se usaron bases privadas, credenciales ni información de clientes.

## Resultado

No se identificaron hallazgos P0, P1 o P2 en el alcance revisado. Esta conclusión corresponde al código y contratos inspeccionados y a las pruebas siguientes; no constituye una garantía sobre estados persistidos fuera de los invariantes de la aplicación.

## Evidencia reproducible

Desde `app/`: `node --test tests/micro-alerts-independent.test.mjs`.

Resultado inicial: 7 pruebas aprobadas, 0 fallidas. El archivo fue creado para esta revisión, sin modificar implementación.

- Dos familias activas con dosis compartida de 7 g y 11 g producen mínimo de 220 g, no 360 g. Un ingrediente exclusivo de una fórmula histórica y sustitutos fuera de las activas quedan excluidos.
- Una orden histórica de 0.01 núcleo con dosis de 1 g conserva faltante exacto de 0.01 g aunque no tenga autorización vigente.
- Requerimiento de 7 g, físico de 10 g, compromiso propio de 3 g y tercero de 5 g producen faltante de 2 g. Revertir el tercero elimina el aviso, sin duplicar crédito propio.
- Órdenes confirmadas y supersedidas no generan avisos; la sucesora pendiente sí.
- Saldo de libro de 219.99 g prevalece sobre apertura y compras económicas; mínimo de 220 g conserva faltante exacto de 0.01 g.
- Sin apertura se informa saldo no disponible; una familia sin autorización se marca incompleta y no se presume evaluación total.
- Dos lecturas sobre estado congelado producen idéntico resultado y conservan todas las tablas y revisión.

## Contratos y alcance

Se inspeccionaron la proyección `microAlerts`, extracción de saldo físico, `preparationOverview`, evaluación histórica de preparaciones, lectura de compromisos, componentes y tipos de presentación. Los avisos mantienen centésimas de gramo; la presentación nueva conserva 0.01 g. El GET existente `/api/micro-preparations` llama a la proyección y no introduce comandos de inventario. No se observaron escrituras, reservas nuevas, consumo, cambios históricos ni ampliación hacia NQP37/38 o I14–I19 en el diff revisado.

## Límites

Se comprobó pureza del dominio dinámicamente y la ruta GET por inspección; esta revisión no ejecutó una nueva prueba HTTP, SQLite, navegador ni la suite completa. La verificación general, E2E y sincronización corresponden al trabajo principal. No se crearon commits ni se realizó push, por encargo explícito de revisión. No fue necesario solicitar ciclo de corrección.

## Cierre independiente sobre el diff final

Se revisaron además `tests/micro-alerts.test.mjs` y la extensión de `tests/local-e2e/micro-preparations.test.mjs`. No se identificaron hallazgos P0–P2 ni se solicitaron correcciones funcionales. Las pruebas nuevas agregan integración HTTP/SQLite con roles y pureza, actualización tras compra, precisión tras consumo, sustitución, rectificaciones y salida incompleta. La extensión E2E comprueba aparición y desaparición de avisos y presentación de 0.01 g, con capturas en dos anchos y temas; su ejecución general sigue a cargo del trabajo principal.

La UI muestra los nuevos avisos únicamente cuando la revisión de la proyección coincide con la revisión del estado, y anuncia actualización mientras difieren. La consulta se repite por revisión, reevaluación explícita y foco. La salida incompleta nombra las familias no evaluables y advierte que los mínimos pueden ser parciales; no muestra el texto de cobertura total en ese caso. `alertWeight` conserva hasta dos decimales en gramos, compatible con la unidad entera de centésimas del dominio. El detalle previo que usa kilogramos redondeados no es la fuente de los nuevos avisos.

La revisión final mantiene los límites de ejecución consignados arriba: no equivale a afirmar que verify/E2E general finalizaron. La suite propia se volvió a ejecutar tras el formato: 7/7 aprobadas. No hubo cambios de implementación por parte de esta revisión.

SHA256 de los seis archivos de implementación inspeccionados (bytes del árbol de trabajo al cierre):

| Archivo relativo a app/                                  | SHA256                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `features/microinsumos/domain/alerts.mjs`                | `f3f25ce663621479f3ec027011d5968b574e68d59b9f4491d48ff70586949887` |
| `features/microinsumos/domain/stock-balances.mjs`        | `df5bb1f54f4870adcad47b884e7c855ef5b389de85fc54280f064a3495c9b348` |
| `features/microinsumos/domain/preparations.mjs`          | `1af3d65a736994391d256a3a6d83b54ead674b32dd4289ed100dc3590853c087` |
| `features/microinsumos/components/MicroAlerts.tsx`       | `03b85dd554d3fdfcf8628178432bbb40f3eb2c6971b36edc4bf1ee76fd4cbb20` |
| `features/microinsumos/components/MicroPreparations.tsx` | `a853860b2852798751be4257ad380e41570856777c7bf45b2da5916709a32624` |
| `features/microinsumos/components/preparation-view.ts`   | `9b09352d48d953863101bcedfb65669c6c5e412cfc94ff25ebc80b42a4d27d2f` |

## Ciclo 1 — corrección de lint

El trabajo principal sustituyó los ternarios anidados de `alerts.mjs` y `stock-balances.mjs` por asignaciones condicionales para cumplir `no-nested-ternary`. Se inspeccionó la equivalencia: UNAVAILABLE prevalece sobre LOW y COVERED; LEDGER prevalece sobre OPENING y UNRECORDED. La selección del saldo físico permanece idéntica. No se identificaron hallazgos P0–P2 ni cambios funcionales derivados de esta corrección.

Reejecución independiente posterior: `node --test tests/micro-alerts-independent.test.mjs`, 7 aprobadas y 0 fallidas. Verify completo y E2E continúan pendientes del trabajo principal. Este es el ciclo 1 por lint; no se solicitaron correcciones funcionales durante la revisión.

Los siguientes hashes reemplazan los de esos dos módulos en la tabla anterior; los otros cuatro archivos conservan el vínculo anterior:

| Archivo relativo a app/                           | SHA256 posterior al ciclo 1                                        |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `features/microinsumos/domain/alerts.mjs`         | `0a1340ffbccc55b0e3f51a3798a491c3e0f6b45ac6c93b57fe9624e3f94719a7` |
| `features/microinsumos/domain/stock-balances.mjs` | `6f60dba36fab81e9d60741389aa76d116a8ea6d6e38c9f62adc143cc71619b76` |
