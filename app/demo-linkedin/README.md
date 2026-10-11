# Demostración operativa para LinkedIn

Video de Nutrequine Pro: producción y costos, registro de una venta a crédito y aplicación de un pago parcial. El panel Resumen abre y cierra la pieza. Los datos son ficticios; los formularios, cálculos, estados y persistencia son los de la aplicación existente.

Entregables principales: `showcase_final.mp4`, `showcase_source.webm`, `record_demo.mjs`, `render_demo.mjs`, `FEATURE_AUDIT.md`, `STORYBOARD.md` y `QA_REPORT.md`. Las evidencias estructuradas quedan en `qa/`. Los PNG de inspección se generan localmente y se excluyen de Git. Ambos videos caben en Git normal; no se requiere LFS ni una publicación externa.

## Reproducir el video terminado

Desde `app/`, en PowerShell:

```powershell
Invoke-Item .\demo-linkedin\showcase_final.mp4
```

Para comprobar el MP4 completo mediante reproducción real a velocidad normal en Chrome:

```powershell
node demo-linkedin/verify_playback.mjs
```

El verificador sirve únicamente el MP4 en un puerto efímero de `127.0.0.1`, reproduce de principio a fin y cierra navegador y servidor. No necesita ejecutar la aplicación ni conectarse a servicios externos.

## Regenerar desde un clon limpio

Prerrequisitos: Windows x64, Node 22.13 o posterior, npm y Google Chrome instalado. Se usó Chrome 146.0.7680.180, Node 24.18.0 y Playwright 1.62.1. La aplicación conserva sus dependencias originales; las herramientas de video tienen un manifiesto y lockfile separados.

Desde `app/`:

```powershell
npm.cmd ci
npm.cmd ci --prefix demo-linkedin
node demo-linkedin/prepare_tools.mjs
node demo-linkedin/record_demo.mjs --rehearse
node demo-linkedin/record_demo.mjs
node demo-linkedin/render_demo.mjs
node demo-linkedin/verify_playback.mjs
```

