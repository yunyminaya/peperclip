#!/usr/bin/env npx tsx
/**
 * Generador standalone de comparación de organigramas — SVG puro (sin Playwright).
 *
 * Genera archivos SVG para los 5 estilos × 3 tamaños de organización, más una página HTML de comparación.
 * Usa directamente el renderizador SVG del lado del servidor — el mismo código que alimenta las rutas.
 *
 * Uso:
 *   npx tsx scripts/generate-org-chart-satori-comparison.ts
 *
 * Salida: tmp/org-chart-svg-comparison/
 */
import * as fs from "fs";
import * as path from "path";
import {
  renderOrgChartSvg,
  renderOrgChartPng,
  type OrgNode,
  type OrgChartStyle,
  ORG_CHART_STYLES,
} from "../server/src/routes/org-chart-svg.js";

// ── Datos de organización de ejemplo ─────────────────────────────────────────

const ORGS: Record<string, OrgNode> = {
  sm: {
    id: "ceo",
    name: "CEO",
    role: "Chief Executive",
    status: "active",
    reports: [
      { id: "eng1", name: "Engineer", role: "Engineering", status: "active", reports: [] },
      { id: "des1", name: "Designer", role: "Design", status: "active", reports: [] },
    ],
  },
  med: {
    id: "ceo",
    name: "CEO",
    role: "Chief Executive",
    status: "active",
    reports: [
      {
        id: "cto",
        name: "CTO",
        role: "Technology",
        status: "active",
        reports: [
          { id: "eng1", name: "ClaudeCoder", role: "Engineering", status: "active", reports: [] },
          { id: "eng2", name: "CodexCoder", role: "Engineering", status: "active", reports: [] },
          { id: "eng3", name: "SparkCoder", role: "Engineering", status: "active", reports: [] },
          { id: "eng4", name: "CursorCoder", role: "Engineering", status: "active", reports: [] },
          { id: "qa1", name: "QA", role: "Quality", status: "active", reports: [] },
        ],
      },
      {
        id: "cmo",
        name: "CMO",
        role: "Marketing",
        status: "active",
        reports: [
          { id: "des1", name: "Designer", role: "Design", status: "active", reports: [] },
        ],
      },
    ],
  },
  lg: {
    id: "ceo",
    name: "CEO",
    role: "Chief Executive",
    status: "active",
    reports: [
      {
        id: "cto",
        name: "CTO",
        role: "Technology",
        status: "active",
        reports: [
          { id: "eng1", name: "Eng 1", role: "Engineering", status: "active", reports: [] },
          { id: "eng2", name: "Eng 2", role: "Engineering", status: "active", reports: [] },
          { id: "eng3", name: "Eng 3", role: "Engineering", status: "active", reports: [] },
          { id: "qa1", name: "QA", role: "Quality", status: "active", reports: [] },
        ],
      },
      {
        id: "cmo",
        name: "CMO",
        role: "Marketing",
        status: "active",
        reports: [
          { id: "des1", name: "Designer", role: "Design", status: "active", reports: [] },
          { id: "wrt1", name: "Content", role: "Engineering", status: "active", reports: [] },
        ],
      },
      {
        id: "cfo",
        name: "CFO",
        role: "Finance",
        status: "active",
        reports: [
          { id: "fin1", name: "Analyst", role: "Finance", status: "active", reports: [] },
        ],
      },
      {
        id: "coo",
        name: "COO",
        role: "Operations",
        status: "active",
        reports: [
          { id: "ops1", name: "Ops 1", role: "Operations", status: "active", reports: [] },
          { id: "ops2", name: "Ops 2", role: "Operations", status: "active", reports: [] },
          { id: "devops1", name: "DevOps", role: "Operations", status: "active", reports: [] },
        ],
      },
    ],
  },
};

const STYLE_META: Record<OrgChartStyle, { name: string; vibe: string; bestFor: string }> = {
  monochrome: { name: "Monocromo", vibe: "Vercel — sin ruido de color, oscuro", bestFor: "READMEs de GitHub, documentación para desarrolladores" },
  nebula: { name: "Nebulosa", vibe: "Glassmorphism — degradado cósmico", bestFor: "Secciones hero, marketing" },
  circuit: { name: "Circuito", vibe: "Linear/Raycast — trazos índigo", bestFor: "Páginas de producto, herramientas de desarrollo" },
  warmth: { name: "Calidez", vibe: "Airbnb — claro, avatares de colores", bestFor: "READMEs en modo claro, presentaciones" },
  schematic: { name: "Esquema", vibe: "Plano — fondo de cuadrícula, monoespaciado", bestFor: "Documentación técnica, diagramas de infraestructura" },
};

// ── Principal ─────────────────────────────────────────────────────────

