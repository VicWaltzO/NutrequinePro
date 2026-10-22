---
version: 1
slug: "app-features-ventas-components-saleform-tsx"
primary_target: "app/features/ventas/components/SaleForm.tsx"
related_targets: ["app/features/ventas/components/SaleLineEditor.tsx","app/features/ventas/hooks/useSaleFormState.ts","app/client/sale-form.css"]
---

# Registro de venta por etapas

Modo: Operate. Refinamiento de la interfaz corporativa existente, solicitado por
el usuario sobre Nueva venta. Misma identidad, componentes y tokens de DESIGN.md.

Recorrido: Cliente → Productos → Pagos. Tres tarjetas consecutivas con títulos
legibles; cliente y sede llevan su acción de creación junto al campo y despliegan
la captura rápida en el mismo bloque. Las altas conservan el resto del formulario.

Productos: botones con fotografía original, nombre, precio y stock. Un clic llena
la primera línea vacía o añade una nueva; no cambia líneas ya seleccionadas. Cada
línea conserva selección nativa, sacos, peso, precio y subtotal editables. En móvil
las entradas se distribuyen en dos columnas y las presentaciones se deslizan.

Peso inicial de las líneas nuevas: 25 kg por saco, editable. Seleccionar un producto
conserva el peso explícito. Ventas guardadas y rectificaciones mantienen su snapshot;
no se cambian maestros, fórmulas ni cálculos del servidor.

La entrega y sus avisos de stock permanecen con Productos; condición, cobro inicial,
saldos y notas, con Pagos. Los tres bloques se conservan al rectificar, con los datos
de cliente de solo lectura. Pie opaco y contenido final accesible en ambas pantallas.

Verificar: altas rápidas, duplicados, varios productos y pesos, subtotal y cobro
real, snapshot al rectificar, claro/oscuro, teclado y móvil. No se crean imágenes
nuevas ni cambia el sistema global de diseño.
