# Navegación y perfil de clientes

Primer PR del brief de navegación y documentos. Incluye las secciones 1, 3 y 4:
transiciones entre subpestañas, ampliación de la ficha existente y gestión contextual
de sedes. La exportación de los cuatro PDF corresponde al segundo PR; no se añaden
botones de exportación sin una implementación disponible.

## Continuidad del sistema visual

La comparación de `Tabs`, `SubtabContent`, `CustomerDetail`, `CustomerSiteFields`,
`CustomerSites`, `customer-profile.css` y `workspace.css` con `PRODUCT.md`,
`DESIGN.md`, `.impeccable/design.json` y la superficie
`.impeccable/surfaces/app-client-app-tsx.md` confirma una extensión del sistema
existente: Segoe heredada, acento azul semántico, superficies sin elevación nueva,
cifras tabulares, cinco métricas agrupadas y sedes editables dentro de la ficha.
Se conservan los controles, tipos y estados existentes, el foco visible y la
navegación y los filtros estables. No se incorpora un mundo visual ni una escala
de tokens nuevos; los cuatro documentos de autoridad se preservan.

Los 440 ms del indicador y del contenido son una excepción expresa para este
flujo, descrita a continuación, y no sustituyen las duraciones generales de
120/220 ms del sistema ni el intervalo del contrato de superficie existente.

## Navegación

`Tabs` conserva botones nativos, foco visible y `aria-current="page"`. Tab y
Shift+Tab recorren las acciones; Enter y Espacio las activan. No se introducen roles
`tablist` incompletos. El hash y el historial siguen siendo la fuente de navegación
de las áreas; las secciones del perfil son locales al diálogo.

Un solo indicador medido con `ResizeObserver` se desplaza hasta la selección.
`SubtabContent` anima el mismo contenedor mediante Web Animations, sin duplicar
tablas ni remontar formularios para animarlos. El orden de pestañas define el
sentido del desplazamiento de 16 px. Cada cambio cancela la animación anterior.

La duración es **440 ms**, al reducir a la mitad la velocidad de los 220 ms
iniciales por petición expresa del usuario. Se aplica al indicador y al contenido.
El movimiento reducido elimina ambos desplazamientos; cambiar esa preferencia
durante una animación también la cancela. Los filtros, encabezados y métricas
compartidos quedan fuera del contenedor animado. La búsqueda, las fechas y el
estado se conservan entre subpestañas, incluido Atrás/Adelante.

Las pestañas móviles conservan desplazamiento horizontal y hacen visible la
selección. El contenido limita el desbordamiento de la transición sin convertir
tablas extensas en un carrusel ni imponer una altura fija a sus filas.

## Ficha existente

Ya existían deuda, saldo a favor, saldo neto, datos del cliente y tabla de ventas.
Se amplía `CustomerDetail`, sin directorio paralelo, con cinco indicadores
agrupados: vendido histórico, cobrado aplicado, deuda actual, saldo a favor actual
y cantidad de ventas efectivas. Borradores y anulaciones no cuentan como ventas.

Resumen, Ventas, Cobros y aplicaciones, Sedes y Actividad permiten consultar el
historial con fechas y, en ventas, estado comercial. Los indicadores históricos y
los saldos actuales se distinguen de las cifras del periodo. El resumen usa
`saleSummary`, `paymentSummary` y `customerSummary`; un cobro aplicado a varias
ventas se cuenta una sola vez. Los pagos revertidos muestran su importe original
como referencia y cero vigente, con sus aplicaciones rotuladas sin efecto.

Ventas, cobros, devoluciones, reversiones y rectificaciones enlazan al detalle de
la operación. Se conservan las acciones existentes. No se añade un gráfico de
compras porque la tabla y el historial ya permiten consultar los datos sin ocupar
más espacio. Los estados sin contacto, ventas, cobros o sedes son explícitos.

## Sedes y atomicidad

Ya existían Clientes → Sedes → Nueva sede, selección de sedes en el formulario y
la relación muchos a muchos `customerSites`. La nueva interacción reutiliza esas
entidades y ofrece buscar/vincular una sede o preparar una nueva desde la ficha y
desde Nuevo/Editar cliente. Preparar la sede no escribe datos; guardar realiza
la creación y el vínculo juntos. Cancelar no crea sedes globales.

`CUSTOMER_SAVE` admite `new_sites` (nombres) y `default_site_id` además de
`site_ids`. `CUSTOMER_SITES_SAVE` modifica exclusivamente los vínculos y la fecha
de actualización del cliente, sin sobrescribir sus contactos. Ambos reutilizan
`saveCustomerSites`, dentro de la copia de estado validada por `executeCommand` y
el batch transaccional de SQLite existente. No hay migraciones ni escrituras
parciales desde el cliente. Los identificadores `new:0`, etc., solo seleccionan
la principal entre las sedes pendientes de esa solicitud; no se guardan como IDs.

Se rechazan nombres duplicados tras normalizar acentos, mayúsculas y espacios,
incluso entre dos sedes pendientes. La interfaz sugiere vincular la existente;
si está inactiva, indica que se active desde Sedes. Este flujo no crea homónimos.
Los duplicados que ya existían en el catálogo no se fusionan ni se renombran.