async function main() {
  const outDir = path.resolve("tmp/org-chart-svg-comparison");
  fs.mkdirSync(outDir, { recursive: true });

  const sizes = ["sm", "med", "lg"] as const;
  const results: string[] = [];

  for (const style of ORG_CHART_STYLES) {
    for (const size of sizes) {
      const svg = renderOrgChartSvg([ORGS[size]], style);
      const svgFile = `${style}-${size}.svg`;
      fs.writeFileSync(path.join(outDir, svgFile), svg);
      results.push(svgFile);
      console.log(`  ✓ ${svgFile}`);

      // También genera PNG
      try {
        const png = await renderOrgChartPng([ORGS[size]], style);
        const pngFile = `${style}-${size}.png`;
        fs.writeFileSync(path.join(outDir, pngFile), png);
        results.push(pngFile);
        console.log(`  ✓ ${pngFile}`);
      } catch (e) {
        console.log(`  ⚠ PNG falló para ${style}-${size}: ${(e as Error).message}`);
      }
    }
  }

  // Compila el HTML de comparación
  let html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Comparación de estilos de organigrama — SVG puro (sin Playwright)</title>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; background: #050505; color: #eee; padding: 40px; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.03em; }
  p.sub { color: #888; font-size: 14px; margin-bottom: 16px; }
  .badge { display: inline-block; background: #1a1a2e; border: 1px solid #333; border-radius: 4px; padding: 4px 10px; font-size: 12px; color: #6366f1; margin-bottom: 32px; }
  .style-section { margin-bottom: 60px; }
  .style-section h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; letter-spacing: -0.02em; }
  .style-meta { font-size: 13px; color: #666; margin-bottom: 16px; }
  .style-meta em { color: #888; font-style: normal; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .grid img, .grid object { width: 100%; border-radius: 8px; border: 1px solid #222; background: #111; }
  .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; font-weight: 500; }
  .size-label { font-size: 10px; color: #555; text-align: center; margin-top: 4px; }
  .note { background: #111; border: 1px solid #222; border-radius: 6px; padding: 16px 20px; margin-top: 40px; font-size: 13px; color: #999; line-height: 1.6; }
  .note h3 { font-size: 14px; color: #ccc; margin-bottom: 8px; }
  .note code { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; font-size: 12px; color: #6366f1; }
</style>
</head><body>
<h1>Exportación de organigrama — Comparación de estilos</h1>
<p class="sub">5 estilos × 3 tamaños de organización. SVG puro — sin Playwright, sin Satori, sin navegador necesario.</p>
<div class="badge">Compatible del lado del servidor — funciona en cualquier ruta</div>
`;

  for (const style of ORG_CHART_STYLES) {
    const meta = STYLE_META[style];
    html += `<div class="style-section">
  <h2>${meta.name}</h2>
  <div class="style-meta"><em>${meta.vibe}</em> — Ideal para: ${meta.bestFor}</div>
  <div class="label">Pequeño / Mediano / Grande</div>
  <div class="grid">
    <div><img src="${style}-sm.png" onerror="this.outerHTML='<object data=\\'${style}-sm.svg\\' type=\\'image/svg+xml\\' style=\\'width:100%;border-radius:8px;border:1px solid #222\\'></object>'" /><div class="size-label">3 agentes</div></div>
    <div><img src="${style}-med.png" onerror="this.outerHTML='<object data=\\'${style}-med.svg\\' type=\\'image/svg+xml\\' style=\\'width:100%;border-radius:8px;border:1px solid #222\\'></object>'" /><div class="size-label">8 agentes</div></div>
    <div><img src="${style}-lg.png" onerror="this.outerHTML='<object data=\\'${style}-lg.svg\\' type=\\'image/svg+xml\\' style=\\'width:100%;border-radius:8px;border:1px solid #222\\'></object>'" /><div class="size-label">14 agentes</div></div>
  </div>
</div>`;
  }

  html += `
<div class="note">
  <h3>¿Por qué SVG puro en lugar de Satori?</h3>
  <p>
    <strong>Satori</strong> convierte JSX → SVG usando Yoga (flexbox). Es ideal para tarjetas OG pero tiene limitaciones para organigramas:
    sin pseudo-elementos <code>::before/::after</code>, sin CSS grid, soporte limitado de degradados,
    y las líneas conectoras entre nodos necesitarían post-procesamiento.
  </p>
  <p>
    <strong>El renderizado SVG puro</strong> (lo que usamos aquí) nos da control total sobre el diseño, los conectores,
    los degradados, los filtros y los patrones — sin dependencias de ejecución más allá de <code>sharp</code> para PNG.
    Se ejecuta en cualquier ruta de Node.js, genera en &lt;10ms y produce una salida idéntica cada vez.
  </p>
  <p>
    Rutas: <code>GET /api/companies/:id/org.svg?style=monochrome</code> y <code>GET /api/companies/:id/org.png?style=circuit</code>
  </p>
</div>
</body></html>`;

  fs.writeFileSync(path.join(outDir, "comparison.html"), html);
  console.log(`\n✓ Listo. ${results.length} archivos generados.`);
  console.log(`  Abre: tmp/org-chart-svg-comparison/comparison.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
