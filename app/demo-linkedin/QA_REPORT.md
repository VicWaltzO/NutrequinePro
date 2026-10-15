# QA — video operativo Nutrequine Pro

Fecha de revisión: 11 de octubre de 2026. Resultado: video final generado y validado; se conservaron el WebM auténtico y los scripts reproducibles. Código de producción, arquitectura, migraciones y reglas de negocio sin modificaciones.

## Pruebas funcionales ejecutadas

El ensayo `qa/rehearsal-e2e.json` pasó 24 controles. La captura definitiva `1791740795768-capture`, documentada en `qa/e2e.json`, pasó 26: los mismos controles funcionales más dos de alineación de la grabación. En ambas ejecuciones hubo cero errores de navegador y cero llamadas HTTP fallidas. El navegador bloqueó solicitudes fuera de `http://127.0.0.1:5174`.

| Operación auténtica        | Resultado comprobado                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Base aislada y preparación | Cero ventas, producciones, pagos y clientes antes de fixtures; usuario y sedes ficticios; precios de demostración; API local real.     |
| Confirmar PR-000002        | DRAFT → CONFIRMED; 40 sacos / 1,000 kg; stock Hi-Performance 10 → 50; insumos conciliados; tabla de costos reales S/ 1,336.40 visible. |
| Seleccionar Hi-Performance | Precio 72 y peso 25 autocompletados por UI; cambiar cantidad a 10 produce S/ 720.00.                                                   |
| Confirmar V-000002         | CREDIT, CONFIRMED, DELIVERED; total y saldo inicial S/ 720.00; stock 50 → 40.                                                          |
| Registrar pago PG-000002   | S/ 300.00 recibido y aplicado a la venta correcta; saldo S/ 420.00; PARTIAL / Pago parcial.                                            |
| Volver a Resumen           | Ventas S/ 7,380.00; cobros S/ 6,960.00; deuda S/ 420.00; stock 10 / 40 / 10.                                                           |
| Recargar                   | Conserva 2 ventas, 2 producciones y 2 pagos; no duplica operaciones ni modifica el saldo.                                              |

Las verificaciones de la aplicación se ejecutaron desde `app/`: `npm.cmd test` (55 pruebas aprobadas), `npm.cmd run check`, `npm.cmd run lint` y `npm.cmd run build`, todos con código de salida 0. El lint se repitió tras los cambios a la grabación y el montaje. La compilación mostró avisos informativos de tiempo de plugins, sin errores. La instalación separada de herramientas mediante `npm.cmd ci --prefix demo-linkedin` y el instalador portátil de FFmpeg también se ejecutaron y comprobaron.

## Validación técnica del MP4

Evidencia completa: `qa/ffprobe.json`, incluidos los 900 timestamps, conteo real mediante `-count_frames` y resultados de cada tramo.

| Propiedad medida               | Resultado                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Archivo                        | showcase_final.mp4                                                            |
| Resolución visible             | 1920 × 1080                                                                   |
| Relación / píxel               | 16:9 / 1:1                                                                    |
| codec_name                     | h264, codificado con libx264                                                  |
| pix_fmt                        | yuv420p                                                                       |
| r_frame_rate / avg_frame_rate  | 30/1 / 30/1                                                                   |
| nb_frames / nb_read_frames     | 900 / 900                                                                     |
| Duración de pista y contenedor | 30.000000 s / 30.000000 s                                                     |
| CFR real                       | Cada frame corresponde a i / 30, error máximo de redondeo menor de 0.000002 s |
| Tramos                         | 90 / 210 / 210 / 240 / 150 frames                                             |
| Audio                          | Ninguna pista                                                                 |
| Faststart                      | Átomo moov anterior a mdat, comprobado en el archivo                          |
| Decodificación                 | FFmpeg decodificó íntegramente el MP4 sin errores                             |
| Calidad solicitada             | CRF 17, preset slow; aproximación 1.05–1.10 en los detalles                   |

