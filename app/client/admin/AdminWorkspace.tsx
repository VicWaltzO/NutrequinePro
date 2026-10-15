import { adminSelectors } from "./selectors";
import { Tabs } from "@/shared/ui/Tabs";
import type { AppState, User, OpenModal, Sale } from "@/lib/domain-types";
import { balanceSummary } from "@/lib/domain-preview.mjs";
import ProductCards from "@/features/inventario/components/ProductCards";
import RecordFilters from "@/client/admin/RecordFilters";
import SaleTable from "@/features/ventas/components/SaleTable";
import ProductionList from "@/features/produccion/components/ProductionList";
import DashboardView from "@/features/balance/components/DashboardView";
import SalesView from "@/features/ventas/components/SalesView";
import CollectionsView from "@/features/cobranza/components/CollectionsView";
import CustomersView from "@/features/clientes/components/CustomersView";
import ProductionsView from "@/features/produccion/components/ProductionsView";
import InventoryView from "@/features/inventario/components/InventoryView";
import ExpensesView from "@/features/gastos/components/ExpensesView";
import BalanceView from "@/features/balance/components/BalanceView";
import ConfigurationView from "@/features/configuracion/components/ConfigurationView";
import PageHeading from "@/client/admin/PageHeading";
import type { useAdminNavigation } from "./hooks/useAdminNavigation";

export default function AdminWorkspace({
  state,
  actor,
  navigation,
  open,
  error,
}: {
  state: AppState;
  actor: User;
  navigation: ReturnType<typeof useAdminNavigation>;
  open: OpenModal;
  error: string;
}) {
  const {
    q,
    setQ,
    filter,
    setFilter,
    client,
    setClient,
    site,
    setSite,
    from,
    setFrom,
    to,
    setTo,
    theme,
    view,
    tab,
    go,
  } = navigation;

  const admin = actor.role === "ADMIN";
  const write = actor.role !== "VIEWER";
  const balance = balanceSummary(state, from, to || "9999");
  const { match, sales, pending, productions, primary } = adminSelectors(state, {
    q,
    filter,
    client,
    site,
    from,
    to,
    tab,
  });

  const productCards = <ProductCards s={state} />;
  const saleTable = (rows: Sale[]) => <SaleTable s={state} write={write} open={open} rows={rows} />;
  const tabs = (options: [string, string][]) => (
    <Tabs options={options} view={view} tab={tab} onSelect={() => setFilter("")} />
  );
  const filters = (
    <RecordFilters
      s={state}
      view={view}
      q={q}
      setQ={setQ}
      filter={filter}
      setFilter={setFilter}
      client={client}
      setClient={setClient}
      site={site}
      setSite={setSite}
      from={from}
      setFrom={setFrom}
      to={to}
      setTo={setTo}
    />
  );

  const productionList = <ProductionList s={state} write={write} open={open} productions={productions} />;

  return (
    <main>
      <PageHeading tab={tab} view={view} admin={admin} write={write} open={open} primary={primary} />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {view === "dashboard" && (
        <DashboardView s={state} b={balance} go={go} productCards={productCards} saleTable={saleTable} />
      )}
      {view === "sales" && (
        <SalesView
          s={state}
          tab={tab}
          write={write}
          open={open}
          match={match}
          sales={sales}
          filters={filters}
          saleTable={saleTable}
          tabs={tabs}
        />
      )}
      {view === "collections" && (
        <CollectionsView
          s={state}
          b={balance}
          tab={tab}
          open={open}
          match={match}
          pending={pending}
          filters={filters}
          saleTable={saleTable}
          tabs={tabs}
        />
      )}
      {view === "customers" && (
        <CustomersView s={state} tab={tab} write={write} open={open} q={q} setQ={setQ} tabs={tabs} />
      )}

      {view === "productions" && (
        <ProductionsView
          s={state}
          tab={tab}
          admin={admin}
          write={write}
          open={open}
          match={match}
          filters={filters}
          productionList={productionList}
          tabs={tabs}
        />
      )}
      {view === "inventory" && (
        <InventoryView
          s={state}
          tab={tab}
          open={open}
          match={match}
          filters={filters}
          productCards={productCards}
          tabs={tabs}
        />
      )}
      {view === "expenses" && (
        <ExpensesView s={state} admin={admin} open={open} match={match} filters={filters} />
      )}
      {view === "balance" && (
        <BalanceView s={state} b={balance} filters={filters} productionList={productionList} />
      )}
      {view === "config" && (
        <ConfigurationView s={state} actor={actor} tab={tab} open={open} theme={theme} tabs={tabs} />
      )}
    </main>
  );
}
