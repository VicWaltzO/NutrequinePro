# NQP26-23 — Contrato de valoración de microinsumos

Motor puro en `features/microinsumos/domain/valuation.mjs`. Se entrega para revisión
técnica posterior de ChatGPT. No activa compras operativas NQP26-22, consumo NQP26-28,
reservas, rutas HTTP, pantallas ni escrituras en la base empresarial. PR apilado
sobre NQP26-21: base remota comprobada `850cd2ad442f5b30641a134cc3e513f4a814ea30`;
`origin/main` era `be084d68b603b9cc42b63198be78a04d99f5a5b0` y #33 seguía abierto.
Las dependencias son 20 → 21 → 23 → 22. Fuentes: fichas maestras 22/23, A y B R08–R09.

## Decisión y alcance persistente

La apertura actual tiene gramos enteros, precio opcional en céntimos y valoración
redondeada. Las compras NQP26-21 son comprobantes económicos. No existía promedio
móvil. Se conserva todo el esquema y los comandos vigentes: ninguna migración ni
tabla nueva. La orden permite un motor puro con persistencia/eventos sintéticos.
El arnés `tests/helpers/valuation-sqlite.mjs` almacena snapshots sintéticos en filas
de auditoría de una base temporal, mediante `persistState` y su revisión SQLite.
Ese arnés no es un repositorio operativo y nunca se importa desde el servidor.
No debe copiarse ese almacenamiento a producción sin definir el modelo de NQP22/28.

## Valores y operaciones

`createValuation(opening, actor)` toma `id`, `micro_ingredient_id`, `version`,
`quantity_grams`, `unit_cost_cents` y `cutoff_date` de una apertura probada. Descarta
catálogo y `valuation_cents`: calcula exactamente gramos × coste unitario / 1000.
Gramos y céntimos de entrada son enteros de 0 a 10¹²; gramos de evento positivos.
Costo debe ser un entero explícito o `null`; ausencia y tipos coercibles se rechazan.
Una apertura positiva sin costo bloquea ambos eventos; debe corregirse con soporte
antes del primero. Cero físico empieza con valor cero aun sin precio; cero monetario
explícito sí permite operaciones. Se conserva la identidad independiente de cada ficha.

`applyValuation(ledger, event, actor)` acepta únicamente:

- `id`, `request_id`, `micro_ingredient_id`: texto técnico ASCII de 1–100 caracteres.
- `type`: `RECEIPT` o `ISSUE`; `date`: fecha ISO válida, posterior al corte y no
  anterior al último evento; `quantity_grams`; `expected_revision`.
- Solo RECEIPT añade `total_cost_cents`, costo total probado de ingredientes, nunca
  precio de catálogo ni flete. Otros campos se rechazan.

Recepción suma cantidad y valor. Salida resta su proporción del valor actual,
congela promedio y costo exacto y registra céntimos sin cambiar snapshots anteriores.
No admite cancelaciones destructivas, eventos retroactivos ni stock insuficiente.
Los eventos de igual fecha se ordenan por revisión aceptada. El ID y request_id
son únicos por libro/ficha. Replay exige mismo actor y payload completo, incluida
la revisión original; no duplica ni cambia versión. Un payload diferente se rechaza.

Valores racionales reducidos `{n,d}` expresan céntimos con cadenas decimales y
BigInt. Ningún promedio o costo exacto usa coma flotante. Cada salida registra
`round(total exacto emitido) − total céntimos ya registrados`, con empate hacia arriba.
`rounding_carry_cents` conserva la diferencia exacta acumulada, incluso al agotar stock.
Así, sumar costos registrados de todas las salidas equivale a redondear una sola vez
el costo exacto total emitido. Saldo físico cero implica valor exacto cero; el carry
es diferencia de presentación/registro, no inventario ni valor negativo. El promedio
sin stock se consulta como `null`. No se realimenta valoración con céntimos redondeados.
El consumidor futuro debe respetar este arrastre al contabilizar; no sumar redondeos
independientes ni interpretar el carry como un gasto logístico.

Numerador y denominador se limitan a 256 caracteres y el libro a 10.000 eventos:
un exceso se rechaza explícitamente sin alterar la entrada.
El límite se comprueba también sobre el promedio resultante antes de aceptar cualquier evento,
para que todo saldo aceptado siga siendo consultable y utilizable en una salida.
Cada llamada reconstruye el acumulador privado y comprueba snapshots (O(n)); una secuencia de n llamadas es
O(n²). JSON conserva el orden canónico producido por el motor. No ofrece firma
criptográfica contra quien controle la base: la autorización de persistencia sigue
siendo responsabilidad del servidor y SQLite.

## Integración futura obligatoria

`inspectValuation` permite consulta a ADMIN, OPERATOR y VIEWER activos. Crear/aplicar
requiere ADMIN activo. Son guardas de dominio, no autenticación: el futuro servidor
debe resolver el actor desde su sesión y mantener CSRF y respuestas 401/403 existentes.
No se ha añadido comando público de recepción/salida y producción no llama al motor.

`assertValuationOpening` comprueba identidad, versión, corte, cantidad y precio
frente al snapshot original. Una apertura corregida antes de eventos permite crear
un libro nuevo; después no se reconstruyen ni recostean salidas. Antes de activar
NQP22/28 se debe persistir el libro en modelo propio, bloquear `MICRO_CORRECT` cuando
haya eventos y ejecutar apertura/valor/stock/gasto/snapshot en una misma transacción
con revisión CAS. Las correcciones posteriores requieren compensaciones auditadas
en otra tarea. Esta entrega rechaza corrección/anulación del libro existente.

Ni comprobantes históricos (incluidas correcciones/anulaciones), ni flete, ni macros,
productos, ventas, producciones cerradas o precios comerciales son entradas del motor.
No se reconstruyen consumos históricos. El esquema microIngredients/microOpenings,
IDs 1–13 y 15–18 y ausencia del 14 se mantienen literalmente.

## Validación reproducible

`node --test tests/micro-valuation*.test.mjs` prueba promedio con cantidades iguales
y distintas, fracciones de un gramo, cero/null, límites, replay, snapshots y guardas.
El ensayo SQLite usa dos procesos con la misma revisión, rollback por FK, reinicio,
respaldo/restauración y comparación de tablas protegidas. La suite existente cubre
roles HTTP y compras documentales; se ejecutan `npm run verify` y `npm run test:e2e`
completos. Se mantienen los seis TODO históricos I14–I19. Evidencias y resultados
efectivos se centralizan en los cuatro entregables oficiales NQP26-23\_ fuera del código.
