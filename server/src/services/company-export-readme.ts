/**
 * Genera README.md con el organigrama Mermaid para exportaciones de empresas.
 */
import type { CompanyPortabilityManifest } from "@paperclipai/shared";

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  coo: "COO",
  vp: "VP",
  manager: "Gerente",
  engineer: "Ingeniero",
  agent: "Agente",
};

/**
 * Genera un diagrama de flujo Mermaid (TD = de arriba hacia abajo) que representa el organigrama.
 * Devuelve null si no hay agentes.
 */
export function generateOrgChartMermaid(agents: CompanyPortabilityManifest["agents"]): string | null {
  if (agents.length === 0) return null;

  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("graph TD");

  // Definiciones de nodos con etiquetas de rol
  for (const agent of agents) {
    const roleLabel = ROLE_LABELS[agent.role] ?? agent.role;
    const id = mermaidId(agent.slug);
    lines.push(`    ${id}["${mermaidEscape(agent.name)}<br/><small>${mermaidEscape(roleLabel)}</small>"]`);
  }

  // Aristas de padre a hijo
  const slugSet = new Set(agents.map((a) => a.slug));
  for (const agent of agents) {
    if (agent.reportsToSlug && slugSet.has(agent.reportsToSlug)) {
      lines.push(`    ${mermaidId(agent.reportsToSlug)} --> ${mermaidId(agent.slug)}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}

/** Normaliza el slug para usarlo como ID de nodo Mermaid (alfanumérico + guion bajo). */
function mermaidId(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Escapa el texto para las etiquetas de nodos Mermaid. */
function mermaidEscape(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Construye una etiqueta visible para la fuente de una habilidad, enlazando a GitHub cuando está disponible. */
function skillSourceLabel(skill: CompanyPortabilityManifest["skills"][number]): string {
  if (skill.sourceLocator) {
    // Para fuentes de GitHub o URL, renderiza como un enlace markdown
    if (skill.sourceType === "github" || skill.sourceType === "skills_sh" || skill.sourceType === "url") {
      return `[${skill.sourceType}](${skill.sourceLocator})`;
    }
    return skill.sourceLocator;
  }
  if (skill.sourceType === "local") return "local";
  return skill.sourceType ?? "\u2014";
}

/**
 * Genera el contenido del README.md para una exportación de empresa.
 */
export function generateReadme(
  manifest: CompanyPortabilityManifest,
  options: {
    companyName: string;
    companyDescription: string | null;
  },
): string {
  const lines: string[] = [];

  lines.push(`# ${options.companyName}`);
  lines.push("");
  if (options.companyDescription) {
    lines.push(`> ${options.companyDescription}`);
    lines.push("");
  }

  // Imagen del organigrama (generada durante la exportación como images/org-chart.png)
  if (manifest.agents.length > 0) {
    lines.push("![Organigrama](images/org-chart.png)");
    lines.push("");
  }

  // Tabla de contenido
  lines.push("## Contenido");
  lines.push("");
  lines.push("> Este es un paquete de [empresa de agentes](https://agentcompanies.io) de [Paperclip](https://paperclip.ing)");
  lines.push("");

  const counts: Array<[string, number]> = [];
  if (manifest.agents.length > 0) counts.push(["Agentes", manifest.agents.length]);
  if (manifest.projects.length > 0) counts.push(["Proyectos", manifest.projects.length]);
  if (manifest.skills.length > 0) counts.push(["Habilidades", manifest.skills.length]);
  if (manifest.issues.length > 0) counts.push(["Tareas", manifest.issues.length]);

  if (counts.length > 0) {
    lines.push("| Contenido | Cantidad |");
    lines.push("|---------|-------|");
    for (const [label, count] of counts) {
      lines.push(`| ${label} | ${count} |`);
    }
    lines.push("");
  }

  // Tabla de agentes
  if (manifest.agents.length > 0) {
    lines.push("### Agentes");
    lines.push("");
    lines.push("| Agente | Rol | Reporta a |");
    lines.push("|-------|------|------------|");
    for (const agent of manifest.agents) {
      const roleLabel = ROLE_LABELS[agent.role] ?? agent.role;
      const reportsTo = agent.reportsToSlug ?? "\u2014";
      lines.push(`| ${agent.name} | ${roleLabel} | ${reportsTo} |`);
    }
    lines.push("");
  }

  // Lista de proyectos
  if (manifest.projects.length > 0) {
    lines.push("### Proyectos");
    lines.push("");
    for (const project of manifest.projects) {
      const desc = project.description ? ` \u2014 ${project.description}` : "";
      lines.push(`- **${project.name}**${desc}`);
    }
    lines.push("");
  }

  // Lista de habilidades
  if (manifest.skills.length > 0) {
    lines.push("### Habilidades");
    lines.push("");
    lines.push("| Habilidad | Descripción | Fuente |");
    lines.push("|-------|-------------|--------|");
    for (const skill of manifest.skills) {
      const desc = skill.description ?? "\u2014";
      const source = skillSourceLabel(skill);
      lines.push(`| ${skill.name} | ${desc} | ${source} |`);
    }
    lines.push("");
  }

  // Inicio rápido
  lines.push("## Inicio rápido");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm paperclipai company import this-github-url-or-folder");
  lines.push("```");
  lines.push("");
  lines.push("Consulta [Paperclip](https://paperclip.ing) para más información.");
  lines.push("");

  // Pie de página
  lines.push("---");
  lines.push(`Exportado de [Paperclip](https://paperclip.ing) el ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  return lines.join("\n");
}
