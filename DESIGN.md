---
name: Nutrequine Pro
description: Un espacio corporativo preciso para las operaciones de nutrición equina.
colors:
  canvas: "#f5f7fb"
  surface: "#ffffff"
  surface-subtle: "#f0f3f8"
  surface-hover: "#e9eef6"
  rail: "#edf1f8"
  border: "#dce2ec"
  border-strong: "#aab8cd"
  ink: "#182638"
  muted: "#546579"
  accent: "#185abd"
  accent-hover: "#114a9d"
  accent-soft: "#e2edff"
  on-accent: "#ffffff"
  success: "#1b6d45"
  success-soft: "#e8f5ed"
  warning: "#805600"
  warning-soft: "#fff4d9"
  danger: "#ac303c"
  danger-soft: "#ffedf0"
  focus: "#256dce"
  scrollbar: "#9babbd"
  overlay: "#15294366"
  dark-canvas: "#111b29"
  dark-surface: "#192637"
  dark-surface-subtle: "#1e2e42"
  dark-surface-hover: "#293d55"
  dark-rail: "#152235"
  dark-border: "#34485f"
  dark-border-strong: "#6e859f"
  dark-ink: "#edf3fc"
  dark-muted: "#b0bfd2"
  dark-accent: "#93beff"
  dark-accent-hover: "#b7d4ff"
  dark-accent-soft: "#243f64"
  dark-on-accent: "#10233f"
  dark-success: "#9addba"
  dark-success-soft: "#1c3c31"
  dark-warning: "#f4d17b"
  dark-warning-soft: "#413821"
  dark-danger: "#ffb2ba"
  dark-danger-soft: "#432a36"
  dark-focus: "#a0caff"
  dark-scrollbar: "#61768e"
  dark-overlay: "#050b16a3"
typography:
  display:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "clamp(2rem, 3.7vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 550
  caption:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "0.75rem"
    lineHeight: 1.5
  control:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  metric:
    fontFamily: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "clamp(1.25rem, 1.65vw, 1.75rem)"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
rounded:
  control: "7px"
  surface: "14px"
  dialog: "16px"
  tag: "5px"
  nav: "8px"
  inset: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  mobile-panel: "18px"
  block: "20px"
  panel: "22px"
  section: "24px"
  dialog: "26px"
  desktop-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-text:
    textColor: "{colors.accent}"
    typography: "{typography.control}"
    padding: "4px 0"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 11px"
  navigation-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.nav}"
    padding: "11px 14px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "22px"
  tab-selected:
    textColor: "{colors.accent}"
    padding: "14px 0"
  empty:
    textColor: "{colors.muted}"
    padding: "38px 20px"
---

# Design System: Nutrequine Pro

## Overview

**Creative North Star: "El espacio de trabajo preciso"**

Nutrequine Pro presenta la operación como un espacio corporativo claro, estable y ágil. La referencia principal de Microsoft se concreta en Segoe, navegación persistente y selección azul; la precisión de acabado de Apple se concreta en alineaciones, superficies contenidas y respuestas breves. Son referencias de diseño confirmadas, sin afiliación con esas empresas.

La densidad permite consultar importes y registrar operaciones sin perder contexto. Computador y móvil tienen la misma prioridad: la estructura cambia de columnas y navegación, mientras los términos, estados y acciones conservan su significado. La identidad vive en el nombre, el logo y las fotografías existentes; la interfaz no necesita imágenes generadas.

**Key Characteristics:**

- Azul funcional y superficies azul pizarra con temas claro y oscuro.
- Jerarquía tipográfica contenida, cifras tabulares e iconos de línea.
- Navegación reconocible, controles consistentes y foco visible.
- Elevación reservada principalmente a superposiciones y movimiento breve.

Fuente normativa: valores efectivos de `app/client/tokens.css`, `globals.css`, `session.css` y, al final de la cascada, `workspace.css`. Componentes contrastados con la aplicación, el resumen, inventario, vacíos y navegación. Las capturas finales de `.impeccable/review/final/` respaldan la apariencia; el veredicto final resuelve específicamente el pie de acciones del formulario.

## Colors

La paleta combina azules sobrios, blancos fríos y estados semánticos. El frontmatter registra ambos temas; las variables CSS conservan el mismo nombre y cambian bajo `data-theme="dark"`. Las rampas del sidecar son muestras sintetizadas para visualizar cada color; no amplían la paleta aplicada.

### Primary

- **Azul de acción** (`accent`, `accent-hover`, `accent-soft`, `on-accent`): botones principales, enlaces, selección y sus fondos. El tema oscuro adapta tanto el acento como el texto sobre él; no basta con invertir el fondo.
- **Azul de foco** (`focus`): contorno de navegación por teclado y búsqueda activa.

