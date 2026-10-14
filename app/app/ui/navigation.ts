import {
  LayoutDashboard,
  ShoppingBag,
  Wallet,
  Users,
  Factory,
  Layers,
  Receipt,
  ChartNoAxesCombined,
  Settings,
} from "lucide-react";

export const nav = [
  ["dashboard", "Resumen", LayoutDashboard],
  ["sales", "Ventas", ShoppingBag],
  ["collections", "Cobranza", Wallet],
  ["expenses", "Gastos", Receipt],
  ["productions", "Producción", Factory],
  ["inventory", "Inventario", Layers],
  ["balance", "Balance", ChartNoAxesCombined],
  ["customers", "Clientes", Users],
  ["config", "Configuración", Settings],
] as const;
