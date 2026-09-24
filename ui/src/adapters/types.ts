import type { ComponentType } from "react";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

// Reexporta los tipos compartidos para que los consumidores locales no necesiten cambiar los imports
export type { TranscriptEntry, StdoutLineParser, CreateConfigValues } from "@paperclipai/adapter-utils";

export interface AdapterConfigFieldsProps {
  mode: "create" | "edit";
  isCreate: boolean;
  adapterType: string;
  /** Modo creación: valores crudos del formulario */
  values: CreateConfigValues | null;
  /** Modo creación: actualiza los valores del formulario */
  set: ((patch: Partial<CreateConfigValues>) => void) | null;
  /** Modo edición: adapterConfig original del agente */
  config: Record<string, unknown>;
  /** Modo edición: lee el valor efectivo */
  eff: <T>(group: "adapterConfig", field: string, original: T) => T;
  /** Modo edición: marca el campo como modificado */
  mark: (group: "adapterConfig", field: string, value: unknown) => void;
  /** Modelos disponibles para las listas desplegables */
  models: { id: string; label: string }[];
  /** Cuando es true, oculta el campo de ruta del archivo de instrucciones (p. ej., durante la importación, donde se establece automáticamente) */
  hideInstructionsFile?: boolean;
}

export interface UIAdapterModule {
  type: string;
  label: string;
  parseStdoutLine: (line: string, ts: string) => import("@paperclipai/adapter-utils").TranscriptEntry[];
  ConfigFields: ComponentType<AdapterConfigFieldsProps>;
  buildAdapterConfig: (values: CreateConfigValues) => Record<string, unknown>;
}