### Secondary

- **Verde de operación completada** (`success`, `success-soft`): pagada, entregada, cerrada y confirmaciones.
- **Ámbar de trabajo pendiente** (`warning`, `warning-soft`): borradores, pendientes y pagos parciales.
- **Rojo de error o cancelación** (`danger`, `danger-soft`): alertas y estados que requieren atención.

### Neutral

- **Lienzo frío** (`canvas`) y **riel azul pizarra** (`rail`): separan la página de su navegación.
- **Superficie clara** (`surface`), **superficie de apoyo** (`surface-subtle`) y **respuesta al puntero** (`surface-hover`): paneles, cabeceras de tabla y estados interactivos.
- **Tinta** (`ink`) y **texto secundario** (`muted`): datos principales, contexto, etiquetas y ayudas.
- **Línea** (`border`, `border-strong`): límites, divisiones y respuesta de controles; `scrollbar` mantiene visible el desplazamiento.
- **Velo** (`overlay`): separa diálogos y cajón móvil del espacio que queda detrás.

**The Estado con palabra Rule.** El color acompaña una etiqueta o un mensaje comprensible: Pagada, Pendiente, Entregada, error o confirmación. No sustituye esa información.

**The Acento de acción Rule.** Usar el azul para actuar, seleccionar o enfocar; conservar tinta y neutros para la lectura ordinaria.

## Typography

**Display Font:** Segoe UI Variable, con Segoe UI, fuente del sistema Apple y sans-serif como respaldo.
**Body Font:** la misma familia. No se carga una fuente remota.
**Label/Mono Font:** las etiquetas comparten familia; los importes usan cifras tabulares, sin introducir una monoespaciada.

**Character:** precisión corporativa con pesos moderados y contraste de tamaño contenido. La fuente de plataforma está justificada por la referencia Microsoft aprobada; no se presenta como una decisión genérica para otros productos.

### Hierarchy

- **Display:** solo la introducción del acceso, según el rol `display`; ancho de párrafo limitado a (36ch). En móvil se oculta esa introducción.
- **Headline:** títulos de página y acceso, según `headline`; la página baja a (1.75rem) en móvil. El título del acceso conserva (1.875rem).
- **Title:** títulos de sección según `title`; en móvil, los de cabecera de sección bajan a (1rem). El título del diálogo usa (1.1875rem). Los nombres de producto usan (0.875rem), peso (650).
- **Body:** texto operativo habitual según `body`. La raíz es (16px); la introducción del acceso usa (1rem), su ayuda de formulario (0.9375rem) y las tablas (0.8125rem) con interlineado de celda (1.4). No existe una escala geométrica única impuesta.
- **Label:** etiquetas de formulario según `label`; navegación y pestañas usan (0.875rem), peso (500) o (600), y selección de navegación (650). Ayudas y estados recurren a `caption`. No convertir etiquetas en titulares en mayúsculas espaciadas.
- **Metric:** importes del resumen según `metric`; móvil fija (1.375rem). Las cantidades de producto usan (1.5rem), interlineado (1.3).

**The Cifras alineadas Rule.** Importes, métricas, tablas y contexto numérico usan cifras tabulares para facilitar la comparación.

## Layout

El espacio parte de un riel fijo lateral de (244px), cabecera persistente de (64px) y contenido con ancho máximo de (1660px). El contenido tiene relleno de (30px 32px); el título y sus acciones comparten una fila cuando caben. Los paneles usan el espaciado `panel`; los huecos habituales están entre `md` y `section`. Es un ritmo práctico de valores pares, no una cuadrícula rígida de ocho puntos.

En escritorio, el resumen agrupa cuatro métricas dentro de una superficie dividida; inventario muestra cuatro tarjetas y los paneles inferiores combinan una columna flexible con una de (280px). Los pendientes forman una banda operativa con enlaces a producción y entregas. Estas son composiciones del resumen, no una obligación para cada sección.

- Hasta **1250px**: riel de (220px), contenido y cabecera con (26px) laterales, inventario en dos columnas, panel auxiliar de (250px) y título de pendientes sobre sus dos acciones.
- Hasta **1000px**: el título permite salto de fila; métricas en dos columnas, paneles del resumen y balance en una columna; se oculta el contexto numérico de cabecera.
- Hasta **760px**: riel convertido en cajón de ancho `min(300px, calc(100vw - 48px))`, contenido sin margen lateral y relleno de (24px 18px). Cabecera de (60px), acciones distribuidas y controles táctiles de al menos (44px). Métricas e inventario siguen en dos columnas, tarjetas de producto verticales, pendientes y formularios en una. Las tablas y pestañas mantienen desplazamiento horizontal; no se comprimen sus columnas hasta volverlas ilegibles.

