# NQP26-11 · Búsquedas reproducibles

Ejecutadas con rg desde raíz del worktree sobre base e66f4de. rg respeta .gitignore: build, dependencias y salidas no son fuentes. El séptimo barrido añade pruebas/scripts y permite conciliar falsos positivos fuera del grafo runtime. Los resultados estáticos se complementan con seguimiento de navegación y AST TypeScript (cabeceras/celdas), no se usan como única prueba de exhaustividad.

## JSX consumidor

```text
rg -n <Table\b app/client app/features app/shared app/server -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 33 coincidencias en 21 archivos.

| Archivo                                                           | Coincidencias |
| ----------------------------------------------------------------- | ------------- |
| `app/features/balance/components/BalanceView.tsx`                 | 1             |
| `app/features/clientes/components/CustomerDetail.tsx`             | 1             |
| `app/features/clientes/components/CustomerDirectory.tsx`          | 2             |
| `app/features/cobranza/components/CollectionsView.tsx`            | 1             |
| `app/features/cobranza/components/PaymentDetail.tsx`              | 1             |
| `app/features/cobranza/components/PaymentForm.tsx`                | 1             |
| `app/features/configuracion/components/Configuration.tsx`         | 3             |
| `app/features/gastos/components/ExpensesView.tsx`                 | 1             |
| `app/features/inventario/components/InventoryView.tsx`            | 2             |
| `app/features/produccion/components/FormulaForm.tsx`              | 1             |
| `app/features/produccion/components/ProductionCorrectionForm.tsx` | 1             |
| `app/features/produccion/components/ProductionDetail.tsx`         | 4             |
| `app/features/produccion/components/ProductionIngredients.tsx`    | 1             |
| `app/features/produccion/components/ProductionList.tsx`           | 1             |
| `app/features/produccion/components/ProductionsView.tsx`          | 2             |
| `app/features/produccion/components/ReconcileForm.tsx`            | 1             |
| `app/features/ventas/components/ReturnForm.tsx`                   | 1             |
| `app/features/ventas/components/SaleDetail.tsx`                   | 4             |
| `app/features/ventas/components/SaleTable.tsx`                    | 1             |
| `app/features/ventas/components/SalesView.tsx`                    | 2             |
| `app/shared/ui/History.tsx`                                       | 1             |

```text
app/features\gastos\components\ExpensesView.tsx:22:        <Table heads={["Fecha", "Categoría", "Descripción", "Monto", "Relación", "Estado", ""]}>
app/shared\ui\History.tsx:16:          <Table heads={["Campo", "Valor anterior", "Valor nuevo"]}>
app/features\ventas\components\SaleTable.tsx:17:    <Table heads={["Venta / fecha", "Cliente", "Sede", "Total", "Pagado", "Saldo", "Finanzas", "Entrega"]}>
app/features\produccion\components\ReconcileForm.tsx:34:      <Table heads={["Insumo", "Teórico bruto", "Descuento S/", "Cobro real S/", "Diferencia", "Pagado"]}>
app/features\ventas\components\SalesView.tsx:41:            <Table heads={["Código", "Venta", "Motivo", "Usuario", "Fecha"]}>
app/features\ventas\components\SalesView.tsx:61:            <Table heads={["Devolución", "Venta", "Fecha", "Motivo", "Reducción económica"]}>
app/features\produccion\components\ProductionsView.tsx:39:            <Table heads={["Insumo", "Precio actual S/ por kg", "Estado", ""]}>
app/features\produccion\components\ProductionsView.tsx:62:                      <Table heads={["Insumo", "Kg / núcleo"]}>
app/features\produccion\components\ProductionList.tsx:18:    <Table heads={["Producción", "Fecha", "Estado", "Sacos", "Costo consolidado", "Fuente"]}>
app/features\produccion\components\ProductionIngredients.tsx:15:    <Table heads={["Insumo", "Kg", "S/ por kg", "Teórico neto", "Descuento S/", "Cobro real S/", "Pagado"]}>
app/features\ventas\components\SaleDetail.tsx:107:            <Table
app/features\ventas\components\SaleDetail.tsx:137:        <Table
app/features\ventas\components\SaleDetail.tsx:173:        <Table heads={["Pago", "Fecha", "Método", "Aplicado", "Estado"]}>
app/features\ventas\components\SaleDetail.tsx:220:            <Table heads={["Producto", "Cantidad", "Peso"]}>
app/features\configuracion\components\Configuration.tsx:27:          <Table
app/features\configuracion\components\Configuration.tsx:81:        <Table heads={["Usuario", "ID autenticado", "Rol", "Estado", ""]}>
app/features\configuracion\components\Configuration.tsx:100:        <Table heads={["Fecha", "Usuario", "Acción", "Detalle"]}>
app/features\ventas\components\ReturnForm.tsx:43:      <Table heads={["Producto", "Entregado", "Ya devuelto", "Devolver cantidad"]}>
app/features\produccion\components\FormulaForm.tsx:45:      <Table heads={["Insumo", "Kg por núcleo", ""]}>
app/features\produccion\components\ProductionDetail.tsx:70:        <Table heads={["Producto", "Versión", "Núcleos", "Sacos", "Kg comerciales", "Kg fórmula"]}>
app/features\produccion\components\ProductionDetail.tsx:87:            <Table heads={["Insumo", "Kg por núcleo"]}>
app/features\produccion\components\ProductionDetail.tsx:100:        <Table
app/features\produccion\components\ProductionDetail.tsx:130:        <Table heads={["Categoría", "Descripción", "Cantidad", "Costo unitario", "Importe", "Pagado"]}>
app/features\balance\components\BalanceView.tsx:88:        <Table heads={["Mes", "Ventas registradas", "Cobros netos"]}>
app/features\produccion\components\ProductionCorrectionForm.tsx:31:      <Table heads={["Producto", "Núcleos originales", "Núcleos corregidos"]}>
app/features\cobranza\components\PaymentForm.tsx:103:            <Table heads={["Venta", "Fecha", "Sede", "Saldo", "Aplicar S/"]}>
app/features\cobranza\components\PaymentDetail.tsx:48:      <Table heads={["Venta", "Aplicación"]}>
app/features\cobranza\components\CollectionsView.tsx:49:            <Table heads={["Pago", "Fecha", "Cliente", "Método", "Monto", "Estado"]}>
app/features\inventario\components\InventoryView.tsx:37:              <Table heads={["Producto", "Cantidad física", "Kg físicos", "Cantidad comprometida"]}>
app/features\inventario\components\InventoryView.tsx:59:              <Table heads={["Fecha", "Ítem", "Movimiento", "Cantidad", "Kg", "Origen", "Notas"]}>
app/features\clientes\components\CustomerDetail.tsx:246:              <Table heads={["Cobro / fecha", "Recibido", "Aplicado", "Disponible", "Estado / aplicaciones"]}>
app/features\clientes\components\CustomerDirectory.tsx:55:            <Table heads={["Sede", "Clientes asociados", "Estado", ""]}>
app/features\clientes\components\CustomerDirectory.tsx:76:            <Table heads={["Cliente", "Contacto", "Sedes", "Deuda", "Saldo a favor", "Estado", ""]}>
```

## HTML directo

```text
rg -n <table\b app/client app/features app/shared app/server -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 1 coincidencias en 1 archivos.

