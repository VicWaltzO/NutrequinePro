# Nutrequine Pro

MVP empresarial local para producción, ventas, inventario, clientes, cobranza, gastos
y balances. React 19/TypeScript/Vite conserva el panel y sus formularios; Fastify/Node
ejecuta las operaciones sobre SQLite. Navegación por hash, tema oscuro y diseño
responsive permanecen disponibles.

## Uso y preparación

Requiere Node **24.18+**. Seguir [instalación local](docs/INSTALACION_LOCAL.md) para
preparar SQLite y credenciales propias en un directorio privado externo al código.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- --config "D:\NutrequinePrivado\servidor.json"
```

Cliente y API comparten `http://127.0.0.1:PUERTO`. El servidor no crea bases ni
usuarios al arrancar. Las cookies se gestionan en el navegador y CSRF en memoria.
Para desarrollar: `npm.cmd run dev -- --config RUTA_PRIVADA_ABSOLUTA`.

## Verificación y arquitectura

`npm.cmd run verify` reúne pruebas, los tres chequeos TypeScript, ESLint, Prettier,
compilación completa y auditoría de distribución. Después ejecutar `npm.cmd run test:e2e`.
Preparar el navegador con `npx.cmd playwright install chromium`, o seleccionar
Chrome instalado mediante `REGRESSION_BROWSER_CHANNEL=chrome`.

Ver [arquitectura](docs/ARQUITECTURA.md), [desarrollo](docs/GUIA_DESARROLLO.md),
[recuperación](docs/RESPALDO_RESTAURACION.md),
[matriz de regresión](docs/MATRIZ_REGRESION.md) y
[consolidación](docs/REPORTE_09_CONSOLIDACION.md). Las reglas comerciales se describen
en la [especificación MVP](docs/ESPECIFICACION_MAESTRA_MVP.md).

Para operar y diagnosticar una instalación, consultar la
[guía operativa final](docs/GUIA_OPERATIVA_FINAL.md). El cierre técnico y sus límites
se registran en [validación final](docs/REPORTE_11_VALIDACION_FINAL.md) y
[matriz de aceptación](docs/MATRIZ_ACEPTACION_FINAL.md). La
[arquitectura corporativa](docs/ARQUITECTURA_ERP_CORPORATIVO.md) es una propuesta
futura; no habilita empresas, membresías ni acceso remoto en esta versión.

La distribución `dist-node/` incluye frontend compilado, backend, CLI SQLite, SQL
histórico, dependencias de runtime y avisos legales; los archivos privados se
seleccionan aparte. La instalación puede descargar paquetes; la operación normal
no necesita Internet. Los informes 01–08 y el material multimedia son antecedentes
históricos; no describen requisitos de arranque actuales.

## Decisiones técnicas y límites explícitos

- Las devoluciones registran retorno físico. Su efecto económico es un importe explícito ingresado por el administrador; valor inicial cero. No se inventa una política automática de descuento o reembolso.
- La reversión de pago es total, administrativa y auditada; revierte también las aplicaciones posteriores de su saldo a favor. Para corregir importes ya aplicados se revierte el original y se registra el pago correcto con nuevas aplicaciones. Los excedentes permanecen disponibles en su pago original hasta una aplicación explícita; no se compensan ni se reembolsan automáticamente. Una rectificación o devolución que deje el total por debajo del pago aplicado continúa requiriendo la reversión previa.
- Una rectificación de venta con devoluciones anteriores queda bloqueada porque no está definida la reasignación económica y física de devoluciones a líneas corregidas. **TODO negocio:** definir este caso antes de permitirlo. El historial y las devoluciones se pueden consultar; no se destruyen.
- La rectificación de cantidades de producción usa los productos y fórmulas originales. Los cobros reales de insumos se conservan; el administrador confirma los importes adicionales. La conciliación permite corregir descuentos, cobros y costos con motivo. Agregar un producto nuevo a una producción confirmada se registra en otra producción.
- Costos marcados como pagados son los egresos de caja de producción, incluso si luego se anula su inventario. El periodo se atribuye a la fecha de producción. **TODO negocio:** si se requiere pago parcial de proveedores o fechas independientes de desembolso, añadir un libro de pagos a proveedores; no se simula en este MVP.
- El resultado comercial usa costos de producción del periodo, sin valoración FIFO ni costo atribuible de cada saco vendido. Se rotula como estimado; no representa contabilidad formal.
- El inventario de insumos registra consumo. No se inventó una compra de materia prima o saldo inicial de insumos, fuera del alcance documentado.
- Operadores registran ventas, pagos, producción en borrador y gastos. Administradores confirman producción, cierran, rectifican, anulan, ajustan inventario y configuran maestros. VIEWER consulta.