Los diálogos usan `min(1040px, calc(100vw - 48px))` y un máximo de (90dvh); en móvil, ancho `calc(100vw - 24px)` y (94dvh). El cuerpo desplaza su contenido; el pie de acciones es opaco, llega a los bordes y ofrece margen de lectura al desplazarse. La corrección final conserva Notas, Condición y Entrega alcanzables y visibles.

Los registros de venta, pago, gasto, producción y ajuste de inventario agrupan sus
campos por tarea en tarjetas consecutivas. Cada cabecera combina icono de línea,
título y contexto breve; el grupo central usa `accent-soft`. Separación de (26px) en escritorio y (18px) en móvil,
cuerpo de (20px), reducido a (16px) en móvil. Producción conserva cuatro grupos
por su densidad. Las tablas desplazan dentro de su grupo; los costos adicionales
usan filas divididas, sin otra tarjeta anidada.

## Elevation & Depth

El espacio de trabajo se organiza con tono, bordes y divisiones; las tarjetas ordinarias no se levantan al pasar el puntero. Diálogo, cajón móvil abierto y confirmación flotante usan sombras suaves. El velo de diálogo desenfoca el fondo (4px). Las fotografías de producto existentes conservan una sombra de recorte tenue (`drop-shadow(0 5px 3px #0000000c)`); no es una sombra general de tarjetas.

### Shadow Vocabulary

