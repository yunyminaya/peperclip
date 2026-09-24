import { Command } from "commander";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadPaperclipEnvFile } from "./config/env.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerClientAuthCommands } from "./commands/client/auth.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "Directorio raíz de datos de Paperclip (aísla el estado de ~/.paperclip)";

program
  .name("paperclipai")
  .description("Paperclip CLI — configura, diagnostica y ajusta tu instancia")
  .version("0.2.7");

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadPaperclipEnvFile(options.config);
});

program
  .command("onboard")
  .description("Asistente interactivo de configuración inicial")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-y, --yes", "Aceptar valores predeterminados (inicio rápido + iniciar de inmediato)", false)
  .option("--run", "Iniciar Paperclip inmediatamente después de guardar la configuración", false)
  .action(onboard);

program
  .command("doctor")
  .description("Ejecutar comprobaciones de diagnóstico en tu instalación de Paperclip")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--repair", "Intentar reparar los problemas automáticamente")
  .alias("--fix")
  .option("-y, --yes", "Omitir las confirmaciones de reparación")
  .action(async (opts) => {
    await doctor(opts);
  });

program
  .command("env")
  .description("Mostrar variables de entorno para el despliegue")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(envCommand);

program
  .command("configure")
  .description("Actualizar secciones de configuración")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-s, --section <section>", "Sección a configurar (llm, database, logging, server, storage, secrets)")
  .action(configure);

program
  .command("db:backup")
  .description("Crear una copia de seguridad única de la base de datos con la configuración actual")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--dir <path>", "Directorio de salida de la copia (anula la configuración)")
  .option("--retention-days <days>", "Ventana de retención usada para la purga", (value) => Number(value))
  .option("--filename-prefix <prefix>", "Prefijo del nombre de archivo de la copia", "paperclip")
  .option("--json", "Mostrar los metadatos de la copia como JSON")
  .action(async (opts) => {
    await dbBackupCommand(opts);
  });

program
  .command("allowed-hostname")
  .description("Permitir un hostname para el acceso en modo autenticado/privado")
  .argument("<host>", "Hostname a permitir (por ejemplo dotta-macbook-pro)")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(addAllowedHostname);

program
  .command("run")
  .description("Preparar la instalación local (onboard + doctor) y ejecutar Paperclip")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-i, --instance <id>", "ID de la instancia local (predeterminado: default)")
  .option("--repair", "Intentar reparaciones automáticas durante el diagnóstico", true)
  .option("--no-repair", "Desactivar las reparaciones automáticas durante el diagnóstico")
  .action(runCommand);

const heartbeat = program.command("heartbeat").description("Utilidades de latido");

heartbeat
  .command("run")
  .description("Ejecutar un latido de agente y transmitir los registros en vivo")
  .requiredOption("-a, --agent-id <agentId>", "ID del agente a invocar")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--context <path>", "Ruta al archivo de contexto del CLI")
  .option("--profile <name>", "Nombre del perfil de contexto del CLI")
  .option("--api-base <url>", "URL base de la API del servidor Paperclip")
  .option("--api-key <token>", "Token bearer para llamadas autenticadas como agente")
  .option(
    "--source <source>",
    "Origen de la invocación (timer | assignment | on_demand | automation)",
    "on_demand",
  )
  .option("--trigger <trigger>", "Detalle del disparador (manual | ping | callback | system)", "manual")
  .option("--timeout-ms <ms>", "Tiempo máximo de espera antes de rendirse", "0")
  .option("--json", "Mostrar JSON sin procesar cuando aplique")
  .option("--debug", "Mostrar fragmentos JSON sin procesar de stdout/stderr del adaptador")
  .action(heartbeatRun);

registerContextCommands(program);
registerCompanyCommands(program);
registerIssueCommands(program);
registerAgentCommands(program);
registerApprovalCommands(program);
registerActivityCommands(program);
registerDashboardCommands(program);
registerWorktreeCommands(program);
registerPluginCommands(program);

const auth = program.command("auth").description("Utilidades de autenticación e inicialización");

auth
  .command("bootstrap-ceo")
  .description("Crear una URL de invitación única para el primer administrador de la instancia")
  .option("-c, --config <path>", "Ruta al archivo de configuración")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", "Crear una invitación nueva aunque ya exista un administrador", false)
  .option("--expires-hours <hours>", "Ventana de vencimiento de la invitación en horas", (value) => Number(value))
  .option("--base-url <url>", "URL base pública usada para mostrar el enlace de invitación")
  .action(bootstrapCeoInvite);

registerClientAuthCommands(auth);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
