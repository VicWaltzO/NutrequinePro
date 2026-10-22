# Verificación de exportación documental · 22/10/2026

Rama `codex/exportacion-documental`, basada en la integración de PR #5 a `main`.
Ensayos con transacciones sintéticas aisladas; nunca se abre una base operativa
para generar ejemplos o capturas.

| Comprobación                           | Resultado                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run verify`                   | 193/193 pruebas; tres chequeos TypeScript; lint, formato, build y auditoría aprobados                                                                      |
| `npm.cmd run test:e2e` con Chrome      | 28/28, ejecución serial sobre distribución instalada                                                                                                       |
| Documentos y transporte HTTP dirigidos | Modelos, estados, fechas, crédito/reversión, ausencia de escrituras, métodos de lectura y prefijo aprobados                                                |
| Proxy PDF                              | Prueba unitaria de `Content-Disposition` aprobada; rebuild y E2E adicional de integración B desde el portal **compilado**, con nombre correcto de descarga |
| Auditoría de distribución final        | 2068 archivos, 69 paquetes de runtime, 0 archivos privados y 0 paquetes retirados                                                                          |
| PDF                                    | A4, texto extraíble, fuentes incrustadas, acentos, numeración y márgenes comprobados con pypdf/pdfplumber y render Poppler                                 |
| Impeccable                             | Detector sin hallazgos; dos correcciones materiales puntuadas como resueltas; documenter: extensión compatible, sin cambios al sistema de diseño           |

## Alcance funcional comprobado

- Lote DRAFT exportado desde lista y detalle. La hoja distingue sacos, núcleos,
  kg comerciales y kg de fórmula; insumos consolidados sin precios ni costos.
- Nota de venta confirmada, futura, borrador, rectificada y anulada generada con
  importes del dominio. Los borradores se rotulan con importes propuestos. El
  modelo comercial excluye fórmulas, insumos, costos y snapshots industriales.
- Historial con un cobro aplicado a más de una venta, cobro revertido, devolución,
  rectificación, borrador y anulación. Cada cobro se cuenta una vez; aplicaciones
  revertidas no tienen efecto vigente. Se separa periodo de situación actual.
- Balance con ventas, cobros, reversión, costos de producción y gastos conocidos.
  Primer y último día exactos; febrero bisiesto y mes anterior; cifras idénticas
  a `balanceSummary`, incluyendo sus reglas de caja y costo estimado.
- Descarga local de los cuatro tipos con tráfico externo bloqueado en navegador
  y proceso del servidor instalado. Se verifican sesión y permisos para ADMIN,
  OPERATOR y VIEWER, desactivación/revocación, filtros inválidos y registro ausente.
- Se compara el estado comercial completo antes/después: no cambia auditoría,
  revisión, inventario, ventas, cobros, producción ni configuración.
- Error con reintento y generación visible. El error no cambia la altura de los
  botones vecinos; objetivos PDF móviles de al menos 44 px y sin overflow de página.
- La batería general conserva ventas, crédito, stock, sedes, teclado, temas,
  navegación de 440 ms, reinicios, respaldo/restauración e integración.

## Evidencia entregada

[Cuatro PDF de ejemplo](ejemplos/), revisados visualmente en todas sus páginas:
lote 1, venta 1, historial 2 y balance 1. El caso de lote prueba 8 sacos, 200 kg
comerciales y 196 kg de fórmula; su fórmula usa maestros sintéticos nuevos.

[Capturas finales](capturas/): cuatro pantallas × escritorio/móvil × claro/oscuro,
más carga y error de venta (18 imágenes). La captura espera fuentes, fin de
animaciones y dos frames. Se conserva el desplazamiento propio de las tablas.
Antecedentes visuales de navegación y clientes: `../navegacion-clientes/antes/`.

Casos extremos excluidos de Git en `outputs/report-stress/`: historial de 130
ventas y notas sin espacios (12 páginas), y venta con producto/textos mucho
mayores que una hoja (3 páginas). Se verifican todos los identificadores, marcas
finales de texto, pies y límites de caracteres; el campo excepcional continúa
rotulado en flujo de texto. Los totales comerciales permanecen agrupados.

## Incidencias resueltas y límites

La primera pasada completa obtuvo 192/193 por un timeout de PowerShell al
verificar ACL de una carpeta temporal; la repetición completa pasó 193/193.
No se flexibilizaron permisos ni timeouts de producción. Intentos de prueba
dentro del aislamiento rechazaron SQLite temporal y loopback (EPERM/EACCES);
las comprobaciones se ejecutaron con los permisos de prueba necesarios.
La expectativa inicial de 403 al desactivar una sesión se ajustó a 401: el
contrato existente revoca esa sesión. No se cambió el comportamiento de acceso.

La revisión visual inicial pidió color semántico de error sin estirar controles
y 44 px táctiles. El verdict pass posterior fue **ship**, con ambas correcciones
**resolved**; su aprobación cubre esas dos correcciones. El documenter contrastó
contratos, tokens, componentes y evidencia, y conservó los archivos de diseño.
Informó referencias históricas de 120–240/220 ms en esos contratos; el código
mantiene los 440 ms solicitados y verificados. No se reescribieron contratos
históricos como efecto secundario de esta entrega.

Los documentos requieren el servidor local iniciado. Son lecturas del estado
vigente, no cierres contables históricos. Los campos que no están registrados
se omiten; no se inventa información tributaria. Los ejemplos no contienen
credenciales, bases privadas ni operaciones de clientes reales.
