# NQP26-13 · Revisión independiente documental

Fecha: 2026-10-31. Base inspeccionada: fa6a7eadb95aca1d7fc6cd434c24854a76821ec0, comprobada con git rev-parse HEAD en el worktree nqp26-13-inventario.

## Dictamen

Sin hallazgos documentales bloqueantes pendientes en los archivos cotejados. El inventario cubre las declaraciones consumidoras observadas y separa las superficies relacionadas con justificación trazable. Este dictamen se limita al inventario y al contrato propuesto: no acredita implementación A–Z, aprobación empresarial ni aprobación formal de una revisión en GitHub.

## Evidencia obtenida por esta revisión

La inspección inicial se hizo directamente sobre fuentes, antes de leer el CSV o los documentos de implementación del responsable principal. Se buscaron selects, opciones, agrupaciones, combobox/listbox/datalist, disclosures, listas filtradas y consumidores indirectos en client, features y shared. Se leyeron componentes, navegación, AdminWorkspace, ModalContent, SimpleForm, hooks de venta, comparadores de coincidencias, permisos y application-store. No se modificaron runtime, pruebas ni datos.

Se observaron 28 declaraciones consumidoras de Select compartido y 3 declaraciones directas de select: 31 sitios consumidores. El select interno de shared/ui/Select.tsx es infraestructura y no un contexto adicional. SaleForm parametriza cliente/sede en un mismo sitio; RecordFilters cambia opciones y montaje por módulo; PaymentFields, CostRows y CustomerSiteFields tienen varios consumidores. El CSV final expande estos contextos y añade listas Check, mes y radios.

Validación propia mediante Import-Csv: 64 filas, 23 nombres de campo, 64 IDs únicos y cero valores de campo vacíos. Se cotejaron fuentes, filtros, defaults, orden actual, identidad y roles de las filas. La conciliación declaración/contextos coincide con la búsqueda propia. No se detectaron consumidores nativos omitidos ni combobox/listbox/datalist propios adicionales.

Se verificaron particularmente: PaymentForm admite cliente activo o con deuda; FormulaForm filtra producto núcleo sin exigir activo; ExpenseFields excluye producción CLOSED/CANCELLED pero no filtra ventas; lote de venta excluye solo CANCELLED; saleSiteContext ordena sedes activas y conserva los grupos; CustomerSiteFields conserva new:index sobre arrays originales; ProductFields impone dependencias de BOTTLE y BAG. Los filtros de Estado de ventas combinan dimensiones distintas. application-store carga colecciones sin ORDER BY; shared Select conserva el orden recibido y traduce strings mediante label().

La lectura de rutas confirmó alias sites/products, consumidores indirectos y separación de roles ADMIN/OPERATOR/VIEWER. Se contrastaron permisos de comandos, sin atribuir autorización a la mera posibilidad de montar ModalContent.

## Hallazgos comunicados y resolución cotejada

- SEL13-029 atribuía el orden inicial de la ficha a simpleFormInitial. Se corrigió: CustomerSites usa links.map sobre customerSites y pasa default separado.
- SEL13-025 mezclaba una explicación de edición con el alta. Se corrigió para describir orden de selección y preparación.
- La elección ONE_TIME/LINK necesitaba una clasificación explícita. Se añadieron SEL13-063/064 como secuencia de negocio y referencia en exclusiones.
- Se pidió trazabilidad para CustomerNameWarning, CustomerSites, tarjetas, cantidades y disclosures. EXCLUSIONES documenta fuentes, naturaleza y motivo. La advertencia mantiene prioridad exact/similar/ID; los directorios pertenecen a tablas; las tarjetas ejecutan acciones de carrito. Su exclusión del CSV de controles de elección es coherente con ese alcance, sin desaparecer del barrido.

## Límites y evidencias del responsable principal

Esta revisión realizó inspección estática y lectura estructural del CSV; no ejecutó builds, suites, SSR ni navegador. Los recorridos sintéticos y sus resultados mencionados en CONCILIACION_FUENTES proceden del responsable principal, no de una reproducción independiente. No se afirma aquí éxito de verify o E2E, que seguían en ejecución al cerrar esta revisión.

Se cotejaron INVENTARIO_SELECTORES, CONCILIACION_FUENTES, EXCLUSIONES y CONTRATO_NQP26-14. No se leyó ni usó información empresarial. No se verifican interacciones físicas móviles, lector de pantalla, datos privados, sincronización remota o estado final del PR. La implementación y aceptación funcional de NQP26-14 permanecen pendientes. No se creó commit propio: este informe local oficial se entrega al responsable principal para su cierre y resumen documental seguro.

## Adenda · destinos de estado y payload

Se cotejó la ampliación de Persistencia_identidad en las 64 filas contra los submit de SaleForm, PaymentForm, FormulaForm, ProductionForm, ReconcileForm, SimpleForm y CustomerSites, además de la descarga mensual, el transporte admin-api y los handlers pertinentes. Conforme: ReconcileForm transmite los CostRows nuevos en PRODUCTION_RECONCILE.new_costs, separados de costs existentes; el handler crea productionCosts desde new_costs. SaleForm transforma mode en deliver (immediate) y create_production (planned), y usa confirm según kind; el CSV identifica flags de petición, sin prometer que la mera selección entregue o confirme una venta. El resto distingue estado local, IDs/enums y destino de comando/payload sin sustituirlos por índices o etiquetas. El mes viaja como ID YYYY-MM del GET de documento balance y no guarda datos comerciales.

No se observaron cambios de contexto, IDs o semántica en este delta. El SHA base fa6a7eadb95aca1d7fc6cd434c24854a76821ec0 indicado al inicio corresponde a la inspección del código antes del commit documental del responsable principal; no identifica el commit final de documentación. Esta adenda sigue siendo revisión estática, sin ejecución de suites/build y sin acreditar el resultado del E2E en curso.

## Clasificación de hallazgos por severidad

La severidad expresa impacto documental en la cobertura y en una futura implementación, sin atribuir defectos nuevos al runtime. Ordenados de mayor a menor:

| Severidad | Hallazgo                                                                                                                                                                                                                                      | Estado  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Media     | Radios ONE_TIME/LINK sin clasificación explícita en el alcance amplio de selectores; riesgo de omitir su secuencia y condiciones en NQP26-14. Resuelto mediante SEL13-063/064 y exclusiones.                                                  | CERRADO |
| Media     | Trazabilidad insuficiente de superficies nominales relacionadas: advertencias por relevancia, vínculos, tarjetas y disclosures podían confundirse con opciones A–Z o quedar fuera del barrido. Resuelto con fuentes y razones en EXCLUSIONES. | CERRADO |
| Baja      | SEL13-029 atribuía a la ficha el orden de simpleFormInitial; la ficha usa links.map y principal separado. Corregido en CSV.                                                                                                                   | CERRADO |
| Baja      | SEL13-025 mezclaba explicación de edición con alta. Corregido para describir orden de selección/preparación.                                                                                                                                  | CERRADO |

Hallazgos críticos o altos: ninguno. Hallazgos abiertos: ninguno. Se mantiene el dictamen documental anterior y sus límites.
