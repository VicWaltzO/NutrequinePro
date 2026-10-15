# Nutrequine Pro · showcase de 45 segundos

> Material multimedia histórico de la arquitectura anterior. Sus instrucciones de
> captura describen ese entorno y requieren recuperar su commit, por ejemplo
> `a229671`, usando datos sintéticos. Este paquete no forma parte de la instalación,
> las pruebas ni la distribución actuales. Consultar la [instalación local](../app/docs/INSTALACION_LOCAL.md).

Subproyecto audiovisual independiente para LinkedIn y portafolio. La interfaz procede de la WebApp existente: Resumen, Producción, Inventario, Ventas, Cobranza, Gastos, Balance, Clientes y Configuración. Se conservan la aplicación productiva y la demo anterior de 30 segundos.

## Decisiones de implementación

- Base D1 nueva por ejecución bajo `showcase/.local-state/`, con el arranque real portable de `app/scripts/run-framework.mjs`; servidor exclusivo en `127.0.0.1:5175`. No se usa `.wrangler/state` habitual ni un binding remoto.
- Datos creados por la API local real y comprobados mediante E2E. Identidad de prueba, clientes y sedes ficticios; catálogo de marca con precios de demostración. La relación producción → venta pasa por el inventario consolidado: no se afirma una asignación exclusiva de lotes.
- Playwright 1.62.1 y Chrome instalado capturan la interfaz y las operaciones. El cursor y las ondas se dibujan durante la captura a partir de eventos reales del ratón; no cambian componentes ni reglas de negocio.
- Composición editable y determinista con HTML/CSS para marca y portada, y FFmpeg para clips, cámara y disolvencias. Se adopta esta alternativa permitida al método sugerido de Remotion para aprovechar la captura continua auténtica y las herramientas nativas ya verificadas en Windows. No añade dependencias a la aplicación.
- Configuración central en `src/config.mjs`: textos, colores, FPS, duración, intervalos, cámara, transiciones y cursor. Los títulos ocupan espacio exterior a la UI. El aviso «DEMO · DATOS SIMULADOS» identifica el material.
- Logo original en `app/public/brand/logo.jpg`; fuente Segoe UI instalada en Windows, sin redistribuir sus archivos. No se incorporan activos de otras marcas, música ni efectos sonoros sin licencia.
- Exportación silenciosa de 45.000 s, 1350 frames a 30 FPS, 1920×1080, H.264, `yuv420p` y `+faststart`. Las disolvencias no introducen cuadros negros.

## Preparación en Windows / PowerShell

Requiere Windows x64, Node 22.13 o posterior, npm y Google Chrome instalado. Desde la raíz del repositorio:

Versiones comprobadas en esta entrega: Node 24.18.0, Chrome 146.0.7680.180, Playwright 1.62.1 y FFmpeg 9.0.2 essentials. Playwright queda fijado mediante lockfile; FFmpeg se comprueba por SHA256.

```powershell
Set-Location .\app
npm.cmd ci
npm.cmd ci --prefix ../showcase
npm.cmd --prefix ../showcase run tools
```

El instalador descarga FFmpeg 9.0.2 essentials en `showcase/.tools/` y verifica SHA256 antes de extraerlo. No modifica PATH ni instala servicios. Permite reutilizar un FFmpeg completo mediante `FFMPEG_BINARY` y `FFPROBE_BINARY`; en esta sesión también se aprovechó el FFmpeg portátil local de la demo anterior. La ruta local para Playwright incorpora el encoder VP8 necesario para su captura WebM.

## Regenerar con un comando

Desde `app/`, después de la preparación:

```powershell
npm.cmd --prefix ../showcase run all
```

Ejecuta captura real, montaje y verificación técnica con reproducción íntegra. La captura arranca y detiene su propio servidor; crea una base nueva y conserva las anteriores, sin borrar ni sobrescribir datos. Si el puerto 5175 está ocupado o el perfil no es portable, detiene la ejecución. En un sandbox que impida iniciar Chrome o Workerd, es necesario ejecutar estos comandos en una terminal autorizada que permita procesos nativos.

También pueden ejecutarse por separado:

```powershell
npm.cmd --prefix ../showcase run rehearse
npm.cmd --prefix ../showcase run capture
npm.cmd --prefix ../showcase run render
npm.cmd --prefix ../showcase run verify
```

Tras cambios al guion, revisar las muestras de captura antes de renderizar y las imágenes de QA después. La verificación automática no sustituye la revisión visual de legibilidad, privacidad y correspondencia entre clic y respuesta.

## Reproducción y vista previa

Desde `app/`:

```powershell
Invoke-Item ..\showcase\dist\nutrequine-pro-showcase-45s-1080p.mp4
npm.cmd --prefix ../showcase run preview
```

La vista previa sirve solo el video y la portada en `http://127.0.0.1:5188`. Se cierra con Ctrl+C. No inicia la aplicación ni publica contenido.

## Evidencia y control de versiones

`ENTREGA.md` recoge la evaluación final de los 15 criterios obligatorios. `ACCEPTANCE.md` añade controles detallados. Los informes JSON de `qa/` documentan E2E, montaje, `ffprobe`, todos los timestamps, `blackdetect`, reproducción y checks de la aplicación. Las hojas de contactos y las muestras PNG se generan localmente para inspección.

La base D1, ejecutables, ZIP, dependencias, intermedios, referencias y capturas de trabajo se excluyen de Git. Se conservan como entregables publicables el MP4 final, la portada y el WebM original, una vez inspeccionados y libres de datos personales. No se despliega la aplicación ni se publica en LinkedIn.
