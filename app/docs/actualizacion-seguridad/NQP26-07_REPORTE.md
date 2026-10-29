# NQP26-07 · Entrega y abastecimiento

29 de octubre de 2026, America/Bogota (fecha del responsable; operación contractual America/Lima).
Estado: **PARCIAL / EN REVISIÓN**. La aceptación completa depende de Capa 2, no autorizada.

## Base y autorización

Solicitud: ejecutar la orden 07 aportada, contrastando revisión 05 y matriz E07-01–20.
GitHub consultado nuevamente: #16 y #17 fusionados; base origin/main
`2219f98fea2db06fc341e9b0c7e383f657aac89e`. Worktree nuevo y rama
`codex/nqp26-07-entrega-ux`. Cambios ajenos del checkout original preservados.
No fusión, despliegue, datos empresariales ni habilitación de reservas.
La cabeza integrada de #17, `36ce42fcae493cafd5c17c5889d8a650bf0a9270`, tiene
CI completed/success, ejecución 40887682731, comprobada de nuevo. El merge
2219f98 no tiene ejecuciones propias devueltas por GitHub; no se le imputa esa CI.

## Diagnóstico antes de modificar (E07-01)

- SaleForm.tsx envía deliver según mode=immediate y create_production según
  mode=planned. Su Footer deshabilita confirmación inmediata ante missing;
  el aviso dice «Elija venta futura para continuar». No basta ocultar ese selector.
- useSaleFormState/sale-form-preview agrupan cantidades y gramos y comparan
  contra stock(); no calculan K. sale-dates conserva sincronización y override.
  Las dos fechas ya están en cabecera y no se moverán.
- SaleLineEditor conserva unidad/peso/precio, líneas vacías y subtotal.
- SaleDetail usa deliveryAvailability del ledger para habilitar entrega legacy;
  presenta ese saldo como «Stock físico», sin evidencia de un recuento físico.
  SALE_DELIVER explícito conserva validación de servidor. ADMIN reprograma;
  OPERATOR no gana permisos de reprogramación. SaleDeliveryDateForm solo cambia fecha.
- commands.mjs: assertStock/outputSale para entrega legacy; coverSale únicamente
  si partialReservations; saleDeliver moderno exige cobertura completa y no repite
  cargo. Pago no entrega. create_production moderno continúa bloqueado.
- coverage/summary/delivery-date: K protegido y N separado; committed no es K;
  coverage_version=1 es obligatorio. La composición ordinaria no ofrece motor,
  rechaza bases experimentales y la experimental no sirve frontend operativo.
- Riesgos: confundir saldo con físico, recalcular reservas en React, borrar lote,
  debilitar faltantes o duplicar fechas. Se preservan comandos, validaciones,
  snapshots, referencias, seis todo y contratos de 01/04/05/06.

## Mapa previo de implementación y matriz

E07-02/04/09/12/16: separar aviso de inventario, entrega y lote mediante grupos
compactos accesibles; conservar selector y opciones legacy. E07-05/06/08/10/11:
componente puro que consume saleSummary; prueba sintética aislada, no integración
comercial. E07-07/13/15/17: regresión existente de dominio, HTTP y SQLite.
E07-03/18: verify y E2E completos después de build. E07-19/20: rama, borrador,
reporte, matriz y bitácora. E07-14 queda PARCIAL mientras reservas no estén autorizadas.

## Resultado implementado

SaleForm conserva el selector Entrega y sus tres opciones legacy, sus payloads y
la guarda del Footer. El aviso de inventario está antes y fuera del grupo Entrega,
anunciado con aria-live; informa faltante de unidades y gramos por producto, sin
llamar físico al saldo. Entrega explica el efecto explícito de confirmar o dejar
pendiente; el lote opcional tiene un grupo independiente. No se suprime creación
legacy ni vinculación. Las fechas y su override permanecen en cabecera.

SaleSupplyStatus es un componente de lectura. Consume coverage_lines añadido
al resumen de dominio, con cantidades cubiertas y faltantes por línea/presentación;
no calcula reservas ni usa committed. Solo muestra el contrato moderno cuando
coverage_version=1; los registros ordinarios dicen «Flujo legacy · sin cobertura
registrada». Borradores y anulados no muestran una promesa de abastecimiento.
Se distingue READY_BY_STOCK de entrega pendiente y DELIVERED explícito; N=0 no
deja aviso de faltante. No se suman sacos con frascos ni variantes de peso.

SaleDetail sigue validando disponibilidad legacy con el mismo helper; cambia su
etiqueta a «Saldo según movimientos». Cuando recibe un resumen moderno sintético
usa coverage_status para la guarda visual de entrega, sin comparar K con saldo libre
C (que puede ser cero cuando K=q). No hay conexión nueva entre la aplicación ordinaria
y la composición experimental. Sus acciones siguen pasando por las validaciones
existentes del servidor. El componente se ensaya aisladamente con SSR, dominio y
SQLite, nunca presentando ese ensayo como aplicación comercial activada.

No cambian esquema, migraciones, comandos de escritura, permisos, fechas, pagos,
precios, pesos, costos, movimientos ni referencias históricas. BASE sigue no
vendible y CascoPlus+ conserva BOTTLE fijo de 2200 g. create_production con reservas
permanece rechazado antes de escribir. Ninguna opción UI, URL, HTTP, entorno o
configuración activa partialReservations. I14–I19 permanecen todo.

## Verificación e incidencias

- Instalación: npm.cmd ci --no-audit --no-fund completó; avisó dependencias de
  desarrollo obsoletas y scripts esbuild no aprobados. El build inicial terminó
  correctamente sin modificar lockfile ni dependencias.