- **Diálogo y cajón:** `elevation-dialog` del código, (0 24px 80px #102c5230) en claro y (0 24px 80px #00000066) en oscuro.
- **Confirmación:** `elevation-toast`, (0 8px 28px #102c5226) en claro y (0 8px 28px #0000004d) en oscuro.

**The Plano en reposo Rule.** Separar superficies ordinarias mediante tono y borde; reservar la elevación estructural para elementos que se superponen al trabajo.

## Shapes

Los controles tienen esquinas contenidas (`control`); las superficies amplias, esquinas más suaves (`surface`). La navegación usa `nav`, las etiquetas de estado `tag` y los recuadros de apoyo `inset`. Los diálogos usan `dialog` y se ajustan al radio de superficie en móvil. Bordes finos de (1px), sin contornos decorativos gruesos; el indicador seleccionado lateral tiene (3px) y las pestañas seleccionadas, una línea inferior de (3px).

Iconos de línea mediante SVG de Lucide, generalmente entre (15px) y (24px), con texto o nombre accesible para las acciones. El avatar de usuario es una inicial dentro de un círculo; esa inicial identifica a la persona, no sustituye un icono de acción.

## Components

### Buttons

Controles directos y consistentes. El primario usa el acento y `on-accent`; el secundario conserva superficie y borde; los enlaces de texto eliminan el contenedor. Relleno base (10px 15px), mínimo (40px), cabecera y pie de formulario (42px), y móvil (44px). En el acceso, campos y botón alcanzan (46px).

Al pasar el puntero, el primario usa `accent-hover`; los demás usan `surface-hover` y borde más marcado, y el enlace se subraya. Al pulsar se desplazan (1px) verticalmente. Deshabilitados: opacidad (0.5) y cursor no permitido. El foco visible es un contorno de (2px), separado (3px), con `focus`.

### Chips

Etiquetas informativas, no botones de filtro: fondos semánticos suaves, texto del mismo estado, relleno (4px 8px), sin borde visible y radio `tag`. El estado sigue escrito; una etiqueta no recibe animación ni foco si no es interactiva.

### Cards / Containers

Paneles y tarjetas de producto usan superficie, borde y radio `surface`, sin sombra de tarjeta. El panel usa `panel` de relleno y baja a `mobile-panel`; el producto usa (20px 16px), cambia a (18px 22px) en el tramo intermedio y (18px 16px) en móvil. Las métricas agrupadas comparten recipiente y divisiones interiores. Las filas de tabla responden al puntero con `surface-subtle` en una transición breve.

### Inputs / Fields

Superficie sólida, borde fino, radio `control`, relleno (10px 11px), mínimo (42px). Etiqueta visible sobre el campo, separado por (7px); en móvil los caracteres de entrada usan (16px) y mínimo (44px). El foco cambia el borde a acento y añade el contorno visible sin brillo. La búsqueda aplica su contorno al conjunto (`focus-within`, separación de 2px), no duplica el del campo interior. Los errores muestran mensaje con fondo y tinta de peligro; la espera de acceso deshabilita campos y cambia el texto de la acción.

El registro de producción usa una tabla de siete columnas. El precio permanece
en lectura con lápiz; descuento opcional por fila; cobro al teórico neto destacado
con `accent-soft` y texto Automático o Valor ajustado. Restablecer recupera el
cálculo automático. Pagado/Pendiente siempre lleva texto y control independiente.
El editor de precio tiene Aplicar/Cancelar y equivalentes Enter/Escape sin cerrar
el diálogo; todas las acciones permanecen dentro del desplazamiento de la tabla.

Los nombres comerciales en producción y el selector de venta incorporan un
marcador de (12px) inmediatamente después del nombre. Nutrelin: (#DDB83E),
Hi-Performance: (#2F926C), Potripregnant: (#C74A8A), BASE: (#F2F1EC) con borde
`border-strong`. Son identificadores secundarios; no reemplazan nombres ni estados.

### Navigation

Riel estable, selección azul suave con marcador lateral y texto reforzado. Botones de (44px) de alto en escritorio y (46px) en cajón móvil; puntero sobre superficie de respuesta. Las pestañas desplazan horizontalmente, conservan su texto y señalan la selección con color y línea inferior; representan navegación de página y usan `aria-current`.

El cajón entra desde la izquierda. Se cierra con botón, fondo exterior, Escape, selección de sección o gesto táctil hacia la izquierda de más de (70px), con desviación vertical menor de (45px). Mantiene desplazamiento vertical nativo (`touch-action: pan-y`), bloquea el fondo, contiene Tab y restaura el foco al cerrar. El gesto complementa los controles visibles.

### Empty / Feedback / Dialog

El vacío combina icono Inbox de línea en superficie de apoyo, mensaje legible y acción cuando existe; no usa glifos decorativos. Carga, error y confirmación nombran el estado. La confirmación flotante usa texto, icono de validación y `role="status"`; errores usan alerta cuando corresponde. Los permisos se expresan mediante las acciones disponibles, conservando las reglas del producto.

Las transiciones de controles duran (120ms); diálogo, cajón y confirmación usan (220ms) y `cubic-bezier(0.16, 1, 0.3, 1)`. La entrada de diálogo desplaza (10px) y la de confirmación (8px), con opacidad. No se anima cada tarjeta. Con `prefers-reduced-motion: reduce`, se eliminan animaciones y transiciones, el desplazamiento vuelve a automático y el botón no se mueve al pulsar.

El diálogo conserva su contenido al salir: se desvanece con el velo y se desplaza
(6px) durante (120ms), sin aceptar otra interacción, antes del cierre nativo y la restauración del foco. Una
apertura nueva interrumpe esa salida. Los formularios seccionados y los estados
que aparecen al seleccionar datos o agregar costos entran en (220ms), con
desplazamientos de (4–6px). El movimiento reducido omite estas secuencias y cierra
inmediatamente; no oculta contenido ni confirmaciones.

## Do's and Don'ts

### Do:

- **Do** reutilizar las variables semánticas y verificar la superficie en claro y oscuro.
- **Do** conservar foco visible, etiquetas, cifras tabulares y estados escritos.
- **Do** adaptar la estructura en los tres puntos de corte y mantener controles táctiles alcanzables.
- **Do** ofrecer botones y teclado equivalentes al gesto del cajón y respetar movimiento reducido.
- **Do** conservar el logo y las fotografías de producto originales con su procedencia, sin modificar sus píxeles.
- **Do** mantener acciones de formulario opacas y contenido desplazable completamente alcanzable.

### Don't:

- **Don't** afirmar afiliación con Microsoft o Apple al aplicar las referencias aprobadas.
- **Don't** confundir venta, entrega y pago mediante etiquetas o estados visuales.
- **Don't** añadir elevación a cada tarjeta ni animar toda la cuadrícula al entrar.
- **Don't** usar el color como única explicación de estado o convertir acciones en glifos de texto.
- **Don't** reintroducir grandes bloques promocionales, marca repetida sobre títulos o pequeños titulares decorativos.
- **Don't** inventar imágenes, métricas, certificaciones o restricciones comerciales para completar una pantalla.

No canonizado: las reglas antiguas sin uso de titulares pequeños espaciados que aún conserva `globals.css`, y el espaciado heredado del marcador de producto BASE, no son patrones para nuevas superficies. Se documenta el resultado efectivo de la cascada; el antiguo solapamiento del pie de formulario está resuelto según el veredicto final y no se convierte en una regla visual.
