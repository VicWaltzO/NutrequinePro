# Nutrequine Pro

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipo de una empresa de nutrición equina. Los administradores gestionan la
operación y sus parámetros; los operadores registran operaciones cotidianas; el
rol VIEWER consulta. Público y propósito confirmados por el usuario durante init.

## Product Purpose

Conectar producción, ventas, entregas, inventario y cobranza en una aplicación
local. La prioridad confirmada por el usuario es la rapidez para registrar
operaciones cotidianas. El éxito consiste en completar esos registros con pocos
pasos comprensibles, conservando las validaciones y las relaciones comerciales.
No se ha definido una meta cuantitativa de tiempo de registro.

## Positioning

Herramienta de gestión para la operación de nutrición equina, ejecutada en el
equipo de la empresa. Vincula fórmulas versionadas, producción, sacos, costos,
ventas, entregas y pagos. Distingue una venta registrada de una entrega y de un
cobro; conserva los parámetros históricos de cada operación.

## Operating Context

- Interfaz en español, con navegación por áreas: Resumen, Ventas, Cobranza,
  Gastos, Producción, Inventario, Balance, Clientes y Configuración.
- Aplicación React/Vite en `app/client/`, funcionalidades en `app/features/`,
  servidor Fastify/Node en `app/server/` y persistencia SQLite local.
- Instalación documentada para Windows 11 y Chrome. Cliente y API comparten
  origen local; el servidor escucha en `127.0.0.1`.
- La operación normal no necesita servicios externos. La instalación y las
  actualizaciones requieren preparar sus dependencias.
- Las bases, credenciales y configuración privada se preparan explícitamente
  fuera del código según `app/docs/INSTALACION_LOCAL.md`. El arranque no crea
  datos ni usuarios.

## Capabilities and Constraints

- Producción con fórmulas versionadas, insumos, núcleos, sacos y costos; ventas
  al contado o crédito; entregas; movimientos de inventario; clientes y sedes;
  pagos, aplicaciones y saldos; gastos y resultado comercial estimado.
- Permisos ADMIN, OPERATOR y VIEWER validados por el servidor. Los operadores
  registran ventas, pagos, producción en borrador y gastos; las confirmaciones,
  rectificaciones, anulaciones, ajustes y configuración corresponden al administrador.
- Los cálculos monetarios y de peso usan céntimos y gramos enteros. El peso de
  fórmula y el peso comercial tienen significados distintos y deben conservarse.
- Las correcciones dejan rastro; los documentos históricos conservan los precios,
  pesos y fórmulas registrados. La rapidez de captura no justifica omitir estas reglas.
- El balance es estimado: no representa contabilidad formal ni valoración FIFO.
  No existe un libro completo de pagos a proveedores ni un flujo de compras de
  materia prima en este alcance.
- LAN, acceso público, identidad corporativa y aislamiento multiempresa requieren
  desarrollo adicional. Las propuestas corporativas no son funciones disponibles.
- Las reglas detalladas y los casos comerciales pendientes están en `app/README.md`
  y `app/docs/ESPECIFICACION_MAESTRA_MVP.md`; no resolverlos mediante decisiones de UI.

## Brand Commitments

Nombre existente: Nutrequine Pro. La interfaz usa español y terminología operativa
como producción, fórmula, núcleo, saco, entrega, cobranza y saldo a favor. Los
recursos originales incluyen `app/public/brand/logo.jpg` y
`app/public/brand/productos.jpg`. Init registra estos activos sin establecer una
nueva dirección visual.

El usuario confirmó después de init un rediseño corporativo de toda la aplicación,
con Microsoft como referencia principal y Apple como referencia de acabado.
La claridad, consistencia y precisión de esas referencias son vinculantes;
Nutrequine conserva su identidad y no afirma afiliación con ellas. Computador y
móvil tienen la misma prioridad. Se requieren transiciones breves, respuestas al
pulsar y cierre por deslizamiento del menú móvil, con botones equivalentes y
respeto al movimiento reducido.

## Evidence on Hand

- `README.md` y `app/README.md`: propósito, instalación, capacidades y límites.
- `app/docs/ARQUITECTURA.md`: arquitectura operativa; los informes 01–08 son
  antecedentes históricos.
- `app/docs/ESPECIFICACION_MAESTRA_MVP.md`: reglas y catálogo empresarial de referencia.
- `app/docs/MATRIZ_REGRESION.md`, `app/tests/` y `app/tests/local-e2e/`: escenarios
  y comprobaciones del comportamiento. Su existencia no acredita que se hayan
  ejecutado durante init.
- Activos de marca locales y aplicación implementada. No se han confirmado
  testimonios, métricas de productividad, precios comerciales ni certificaciones;
  no inventarlos en futuras superficies.

## Product Principles

1. Priorizar la rapidez de registro de las operaciones cotidianas, con pasos y
   términos fáciles de comprender.
2. Mantener diferenciados venta, entrega y pago, y mostrar estados y pendientes
   que permitan continuar el trabajo.
3. Conservar trazabilidad, parámetros históricos y validaciones al simplificar
   cualquier flujo.
4. Respetar los permisos y mantener datos y credenciales bajo control de la empresa.
5. Describir con precisión las capacidades disponibles y los resultados estimados.

## Open Decisions

No se han confirmado necesidades de accesibilidad específicas, clases de
dispositivos adicionales ni objetivos medibles de velocidad de captura. Estos
puntos quedan abiertos; no constituyen requisitos acordados.