- Primera dirigida: node --test tests/sale-supply-status.test.mjs
  tests/sale-delivery-date.test.mjs tests/sale-empty-preview.test.mjs
  tests/nqp26-queue.test.mjs: 57 aprobadas, una fallida, cero todo/omitidas/canceladas.
  La expectativa nueva usaba coma decimal, pero kg() vigente devuelve 2.2; se corrigió
  la expectativa y la concordancia singular del mensaje del componente.
- Última dirigida, mismo comando: 58 aprobadas, cero fallidas/todo/omitidas/canceladas.
  Incluye K=2/N=1, cobro inerte, reposición a K=q con entrega PENDING y C=0,
  botón de entrega según cobertura y entrega expresa sin duplicar ledger; memoria
  y SQLite real. Las 58 no se suman al conteo de verify.
- Tres TypeScript y lint independientes completaron correctamente.
- Primera UI dirigida: REGRESSION_BROWSER_CHANNEL=chrome; node --test
  tests/local-e2e/sale-supply.test.mjs: cero aprobadas y una fallida. Había completado
  bloqueo HTTP con rollback, captura de formulario, lote y detalle; falló al buscar
  Ventas con el menú móvil cerrado. El ensayo ahora restaura escritorio antes de
  navegar, sin aumentar timeouts ni cambiar código de aplicación.
- Primera verify: npm.cmd run verify, 349 aprobadas, una fallida y seis todo;
  cero omitidas/canceladas. Solo falló ui-regression por HTML cambiado. No llegó
  a los pasos de tipos/lint/formato/build del agregador. No fue una corrida verde.
- Última verify (02), mismo comando: 350 aprobadas, seis todo, cero fallidas,
  omitidas o canceladas; salida 0. Tres TypeScript, lint, formato, build completo
  y auditoría de distribución correctos: 2078 archivos, 69 paquetes runtime,
  cero privados y cero paquetes retirados. Esta es la compilación usada por E2E.
- Primera y última E2E completa (01): `$env:REGRESSION_BROWSER_CHANNEL='chrome'; npm.cmd run test:e2e`,
  32/32 aprobadas en una sola corrida después del build final; cero fallidas,
  omitidas, canceladas o todo, salida 0. La prueba nueva corregida pasa dentro de
  esa corrida y no se suma por separado. Comprueba venta suficiente ordinaria,
  rechazo HTTP íntegro ante insuficiencia, pendiente legacy, lote, entrega
  explícita, ausencia de cobertura imputada y aviso no residual. Las suites de
  fechas y vacío también aprueban, con reinicio, reapertura y guardado real.
  Estos E2E acreditan exclusivamente el modo ordinario.

## Revisión visual y huellas

Revisión del formulario y detalle legacy reales, 1440×1000 y 390×844, claro y oscuro:
ocho capturas sintéticas, sin desbordamiento horizontal del cuerpo del modal.
Foco conservado al cambiar Entrega por teclado; Tab llega al lote, con contorno
visible. Cabecera, pie y contenido mantienen el estilo corporativo existente.
El estado vacío y las fechas se conservan y sus regresiones siguen obligatorias.
El componente de cobertura se renderizó además por separado en los cuatro tamaños/
temas para parcial y listo, rotulado como sintético y con reservas empresariales
deshabilitadas. No es una ruta de la aplicación.

Se comparó el DOM de la base exacta 2219f98 con el actual y se revisaron las
capturas de ambos. La revisión SSR auxiliar inicial se repitió al corregir la
selección de fuentes de base y del fixture; únicamente los archivos finales con
sufijo 1440/390 sustentan la comparación. En la comparación estática no se cargan
fotografías; las capturas del servidor real sí conservan los activos existentes.
Solo cambian dos escenarios de ui-corporate.json, tras revisar los cambios exactos:

| Escenario         | SHA-256 anterior                                                 | SHA-256 nuevo                                                    |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| modal:sale        | 1d654f144b36aee5d1398c728e200cf2ee4922366ea7cf9f221d78afb8375749 | a4788f41732ba4d66d5e2d82d2b70fceb3f43f242f3666fd36e58c670396b756 |
| modal:sale-detail | b6fa836c16057bac02fc29523d23f870ab5e1ca9c81d0cf7b1ed617ffc72aa86 | 2c216235d4ff999b784ead2ef5d926e3a9edba09e76647f6f9587f6cca911326 |

No se cambia ui-baseline ni ninguna aserción histórica de negocio. Rectificación
y todas las rutas/roles restantes conservan su huella. Logs y capturas quedan
en 04_EVIDENCIAS, fuera del commit. Limitaciones de revisión: emulación Chrome,
sin teléfono físico ni lector de pantalla real.

## Puerta de aceptación

E07-14 sigue **PARCIAL**: el flujo ordinario aún exige elegir venta futura para
registrar pendiente sin stock; ocultarlo eludiría el contrato protegido. No se
implementa la sustitución comercial ni planificación enlazada a reservas. La
valoración, permisos integrados y aceptación empresarial requieren las tareas
posteriores indicadas en 04/05. «Conforme a UX preparatoria» no equivale a reservas
empresariales habilitadas. Tampoco se adelantan las alertas globales de 08/38.

La documentación de diseño auxiliar design.json fue marcada desactualizada por
Impeccable; no se modifica ni se amplía el alcance para regenerarla.

## Entrega

Validación local completa. Rama codex/nqp26-07-entrega-ux sobre 2219f98; publicación
y CI de la cabeza propia pendientes al preparar el commit funcional. Las copias
locales de reporte/matriz y la bitácora se guardan fuera de Git. El PR deberá
permanecer en borrador y sin fusión. No se certifica despliegue ni aceptación humana.
