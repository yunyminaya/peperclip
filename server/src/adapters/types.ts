// Reexportar todos los tipos del paquete compartido adapter-utils.
// Este archivo se mantiene como un shim de conveniencia para que los
// imports existentes dentro del árbol (process/, http/, heartbeat.ts)
// no necesiten reescribirse.
export type {
  AdapterAgent,
  AdapterSessionManagement,
  AdapterRuntime,
  UsageSummary,
  AdapterExecutionResult,
  AdapterInvocationMeta,
  AdapterExecutionContext,
  AdapterEnvironmentCheckLevel,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestStatus,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestContext,
  AdapterSkillSyncMode,
  AdapterSkillState,
  AdapterSkillOrigin,
  AdapterSkillEntry,
  AdapterSkillSnapshot,
  AdapterSkillContext,
  AdapterSessionCodec,
  AdapterModel,
  NativeContextManagement,
  ResolvedSessionCompactionPolicy,
  SessionCompactionPolicy,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
