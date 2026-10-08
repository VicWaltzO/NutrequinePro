# NUTREQUINE PRO
## Especificación funcional maestra del MVP
### Fuente única de verdad para implementación con Codex

**Versión:** 1.0  
**Fecha de consolidación:** 2026-10-06  
**Estado:** APROBADO PARA IMPLEMENTACIÓN DEL MVP  
**Propósito:** sustituir especificaciones previas fragmentadas y evitar interpretaciones ambiguas durante el desarrollo.

---

# 0. REGLA DE PRECEDENCIA

Este documento es la **fuente funcional principal y normativa** del MVP de Nutrequine Pro.

Si existe una contradicción entre este documento y notas, chats, archivos `.md`, hojas Excel, prototipos o implementaciones anteriores, **manda este documento**.

Codex no debe completar reglas de negocio importantes por intuición.

Si una regla no aparece aquí:

1. preservar trazabilidad;
2. evitar duplicidades;
3. evitar borrar historia financiera;
4. minimizar la entrada manual;
5. favorecer una arquitectura extensible;
6. implementar la alternativa más simple compatible con el modelo actual;
7. dejar comentarios técnicos o TODO cuando se trate de una decisión de negocio aún no definida.

No convertir el MVP en un ERP contable completo.

---

# 1. OBJETIVO DEL SISTEMA

Nutrequine Pro es una WebApp interna para administrar un negocio de alimento balanceado equino.

Debe reemplazar el uso disperso de Excel por una aplicación:

- profesional;
- simple;
- rápida de usar;
- con pocos formularios;
- con cálculos automáticos;
- con trazabilidad histórica;
- con inventario de producto terminado;
- con producción por núcleos;
- con ventas;
- con cobranza;
- con pagos;
- con gastos;
- con balance económico;
- preparada para crecer sin rehacer la arquitectura.

La aplicación será utilizada por pocas personas y tendrá un volumen transaccional relativamente bajo.

Las operaciones comerciales pueden involucrar cantidades grandes de sacos, pero no ocurren de manera masiva todos los días.

---

# 2. ALCANCE DEL MVP

El MVP debe incluir:

1. Dashboard.
2. Clientes.
3. Sedes.
4. Productos.
5. Insumos.
6. Fórmulas.
7. Producción por núcleos.
8. Lotes a producir.
9. Costos de producción.
10. Descuentos por insumo.
11. Costos adicionales de producción.
12. Conciliación con cobros reales.
13. Inventario de producto terminado.
14. Ventas.
15. Ventas futuras.
16. Cobranza.
17. Pagos.
18. Aplicación de un pago a una o varias ventas.
19. Gastos logísticos y operativos.
20. Rectificaciones.
21. Devoluciones.
22. Anulaciones.
23. Balance general.
24. Configuración básica.

No incluir por ahora:

- SUNAT;
- facturación electrónica;
- conciliación bancaria;
- contabilidad tributaria completa;
- CRM avanzado;
- predicciones;
- IA;
- optimización nutricional automática;
- permisos empresariales complejos;
- órdenes de compra sofisticadas;
- contabilidad por centros de costo avanzada.

---

# 3. PRINCIPIO GENERAL DE DISEÑO

La WebApp debe sentirse como una aplicación administrativa moderna, no como una hoja Excel incrustada en un navegador.

Principios:

- pocas pantallas de captura;
- muchas vistas de consulta;
- evitar duplicidad de datos;
- autocompletar cuando sea posible;
- conservar historial;
- cálculos importantes en backend/capa de dominio;
- transacciones en operaciones críticas;
- datos financieros no se eliminan físicamente;
- estados y rectificaciones en lugar de sobrescritura destructiva;
- diseño sobrio;
- tablas legibles;
- no depender de colores como portadores únicos de información.

---

# 4. PRODUCTOS

## 4.1 Productos actuales

Existen cuatro productos relevantes para el sistema:

### 4.1.1 Potripregnant

- tipo: formulado premium;
- segmento: potrillos / reproducción / desarrollo;
- presentación estándar: saco de 25 kg;
- precio base actual conocido: S/ 73 por saco;
- producción por núcleo;
- 1 núcleo = 40 sacos;
- peso comercial por núcleo = 1,000 kg.

### 4.1.2 Hi-Performance

- tipo: formulado premium;
- presentación estándar: saco de 25 kg;
- precio base actual conocido: S/ 67 por saco;
- producción por núcleo;
- 1 núcleo = 40 sacos;
- peso comercial por núcleo = 1,000 kg.

### 4.1.3 Nutrelin Adulto

- tipo: formulado premium;
- presentación estándar: saco de 25 kg;
- precio base actual conocido: S/ 69 por saco;
- producción por núcleo;
- 1 núcleo = 40 sacos;
- peso comercial por núcleo = 1,000 kg.

### 4.1.4 BASE

BASE existe realmente y debe modelarse como producto.

- tipo: alimento estándar;
- uso actual principal: consumo propio;
- puede habilitarse para venta futura;
- presentación estándar: saco de 50 kg;
- producción por núcleo;
- 1 núcleo = 30 sacos;
- peso comercial por núcleo = 1,500 kg.

BASE **NO** debe programarse como excepción hardcodeada.

Debe funcionar con los mismos mecanismos que cualquier producto, usando parámetros diferentes.

---

# 5. CONFIGURACIÓN DE PRODUCTO

Cada producto debe contener al menos:

```text
id
name
category
default_sale_price
standard_bag_weight_kg
bags_per_nucleus
commercial_weight_per_nucleus_kg
is_sellable
is_active
created_at
updated_at
```

Reglas:

- el precio estándar depende del producto, no del cliente;
- el precio estándar puede modificarse;
- modificarlo no altera ventas pasadas;
- un producto puede permanecer activo pero no vendible;
- BASE puede mantenerse `is_sellable = false` mientras sea solo de consumo interno;
- no usar nombre del producto para decidir lógica del sistema.

---

# 6. PRESENTACIÓN ESTÁNDAR Y PESO EXTRAORDINARIO

Los tres productos premium normalmente se venden en sacos de 25 kg.

BASE normalmente utiliza sacos de 50 kg.

Sin embargo, el sistema debe permitir ventas extraordinarias con peso diferente.

Ejemplos:

- 17 kg;
- 40 kg;
- cualquier otro peso válido.

No se debe crear otro producto por una presentación extraordinaria.

