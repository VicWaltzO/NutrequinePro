import { LayoutDashboard } from "lucide-react";
import { ShoppingBag } from "lucide-react";
import { Wallet } from "lucide-react";
import { Users } from "lucide-react";
import { Factory } from "lucide-react";
import { Layers } from "lucide-react";
import { Receipt } from "lucide-react";
import { ChartNoAxesCombined } from "lucide-react";
import { Settings } from "lucide-react";
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
