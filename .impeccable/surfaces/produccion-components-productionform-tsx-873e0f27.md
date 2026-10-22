---
version: 1
slug: "produccion-components-productionform-tsx-873e0f27"
primary_target: "app/features/produccion/components/ProductionForm.tsx"
related_targets: ["app/features/produccion/components/ProductionIngredients.tsx", "app/features/produccion/components/ProductionPriceCell.tsx", "app/features/produccion/hooks/production-ingredient-input.ts", "app/client/production-entry.css", "app/shared/ui/ProductMarker.tsx"]
---

# Registro rápido de producción

Modo: Operate. Refinamiento dentro de la identidad existente, siguiendo el brief
UX operativo aportado por el usuario. Mantener productos, fórmulas, precios
maestros, permisos y reglas de conciliación y cierre.

Recorrido: indicar núcleos → revisar insumos calculados → ajustar excepciones →
guardar. Tabla de siete columnas, sin tarjetas por fila: precio en lectura con
lápiz inline, descuento que se revela con casilla, cobro automático al teórico
neto con acento suave, restablecimiento explícito tras una edición manual y
Pagado marcado en filas nuevas. Pendientes históricos y cobros nulos permanecen.
El precio se aplica solo al lote, con snapshot en céntimos. Enter aplica y Escape
cancela únicamente la celda, devolviendo el foco al lápiz.

Marcadores de producto de 12px tras el nombre: amarillo Nutrelin, verde
Hi-Performance, rosa Potripregnant y blanco cálido con borde para BASE. Nombre
y cantidades siguen identificando el producto; el color es apoyo secundario.

Ritmo compartido de FormSection y sale-section: 26px entre grupos en escritorio,
18px en móvil, cuerpos de 20px/16px. Misma paleta, borde fino y radio; sin nuevas
sombras ni cambios globales. Tablas desplazan localmente, acciones táctiles de 44px
y pie opaco. Movimiento breve existente y alternativa de movimiento reducido.

Verificar modos de cobro, descuentos ocultos, varios pendientes, varios productos
y cantidades cero; rechazos por precisión/rango sin romper el recálculo; guardar,
reiniciar, reabrir y conciliar en SQLite sintético. Comparar antes/después de los
cinco formularios en claro/oscuro y escritorio/móvil. No usar bases empresariales.