Cada línea de venta debe guardar:

```text
product_id
quantity
unit_weight_kg
reference_unit_weight_kg
unit_price
subtotal
```

El peso aplicado en esa venta queda congelado históricamente.

---

# 7. FÓRMULAS

Las fórmulas deben versionarse.

Entidades mínimas:

```text
Formula
- id
- product_id
- version
- valid_from
- valid_to
- is_active

FormulaIngredient
- id
- formula_id
- ingredient_id
- kg_per_nucleus
```

Una producción confirmada debe conservar la versión de fórmula usada.

Cambiar la fórmula posteriormente no debe alterar producciones históricas.

---

# 8. FÓRMULAS ACTUALES POR NÚCLEO

## 8.1 Potripregnant

| Insumo | kg/núcleo |
|---|---:|
| Torta soya HiPro | 122 |
| HNA integral soya extruida | 75 |
| Maíz nacional Perú | 100 |
| Subproducto trigo molido | 580 |
| Aceite premium | 15 |
| Melaza de caña | 25 |
| Heno alfalfa molida | 50 |
| Carbonato calcio fino | 12 |
| Sal común | 8 |
| Silvafeed Gunny | 1 |
| **Total fórmula** | **988** |

Peso comercial por núcleo: 1,000 kg.

---

## 8.2 Hi-Performance

| Insumo | kg/núcleo |
|---|---:|
| Torta soya HiPro | 10 |
| HNA integral soya extruida | 64 |
| Maíz nacional Perú | 100 |
| Subproducto trigo molido | 700 |
| Aceite premium | 15 |
| Melaza de caña | 25 |
| Heno alfalfa molida | 50 |
| Carbonato calcio fino | 12 |
| Sal común | 8 |
| Silvafeed Gunny | 1 |
| **Total fórmula** | **985** |

Peso comercial por núcleo: 1,000 kg.

---

## 8.3 Nutrelin Adulto

| Insumo | kg/núcleo |
|---|---:|
| Torta soya HiPro | 40 |
| HNA integral soya extruida | 20 |
| Maíz nacional Perú | 0 |
| Subproducto trigo molido | 840 |
| Aceite premium | 15 |
| Melaza de caña | 25 |
| Heno alfalfa molida | 30 |
| Carbonato calcio fino | 12 |
| Sal común | 8 |
| Silvafeed Gunny | 1 |
| **Total fórmula** | **991** |

Peso comercial por núcleo: 1,000 kg.

---

## 8.4 BASE

| Insumo | kg/núcleo |
|---|---:|
| Torta soya HiPro | 200 |
| HNA integral soya extruida | 150 |
| Maíz nacional Perú | 150 |
| Subproducto trigo molido | 850 |
| Aceite premium | 20 |
| Melaza de caña | 30 |
| Heno alfalfa molida | 75 |
| Carbonato calcio fino | 15 |
| Sal común | 10 |
| Silvafeed Gunny | 1 |
| **Total fórmula** | **1,501** |

Peso comercial por núcleo: 1,500 kg.

---

# 9. REGLA CENTRAL: PESO DE FÓRMULA VS PESO COMERCIAL

Nunca asumir que:

```text
peso_formula == peso_comercial
```

Los núcleos se convierten en sacos usando parámetros comerciales del producto.

Ejemplo:

```text
3 núcleos Potripregnant
= 3 × 40 sacos
= 120 sacos
= 3,000 kg comerciales
```

Aunque:

```text
3 × 988 kg fórmula
= 2,964 kg de fórmula
```

El sistema NO debe calcular el número de sacos dividiendo peso de fórmula entre peso de saco.

La cantidad de sacos se calcula mediante:

```text
bags_produced = nuclei_count * bags_per_nucleus
```

---

# 10. INSUMOS

Entidad:

```text
Ingredient
- id
- name
- current_price_per_kg
- is_active
- created_at
- updated_at
```

Precios actuales conocidos:

| Insumo | S//kg |
|---|---:|
| Torta soya HiPro | 2.10 |
| HNA integral soya extruida | 2.20 |
| Maíz nacional Perú | 1.40 |
| Subproducto trigo molido | 1.00 |
| Aceite premium | 6.50 |
| Melaza de caña | 1.20 |
| Heno alfalfa molida | 1.60 |
| Carbonato calcio fino | 0.30 |
| Sal común | 0.60 |
| Silvafeed Gunny | 3.74 |

Estos valores son editables.

Una producción debe guardar un snapshot histórico del precio utilizado.

---

# 11. PRODUCCIÓN

## 11.1 Entidad principal

```text
Production
- id
- code
- production_date
- created_at
- responsible_user_id
- notes
- status
```

Estados:

```text
DRAFT
CONFIRMED
CLOSED
CANCELLED
```

---

# 12. SIGNIFICADO DE ESTADOS DE PRODUCCIÓN

## DRAFT

Representa un **lote a producir** o producción planificada.

Puede editarse libremente.

No genera movimientos reales de inventario.

No consume inventario real de insumos.

Puede usarse para asociar/justificar ventas futuras.

---

## CONFIRMED

Significa que la producción fue ejecutada o formalmente confirmada.

Al confirmar:

- se congela la fórmula utilizada;
- se congelan precios históricos;
- se calculan costos;
- se generan entradas de producto terminado;
- se registran los consumos correspondientes;
- la edición directa queda restringida.

---

## CLOSED

La producción fue conciliada y cerrada.

Debe contar con los datos reales disponibles:

- cobros;
- gastos;
- descuentos;
- servicios;
- costos adicionales.

No debe modificarse directamente salvo mediante rectificación administrativa.

---

## CANCELLED

No se elimina la producción.

Debe conservarse:

- código;
- fecha;
- usuario;
- datos originales;
- motivo de cancelación.

Si hubiera movimientos reales asociados previamente, deben revertirse mediante movimientos compensatorios, nunca borrando el histórico.

---

# 13. PRODUCTOS DENTRO DE UNA PRODUCCIÓN

Entidad:

```text
ProductionProduct
- id
- production_id
- product_id
- nuclei_count
- bags_per_nucleus_snapshot
- bags_produced
- commercial_weight_per_nucleus_snapshot
- commercial_weight_kg
- formula_weight_kg
```

Ejemplo:

```text
Potripregnant: 8 núcleos
Hi-Performance: 4
Nutrelin: 3
BASE: 0
```

