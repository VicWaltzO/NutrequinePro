# NQP26-12 — Contrato de ordenamiento tipado

**Carácter:** guía de implementación derivada de la especificación UX-01 y del inventario NQP26-11. Propuestas de comparador del CSV son **decisiones por validar**, no código ya existente.

## Alcance exacto

- 51 superficies inventariadas / 268 columnas: **43 UI** (42 con al menos una elegible; `FORMULA-EDITOR` íntegramente NO) y **8 PDF** sin orden interactivo.
- **208 columnas marcadas SI** deben ofrecer orden por encabezado en el contexto UI correspondiente; **60 NO** deben carecer de indicador falso (35 PDF, 13 controles editables, 7 acciones, 5 JSON heterogéneos).
- En superficies compartidas probar cada contexto consumidor (por ejemplo 7 × `SaleTable`) aunque se reutilice el mismo componente. El cumplimiento 208/208 se rastrea con `NQP26-12_SEGUIMIENTO_268_COLUMNAS.csv`.

## Especificación del comparador

| Clase                | Valor a comparar (NO HTML/texto formateado)                                                                        | Ejemplos y restricciones                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Texto                | Cadena original normalizada solo para comparación por `Intl.Collator('es-PE', {sensitivity:'base', numeric:true})` | Tildes/caso y código `V-2` antes de `V-10`; preservar grafía guardada; desempate determinista                                                          |
| Moneda               | Centavos PEN enteros del estado o cálculo exacto                                                                   | `900 < 8000 < 10000` para S/9, S/80, S/100; negativos válidos si el dominio los admite                                                                 |
| Masa                 | Gramos enteros del modelo, incluso campos con nombre `_kg`                                                         | 900g < 1.000g < 10.000g; no mezclar peso con cantidad ni convertir unidades dentro del orden                                                           |
| Unidades comerciales | Cantidad numérica con presentación/contexto consistente                                                            | BAG/BOTTLE/UNIT son categorías distintas; no sumar mezclas; si una tabla permite presentaciones mixtas, comparador explícito en CSV antes de codificar |
| Núcleos/decimales    | Valor numérico real (centésimas)                                                                                   | Cero válido; no comparar strings de formulario, usar valor semánticamente validado                                                                     |
| Fecha civil          | `YYYY-MM-DD` por calendario local, sin convertir a medianoche UTC                                                  | La fecha se compara como fecha civil; `null` queda al final                                                                                            |
| Mes                  | `YYYY-MM` como periodo                                                                                             | `2026-02 < 2026-10`; no asumir ID inexistente                                                                                                          |
| Instante             | ISO UTC/época numérica; UI en Lima solo formatea                                                                   | No ordenar según la traducción visible `stamp()`                                                                                                       |
| Booleano             | `false`/`true` explícitos                                                                                          | `false` no es vacío; dirección inversa real                                                                                                            |
| Enum de estado       | Prioridad del negocio **solo si documentada**, en otro caso etiqueta/orden definido y testado                      | No inventar secuencia logística distinta de los enums reales; comparar por estado persistido/cálculo, no badges HTML                                   |
| Compuesto            | Llave principal y secundarias visibles tipadas                                                                     | Ventas: fecha + código, cliente + nombre; determinismo final mediante ID de registro/snapshot                                                          |
| Multirrelación       | Magnitud definida por la columna inventariada                                                                      | P.ej. número de vínculos activos no retirados; no ordenar por concatenación de chips ni por HTML                                                       |

## Política uniforme de interacción y estado

1. Sin clic: **orden inicial de esa vista**, idéntico al existente antes de la tarea.
2. Primer clic o Enter/Espacio: **ascendente**; segundo: **descendente**; tercero: volver a **orden inicial**. Este contrato ternario debe ser uniforme y probarse (si el agente elige patrón binario, documentar excepción y pedir autorización antes de cambiar las matrices).
3. `aria-sort="ascending"/"descending"` en `<th>` activo, y control de encabezado `<button type="button">` con nombre accesible y foco visible; otros `<th>` sin indicador activo. No poner botones en las 60 NO.
4. Ausente, `null`, no aplicable y vacío textual **siempre al final**, en ascendente **y** descendente. **0 y `false` no son ausentes**. Los empates no invierten accidentalmente el desempate: secundario significativo ascendente fijo, luego ID estable (o posición histórica solo donde no hay ID).
5. Ordenar copia derivada: `const shown = sortRows(filtered, spec)`; jamás `state.sales.sort(...)` ni mutaciones en propiedades, snapshots, arrays de auditoría o colas. Filtros/roles se ejecutan antes del orden de presentación.
6. Cuando el contexto/proveedor cambia (subpestaña, entidad o filtro), preservar únicamente estado de sort válido para ese contexto o restaurar orden inicial de manera consistente y testeada. Tabla vacía y datos nuevos no deben producir excepción ni saltos de foco.
7. En dashboard `slice(-5)` conserva exactamente el subconjunto de **últimas cinco**, ordenable solo dentro de esas cinco; no existe paginación remota que deba implementarse. PDF conserva orden documental, sin reordenamiento.
8. Accesibilidad móvil: cabeceras semánticas intactas, scroll horizontal existente disponible, no tapar botones/modal footer; verificar 390×844 y 1440×1000, claro/oscuro, teclado y al menos roles ADMIN/OPERATOR/VIEWER.

