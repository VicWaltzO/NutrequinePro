import type { ReactNode } from "react";
import type { HTMLInputTypeAttribute } from "react";
import type { AppState } from "@/lib/domain-types";
import type { EditorRecord } from "@/lib/domain-types";
import type { SimpleFields } from "./forms";
export interface SimpleFieldProps {
  s: AppState;
  kind?: string;
  record?: EditorRecord;
  v: SimpleFields;
  set: <K extends keyof SimpleFields>(key: K, value: SimpleFields[K]) => void;
  input: (
    key: keyof SimpleFields,
    label: string,
    type?: HTMLInputTypeAttribute,
    required?: boolean,
  ) => ReactNode;
  categories: string[];
  defaultCategory: string | undefined;
}