Resultado:

```text
Potripregnant = 320 sacos
Hi-Performance = 160 sacos
Nutrelin = 120 sacos
Total = 600 sacos
```

---

# 14. CONSUMO TOTAL DE INSUMOS

Para cada insumo:

```text
total_kg =
sum(
    kg_per_nucleus_formula
    *
    nuclei_count
)
```

La aplicación debe consolidar el mismo insumo aunque aparezca en varios productos.

---

# 15. COSTO TEÓRICO DE INSUMOS

Entidad:

```text
ProductionIngredient
- id
- production_id
- ingredient_id
- total_kg
- historical_price_per_kg
- theoretical_gross_cost
- discount_amount
- theoretical_net_cost
- actual_charge
- difference
- notes
```

Fórmula:

```text
theoretical_gross_cost =
total_kg * historical_price_per_kg
```

---

# 16. DESCUENTOS POR INSUMO

Los descuentos:

- se registran por insumo;
- pueden existir para algunos insumos y para otros no;
- pueden ser monto fijo;
- no deben repartirse obligatoriamente por núcleo.

Fórmula:

```text
theoretical_net_cost =
theoretical_gross_cost - discount_amount
```

---

# 17. COBRO REAL / ROBERTO / MOLINO

Debe conservarse tanto:

```text
costo teórico
```

como:

```text
costo realmente cobrado
```

Campo:

```text
actual_charge
```

Diferencia:

```text
difference =
actual_charge - theoretical_net_cost
```

La diferencia puede deberse a:

- redondeos;
- manipulación;
- criterios del molino;
- diferencias de peso;
- otros ajustes operativos.

No asumir automáticamente que una diferencia implica error.

La interfaz debe permitir detectar qué insumos explican las diferencias.

---

# 18. ESTRUCTURA REAL DE COSTOS DE PRODUCCIÓN

El costo de producción NO se limita al precio de los insumos.

Debe permitir registrar y consolidar componentes como:

## 18.1 Costo de núcleos

Actualmente puede existir un costo de referencia de:

```text
S/ 250 por núcleo
```

Este valor debe ser configurable y quedar congelado en la producción correspondiente.

No hardcodear S/250 como constante perpetua.

---

## 18.2 Insumos

Suma de costos reales o conciliados de los insumos utilizados.

---

## 18.3 Flete

Costo de transporte relacionado con producción.

---

## 18.4 Estriba / carga / descarga

Costo asociado a manipulación física de sacos o insumos.

---

## 18.5 Personal

Pago a personal relacionado con producción o traslado.

---

## 18.6 Servicio

Debe existir la posibilidad de registrar uno o más costos de servicio asociados a una producción.

Ejemplos:

- servicio de molino;
- procesamiento;
- manipulación;
- servicio operativo relacionado.

---

## 18.7 Sacos / envases

Costo actual de referencia:

```text
S/ 1.10 por saco
```

Debe ser editable y guardarse históricamente.

Fórmula orientativa:

```text
packaging_cost =
bags_produced * historical_bag_cost
```

BASE y otros productos pueden usar valores distintos en el futuro.

---

## 18.8 Gastos extraordinarios por insumo

Debe permitirse registrar un costo adicional específico relacionado con un insumo.

Ejemplo conceptual:

```text
Insumo: melaza
Costo extra: S/ 80
Motivo: traslado extraordinario
```

No modificar artificialmente el precio base histórico del insumo para representar ese costo.

---

# 19. ENTIDAD DE COSTOS ADICIONALES DE PRODUCCIÓN

Implementar una entidad genérica:

```text
ProductionCost
- id
- production_id
- category
- description
- quantity optional
- unit_cost optional
- amount
- ingredient_id optional
- notes optional
- created_at
```

Categorías iniciales:

```text
NUCLEUS
FREIGHT
HANDLING
PERSONNEL
SERVICE
PACKAGING
INGREDIENT_EXTRA
OTHER
```

Esto evita crear una tabla diferente para cada gasto.

---

# 20. COSTO REAL DE PRODUCCIÓN

Debe calcularse una única cifra de costo real consolidado.

Conceptualmente:

```text
real_production_cost =
actual_ingredient_cost
+ nucleus_cost
+ freight
+ handling
+ personnel
+ service
+ packaging
+ ingredient_extra_costs
+ other_production_costs
```

No sumar dos veces el mismo gasto.

Si un importe ya forma parte de `actual_charge` de un insumo, no volver a registrarlo como gasto adicional salvo que realmente sea otro concepto.

---

# 21. COSTO ESTIMADO VS REAL

Antes de disponer de todos los costos reales:

```text
estimated_production_cost
```

puede usar:

- costo teórico neto de insumos;
- costos adicionales conocidos.

Cuando existan cobros reales:

```text
real_production_cost
```

debe usar los valores conciliados.

La interfaz debe distinguir claramente:

```text
Estimado
Real
Variación
```

No sumar estimado + real.

---

# 22. INVENTARIO DE PRODUCTO TERMINADO

El inventario se controla preferentemente en unidades/sacos.

También debe conservarse el peso asociado.

Entidad:

```text
InventoryMovement
- id
- date
- item_type
- item_id
- movement_type
- quantity
- weight_kg
- source_type
- source_id
- notes
- created_at
```

Tipos de movimiento iniciales:

```text
PRODUCTION_IN
SALE_OUT
RETURN_IN
ADJUSTMENT_IN
ADJUSTMENT_OUT
CANCELLATION_REVERSAL
```

---

# 23. VENTA FUTURA Y STOCK INSUFICIENTE

Este caso es real y debe estar soportado.

Puede ocurrir que el administrador registre una venta antes de haber registrado la producción del lote que abastecerá dicha venta.

Por tanto:

**NO bloquear automáticamente una venta solo porque el stock actual sea insuficiente.**

Al detectar stock insuficiente, mostrar una advertencia visible.

Ejemplo:

```text
Stock disponible: 80 sacos
Venta solicitada: 120 sacos

Faltante: 40 sacos
```

La interfaz debe ofrecer:

```text
1. Continuar como venta futura / pendiente de entrega
2. Registrar primero un LOTE A PRODUCIR
3. Cancelar y corregir
```

---

# 24. LOTE A PRODUCIR

Un "Lote a producir" se representa mediante:

```text
Production.status = DRAFT
```

