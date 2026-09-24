import { inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

const jsonMode = process.argv.includes("--json");

function toError(error: unknown, context = "No se pudo verificar el estado de la migración"): Error {
  if (error instanceof Error) return error;
  if (error === undefined) return new Error(context);
  if (typeof error === "string") return new Error(`${context}: ${error}`);

  try {
    return new Error(`${context}: ${JSON.stringify(error)}`);
  } catch {
    return new Error(`${context}: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const connection = await resolveMigrationConnection();

  try {
    const state = await inspectMigrations(connection.connectionString);
    const payload =
      state.status === "upToDate"
        ? {
            source: connection.source,
            status: "upToDate" as const,
            tableCount: state.tableCount,
            pendingMigrations: [] as string[],
          }
        : {
            source: connection.source,
            status: "needsMigrations" as const,
            tableCount: state.tableCount,
            pendingMigrations: state.pendingMigrations,
            reason: state.reason,
          };

    if (jsonMode) {
      console.log(JSON.stringify(payload));
      return;
    }

    if (payload.status === "upToDate") {
      console.log(`La base de datos está actualizada con ${payload.source}`);
      return;
    }

    console.log(
      `Migraciones pendientes con ${payload.source}: ${payload.pendingMigrations.join(", ")}`,
    );
  } finally {
    await connection.stop();
  }
}

main().catch((error) => {
  const err = toError(error, "No se pudo verificar el estado de la migración");
  process.stderr.write(`${err.stack ?? err.message}\n`);
  process.exit(1);
});