El bruto `showcase_source.webm` conserva VP8 a 1920 × 1080 y 25 FPS, frecuencia de captura de Playwright. No fue sustituido por el montaje. Los tramos se ajustan ligeramente (aproximadamente 1.049–1.119×), sin aceleraciones extremas ni relleno de varios segundos congelados. Los planos de lectura conservan la UI real mientras la cámara digital se mueve lentamente.

La alineación se midió mediante el primer cambio auténtico de Resumen a Producción. `qa/alignment.json` registra frame 152, PTS 6.080 s, corrección −0.041 s y tolerancia de 0.099 s. Los límites del montaje y los resaltados usan esa corrección; el contorno de Confirmar producción se muestra antes de ejecutar el clic y termina antes de que cambien sus acciones.

## Reproducción y revisión visual

`verify_playback.mjs` reprodujo el MP4 final completo en Chrome a velocidad 1, sin saltar a otro punto del video. `qa/playback.json` registra llegada a `ended`, posición y duración 30 s, 900 fotogramas decodificados, cero descartados, presentación monotónica y ningún error. La reproducción dura aproximadamente 30 segundos de reloj real.

Se inspeccionaron imágenes extraídas del MP4, además de capturas originales: `qa/sample-01.png` a `sample-05.png`, la hoja de contacto con 15 momentos y tres fotogramas de interacciones. La revisión confirmó:

- El botón Confirmar producción resaltado pertenece a la UI real y corresponde al clic ejecutado; la producción muestra su estado posterior y la tabla real de insumos.
- El formulario de venta muestra precio 72, peso 25, cantidad 10 y total S/ 720; el detalle conserva el mismo importe y deuda inicial.
- El formulario de pago muestra 300 recibido y 300 aplicado; el detalle posterior muestra S/ 300 cobrado y S/ 420 de saldo, con PG-000002 registrado.
- Los títulos y etiquetas quedan completos; las etiquetas de 28 px no cubren los datos. Los planos generales usan zoom 1.00–1.02 para conservar textos y marca en los bordes.
- No hay datos personales, correos, teléfonos, RUC, cuentas, claves, URLs privadas, pestañas, consola ni notificaciones del sistema visibles. Los únicos nombres de clientes y usuario son ficticios.
- No se observan loaders, pantallas blancas, errores, barras negras, escalado deformante, cursor falso ni modales ajenos al recorrido. Los cuadros oscuros en los límites corresponden a los fundidos editoriales de 0.15 + 0.15 s, no a fallos de carga.
- El comienzo es una vista administrativa real y el cierre vuelve a Resumen con fundido discreto de 0.25 s. No hay introducción comercial, CTA, voz ni música.

## Incidencias corregidas y límites

Workerd no arrancó dentro del sandbox; funcionó fuera de él con D1 local aislada. Chrome instalado resolvió la falta de un Chromium cacheado accesible. El FFmpeg mínimo no admitía el encoder VP8 requerido por Playwright; se usó un FFmpeg completo portátil con SHA256 verificado. Se corrigieron selectores ambiguos entre los filtros y el diálogo, la detección de arranque con redirección de autenticación, el origen temporal de la captura y una etiqueta que inicialmente rozaba la tabla.

La prioridad de legibilidad requiere reproducir a 1080p y con tamaño suficiente para leer el desglose de insumos; una miniatura móvil no permite inspeccionar todas las columnas. Los planos generales usan menor zoom que los detalles para evitar recortar textos. La tolerancia temporal de alineación es inferior a una décima de segundo; la duración y frecuencia del archivo final sí se verifican fotograma por fotograma.

No quedan criterios técnicos fallidos ni operaciones simuladas. Las pruebas corresponden al entorno portable local; no certifican el alojamiento, todos los roles ni las funciones descartadas. No se publicó el video en LinkedIn ni se desplegó la aplicación. Ejecutables, ZIP, bases D1, intermedios y PNG de trabajo se excluyen de Git; el MP4 y el bruto se incluyen como entregables solicitados.
