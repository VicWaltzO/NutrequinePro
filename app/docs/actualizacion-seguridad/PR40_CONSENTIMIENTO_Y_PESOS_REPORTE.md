# PR 40: consentimiento por propuesta y presentación de pesos

## Cambios

- Cambiar la preparación o la sustitución desmarca el consentimiento y deshabilita la confirmación hasta una nueva aceptación explícita.
- Un formateador compartido muestra desde 1000 g en kg con máximo dos decimales y cantidades inferiores en gramos enteros. Incluye cero y movimientos negativos.
- Inventario, producción, ventas, fórmulas, compras y preparaciones usan unidades explícitas en los pesos mostrados. Los encabezados reflejan unidades variables.
- El redondeo es exclusivamente visual. No cambia cantidades guardadas, cálculos, inventario, costos ni la precisión de los campos de captura.
- Regresión de navegador: cambiar entre preparaciones de dos familias y cambiar la sustitución invalida el consentimiento sin escribir datos.
- Pruebas de formato cubren el umbral de 1 kg, redondeo, ceros, nulos y movimientos negativos; el oráculo de ordenamiento normaliza unidades para comparar pesos.

## Validación final

- `npm.cmd run verify`: aprobado. 615 casos: 609 aprobados, cero fallos, cero cancelaciones y seis TODO históricos. Incluye los tres chequeos TypeScript, lint, formato, compilación completa y auditoría de distribución.
- Distribución: 2108 archivos, 69 paquetes de runtime, cero archivos privados y cero paquetes retirados.
- E2E: 50 casos verificados por bloques, sin casos pendientes. La corrida inicial registró 37 aprobados y tres fallidos antes de interrumpirse por disco lleno. Catálogo, validación general y confirmaciones se repitieron individualmente: 1/1 cada archivo, sin fallos. Tras recuperar espacio se ejecutaron los diez restantes: 10/10, sin fallos, omisiones ni cancelaciones.
- Regresión de sustituciones: cambiar preparación entre familias o cambiar sustitución invalida el consentimiento sin escribir datos. Se conservan el replay sin duplicación, el historial y los consumos separados por grupo.
- Comparación determinista del HTML normalizado de los 66 escenarios contra b798cfd: estructura y atributos idénticos; solo cambian textos de unidades y encabezados. Se actualizaron 32 huellas y se conservaron 34.
- Capturas sintéticas de escritorio y móvil, claro y oscuro, revisadas para sustituciones y confirmaciones. Catálogo comercial revisado visualmente.

## Incidencias de verificación resueltas

Se recuperó espacio de disco y se reinstalaron las dependencias con `npm ci`, sin cambiar el lockfile. Después se recompiló la aplicación y se completaron los casos interrumpidos y la verificación general.

La prueba de catálogo conserva todas sus aserciones y permite diez minutos en Windows por los procesos PowerShell de comprobación de ACL; otros sistemas conservan cuatro minutos. La repetición completa aprobada tardó 254 segundos en Windows.

Las capturas, registros, bases sintéticas y demás evidencias locales quedan excluidos del commit. Los registros finales están en `outputs/pr40-verificacion/`, ignorado por Git.