No requiere una entidad completamente diferente.

Debe poder crearse rápidamente desde el flujo de venta cuando exista stock insuficiente.

Puede guardar una relación opcional con una venta futura:

```text
SaleProductionLink
- sale_id
- production_id
- notes optional
```

Esta relación sirve para trazabilidad y planificación.

No debe impedir que una producción abastezca posteriormente varias ventas.

---

# 25. ENTREGA E INVENTARIO EN VENTAS FUTURAS

Para evitar stock negativo artificial, separar:

```text
registro comercial de venta
```

de:

```text
salida física de inventario
```

Agregar a la venta:

```text
fulfillment_status
```

Valores iniciales:

```text
PENDING
PARTIALLY_DELIVERED   [preparado para futuro; puede omitirse de UI MVP si no se implementa entrega parcial]
DELIVERED
CANCELLED
```

Para el MVP puede manejarse entrega total por venta.

Regla:

- venta futura confirmada: no descuenta stock todavía;
- al marcar `DELIVERED`: genera `SALE_OUT`;
- venta inmediata con stock suficiente: puede confirmarse y marcarse `DELIVERED` en la misma operación.

Si se implementa entrega parcial en una fase posterior, usar entidad de despacho.

---

# 26. STOCK DISPONIBLE

Conceptualmente:

```text
stock =
entradas confirmadas
- salidas entregadas
+ devoluciones
± ajustes
```

Las ventas futuras pendientes de entrega no reducen el stock físico.

Opcionalmente mostrar:

```text
stock_fisico
stock_comprometido
stock_disponible_proyectado
```

Para el MVP, al menos mostrar:

- stock actual;
- cantidad comprometida en ventas futuras.

---

# 27. CLIENTES

Entidad:

```text
Customer
- id
- code
- name
- tax_id optional
- contact_name optional
- phone optional
- address optional
- notes optional
- is_active
- created_at
- updated_at
```

Debe permitirse crear cliente desde el formulario de venta.

Búsqueda:

- ignorar mayúsculas/minúsculas;
- ignorar tildes;
- ignorar espacios extra;
- sugerir coincidencias;
- advertir posibles duplicados.

---

# 28. SEDES

Las sedes representan el lugar destino de la venta.

Ejemplos históricos:

- Lima Polo Club;
- Quilmaná;
- Club Hípico Villa;
- Hipódromo;
- Rancho Los Caballos.

No hardcodear la lista.

Entidad:

```text
Site
- id
- name
- is_active
- created_at
- updated_at
```

Relación:

```text
CustomerSite
- customer_id
- site_id
- is_default
```

Un cliente puede estar relacionado con varias sedes.

La venta guarda explícitamente la sede destino.

---

# 29. VENTAS

Entidad:

```text
Sale
- id
- code
- sale_date
- customer_id
- site_id
- payment_condition
- commercial_status
- financial_status
- fulfillment_status
- notes
- created_by
- created_at
- cancelled_at optional
- cancellation_reason optional
```

---

# 30. ESTADOS DE VENTA

## commercial_status

```text
DRAFT
CONFIRMED
CANCELLED
RECTIFIED
```

## financial_status

```text
PENDING
PARTIAL
PAID
CANCELLED
```

## fulfillment_status

```text
PENDING
DELIVERED
CANCELLED
```

No existe estado `OVERDUE`.

**No se implementará vencimiento de deuda en el MVP.**

No existe:

```text
due_date
```

No existe:

```text
vencida
```

No mostrar indicadores de deuda vencida.

---

# 31. DETALLE DE VENTA

Entidad:

```text
SaleItem
- id
- sale_id
- product_id
- quantity
- reference_unit_weight_kg
- unit_weight_kg
- total_weight_kg
- reference_unit_price
- unit_price
- subtotal
```

Fórmulas:

```text
total_weight_kg =
quantity * unit_weight_kg
```

```text
subtotal =
quantity * unit_price
```

```text
sale_total =
sum(subtotal)
```

---

# 32. PRECIO DE REFERENCIA Y PRECIO APLICADO

Al elegir un producto:

```text
reference_unit_price =
product.default_sale_price
```

Autocompletar:

```text
unit_price =
reference_unit_price
```

El usuario puede modificar `unit_price`.

Guardar ambos.

Esto permite detectar precios especiales sin perder el precio de lista histórico.

---

# 33. CONDICIÓN DE VENTA

Valores:

```text
CASH
CREDIT
```

Crédito no es método de pago.

---

# 34. VENTA AL CONTADO

Se adopta la **Opción B**.

Al confirmar una venta `CASH`:

1. el usuario debe seleccionar método de pago;
2. debe ingresar los datos mínimos del pago;
3. el sistema crea la venta;
4. crea el pago;
5. crea la aplicación de pago;
6. la venta queda financieramente pagada;
7. todo ocurre en una misma transacción.

Si la transacción falla, no debe quedar una venta sin su pago correspondiente.

---

# 35. VENTA A CRÉDITO

Una venta `CREDIT`:

- puede iniciar sin pagos;
- puede recibir pagos parciales;
- puede recibir varios pagos;
- aparece en Cobranza mientras tenga saldo > 0;
- deja de aparecer en pendientes cuando saldo = 0;
- nunca se elimina del historial.

---

# 36. NO EXISTE VENCIMIENTO DE DEUDA

Eliminar completamente del MVP:

- fecha de vencimiento;
- antigüedad como criterio de vencimiento;
- indicador "vencido";
- total vencido;
- estado VENCIDA.

Se puede mostrar simplemente la **edad de la venta** como dato informativo si se desea, pero no debe generar lógica financiera especial.

---

# 37. PAGOS

Entidad:

```text
Payment
- id
- code
- customer_id
- payment_date
- total_amount
- payment_method
- other_method optional
- reference optional
- notes optional
- created_by
- created_at
```

Métodos iniciales:

```text
CASH
TRANSFER
CHECK
OTHER
```

Si:

```text
payment_method = OTHER
```

mostrar:

```text
other_method
```

Ejemplos:

- Yape;
- Plin;
- otro.

No implementar todavía cuentas bancarias receptoras complejas.

---

# 38. APLICACIÓN DE PAGOS

Un pago real puede cubrir una o varias ventas.

Entidad:

```text
PaymentApplication
- id
- payment_id
- sale_id
- applied_amount
```

Ejemplo:

```text
Pago real: S/ 1,866

V-101 -> S/ 1,460
V-115 -> S/   268
V-122 -> S/   138
```

No crear tres pagos ficticios.

Crear un pago y tres aplicaciones.

---

# 39. SALDO DE VENTA

```text
paid_amount =
sum(PaymentApplication.applied_amount)
```

```text
balance =
sale_total - paid_amount
```

Estados:

```text
if cancelled:
    CANCELLED

elif balance <= 0:
    PAID

elif paid_amount > 0:
    PARTIAL

else:
    PENDING
```

No permitir que un error de redondeo pequeño genere saldo negativo absurdo.

Usar `Decimal`, nunca `float`, para dinero.

---

# 40. COBRANZA

Cobranza debe mostrar:

```text
payment_condition = CREDIT
AND
balance > 0
AND
sale not cancelled
```

Columnas mínimas:

- cliente;
- sede;
- código venta;
- fecha;
- total;
- pagado;
- saldo;
- estado.

Filtros:

- cliente;
- sede;
- estado financiero;
- rango de fechas.

Indicadores:

- total por cobrar;
- clientes con deuda;
- ventas pendientes.

No mostrar "total vencido".

---

# 41. INGRESOS

Una venta no equivale a un ingreso.

Regla:

```text
ingreso_real = Payment.total_amount
```

No usar:

```text
Sale.total
```

como ingreso de caja.

En el Balance deben mostrarse por separado:

- ventas registradas;
- dinero cobrado;
- saldo pendiente.

---

# 42. GASTOS

Entidad general:

```text
Expense
- id
- date
- category
- description
- amount
- production_id optional
- sale_id optional
- site_id optional
- ingredient_id optional
- notes optional
- created_by
- created_at
```

Categorías iniciales:

```text
LOGISTICS
OPERATING
ADMINISTRATIVE
OTHER
```

Cuando el gasto sea directamente parte del costo de una producción, preferir `ProductionCost`.

No duplicar el mismo egreso en `ProductionCost` y `Expense`.

---

# 43. GASTOS LOGÍSTICOS

Ejemplos:

- transporte;
- flete;
- carga;
- descarga;
- combustible;
- peajes;
- movilidad;
- viáticos;
- personal de apoyo.

Pueden relacionarse con:

- una producción;
- una venta;
- una sede;
- ninguno, si son generales.

---

# 44. ANULACIONES

Las ventas no se eliminan.

Al anular:

- conservar registro;
- guardar motivo;
- guardar usuario;
- guardar fecha;
- revertir movimientos de inventario mediante movimientos compensatorios si ya hubo entrega;
- actualizar efectos financieros de forma controlada.

Si una venta tiene pagos, no permitir una anulación silenciosa.

Debe requerir un flujo explícito de rectificación/reversión.

---

# 45. RECTIFICACIONES

Este flujo existe porque el administrador puede cometer errores de tipeo.

Ejemplo:

```text
Cantidad real: 100 sacos
Cantidad tipeada: 1000 sacos
```

Una venta confirmada no debe editarse destruyendo los valores originales.

Debe existir una acción:

```text
RECTIFICAR
```

La rectificación debe:

1. guardar el registro original;
2. guardar qué campos cambiaron;
3. guardar valores anteriores;
4. guardar valores nuevos;
5. guardar motivo;
6. guardar usuario;
7. guardar fecha/hora;
8. recalcular total;
9. recalcular saldo;
10. ajustar inventario mediante movimientos compensatorios si la venta ya fue entregada.

---

# 46. AUDITORÍA DE RECTIFICACIÓN

Entidad recomendada:

```text
Correction
- id
- entity_type
- entity_id
- reason
- created_by
- created_at
```

Detalle:

```text
CorrectionField
- correction_id
- field_name
- old_value
- new_value
```

Para cambios complejos de detalle de venta se puede guardar snapshot JSON adicional.

---

# 47. RECTIFICACIÓN CON PAGOS YA EXISTENTES

Caso:

```text
Venta original: S/ 10,000
Pagado: S/ 6,000
Venta rectificada: S/ 5,500
```

No borrar pagos.

El sistema debe detectar:

```text
paid_amount > corrected_sale_total
```

y bloquear el cierre automático de la rectificación hasta que el usuario resuelva el excedente.

Para el MVP:

- no crear saldo a favor automático;
- mostrar alerta;
- exigir una operación administrativa de devolución/reversión de pago antes de completar.

---

# 48. DEVOLUCIONES

Las devoluciones son diferentes de rectificación.

Rectificación:

> el dato registrado era incorrecto.

Devolución:

> la venta fue correcta, pero producto entregado retorna posteriormente.

Entidad:

```text
Return
- id
- sale_id
- return_date
- reason
- notes
- created_by
- created_at
```

Detalle:

```text
ReturnItem
- id
- return_id
- sale_item_id
- quantity
- weight_kg
```

Una devolución confirmada:

- genera `RETURN_IN`;
- conserva historial;
- puede afectar el saldo económico según corresponda.

La gestión fiscal de notas de crédito queda fuera del MVP.

---

# 49. EDICIÓN DIRECTA

Regla general:

## Borradores

```text
DRAFT
```

pueden editarse libremente.

## Confirmados

No deben sobrescribirse destructivamente.

Usar:

- rectificación;
- devolución;
- anulación;
- movimiento de ajuste.

---

# 50. BALANCE GENERAL

La vista Balance debe distinguir:

```text
Ventas registradas
Cobros reales
Saldo por cobrar
Costo de producción
Gastos logísticos
Otros gastos
Resultado
```

No confundir:

```text
vendido != cobrado != pendiente
```

---

# 51. RESULTADO ECONÓMICO

Vista de caja simplificada:

```text
cash_result =
real_collections
- real_production_costs_paid
- logistics_expenses
- other_expenses
```

Vista comercial/estimada:

```text
estimated_margin =
sales
- attributable_production_costs
- logistics
- other attributable costs
```

Para el MVP, priorizar el resultado basado en datos efectivamente registrados.

No pretender hacer contabilidad financiera formal.

---

# 52. COSTO DE PRODUCCIÓN EN BALANCE

Usar una sola fuente consolidada.

Para producciones con costos reales:

```text
usar real_production_cost
```

Para producciones todavía sin conciliación completa:

```text
usar estimated_production_cost
```

La UI debe marcar visualmente si la cifra es:

