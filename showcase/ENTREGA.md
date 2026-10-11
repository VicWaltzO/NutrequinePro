# Entrega · Nutrequine Pro · 45 segundos

Fecha: 11 de octubre de 2026. Estado: **APROBADO**. Se exportaron y verificaron el video definitivo y su portada. La aplicación existente y la demo anterior de 30 segundos se conservan.

## Archivos

Rutas desde la raíz del repositorio:

- Principal: `showcase/dist/nutrequine-pro-showcase-45s-1080p.mp4`, **8,220,309 bytes (8.22 MB)**.
- Portada: `showcase/dist/nutrequine-pro-poster.png`, 267,007 bytes, 1920×1080.
- Captura continua auténtica: `showcase/assets/captures/source.webm`, 5,216,395 bytes.
- Proyecto editable: `src/config.mjs`, `src/composition.mjs`, scripts, fixture y lockfile dentro de `showcase/`.
- Evidencia JSON: `showcase/qa/`; imágenes locales: `qa/contact-sheet.png`, `qa/transitions.png`, once escenas, interacciones, móvil y `qa/last-frame.png`. Las imágenes de trabajo se regeneran y quedan excluidas de Git.

SHA256 del MP4: `eb3aa0513c8c77cec5d6718eaaab243c56e8bcb668f7f8bd66519407b79f48bc`.

## Los 15 criterios obligatorios

| ID  | Criterio                                                     | Estado   | Evidencia ejecutada                                                                                    |
| --- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| A01 | MP4 en la ruta exigida                                       | APROBADO | Archivo de 8,220,309 bytes y decodificación completa sin errores.                                      |
| A02 | 45.000 s, 1350 frames, 30 FPS CFR, 1920×1080, H.264, yuv420p | APROBADO | FFprobe, conteo real, todos los timestamps y +faststart: qa/verification.json.                         |
| A03 | Portada PNG de 1920×1080                                     | APROBADO | Dimensiones comprobadas y diseño final inspeccionado.                                                  |
| A04 | Los nueve módulos aparecen                                   | APROBADO | Captura E2E, once escenas finales, contactos y revisión visual.                                        |
| A05 | Tres movimientos → clic → respuesta reconocibles             | APROBADO | Producción confirmada, venta creada y pago aplicado; frames de interacción y eventos reales.           |
| A06 | Producción → Inventario → Ventas → Cobranza → Balance        | APROBADO | Stock 10→50→40; venta 720, pago 300, saldo 420; indicadores conciliados.                               |
| A07 | Datos simulados, sin información confidencial                | APROBADO | Base nueva aislada, fixtures ficticios, aviso DEMO y revisión de escenas/portada/archivos publicables. |
| A08 | Identidad propia de Nutrequine Pro                           | APROBADO | Logo original, neutros claros y dorado discreto; apertura, cierre y portada revisados.                 |
| A09 | Sin cuadros negros ni fallos de continuidad                  | APROBADO | Blackdetect: cero segmentos; diez transiciones y reproducción completa aprobadas.                      |
| A10 | Rótulos legibles y sin ocultar acciones                      | APROBADO | Títulos fuera de la UI; muestras nativas y móviles de 480×270 revisadas.                               |
| A11 | Estados validados en capturas reales                         | APROBADO | 45 aserciones finales aprobadas; cero errores de navegador y solicitudes fallidas: qa/e2e.json.        |
| A12 | Comprensible en silencio                                     | APROBADO | Exportación sin audio; secuencia, importes y respuestas reconocibles en revisión visual.               |
| A13 | QA técnico y visual ejecutado                                | APROBADO | FFprobe, CFR, blackdetect, decode, playback, contactos, interacciones, móvil y portada.                |
| A14 | Scripts reproducibles documentados                           | APROBADO | Tools, captura, render, verify y preview ejecutados; versiones y comandos en README.                   |
| A15 | Datos reales y lógica empresarial conservados                | APROBADO | D1 independiente, API exclusivamente local, subproyecto aislado y app/ sin modificaciones.             |

## Operaciones y montaje

Una base D1 nueva por ejecución se prepara mediante `/api/command` del servidor portable local. Usuario Demo, Cliente Demo, Cliente Demo Histórico, sedes y precios son ficticios. No se utiliza la base habitual ni una autenticación real.