| Archivo                   | Coincidencias |
| ------------------------- | ------------- |
| `app/shared/ui/Table.tsx` | 1             |

```text
app/shared\ui\Table.tsx:5:      <table>
```

## Semántica ARIA

```text
rg -n role\s*[:=]\s*[{\"'\s]*(table|grid)\b app/client app/features app/shared app/server -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 1; 0 coincidencias en 0 archivos.

Sin coincidencias; se mantuvo revisión de componentes indirectos para evitar falso negativo.

```text
(sin coincidencias)
```

## Generación dinámica

```text
rg -n createElement|innerHTML|dangerouslySetInnerHTML|heads\.map|<thead|<tbody|<th\b|<tr\b app/client app/features app/shared app/server -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 40 coincidencias en 24 archivos.

| Archivo                                                           | Coincidencias |
| ----------------------------------------------------------------- | ------------- |
| `app/features/balance/components/BalanceView.tsx`                 | 1             |
| `app/features/clientes/components/CustomerDetail.tsx`             | 1             |
| `app/features/clientes/components/CustomerDirectory.tsx`          | 2             |
| `app/features/cobranza/components/CollectionsView.tsx`            | 1             |
| `app/features/cobranza/components/PaymentDetail.tsx`              | 1             |
| `app/features/cobranza/components/PaymentForm.tsx`                | 1             |
| `app/features/configuracion/components/Configuration.tsx`         | 3             |
| `app/features/documentos/components/DownloadPdfButton.tsx`        | 1             |
| `app/features/gastos/components/ExpensesView.tsx`                 | 1             |
| `app/features/inventario/components/InventoryView.tsx`            | 2             |
| `app/features/produccion/components/FormulaForm.tsx`              | 1             |
| `app/features/produccion/components/ProductionCorrectionForm.tsx` | 1             |
| `app/features/produccion/components/ProductionDetail.tsx`         | 4             |
| `app/features/produccion/components/ProductionIngredients.tsx`    | 1             |
| `app/features/produccion/components/ProductionList.tsx`           | 1             |
| `app/features/produccion/components/ProductionsView.tsx`          | 2             |
| `app/features/produccion/components/ReconcileForm.tsx`            | 1             |
| `app/features/ventas/components/ReturnForm.tsx`                   | 1             |
| `app/features/ventas/components/SaleDetail.tsx`                   | 4             |
| `app/features/ventas/components/SaleTable.tsx`                    | 1             |
| `app/features/ventas/components/SalesView.tsx`                    | 2             |
| `app/shared/ui/AuthenticatedId.tsx`                               | 1             |
| `app/shared/ui/History.tsx`                                       | 1             |
| `app/shared/ui/Table.tsx`                                         | 5             |