```text
ESTIMADA
REAL
```

Nunca sumar ambos.

---

# 53. DASHBOARD

Debe ser simple.

Indicadores recomendados:

- ventas del periodo;
- cobrado;
- saldo por cobrar;
- gastos;
- costo de producción;
- utilidad/resultado estimado;
- stock actual;
- ventas futuras pendientes de entrega;
- producciones/lotes a producir.

No llenar el Dashboard de gráficos inútiles.

---

# 54. NAVEGACIÓN

```text
DASHBOARD

VENTAS
 ├─ Nueva venta
 ├─ Historial
 ├─ Ventas futuras
 ├─ Rectificaciones
 ├─ Devoluciones
 └─ Anulaciones

COBRANZA
 ├─ Cuentas pendientes
 ├─ Registrar pago
 └─ Historial de pagos

CLIENTES
SEDES
PRODUCTOS

PRODUCCIÓN
 ├─ Nueva producción
 ├─ Lotes a producir
 ├─ Historial
 ├─ Insumos
 ├─ Fórmulas
 └─ Costos / conciliación

INVENTARIO
 ├─ Stock actual
 └─ Movimientos

GASTOS
 ├─ Logística
 └─ Otros

BALANCE

CONFIGURACIÓN
```

---

# 55. PANTALLAS DE CAPTURA FRECUENTE

Mantener pocas.

Principales:

1. Nueva venta.
2. Registrar producción / lote a producir.
3. Registrar pago.
4. Registrar gasto.
5. Rectificar cuando sea necesario.

Clientes, productos y sedes deben poder crearse rápidamente desde flujos relacionados.

---

# 56. CÓDIGOS INTERNOS

Usar códigos legibles.

Ejemplo:

```text
Venta:       V-000001
Producción:  PR-000001
Pago:        PG-000001
Devolución:  DV-000001
Rectificación: RC-000001
```

El ID interno de base de datos puede ser UUID.

El código visible no debe usarse como clave primaria técnica.

---

# 57. MONEDA Y PRECISIÓN

Moneda MVP:

```text
PEN
```

Dinero:

```text
Decimal / NUMERIC
2 decimales
```

Pesos:

usar precisión suficiente, idealmente:

```text
NUMERIC(12,3)
```

Cantidades de sacos estándar:

enteros.

Si en el futuro se requiere fraccionamiento, ampliar sin romper modelo.

---

# 58. FECHAS

Guardar:

- fecha comercial;
- fecha/hora real de creación;
- usuario creador.

Ejemplo en ventas:

```text
sale_date
created_at
```

Esto permite registrar operaciones atrasadas sin fingir que fueron creadas ese día.

Zona horaria de aplicación:

```text
America/Lima
```

---

# 59. USUARIOS Y ROLES DEL MVP

Arquitectura preparada para varios usuarios.

Roles mínimos sugeridos:

```text
ADMIN
OPERATOR
VIEWER
```

## ADMIN

- configuración;
- confirmar;
- rectificar;
- anular;
- registrar pagos;
- cerrar producción.

## OPERATOR

- registrar ventas;
- registrar producción;
- registrar gastos;
- registrar pagos según permisos.

## VIEWER

- consulta.

No implementar un sistema empresarial de permisos excesivamente granular en MVP.

---

# 60. REGLAS DE INTEGRIDAD

1. No borrar ventas confirmadas.
2. No borrar pagos.
3. No borrar producciones confirmadas.
4. No borrar movimientos de inventario históricos.
5. Preferir `inactive` para clientes/productos/sedes.
6. Toda transacción financiera debe ser trazable.
7. Todo precio histórico usado debe quedar almacenado.
8. Toda fórmula usada debe quedar identificada.
9. Toda rectificación debe registrar motivo.
10. Toda anulación debe registrar motivo.
11. No duplicar cuentas por cobrar.
12. No duplicar gastos de producción.
13. No descontar stock por ventas futuras aún no entregadas.
14. No inferir sacos a partir de peso de fórmula.
15. No mezclar venta e ingreso.

---

# 61. TRANSACCIONES DE BASE DE DATOS

Deben ser atómicas al menos estas operaciones:

## Confirmar venta al contado

```text
crear venta
crear detalles
crear pago
crear aplicación de pago
crear salida inventario si se entrega
commit
```

## Confirmar producción

```text
guardar snapshot fórmula
guardar costos
crear movimientos inventario
commit
```

## Registrar pago

```text
crear Payment
crear PaymentApplications
recalcular estados
commit
```

## Rectificar venta entregada

```text
registrar corrección
crear movimientos compensatorios
recalcular totales
recalcular saldo
commit
```

---

# 62. MODELO DE DATOS RESUMIDO

```text
User

Customer
Site
CustomerSite

Product
Ingredient
Formula
FormulaIngredient

Production
ProductionProduct
ProductionIngredient
ProductionCost
SaleProductionLink

Sale
SaleItem

Payment
PaymentApplication

Return
ReturnItem

Correction
CorrectionField

Expense

InventoryMovement
```

---

# 63. RELACIONES PRINCIPALES

```text
Customer
  ├── CustomerSite ── Site
  └── Sale
        ├── SaleItem ── Product
        ├── PaymentApplication ── Payment
        ├── Return
        └── Correction

Product
  ├── Formula
  │     └── FormulaIngredient ── Ingredient
  ├── ProductionProduct
  └── SaleItem

Production
  ├── ProductionProduct
  ├── ProductionIngredient
  ├── ProductionCost
  ├── InventoryMovement
  └── SaleProductionLink ── Sale
```

---

# 64. FLUJO COMPLETO DE PRODUCCIÓN

```text
Configurar productos
        ↓
Configurar insumos
        ↓
Definir fórmulas
        ↓
Crear lote a producir (DRAFT)
        ↓
Ingresar núcleos por producto
        ↓
Calcular insumos requeridos
        ↓
Calcular costo teórico
        ↓
Registrar descuentos
        ↓
Registrar costos adicionales
        ↓
Confirmar producción
        ↓
Congelar snapshots históricos
        ↓
Generar producto terminado
        ↓
Registrar cobros/costos reales
        ↓
Conciliar
        ↓
Cerrar producción
```

---

# 65. FLUJO COMPLETO DE VENTA INMEDIATA

