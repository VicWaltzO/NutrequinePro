import type { Sale } from "@/lib/domain-types";
import LoadingScreen from "../LoadingScreen";
import SaleTable from "@/features/ventas/components/SaleTable";
import Sidebar from "@/client/admin/Sidebar";
import Topbar from "@/client/admin/Topbar";
import ModalHost from "@/client/admin/ModalHost";
import { useAdminOperations } from "./hooks/useAdminOperations";
import { useAdminNavigation } from "./hooks/useAdminNavigation";
import AdminWorkspace from "./AdminWorkspace";
export default function AdminApp() {
  const { s: state, actor, modal, error, busy, toast, reload, open, close, run } = useAdminOperations();
  const navigation = useAdminNavigation();
  const { view, go, menu, theme, setMenu, toggleTheme } = navigation;
  if (!state || !actor) return <LoadingScreen reload={reload} error={error} />;
  const write = actor.role !== "VIEWER";
  const saleTable = (rows: Sale[]) => <SaleTable s={state} write={write} open={open} rows={rows} />;
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
        <AdminWorkspace
          state={state}
          actor={actor}
          navigation={navigation}
          open={open}
          error={modal ? "" : error}
        />
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
        s={state}
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