`prepare_tools.mjs` descarga [FFmpeg 9.0.2 essentials para Windows](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip), proveedor enlazado por [FFmpeg](https://ffmpeg.org/download.html). Comprueba el SHA256 del ZIP antes de extraer o ejecutar: `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`. Todo se guarda en `.tools/`, sin instalación global ni cambios a PATH.

Si ya dispone de FFmpeg completo con H.264, `drawtext`, `zoompan` y VP8, puede indicar `FFMPEG_BINARY` y `FFPROBE_BINARY` para el montaje. `DEMO_OVERLAY_FONT` permite elegir una fuente local. En Windows se usa Segoe UI, incluida en la familia tipográfica real de la WebApp. Las fuentes del sistema no se distribuyen con esta demo.

En Codex se aprovechó Playwright del runtime incluido como alternativa a `demo-linkedin/node_modules`. Se utiliza Chrome instalado mediante `channel: "chrome"`: las carpetas del Chromium cacheado no contenían un ejecutable accesible. El FFmpeg mínimo cacheado tampoco admitía VP8, requerido por esta versión de Playwright; por eso el instalador crea `.tools/playwright/ffmpeg-1011/ffmpeg-win64.exe` a partir del FFmpeg completo verificado. La captura usa `video.saveAs()` y el montaje comprueba que el archivo realmente existe y puede decodificarse.

Workerd y Chrome no arrancaron en el sandbox administrado de esta sesión. Se ejecutaron con autorización del entorno fuera de ese sandbox, siempre en loopback y con D1 local. En una terminal normal de Windows no se necesita modificar el perfil de ejecución de la aplicación.

## Aislamiento y fixtures

Cada ejecución crea una base nueva en `.local-state/<identificador>/` y pasa su ruta absoluta mediante `NUTREQUINE_LOCAL_STATE_DIR` al arranque real `scripts/run-framework.mjs dev`. El servidor se fija en `127.0.0.1:5174`, con `--strictPort`; si está ocupado, el script falla. Wrangler usa `wrangler.local.json`, binding DB e ID local `00000000-0000-4000-8000-000000000000`. No se ejecutan comandos `--remote` ni se despliega código.

El script inicia y detiene su propio árbol de procesos. Conserva las bases de ensayos y tomas anteriores, excluidas de Git; la regeneración no borra ni reinicia bases existentes. La identidad de prueba del starter es el primer ADMIN de la base vacía. Se renombra mediante `USER_SAVE` a `Usuario Demo`; ADMIN es necesario para confirmar el lote. No se crea un usuario real ni se graba el inicio de sesión.

Los fixtures se preparan por los endpoints reales `/api/state` y `/api/command`. El script comprueba que inicialmente no haya ventas, pagos, producciones ni clientes. Sustituye precios de catálogo e insumos por importes ficticios y los nombres de sedes por `Sede Demo NN`. Crea `Cliente Demo` y `Cliente Demo Histórico`, sin RUC, correo, teléfonos ni cuentas. El navegador bloquea solicitudes HTTP fuera del origen local.

La preparación incluye un lote cerrado de 120 sacos y una venta ficticia anterior de 90 sacos, pagada por S/ 6,660. El lote demostrado produce otros 40 sacos de Hi-Performance. En cámara se confirma ese lote, se registran 10 sacos a S/ 72 y se aplica un pago de S/ 300 a su venta de S/ 720. El saldo resultante es S/ 420. No se vincula una venta inmediata de forma exclusiva a un lote: la relación mostrada pasa por el inventario consolidado del producto.

El bruto es una grabación continua VP8 WebM a 1920 × 1080 y 25 FPS, frecuencia usada por Playwright. Incluye tiempos de preparación entre escenas y la recarga de comprobación posterior. `shots.json` identifica los cinco intervalos verificados. Antes del montaje se mide el desfase del reloj contra el primer cambio real de navegación a Producción, usando una región de 8 × 8 px del fondo de su botón nativo y los PTS de la grabación. `qa/alignment.json` conserva esa medida; no se añaden marcadores a la interfaz. El montaje convierte los tramos a 30 FPS constantes, con velocidad ligeramente ajustada y sin añadir varios segundos congelados. El WebM original permanece intacto.

## Montaje y comprobaciones

`render_demo.mjs` produce exactamente 90 / 210 / 210 / 240 / 150 frames. Aplica zoom lento 1.05–1.10 a los detalles; los planos generales de Resumen usan 1.00–1.02 para mantener completos la marca y los textos cercanos a los bordes. Incluye tres etiquetas editoriales de 2–4 palabras a 28 px, contornos temporales sobre elementos auténticos y fundidos de 0.15 s dentro de cada tramo. Cada transición suma 0.30 s y mantiene los límites 00:03, 00:10, 00:17 y 00:25. El fundido final dura 0.25 s. No añade cursor, voz, música, fotografías externas ni cifras.

La exportación usa H.264 `libx264`, CRF 17, preset slow, `yuv420p`, sin pista de audio y `+faststart`. FFprobe cuenta fotogramas reales y comprueba dimensiones, códec, duración del contenedor y pista, frecuencia y cada timestamp de los 900 frames. FFmpeg decodifica el archivo completo y genera muestras y una hoja de contacto. `verify_playback.mjs` añade reproducción completa de 30 segundos en Chrome. La revisión humana de las imágenes se documenta en `QA_REPORT.md`.

Desde `app/`, también se ejecutan las verificaciones del repositorio:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run lint
npm.cmd run build
```

Los scripts no alteran arquitectura, componentes, reglas de negocio, migraciones ni permisos productivos. No envían el video a LinkedIn ni publican una nueva versión de la aplicación. El MP4 y el bruto se conservan en este repositorio; los ejecutables, ZIP, bases, intermedios y capturas de revisión quedan excluidos.
