# Sacos, frascos y otras unidades comerciales

El catálogo separa la categoría, la unidad comercial (`BAG`, `BOTTLE`, `UNIT`),
el contenido neto en gramos enteros, la política de peso (`FIXED`, `VARIABLE`)
y el ingreso al inventario (`NUCLEUS_PRODUCTION`, `DIRECT_STOCK`). Los precios
continúan en céntimos por unidad comercial; las cantidades físicas son enteras.
Los nombres de campos históricos terminados en `_kg` siguen almacenando gramos.

## Actualización y compatibilidad

Los metadatos son propiedades aditivas del JSON que ya persiste SQLite. No hay
migración SQL ni reescritura de ventas, fórmulas, producciones o movimientos.
Un maestro antiguo se interpreta como saco, peso variable y producción por
núcleo, usando su `standard_bag_weight_kg` almacenado: BASE conserva 50 kg y
los otros alimentos conservan 25 kg. Elegir un producto nuevo en ventas toma
su peso nominal; las rectificaciones del mismo producto conservan el peso usado.

Las líneas y movimientos nuevos congelan presentación, política y peso nominal;
el peso efectivamente vendido permanece en `unit_weight_kg`. Los documentos
antiguos sin metadatos se interpretan como sacos, sin consultar la presentación
actual para reetiquetarlos. La devolución y las compensaciones usan la línea
histórica. Después de tener ventas, producción o movimientos, la presentación
no puede cambiar unidad, peso o modalidad: se debe crear una ficha distinta.
Sí pueden actualizarse nombre, precio, fotografía y estado sin alterar snapshots.

Antes de actualizar una instalación empresarial, detenga el servidor y siga el
respaldo y la verificación de [INSTALACION_LOCAL.md](INSTALACION_LOCAL.md).
Compruebe el respaldo y ensaye su restauración en otro destino privado. Este
cambio no prepara, modifica ni despliega ninguna base empresarial automáticamente.

## Alta privada autorizada de CascoPlus+

No se incluye el producto en `seedState` ni en la provisión del catálogo original.
No se publica su fotografía ni se inventan precio, existencias, fórmula o proveedor.
El canal de alta es la sesión local autenticada de un administrador:

1. En Configuración → Productos, busque primero `CascoPlus+`. Si existe, edite
   esa ficha. Si hay un nombre provisional, revise sus referencias y acuerde con
   el responsable cualquier corrección; no hay renombrado ni fusión automática.
2. Cree únicamente la ficha autorizada: nombre **CascoPlus+**, categoría
   **Suplemento nutricional equino**, unidad **Frasco**, contenido **2200 gramos**,
   peso **Fijo**, ingreso **Registro directo de existencias**.
3. Deje vacío el precio y desmarque **Habilitado para venta** mientras no se conozca
   el precio real. La API rechaza habilitar venta sin precio; no convierte un
   precio ausente en cero. Cuando el administrador registre el precio real por
   frasco, podrá habilitarla. Los precios especiales por línea siguen disponibles.
4. Extraiga localmente `assets/cascoplus-plus-referencia.jpg` del ZIP proporcionado
   y selecciónela en **Fotografía privada del producto**. JPEG, PNG y WebP de hasta
   150 KB se guardan en el JSON privado, bajo los permisos de la base y su respaldo.
   La foto adjunta de referencia cabe en ese límite. No copie el ZIP ni la imagen
   a `public/`, al repositorio o a servicios externos. Los recursos históricos de
   sacos siguen usando sus clases existentes; la foto cargada usa proporciones
   originales con `object-fit: contain`.
5. Registre existencias reales desde Inventario → Ajustar inventario: fecha,
   entrada, cantidad entera de frascos y motivo/origen documentado. Se conserva
   el usuario autenticado y el origen `ADJUSTMENT`; el peso se calcula. No se crea
   una compra, costo, lote físico ni producción industrial implícitos.

Los nombres de producto duplicados se rechazan. Los reintentos de un mismo
comando con su `request_id` conservan la idempotencia existente. Las altas y
cambios de maestros se auditan. No se genera un SKU comercial.

## Operación

- Un frasco de peso fijo siempre usa 2200 g en ventas y ajustes. La API valida
  cantidad entera y coincidencia del peso total si se suministra; la interfaz
  muestra el peso calculado sin permitir editarlo.
- Las ventas pendientes comprometen unidades sin descontarlas físicamente. La
  entrega comprueba cantidades y gramos conjuntamente y falla sin efectos parciales.
- En una venta futura mixta, solo los productos de producción por núcleo entran
  al lote planificado. Una venta compuesta únicamente por ingreso directo no crea
  un lote vacío ni ficticio; queda pendiente hasta tener existencias.
- La devolución usa los gramos históricos y una reducción económica explícita.
  La anulación compensa solo lo no devuelto. Se conservan las reglas de reversión
  de pagos y de stock no negativo.
- Producción y edición de fórmulas excluyen los productos de ingreso directo;
  el dominio también rechaza peticiones incompatibles.
- Inventario, ventas, devoluciones y PDF muestran la unidad por fila; no hay
  totales que presenten una mezcla de sacos y frascos como si fueran sacos.

## Verificación aislada

`tests/presentations.test.mjs` verifica memoria, SQLite histórica y SQLite nueva,
incluyendo cierre/reapertura y respaldo/restauración. Solo usa valores sintéticos.
La secuencia 5 frascos → entrega 2 → devolución 1 produce 11000 → 6600 → 8800 g.
También prueba falta de precio, duplicados, rechazos atómicos, venta futura mixta,
anulación, snapshots y compatibilidad de pesos extraordinarios históricos.

`tests/local-e2e/presentations.test.mjs` recorre el alta mediante formulario,
recepción automática, selección saco → frasco, venta mixta, producción restringida,
validación HTTP, entrega, devolución y PDF. Captura escritorio/móvil y claro/oscuro
en `outputs/` (excluido de Git). Por defecto utiliza una imagen sintética mínima;
para revisar la foto original localmente, establezca `NUTREQUINE_TEST_PRODUCT_PHOTO`
en su ruta absoluta. Ninguna captura o base de prueba se publica en el PR.

Ejecute `npm.cmd run verify` y después `npm.cmd run test:e2e` desde `app/`.
