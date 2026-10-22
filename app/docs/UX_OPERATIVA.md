# Captura operativa de producción

Implementación del brief UX operativo, partiendo de `e4b05d2`. Mantiene la
identidad corporativa, las fórmulas, los maestros y las reglas de conciliación.
Las capturas usan exclusivamente bases sintéticas aisladas de la instalación local.

## Interacciones

- El lápiz abre únicamente el precio del insumo elegido. Enter o Aplicar acepta;
  Escape o Cancelar descarta y devuelve el foco al lápiz. El precio corresponde
  al lote, sin cambiar el maestro ni otras producciones.
- Aplicar descuento revela el importe. Desmarcar envía cero, aunque el borrador
  del campo se conserve para volver a activarlo. El backend rechaza descuentos
  superiores al bruto y precios inválidos.
- Los insumos nuevos precargan cobro real al teórico neto y comienzan pagados.
  El cobro automático acompaña cantidades, precio y descuento; editarlo cambia
  al modo manual. Restablecer al teórico neto recupera el modo automático.
  El estado Pagado es independiente del importe y admite varios pendientes.
- Abrir borradores existentes conserva precios históricos, cobros nulos,
  descuentos y pagos. Los registros sin modo explícito conservan sus valores;
  las producciones nuevas guardan la intención automática/manual al reabrir.
- Los marcadores de producto complementan el nombre. El espaciado de los cinco
  formularios pasa a 26px en escritorio y 18px en móvil, con padding interior de 20px/16px.

## Compatibilidad

`IngredientInput` añade dos campos opcionales: `price_per_kg` en soles y
`actual_charge_mode` (`auto`/`manual`). El precio se valida con el escalado
monetario existente y se almacena en `historical_price_per_kg` en céntimos. El
modo automático deriva el cobro neto en el servidor. Su ausencia conserva el
contrato anterior (cobro nullable y estado de pago explícito).

No requiere migraciones: los campos de intención se conservan en el snapshot
JSON existente. Al confirmar un borrador antiguo, el precio ya registrado se
conserva si no había un precio explícito en su entrada. No cambia fórmulas,
inventario, permisos, costos de núcleos/envases ni las condiciones para cerrar.
Un precio propio del lote puede diferir del maestro; el detalle y la conciliación
continúan usando el snapshot histórico del lote.

## Verificación

Las pruebas unitarias cubren precisión, límites, varios productos, descuento
oculto, automatismo/manual, varios pendientes, históricos y cierre con cantidades
cero. La prueba de navegador cubre teclado y foco, independencia por fila,
persistencia tras reinicio, catálogo intacto, conciliación y cierre. La regresión
general conserva el resto de rutas, roles, formularios y operaciones.

Comandos del proyecto: `npm.cmd run verify` y `npm.cmd run test:e2e`. Los resultados
finales de ejecución se incluyen en el Pull Request. No se modificó la base de
demostración ni la base empresarial para estas comprobaciones.

## Antes y después

Capturas comparables de un núcleo de Potripregnant, misma resolución y tema:

| Superficie              | Antes                                                      | Después                                                        |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Productos de producción | ![Antes](ux-operativa/antes/production-desktop-light.png)  | ![Después](ux-operativa/despues/production-desktop-light.png)  |
| Insumos, tema claro     | ![Antes](ux-operativa/antes/ingredients-desktop-light.png) | ![Después](ux-operativa/despues/ingredients-desktop-light.png) |
| Insumos, tema oscuro    | ![Antes](ux-operativa/antes/ingredients-desktop-dark.png)  | ![Después](ux-operativa/despues/ingredients-desktop-dark.png)  |
| Insumos, móvil          | ![Antes](ux-operativa/antes/ingredients-mobile-light.png)  | ![Después](ux-operativa/despues/ingredients-mobile-light.png)  |
| Venta                   | ![Antes](ux-operativa/antes/sale-desktop-light.png)        | ![Después](ux-operativa/despues/sale-desktop-light.png)        |
| Pago                    | ![Antes](ux-operativa/antes/payment-desktop-light.png)     | ![Después](ux-operativa/despues/payment-desktop-light.png)     |
| Gasto                   | ![Antes](ux-operativa/antes/expense-desktop-light.png)     | ![Después](ux-operativa/despues/expense-desktop-light.png)     |
| Ajuste de inventario    | ![Antes](ux-operativa/antes/inventory-desktop-light.png)   | ![Después](ux-operativa/despues/inventory-desktop-light.png)   |

Estado interactivo de varios productos: precio de lote, descuento, cobro manual
y dos filas pendientes. Los controles finales permanecen accesibles desplazando
la tabla en móvil.

![Ajustes del lote](ux-operativa/despues/ingredients-adjusted-desktop.png)
![Controles de cobro y pago en móvil](ux-operativa/despues/ingredients-mobile-right.png)
