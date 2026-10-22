---
version: 1
slug: "app-shared-ui-formsection-tsx"
primary_target: "app/shared/ui/FormSection.tsx"
related_targets: ["app/features/cobranza/components/PaymentForm.tsx", "app/features/gastos/components/ExpenseFields.tsx", "app/features/inventario/components/InventoryAdjustmentFields.tsx", "app/features/produccion/components/ProductionForm.tsx", "app/client/operation-forms.css", "app/client/admin/ModalHost.tsx"]
---

# Captura operativa por secciones

Modo: Operate. Extensión del patrón aprobado de Registrar venta, conservando la
identidad, los tokens, las etiquetas y las reglas de la aplicación.

Pago: Cliente → Cobro → Aplicación a ventas. Aplicar un saldo existente conserva
su contexto y no representa un cobro nuevo. Los vacíos explican qué falta.
Gasto: Gasto → Vinculación opcional → Notas. El aviso al vincular una producción
mantiene explícito que el costo no se suma dos veces.
Producción: Lote → Productos → Insumos consolidados → Costos y registro. Cuatro
grupos responden a la densidad de la tarea. Los costos adicionales son filas
separadas por líneas dentro de su grupo, sin tarjetas anidadas.
Inventario: Producto y fecha → Movimiento y cantidades → Motivo obligatorio.

Lectura en el mismo orden que el foco; dos columnas cuando caben, una en móvil.
Cabeceras de 16px/20px y cuerpo de 20px; móvil 14px/16px y cuerpo de 16px, con
22px entre grupos, iguales a Venta. Las tablas desplazan dentro de su contenedor
y muestran una indicación en móvil. El pie opaco conserva el último campo legible.

Movimiento: diálogo y velo entran juntos en 220ms; salen en 120ms antes de
restaurar el foco nativo. El contenido permanece inerte durante el cierre y una nueva
apertura cancela la salida anterior. La sustitución del formulario y los estados
que aparecen por una acción usan desplazamiento corto y desvanecimiento; las
tarjetas estáticas no reciben una cascada. Movimiento reducido elimina estos
efectos y conserva contenido y confirmaciones inmediatas.

Verificación: registros reales con datos sintéticos, aplicación parcial de pago,
gasto vinculado sin duplicar costos, borrador de producción con costo adicional,
ajuste exacto de sacos/gramos, cierre por botón/Escape y foco restaurado. Claro y
oscuro; escritorio y anchos de 768, 390 y 320px. Sin nuevas imágenes ni dependencias.