```text
Nueva venta
    ↓
Elegir cliente
    ↓
Elegir sede
    ↓
Agregar productos
    ↓
Autocompletar precios
    ↓
Editar precio si corresponde
    ↓
Validar stock
    ↓
Stock suficiente
    ↓
Elegir CONTADO o CRÉDITO
    ↓
Confirmar
    ↓
Si CONTADO -> crear pago
    ↓
Marcar entregada
    ↓
Generar salida inventario
```

---

# 66. FLUJO DE VENTA FUTURA

```text
Nueva venta
    ↓
Cantidad solicitada > stock
    ↓
Mostrar advertencia
    ↓
Usuario decide:
    ├─ continuar como venta futura
    │       ↓
    │   fulfillment = PENDING
    │
    └─ registrar LOTE A PRODUCIR
            ↓
        Production = DRAFT
            ↓
        asociar opcionalmente a la venta
```

Posteriormente:

```text
Producción confirmada
    ↓
Stock disponible
    ↓
Venta se marca DELIVERED
    ↓
SALE_OUT
```

---

# 67. FLUJO DE COBRANZA

```text
Venta CREDIT
    ↓
Saldo > 0
    ↓
Aparece en Cobranza
    ↓
Registrar pago
    ↓
Aplicar a una o varias ventas
    ↓
Recalcular saldo
    ↓
saldo = 0
    ↓
PAID
    ↓
deja lista de pendientes
```

---

# 68. FLUJO DE ERROR DE TIPEO

```text
Venta confirmada
    ↓
Administrador detecta error
    ↓
RECTIFICAR
    ↓
Mostrar valores originales
    ↓
Ingresar valores correctos
    ↓
Ingresar motivo
    ↓
Calcular impacto:
    ├─ venta
    ├─ saldo
    ├─ inventario
    └─ pagos
    ↓
crear auditoría
    ↓
crear movimientos compensatorios si corresponde
```

Nunca hacer:

```text
UPDATE silencioso y olvidar el valor anterior
```

---

# 69. VALIDACIONES DE VENTA

- cliente obligatorio;
- sede obligatoria salvo decisión futura explícita;
- al menos un producto;
- cantidad > 0;
- peso unitario > 0;
- precio aplicado >= 0;
- producto activo;
- producto vendible;
- total calculado en backend;
- advertir stock insuficiente;
- venta futura permitida;
- pago obligatorio para CONTADO;
- no crear pago automático sin método seleccionado.

---

# 70. VALIDACIONES DE PAGO

- monto > 0;
- cliente debe coincidir con ventas aplicadas;
- suma de aplicaciones <= monto del pago;
- cada aplicación > 0;
- no aplicar más que saldo pendiente;
- no aplicar a venta anulada;
- no borrar pagos existentes.

Para MVP puede exigirse:

```text
sum(applied_amount) == total_amount
```

evitando saldos de pago sin aplicar.

---

# 71. VALIDACIONES DE PRODUCCIÓN

- al menos un producto con núcleos > 0;
- fórmula activa disponible;
- cantidad de núcleos válida;
- snapshots de precios antes de confirmar;
- costo de sacos configurable;
- costo de núcleo configurable;
- no recalcular historia usando precios actuales;
- no cerrar sin haber confirmado.

---

# 72. ALERTAS ÚTILES

Mostrar alertas únicamente cuando tengan utilidad operativa.

Ejemplos:

- stock insuficiente;
- precio aplicado diferente al precio estándar;
- diferencia alta entre costo teórico y cobro real;
- producción sin conciliar;
- venta futura sin lote planificado;
- rectificación que genera pago excedente;
- producto inactivo;
- cliente potencialmente duplicado.

---

# 73. NO USAR COLORES COMO REGLA DE NEGOCIO

Puede conservarse referencia visual discreta:

- Potripregnant;
- Nutrelin;
- Hi-Performance;
- BASE.

Pero la identidad del producto siempre depende de ID, nunca del color.

Estados también deben tener texto e icono, no solo color.

---

# 74. HISTORIAL

Cada entidad financiera u operativa importante debe conservar:

```text
created_at
created_by
updated_at cuando aplique
```

Operaciones sensibles pueden guardar adicionalmente:

```text
confirmed_at
confirmed_by
cancelled_at
cancelled_by
closed_at
closed_by
```

---

# 75. DASHBOARD Y BALANCE NO SON FUENTES DE DATOS

Dashboard y Balance solo consolidan.

No deben solicitar nuevamente:

- ventas;
- pagos;
- producción;
- costos;
- gastos.

Las fuentes son los módulos operativos originales.

---

# 76. CONFIGURACIÓN INICIAL

Sección:

```text
Configuración
```

Subsecciones:

```text
Empresa
Productos
Sedes
Insumos
Fórmulas
Categorías de gasto
Costos por defecto
Usuarios
```

Empresa:

```text
name = Nutrequine Pro
currency = PEN
timezone = America/Lima
```

Costos por defecto pueden incluir:

```text
default_nucleus_cost
default_packaging_cost
```

Estos son valores de ayuda.

Las producciones confirmadas guardan snapshot.

---

# 77. DATOS HISTÓRICOS INMUTABLES

Guardar snapshots en lugar de depender de configuración actual.

Ejemplos:

- precio de venta;
- precio referencia;
- peso estándar;
- precio insumo;
- costo por saco;
- costo por núcleo;
- fórmula;
- sacos por núcleo;
- peso comercial por núcleo.

---

# 78. ORDEN DE IMPLEMENTACIÓN RECOMENDADO

## Fase 1 — Base técnica

1. proyecto;
2. autenticación simple;
3. base de datos;
4. migraciones;
5. layout;
6. componentes UI.

## Fase 2 — Maestros

7. productos;
8. insumos;
9. fórmulas;
10. sedes;
11. clientes.

## Fase 3 — Producción

12. producción DRAFT;
13. cálculo por núcleos;
14. consolidación insumos;
15. costos;
16. descuentos;
17. ProductionCost;
18. confirmación;
19. inventario.

## Fase 4 — Comercial

20. nueva venta;
21. detalle;
22. precios;
23. stock;
24. venta futura;
25. historial.

## Fase 5 — Finanzas

26. pagos;
27. PaymentApplication;
28. cobranza;
29. gastos;
30. balance.

## Fase 6 — Integridad

31. anulaciones;
32. rectificaciones;
33. devoluciones;
34. auditoría.

## Fase 7 — Presentación