## Guardas especiales para formularios

- Separar **índice de origen** y **posición visual** en las tablas que renderizan entradas; usar claves estables en React y manejadores vinculados a la identidad original; no mezclar campos de dos productos/insumos.
- `LOTE-RECTIFICAR-CANTIDADES` usa `a.products[i]`: **nunca** ordenar solo un array relacionado y dejar el otro en posición anterior. La opción más segura es proyectar tuplas `{row, summary, originalIndex}` antes de ordenar.
- Mantener las etiquetas/valores controlados, `checked`, `onChange`, montos y vínculos tras asc/desc/volver al inicio y después de un error/validación del formulario.
- Los campos NO siguen no ordenables aunque el resto de columnas de la misma tabla sí lo sean; la fila completa puede moverse visualmente solo con identidad/handlers probados.
- Estructuras `History` con JSON anterior/nuevo: solo ordenar por Campo, no fingir un comparador para las columnas JSON.

## Decisiones pendientes de Codex antes de editar

- Revisar los 268 registros y **fijar las claves estables reales** y excepciones de enums/composites; documentar toda propuesta que no pueda resolverse con el código vigente.
- Seleccionar arquitectura reutilizable: utilidades puras para valores tipados + hook de selección local + encabezado accesible; componentes consumidores pasan filas/criterios tipados; `Table` no debe parsear su DOM/children.
- Estimar coste y verificar que ordenar varias tablas con cálculo pesado no cause regresión sensible; medir con fixture sintético si procede sin prometer SLA.
- Tras cambios en main posteriores a NQP26-11, actualizar mapa de cobertura por diff y mantener trazabilidad, sin borrar el inventario original.

## Decisiones efectivas de implementación (12)

No hay delta aplicativo desde la base del inventario hasta la cabeza de 11. Los 268 registros conservan su decisión SI/NO. El seguimiento registra el accessor concreto, archivo y prueba por columna.

Estados de ventas, producción, gastos, roles y movimientos: etiqueta del enum real mediante `label`, orden natural español; no se declara una prioridad empresarial. Reversión, actividad, venta habilitada y pagado usan booleanos false/true. Fuente de costo usa ESTIMADO/REAL. Los instantes de auditoría y rectificación usan época; fechas civiles y meses conservan sus cadenas ISO.

En cantidades mixtas se compara la cantidad numérica de la fila, con unidad singular como secundario ASC fijo (no se suman unidades ni se infiere equivalencia física); peso y dinero conservan campos originales. Esta decisión explícita permite comparar números de registros con contexto de saco/frasco/unidad y distinguir empates sin convertirlos a masa. Disponibilidad legacy usa cantidad principal y gramos secundarios, idénticos a los dos valores de cada celda. Presentación del catálogo usa etiqueta de unidad, gramos nominales y política; precio base/aplicado usa céntimos y unidad secundaria. No se cambia el modelo ni el cálculo de magnitudes.

Identidades: ID real de registro/snapshot; disponibilidad legacy product_id, rectificación product_id, preview ing.id; mes es su propio periodo único. Snapshot mantiene ingredient_id/ID con índice histórico como último desempate. El render recibe siempre originalIndex; los formularios que usan índices conservan la asociación con a.products[i] y los handlers originales.

Al cambiar subpestaña/contexto se remonta solo la tabla ordenable interna. Cambiar filtros conserva el sort válido sobre el conjunto filtrado nuevo; actualizar registros conserva la selección y evalúa valores actuales. Reabrir modal restaura el orden inicial. El estado de orden es exclusivamente React local, sin persistencia ni petición HTTP.
