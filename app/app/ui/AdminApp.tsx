"use client";
import { adminSelectors } from "./selectors";
import { Tabs } from "@/shared/ui/Tabs";
import type { Sale } from "@/lib/domain-types";
import { balanceSummary } from "@/lib/domain.mjs";
import LoadingScreen from "@/shared/ui/LoadingScreen";
import ProductCards from "@/features/inventario/components/ProductCards";
import RecordFilters from "@/app/ui/RecordFilters";
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
import Sidebar from "@/app/ui/Sidebar";
import Topbar from "@/app/ui/Topbar";
import PageHeading from "@/app/ui/PageHeading";
import ModalHost from "@/app/ui/ModalHost";
import { useAdminOperations } from "./hooks/useAdminOperations";
import { useAdminNavigation } from "./hooks/useAdminNavigation";
export default function AdminApp() {
  const { s, actor, modal, error, busy, toast, authenticatedId, reload, open, close, run } =
    useAdminOperations();
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
    menu,
    setMenu,
    theme,
    view,
    tab,
    go,
    toggleTheme,
  } = useAdminNavigation();

  if (!s || !actor) return <LoadingScreen reload={reload} error={error} authenticatedId={authenticatedId} />;
  const admin = actor.role === "ADMIN",
    write = actor.role !== "VIEWER";
  const b = balanceSummary(s, from, to || "9999");
  const { match, sales, pending, productions, primary } = adminSelectors(s, {
    q,
    filter,
    client,
    site,
    from,
    to,
    tab,
  });

  const productCards = <ProductCards s={s} />;
  const saleTable = (rows: Sale[]) => <SaleTable s={s} write={write} open={open} rows={rows} />;
  const tabs = (options: [string, string][]) => (
    <Tabs options={options} view={view} tab={tab} onSelect={() => setFilter("")} />
  );
  const filters = (
    <RecordFilters
      s={s}
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

  const productionList = <ProductionList s={s} write={write} open={open} productions={productions} />;
  return (
    <div className="app-shell">
      <Sidebar actor={actor} view={view} go={go} menu={menu} />
      <div className="workspace">
        <Topbar
          view={view}
          reload={reload}
          theme={theme}
          menu={menu}
          setMenu={setMenu}
          toggleTheme={toggleTheme}
        />
        <main>
          <PageHeading tab={tab} view={view} admin={admin} write={write} open={open} primary={primary} />
          {error && !modal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {view === "dashboard" && (
            <DashboardView s={s} b={b} go={go} productCards={productCards} saleTable={saleTable} />
          )}
          {view === "sales" && (
            <SalesView
              s={s}
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
              s={s}
              b={b}
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
            <CustomersView s={s} tab={tab} write={write} open={open} q={q} setQ={setQ} tabs={tabs} />
          )}

          {view === "productions" && (
            <ProductionsView
              s={s}
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
              s={s}
              tab={tab}
              open={open}
              match={match}
              filters={filters}
              productCards={productCards}
              tabs={tabs}
            />
          )}
          {view === "expenses" && (
            <ExpensesView s={s} admin={admin} open={open} match={match} filters={filters} />
          )}
          {view === "balance" && (
            <BalanceView s={s} b={b} filters={filters} productionList={productionList} />
          )}
          {view === "config" && (
            <ConfigurationView s={s} actor={actor} tab={tab} open={open} theme={theme} tabs={tabs} />
          )}
        </main>
        <footer className="app-footer">
          Nutrequine Pro <span>Operaciones conectadas · America/Lima · PEN</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      <ModalHost
        s={s}
        actor={actor}
        write={write}
        open={open}
        run={run}
        close={close}
        reload={reload}
        busy={busy}
        error={error}
        modal={modal}
        saleTable={saleTable}
      />
    </div>
  );
}
