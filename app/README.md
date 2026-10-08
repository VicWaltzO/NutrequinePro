# Nutrequine Pro

WebApp administrativa basada en la [especificación maestra](docs/ESPECIFICACION_MAESTRA_MVP.md). React / Vinext, Cloudflare Workers y D1 (SQLite). La aplicación comienza con maestros reales y sin operaciones ficticias.

## Uso

La versión alojada requiere autenticación de ChatGPT y conserva el acceso privado del propietario. El primer usuario autenticado en una base vacía queda registrado como ADMIN. Otros usuarios requieren tanto acceso al sitio como alta de su ID en Configuración → Usuarios. Se aplican permisos también en el servidor. La vista previa local utiliza la identidad de prueba del starter y tiene su propia base, separada de producción.

Los accesos frecuentes están en Ventas, Producción, Cobranza y Gastos. Los códigos abren el detalle con las acciones disponibles. El stock insuficiente se resuelve con venta futura, lote planificado o corrección de cantidades. La entrega total es una acción separada. No hay entregas parciales ni vencimientos de deuda.

## Desarrollo local (Node 22.13+)

```powershell
npm.cmd ci
npm.cmd run build
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --file drizzle/0000_nervous_silver_fox.sql --persist-to .wrangler/state --config dist/server/wrangler.json
npm.cmd run dev
```

Aplicar la migración inicial una sola vez a una base local vacía. Las migraciones posteriores se aplican en orden. No ejecutar nuevamente la inicial sobre una base existente. La vista previa responde en http://127.0.0.1:5173. El helper de Sites aplica las migraciones versionadas al publicar. El comando `db:generate` genera migraciones futuras; las aplicadas son inmutables.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

## Integridad y arquitectura

- `lib/domain.mjs`: validaciones y transiciones puras; no depende del navegador ni de la base.
- `lib/persistence.mjs`: plan de escrituras para todas las entidades de una operación.
- `lib/store.ts`: acceso preparado a D1; lotes atómicos y control optimista de revisión. Un conflicto obliga a recargar, sin sobrescribir otra operación.
- `db/schema.ts` y `drizzle/`: 27 tablas con relaciones y migraciones. Cada entidad usa columnas de identidad/relación y un documento JSON de datos; los snapshots completos permanecen en las tablas de operación y auditoría. Se eligió este modelo para el volumen reducido documentado. La extensión a columnas de consulta se hace mediante migraciones.
- Importes enteros en céntimos, pesos enteros en gramos. Las multiplicaciones de insumos se redondean a céntimos con aritmética entera BigInt. Los cálculos fuera de rango se rechazan.
- Formularios y vistas solo consolidan; el servidor vuelve a calcular todos los totales. Los IDs de operación permiten reintentar sin crear un segundo pago o venta.
- No existen endpoints de borrado de operaciones. Anulaciones y reversiones agregan trazabilidad. Los maestros se desactivan.
- Recursos de marca en `public/brand/`: archivos originales suministrados. Las presentaciones se muestran como recortes visuales por CSS del catálogo original. BASE usa un bloque tipográfico porque no se aportó una foto de su presentación.

## Decisiones técnicas y límites explícitos

- Las devoluciones registran retorno físico. Su efecto económico es un importe explícito ingresado por el administrador; valor inicial cero. No se inventa una política automática de descuento o reembolso.
- La reversión de pago es total, administrativa y auditada. Para una reasignación o corrección parcial se revierte el original y se registra el pago correcto con nuevas aplicaciones. No existe saldo a favor automático.
- Una rectificación de venta con devoluciones anteriores queda bloqueada porque no está definida la reasignación económica y física de devoluciones a líneas corregidas. **TODO negocio:** definir este caso antes de permitirlo. El historial y las devoluciones se pueden consultar; no se destruyen.
- La rectificación de cantidades de producción usa los productos y fórmulas originales. Los cobros reales de insumos se conservan; el administrador confirma los importes adicionales. La conciliación permite corregir descuentos, cobros y costos con motivo. Agregar un producto nuevo a una producción confirmada se registra en otra producción.
- Costos marcados como pagados son los egresos de caja de producción, incluso si luego se anula su inventario. El periodo se atribuye a la fecha de producción. **TODO negocio:** si se requiere pago parcial de proveedores o fechas independientes de desembolso, añadir un libro de pagos a proveedores; no se simula en este MVP.
- El resultado comercial usa costos de producción del periodo, sin valoración FIFO ni costo atribuible de cada saco vendido. Se rotula como estimado; no representa contabilidad formal.
- El inventario de insumos registra consumo. No se inventó una compra de materia prima o saldo inicial de insumos, fuera del alcance documentado.
- Operadores registran ventas, pagos, producción en borrador y gastos. Administradores confirman producción, cierran, rectifican, anulan, ajustan inventario y configuran maestros. VIEWER consulta.

## Verificación

Ver [matriz de aceptación](docs/ACEPTACION.md). Las pruebas operan sobre estados aislados y bases SQLite en memoria. Las pruebas manuales de navegador usan una base local separada; esos registros no se publican.
