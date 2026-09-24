import { applyPendingMigrations, inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

async function main(): Promise<void> {
  const resolved = await resolveMigrationConnection();

  console.log(`Migrando la base de datos con ${resolved.source}`);

  try {
    const before = await inspectMigrations(resolved.connectionString);
    if (before.status === "upToDate") {
      console.log("Sin migraciones pendientes");
      return;
    }

    console.log(`Aplicando ${before.pendingMigrations.length} migración(es) pendiente(s)...`);
    await applyPendingMigrations(resolved.connectionString);

    const after = await inspectMigrations(resolved.connectionString);
    if (after.status !== "upToDate") {
      throw new Error(`Migraciones incompletas: ${after.pendingMigrations.join(", ")}`);
    }
    console.log("Migraciones completas");
  } finally {
    await resolved.stop();
  }
}

await main();