35. dashboard;
36. filtros;
37. UX;
38. responsividad;
39. validaciones;
40. pruebas.

---

# 79. CRITERIOS DE ACEPTACIÓN DEL MVP

El MVP se considera funcionalmente válido si puede demostrar el siguiente escenario completo:

## Escenario A — Producción

1. Crear producción.
2. Elegir:
   - 8 núcleos Potripregnant;
   - 4 Hi-Performance;
   - 3 Nutrelin.
3. Obtener automáticamente:
   - sacos;
   - peso comercial;
   - insumos totales;
   - costo teórico.
4. Aplicar descuentos.
5. Registrar costos adicionales.
6. Registrar cobros reales.
7. Confirmar.
8. Ver entrada en inventario.

## Escenario B — Venta contado

1. Crear cliente.
2. Elegir sede.
3. Registrar varios productos.
4. Autocompletar precios.
5. Modificar un precio.
6. Elegir CONTADO.
7. Elegir método de pago.
8. Confirmar.
9. Ver pago.
10. Ver salida de stock si se entrega.

## Escenario C — Venta crédito

1. Crear venta CREDIT.
2. Verla en Cobranza.
3. Registrar pago parcial.
4. Ver estado PARTIAL.
5. Registrar segundo pago.
6. Ver saldo 0.
7. Ver estado PAID.
8. Ya no aparece en pendientes.
9. Mantener historial.

## Escenario D — Un pago para varias ventas

1. Cliente posee tres ventas pendientes.
2. Registrar una transferencia.
3. Distribuirla entre las tres ventas.
4. Crear un solo Payment.
5. Crear tres PaymentApplications.

## Escenario E — Venta futura

1. Stock = 80.
2. Venta = 120.
3. Mostrar alerta.
4. Permitir continuar.
5. Marcar fulfillment PENDING.
6. Crear lote a producir opcional.
7. Confirmar producción.
8. Entregar venta.
9. Descontar stock al entregar.

## Escenario F — Rectificación

1. Registrar venta con cantidad errónea.
2. Confirmarla.
3. Detectar error.
4. Rectificar.
5. Guardar valores anteriores.
6. Guardar motivo.
7. Ajustar inventario.
8. Recalcular total y saldo.

---

# 80. REGLAS QUE CODEX NO DEBE INVENTAR

Codex NO debe:

- asumir que todos los productos pesan 25 kg;
- eliminar BASE;
- bloquear todas las ventas sin stock;
- generar stock negativo solo para representar ventas futuras;
- crear vencimiento de deuda;
- crear estado VENCIDA;
- crear una cuenta por cobrar distinta por cada pago;
- tratar un pago múltiple como varios pagos falsos;
- sobrescribir ventas confirmadas;
- eliminar pagos;
- derivar sacos desde peso de fórmula;
- recalcular historia con precios actuales;
- sumar costo estimado y real;
- duplicar gastos;
- asumir que venta = ingreso;
- hardcodear valores S/250 o S/1.10 sin snapshot/configuración;
- implementar lógica condicional basada en el nombre "BASE";
- añadir SUNAT por iniciativa propia.

---

# 81. FILOSOFÍA FINAL

Nutrequine Pro debe priorizar:

```text
correctitud
> trazabilidad
> rapidez operativa
> claridad
> estética
```

La estética importa, pero nunca debe destruir la lógica del negocio.

El administrador debe poder registrar las operaciones principales sin sentirse frente a una hoja contable gigantesca.

La mayor parte de la aplicación debe ser de consulta.

---

# 82. RESUMEN NORMATIVO DE LAS DECISIONES CERRADAS

1. Existen cuatro productos relevantes.
2. Tres son comerciales actualmente.
3. BASE existe y usa parámetros propios.
4. BASE no es una excepción de código.
5. Los productos premium normalmente usan sacos de 25 kg.
6. BASE usa 50 kg.
7. Se permiten pesos extraordinarios por línea de venta.
8. Producción se maneja por núcleos.
9. Peso de fórmula y peso comercial son conceptos distintos.
10. Fórmulas se versionan.
11. Precios históricos se congelan.
12. Producción DRAFT representa un lote a producir.
13. DRAFT no afecta stock.
14. CONFIRMED genera producto terminado.
15. CLOSED representa producción conciliada/cerrada.
16. Los costos de producción incluyen más que insumos.
17. Puede existir costo de núcleo de referencia S/250.
18. Puede existir costo de saco de referencia S/1.10.
19. Ambos deben ser configurables y guardarse históricamente.
20. Se registran flete, estriba/manipulación, personal, servicios y extras por insumo.
21. No se duplica un costo.
22. Venta puede tener varios productos.
23. Precio se autocompleta pero puede editarse.
24. CONTADO exige registrar pago en el mismo flujo.
25. CRÉDITO puede recibir pagos parciales.
26. No existe vencimiento de deuda en MVP.
27. No existe estado VENCIDA.
28. Un pago puede cubrir varias ventas.
29. Venta no equivale a ingreso.
30. Puede registrarse una venta futura sin stock suficiente.
31. Stock insuficiente genera advertencia, no bloqueo absoluto.
32. Puede crearse un LOTE A PRODUCIR desde ese flujo.
33. Venta futura no descuenta stock físico hasta la entrega.
34. Las ventas confirmadas no se editan destructivamente.
35. Los errores de tipeo se corrigen mediante rectificación.
36. Las devoluciones representan retorno real de producto.
37. Las anulaciones conservan historia.
38. El inventario usa movimientos.
39. Balance consolida automáticamente.
40. Dashboard no captura datos.
41. No hay SUNAT en MVP.
42. Este documento reemplaza los documentos funcionales previos como fuente normativa.

---

# 83. INSTRUCCIÓN FINAL PARA CODEX

Implementar Nutrequine Pro siguiendo este documento como contrato funcional.

Antes de crear una regla de negocio no especificada:

1. revisar si puede derivarse directamente de estas entidades y estados;
2. elegir la alternativa que preserve trazabilidad;
3. evitar agregar complejidad innecesaria;
4. no alterar decisiones cerradas;
5. documentar cualquier supuesto técnico relevante.

Priorizar que cada flujo funcione correctamente de extremo a extremo antes de añadir decoración o dashboards avanzados.

**FIN DE LA ESPECIFICACIÓN FUNCIONAL MAESTRA DEL MVP**
