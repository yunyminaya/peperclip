import { createDb } from "./client.js";
import { companies, agents, goals, projects, issues } from "./schema/index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL es obligatorio");

const db = createDb(url);

console.log("Insertando datos iniciales en la base de datos...");

const [company] = await db
  .insert(companies)
  .values({
    name: "Paperclip Demo Co",
    description: "Una empresa autónoma de demostración",
    status: "active",
    budgetMonthlyCents: 50000,
  })
  .returning();

const [ceo] = await db
  .insert(agents)
  .values({
    companyId: company!.id,
    name: "Agente CEO",
    role: "ceo",
    title: "Director ejecutivo",
    status: "idle",
    adapterType: "process",
    adapterConfig: { command: "echo", args: ["hello from ceo"] },
    budgetMonthlyCents: 15000,
  })
  .returning();

const [engineer] = await db
  .insert(agents)
  .values({
    companyId: company!.id,
    name: "Agente ingeniero",
    role: "engineer",
    title: "Ingeniero de software",
    status: "idle",
    reportsTo: ceo!.id,
    adapterType: "process",
    adapterConfig: { command: "echo", args: ["hello from engineer"] },
    budgetMonthlyCents: 10000,
  })
  .returning();

const [goal] = await db
  .insert(goals)
  .values({
    companyId: company!.id,
    title: "Lanzar V1",
    description: "Entregar la primera versión del plano de control",
    level: "company",
    status: "active",
    ownerAgentId: ceo!.id,
  })
  .returning();

const [project] = await db
  .insert(projects)
  .values({
    companyId: company!.id,
    goalId: goal!.id,
    name: "MVP del plano de control",
    description: "Implementar el panel principal + el ciclo del agente",
    status: "in_progress",
    leadAgentId: ceo!.id,
  })
  .returning();

await db.insert(issues).values([
  {
    companyId: company!.id,
    projectId: project!.id,
    goalId: goal!.id,
    title: "Implementar checkout atómico de tareas",
    description: "Garantizar que reclamar tareas in_progress sea seguro ante conflictos",
    status: "todo",
    priority: "high",
    assigneeAgentId: engineer!.id,
    createdByAgentId: ceo!.id,
  },
  {
    companyId: company!.id,
    projectId: project!.id,
    goalId: goal!.id,
    title: "Agregar pausa automática del presupuesto",
    description: "Pausar el agente al alcanzar el límite máximo del presupuesto",
    status: "backlog",
    priority: "medium",
    createdByAgentId: ceo!.id,
  },
]);

console.log("Datos iniciales insertados");
process.exit(0);
