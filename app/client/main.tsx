import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";
import "./session.css";
import "./workspace.css";
import "./customer-profile.css";
import "./customer-name.css";
import "./sale-form.css";
import "./operation-forms.css";
import "./production-entry.css";
import "../features/produccion/components/journeys.css";
import "./pending-stock.css";
import "../features/microinsumos/components/micro-inventory.css";

createRoot(document.getElementById("root")!).render(<App />);