PR-000002 / Lote Demo 001 produce 40 sacos de Hi-Performance (1000 kg), costo S/ 1,336.40. Stock 10→50. V-000002 vende 10 sacos a S/ 72, total S/ 720, y reduce stock a 40. PG-000002 aplica S/ 300 a esa venta: cobrado 300, saldo 420, pago parcial. Gastos muestra una fila real Transporte Demo de S/ 85; la app no tiene diálogo de gasto. Balance consolida ventas 7,380, cobros 6,960, deuda 420, resultado comercial **estimado** 1,959.50 y caja 1,539.50. Clientes muestra deuda 420; Configuración mantiene vacíos los campos fiscales y de contacto.

Secuencia: introducción 0–3; Resumen 3–6; Producción 6–11; Inventario 11–15; Ventas 15–22; Cobranza 22–29; Gastos 29–32; Balance 32–36; Clientes 36–39; Configuración 39–41; cierre 41–45 segundos.

Se adoptó la alternativa documentada de HTML/CSS por frames y FFmpeg permitida por el brief. Cámara suave 1.00→1.25 en detalles, cursor de eventos reales con pulso de 200 ms y disolvencias de 0.30 s. Los clips mantienen velocidad aproximadamente 1×. No se añadieron dependencias productivas ni música sin licencia. La captura original se comprobó idéntica antes/después del montaje, SHA256 `5282d651a1de9a7350737b3b05ec328f3a1414d92254a539f599b307ab5bc9ca`.

## Mediciones y revisión

- Pista y contenedor: **45.000000 s**, 1350 frames, 30/1 FPS, 1920×1080, H.264 High, yuv420p; una pista de video, sin audio. `moov` precede a `mdat`.
- CFR: todos los 1350 timestamps comprobados; error máximo frente a n/30 de **0.0000003334 s**.
- `blackdetect=d=0.01:pix_th=0.10:pic_th=0.98`: **cero segmentos negros**, incluido inicio, límites y final. Decodificación completa aprobada.
- Chrome reprodujo de principio a fin a velocidad 1 sin saltos: ended=true, posición 45, último frame 44.966667, 1350 frames, **0 descartados y 0 errores**. Tiempo de pared 44.9685 s. El primer pase informó un frame descartado; se ajustó la precarga a canplaythrough antes de repetir y aprobar.
- Revisión visual de las once escenas, portada, contactos, diez transiciones, último frame, clics y muestras de 480×270: aprobada (`qa/visual-review.json`). Se inspeccionaron imágenes extraídas; no se afirma haber visto manualmente cada frame del video completo. La reproducción íntegra está medida por separado.
- Aplicación: **55/55 pruebas**, tipos, lint y build aprobados (`qa/app-checks.json`). Preview: HTML, PNG, MP4 parcial HTTP 206 y respuestas 404/416 comprobados (`qa/preview.json`).

## Regeneración

Desde la raíz del repositorio, PowerShell:

```powershell
Set-Location .\app
npm.cmd ci
npm.cmd ci --prefix ../showcase
npm.cmd --prefix ../showcase run tools
npm.cmd --prefix ../showcase run all
```

En esta entrega se ejecutaron captura, render y verify por separado y se probó preview; all concatena esos mismos scripts. Requisitos y versiones comprobadas: Windows x64, Node 24.18.0, Chrome 146.0.7680.180, Playwright 1.62.1 y FFmpeg 9.0.2. El instalador verifica SHA256.

Desde app/, `npm.cmd --prefix ../showcase run preview` sirve la vista previa en 127.0.0.1:5188; Ctrl+C lo detiene. Captura inicia/detiene su servidor propio y conserva cada base temporal aislada. Preparación detallada en README.

## Límites reales

En móvil se reconocen títulos, módulos y cantidades/importes principales; las tablas y etiquetas pequeñas requieren 1080p o pantalla completa. La confirmación de venta conserva un breve «Guardando…» nativo antes del resultado. Durante las disolvencias se superponen brevemente los dos rótulos. La venta consume inventario consolidado y no se atribuye exclusivamente al lote mostrado. El resultado comercial conserva su carácter estimado. La prueba local no certifica alojamiento ni todos los roles. Se entrega sin música, sin publicación en LinkedIn ni despliegue; la variante 4:5 permanece opcional.

Git conserva únicamente código, documentación, evidencia JSON y los tres materiales finales revisados (MP4, portada y captura original ficticia). Bases, herramientas, dependencias, referencias, intermedios y capturas de trabajo quedan excluidos.