Retirar un vínculo conserva la sede global y las ventas históricas. La sede
principal pertenece a la relación del cliente, sin cambiar la de otros clientes.
Las opciones de ventas reciben el estado actualizado y usan la principal mediante
la selección de cliente que ya existía. El editor de sedes conserva sus cambios
al visitar otra sección del perfil. La edición de contactos conserva sus campos
mientras se prepara una sede nueva.

ADMIN y OPERATOR conservan sus permisos de escritura y VIEWER solo consulta. La
API y el dominio verifican autorización; ocultar controles no es la protección.
La revisión optimista e idempotencia existentes también protegen estos comandos.

## Validación y evidencias

Las pruebas nuevas usan exclusivamente datos sintéticos y bases temporales:

- `tests/customer-navigation.test.mjs`: métricas con aplicaciones distribuidas,
  reversión, devolución, borrador y anulación; vínculos compartidos; principal;
  permisos; idempotencia; rechazos sin cambios y rollback ante fallo SQL inducido.
- `tests/local-e2e/customer-navigation.test.mjs`: las seis áreas con subpestañas,
  direcciones, 440 ms, historial, clics rápidos, filtros, teclado, movimiento
  reducido, temas, móvil, creación y vínculo contextual, opciones de venta,
  persistencia tras reinicio y permisos HTTP/interfaz.

Las capturas antes/después proceden de instalaciones sintéticas aisladas. La
referencia anterior corresponde al cliente previo a este PR; las pantallas de
producción del PR #4 no forman parte de la comparación ni de los cambios de este
PR. La rama se actualizó con `main` después de verificar su fusión en GitHub.

El informe final del PR registra los resultados de `npm.cmd run verify` y
`npm.cmd run test:e2e`. No se incluyen bases, credenciales, trazas ni registros
privados en el repositorio o la distribución.

E2E ejecuta los archivos en serie, con `--test-concurrency=1` antes de los patrones
de archivos. Algunos ensayos reconstruyen la distribución y otros la copian a
instalaciones temporales: no ejecutar E2E a la vez que `verify` o un build. Un
primer intento concurrente produjo copias incompletas; se conserva como fallo de
ejecución y la validación final debe hacerse después del build completo.

Resultado final de esta entrega:

- `npm.cmd run verify`: 190 pruebas aprobadas; tres comprobaciones TypeScript,
  lint, formato, build y auditoría de distribución aprobados. La auditoría enumera
  1056 archivos y 50 paquetes de runtime, sin archivos privados.
- `REGRESSION_BROWSER_CHANNEL=chrome npm.cmd run test:e2e`: 27 pruebas aprobadas,
  cero fallos y cero omisiones, ejecutadas en serie sobre la distribución.
- Revisión independiente de Impeccable: `ship`, sin correcciones materiales; 20
  capturas finales válidas, más seis referencias anteriores. Documentación del
  sistema contrastada y autoridades visuales preexistentes conservadas.
- Accesibilidad y estabilidad: controles nativos, foco con teclado, movimiento
  reducido y cambio de preferencia durante la transición, clics rápidos,
  desbordamiento móvil, permisos de consulta/escritura, reversiones y aplicaciones
  distribuidas. Persistencia y vínculos comprobados tras reiniciar la instalación
  sintética. No se modificaron datos empresariales.

## Comparación visual

Todas las imágenes son capturas de escenarios sintéticos. Los importes de la
comparación corresponden al mismo escenario de dos ventas y un cobro distribuido.

| Superficie        | Antes                                                        | Después                                                         |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Navegación clara  | [Ver](navegacion-clientes/antes/navigation-before-light.png) | [Ver](navegacion-clientes/despues/navigation-desktop-light.png) |
| Navegación oscura | [Ver](navegacion-clientes/antes/navigation-before-dark.png)  | [Ver](navegacion-clientes/despues/navigation-desktop-dark.png)  |
| Clientes claro    | [Ver](navegacion-clientes/antes/customers-before-light.png)  | [Ver](navegacion-clientes/despues/customers-desktop-light.png)  |
| Clientes oscuro   | [Ver](navegacion-clientes/antes/customers-before-dark.png)   | [Ver](navegacion-clientes/despues/customers-desktop-dark.png)   |
| Perfil claro      | [Ver](navegacion-clientes/antes/profile-before-light.png)    | [Ver](navegacion-clientes/despues/profile-desktop-light.png)    |
| Perfil oscuro     | [Ver](navegacion-clientes/antes/profile-before-dark.png)     | [Ver](navegacion-clientes/despues/profile-desktop-dark.png)     |

Móvil: [perfil claro](navegacion-clientes/despues/profile-mobile-light.png),
[perfil oscuro](navegacion-clientes/despues/profile-mobile-dark.png),
[sedes](navegacion-clientes/despues/sites-mobile-light.png),
[edición de sedes](navegacion-clientes/despues/site-editor-mobile-dark.png).
La carpeta `navegacion-clientes/despues` conserva la matriz de cinco superficies
en escritorio/móvil y claro/oscuro (20 capturas). Las fichas se desplazan dentro
del diálogo; las imágenes de sedes y edición móvil muestran también su zona final.
