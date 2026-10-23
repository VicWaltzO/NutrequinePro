# Producción con núcleos decimales

Fecha: 23 de octubre de 2026, America/Bogota.

## Alcance y regla confirmada

Se admiten núcleos con hasta dos decimales y coma o punto: `3,57` y `3.57` son equivalentes. Se conserva el rendimiento configurado por producto (40 sacos por núcleo en el catálogo actual). No se calcula el rendimiento comercial a partir del peso de la fórmula.

Los insumos se consumen proporcionalmente a los núcleos. La producción comercial toma el máximo de sacos completos por producto: se redondea hacia abajo la proporción de sacos, sin combinar productos. El peso comercial es la cantidad de sacos completos por su peso configurado. El equivalente del sobrante queda fuera del inventario y se indica en la vista previa como kg no comerciales; no se registra como producto vendible ni se transforma en stock de insumos.

Ejemplo: 3,57 núcleos × 40 sacos = 142,8 sacos. Con sacos de 25 kg, ingresan 142 sacos y 3.550 kg comerciales; 20 kg equivalentes no se cuentan como comerciales. No se cambia el consumo de fórmula a 142 sacos: se conserva el correspondiente a 3,57 núcleos.

## Implementación

El parser compartido valida tipos, separador, precisión y el límite existente de 10.000.000 de núcleos. Las centésimas se calculan como enteros. Insumos y fórmula se redondean por línea al gramo más cercano; costos por núcleo se redondean al céntimo más cercano. Empaques se cobran únicamente por sacos completos.

Alta, edición del borrador, confirmación y rectificación usan la misma proporción. Las rectificaciones conservan fórmula y rendimiento históricos y mantienen las restricciones de stock consumido. Las comprobaciones numéricas admiten decimales solo en las cantidades de núcleos; dinero, gramos y sacos mantienen su representación entera.

Sin migraciones ni cambios de dependencias. Los registros históricos no se recalculan. Los formularios usan teclado decimal y admiten ambos separadores. La prueba E2E existente de formularios verifica ambos con 3,57 y el guardado de 142 sacos.

## Validación

Regresiones nuevas: parser y límites; proporción de sacos completos y remanente; redondeo; equivalencia coma/punto; vista previa frente al resultado persistido; guardado/recarga, confirmación, rectificación y anulación en memoria y SQLite de disco; rechazos sin cambios en el estado. Solo datos sintéticos en temporales externos.

El cierre registrará los resultados de verify, E2E y git diff --check. Evidencias, bases, capturas y builds se mantienen excluidos del commit.

## Seguimiento de verificación

Verify aprobado: 232 pruebas, tres comprobaciones TypeScript, lint, formato, build y auditoría de distribución (2.071 archivos; privateFiles=0 y retiredPackages=0). Después se añadió y aprobó una regresión adicional para impedir que cantidades o costos fuera de rango rompan el formulario; la ejecución enfocada de producción aprobó 16 pruebas. Las comprobaciones estáticas y el build de verify incorporaron esta protección.

Se actualizaron únicamente los hashes HTML de los formularios de producción y rectificación debido al cambio de tipo de sus campos; las demás referencias permanecen iguales.

La primera suite E2E aprobó el caso decimal y 28 de 29 pruebas, pero falló la comprobación de cancelación de animaciones al cambiar movimiento reducido. Se sustituyeron las dos lecturas inmediatas del cambio de preferencia por aserciones que esperan cero animaciones activas. No se modifica la aplicación ni se relaja el resultado esperado. La suite completa se repite; el primer resultado fallido no se considera aprobado.

Cierre local: E2E completo aprobado (29 pruebas, cero fallos/cancelaciones/omisiones; 384,82 segundos), incluidos 3.57 y 3,57 en el formulario. Lint final, formato y git diff --check aprobados. Capturas de escritorio y móvil revisadas visualmente; quedan excluidas. Código listo en rama propia para integrar a main mediante PR; no se realiza despliegue ni se cambian datos empresariales.
