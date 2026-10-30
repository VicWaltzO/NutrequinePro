# NQP26-11 · Revisión independiente

2026-10-30 America/Bogota. Revisor: agente separado `review_independiente`, instruido para inspeccionar desde cero las fuentes y buscar faltantes, sin editar, compilar en paralelo ni asumir cobertura del autor. Base `e66f4de`. No es aprobación empresarial ni GitHub Review formal.

## Evidencia ejecutada por el revisor

- Inspección de navegación, consumidores indirectos SaleTable/ProductionList/History/PaymentForm, listas con campos comparables y PDF.
- Python CSV: 268 filas, 51 IDs, 208 SI y 60 NO; índices contiguos, archivos existentes y sin duplicados por instancia.
- Extracción independiente de 33 declaraciones JSX y cotejo de cabeceras/archivo/línea contra familias CSV: 33/33 conciliadas, cero discrepancias, incluidas cabeceras multilineales y dos celdas dinámicas de conciliación.
- Confirmó 43 superficies UI y 8 PDF (35 columnas); configuración visible para los tres roles, controles administrativos diferenciados.
- Revisó exclusiones y contrato de navegación; no identificó una superficie tabular omitida.

## Hallazgos y resolución

| Prioridad | Hallazgo inicial                                                                                                  | Corrección documental                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2        | Texto genérico de filtros atribuía estado/cliente/sede a superficies donde no se aplica o no hay control visible. | CSV distingue controles visibles y filtros efectivos por ID; pagos, devoluciones, rectificaciones e insumos no aplican el selector Estado; balance mensual y fórmulas no aplican filtros globales. |
| P2        | Sedes describía un cliente “principal” inexistente como desempate.                                                | Comparador por cantidad de clientes no eliminados con vínculo activo; desempate nombre/ID de sede. Admite clientes inactivos no eliminados, según fuente.                                          |
| P2        | Desempates genéricos no concretaban claves y mes no tiene id.                                                     | CSV identifica claves por familia; mes `m`, productos/ingredientes/campos/ítems por identidad propia y posición histórica solo como último recurso del snapshot.                                   |
| P2        | Tipos de captura agrupaban boolean/select/dinero sin distinguirlos.                                               | CSV separa checkbox booleano, ID string, NumericInput soles/kg/núcleos y cantidades enteras; identifica conversiones de centavos/gramos.                                                           |

En la revisión final se cerró un quinto P2: el contexto de las cuatro columnas de disponibilidad legacy se había recortado a «CANCELLED» al dividir una descripción con barra. Ahora indica «Disponibilidad legacy; PENDING; excluir DRAFT y CANCELLED». Los contextos PDF también se precisaron por familia.

Tras revisar la versión corregida, dictamen del revisor: **sin P0–P2 pendientes de exhaustividad o alcance; sin implementación de ordenamiento ni cambios de runtime observados**. El ajuste menor sobre clientes asociados también fue incorporado. Las verificaciones de runtime y el recorrido Chrome los ejecuta el autor y se informan aparte; no se atribuyen al revisor ni se suman sus comprobaciones al total de npm test.