## Reportes/impresión

```text
rg -n \btable\(|autoTable|drawTable|window\.print|text/html app/server app/features/documentos -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 11 coincidencias en 3 archivos.

| Archivo                        | Coincidencias |
| ------------------------------ | ------------- |
| `app/server/frontend.mts`      | 1             |
| `app/server/report-layout.mts` | 1             |
| `app/server/reports.mts`       | 9             |

```text
app/server\frontend.mts:7:  html: "text/html; charset=utf-8",
app/server\reports.mts:46:  const table = (head: string[], rows: string[][], widths?: number[]) => pdf.table(head, rows, widths);
app/server\reports.mts:58:    table(
app/server\reports.mts:75:    table(
app/server\reports.mts:102:    table(
app/server\reports.mts:160:    table(
app/server\reports.mts:172:    table(
app/server\reports.mts:184:    table(
app/server\reports.mts:195:    table(
app/server\reports.mts:231:    table(
app/server\report-layout.mts:121:  table(headers: string[], rows: string[][], weights: number[] = headers.map(() => 1)) {
```

## Consumidores indirectos

```text
rg -n saleTable\(|productionList|<History\b|<ProductionIngredients\b|<SaleTable\b|<ProductionList\b app/client app/features app/shared app/server -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 18 coincidencias en 11 archivos.

| Archivo                                                   | Coincidencias |
| --------------------------------------------------------- | ------------- |
| `app/client/admin/AdminApp.tsx`                           | 1             |
| `app/client/admin/AdminWorkspace.tsx`                     | 4             |
| `app/features/balance/components/BalanceView.tsx`         | 3             |
| `app/features/balance/components/DashboardView.tsx`       | 1             |
| `app/features/clientes/components/CustomerDetail.tsx`     | 1             |
| `app/features/cobranza/components/CollectionsView.tsx`    | 1             |
| `app/features/produccion/components/ProductionDetail.tsx` | 1             |
| `app/features/produccion/components/ProductionForm.tsx`   | 1             |
| `app/features/produccion/components/ProductionsView.tsx`  | 3             |
| `app/features/ventas/components/SaleDetail.tsx`           | 1             |
| `app/features/ventas/components/SalesView.tsx`            | 1             |

```text
app/features\cobranza\components\CollectionsView.tsx:74:            saleTable(pending)
app/client\admin\AdminApp.tsx:17:  const saleTable = (rows: Sale[]) => <SaleTable s={state} write={write} open={open} rows={rows} />;
app/client\admin\AdminWorkspace.tsx:68:  const saleTable = (rows: Sale[]) => <SaleTable s={state} write={write} open={open} rows={rows} />;
app/client\admin\AdminWorkspace.tsx:89:  const productionList = <ProductionList s={state} write={write} open={open} productions={productions} />;
app/client\admin\AdminWorkspace.tsx:142:          productionList={productionList}
app/client\admin\AdminWorkspace.tsx:161:        <BalanceView s={state} b={balance} filters={filters} productionList={productionList} />
app/features\clientes\components\CustomerDetail.tsx:237:            {sales.length ? saleTable(sales) : <p>No hay ventas con estos filtros.</p>}
app/features\ventas\components\SalesView.tsx:81:            saleTable(sales)
app/features\balance\components\DashboardView.tsx:84:          {saleTable(state.sales.slice(-5).reverse())}
app/features\ventas\components\SaleDetail.tsx:237:      <History s={state} type="SALE" id={id} />
app/features\balance\components\BalanceView.tsx:10:  productionList,
app/features\balance\components\BalanceView.tsx:15:  productionList: ReactNode;
app/features\balance\components\BalanceView.tsx:84:        {productionList}
app/features\produccion\components\ProductionDetail.tsx:147:      <History s={state} type="PRODUCTION" id={id} />
app/features\produccion\components\ProductionForm.tsx:110:            <ProductionIngredients rows={ingredients} update={adj} />
app/features\produccion\components\ProductionsView.tsx:14:  productionList,
app/features\produccion\components\ProductionsView.tsx:24:  productionList: ReactNode;
app/features\produccion\components\ProductionsView.tsx:85:            productionList
```

## Barrido global de fuentes

```text
rg -n <Table\b|<table\b|\btable\(|role\s*[:=]\s*[{\"'\s]*(table|grid)\b app -g *.tsx -g *.ts -g *.mts -g *.mjs -g *.js
```

Salida 0; 44 coincidencias en 24 archivos.

| Archivo                                                           | Coincidencias |
| ----------------------------------------------------------------- | ------------- |
| `app/features/balance/components/BalanceView.tsx`                 | 1             |
| `app/features/clientes/components/CustomerDetail.tsx`             | 1             |
| `app/features/clientes/components/CustomerDirectory.tsx`          | 2             |
| `app/features/cobranza/components/CollectionsView.tsx`            | 1             |
| `app/features/cobranza/components/PaymentDetail.tsx`              | 1             |
| `app/features/cobranza/components/PaymentForm.tsx`                | 1             |
| `app/features/configuracion/components/Configuration.tsx`         | 3             |
| `app/features/gastos/components/ExpensesView.tsx`                 | 1             |
| `app/features/inventario/components/InventoryView.tsx`            | 2             |
| `app/features/produccion/components/FormulaForm.tsx`              | 1             |
| `app/features/produccion/components/ProductionCorrectionForm.tsx` | 1             |
| `app/features/produccion/components/ProductionDetail.tsx`         | 4             |
| `app/features/produccion/components/ProductionIngredients.tsx`    | 1             |
| `app/features/produccion/components/ProductionList.tsx`           | 1             |
| `app/features/produccion/components/ProductionsView.tsx`          | 2             |
| `app/features/produccion/components/ReconcileForm.tsx`            | 1             |
| `app/features/ventas/components/ReturnForm.tsx`                   | 1             |
| `app/features/ventas/components/SaleDetail.tsx`                   | 4             |
| `app/features/ventas/components/SaleTable.tsx`                    | 1             |
| `app/features/ventas/components/SalesView.tsx`                    | 2             |
| `app/server/report-layout.mts`                                    | 1             |
| `app/server/reports.mts`                                          | 9             |
| `app/shared/ui/History.tsx`                                       | 1             |
| `app/shared/ui/Table.tsx`                                         | 1             |

## Cierre de hallazgos

33 `<Table>` de aplicación se concilian en RECONCILIACION_FUENTES con 43 instancias UI; 1 `<table>` es wrapper excluido; 8 llamadas PDF inventariadas; alias y método ReportLayout excluidos como generadores. No hubo roles table/grid. createElement genera ancla de descarga, no tabla; th/thead/tbody son wrapper, y tr/td pertenecen a los consumidores inventariados. Las pruebas usan representaciones de estas mismas fuentes, SQL usa table para persistencia; ver EXCLUSIONES.

El parser TypeScript extrajo arrays heads de JSX y de llamadas table, conservó posición y celdas. Se cotejaron 41 declaraciones con CSV por archivo/línea/cabecera. ReconcileForm genera dos td en map de discount_amount/actual_charge: expansión manual explícita, sin perder columna. No se versiona script de generación temporal ni dependencias nuevas.
