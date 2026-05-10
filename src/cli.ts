import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { AppConfig, Lead } from "./models.js";
import { runHybrid } from "./core.js";
import { rankLeads } from "./scoring/basic.js";
import { writeLeadsCsv } from "./export/csv.js";
import { aiEnrichLeads } from "./enrich/gemini.js";

function argValue(name: string, fallback = ""): string {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadEnvKey(name: string): string {
  if (process.env[name]) return String(process.env[name]);
  const file = path.join(process.env.HOME || "", ".lead_finder.env");
  if (!fs.existsSync(file)) return "";
  const txt = fs.readFileSync(file, "utf8");
  const line = txt.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.split("=", 2)[1].trim().replace(/^['"]|['"]$/g, "") : "";
}

function parseConfig(): AppConfig {
  const mode = (argValue("--mode", "hybrid") as AppConfig["mode"]);
  const mapsDepth = (argValue("--maps-depth", "fast") as AppConfig["mapsDepth"]);
  const city = argValue("--city", "Rimini");
  const keyword = argValue("--keyword", "dentista");
  const maxResults = Number(argValue("--max-results", "40"));

  return {
    mode,
    mapsDepth,
    city,
    keyword,
    maxResults: Number.isFinite(maxResults) ? Math.min(maxResults, 80) : 40,
    withWhois: hasFlag("--with-whois"),
    debug: hasFlag("--debug"),
    aiEnrich: hasFlag("--ai-enrich"),
    aiMax: Number(argValue("--ai-max", "20")) || 20,
    aiModel: argValue("--ai-model", "gemini-1.5-flash"),
    zirelOnly: hasFlag("--zirel-only")
  };
}

async function main(): Promise<void> {
  const cfg = parseConfig();
  const mapsKey = loadEnvKey("GOOGLE_MAPS_API_KEY");
  if (!mapsKey) throw new Error("GOOGLE_MAPS_API_KEY mancante (.env o ~/.lead_finder.env)");

  const raw = await runHybrid({
    city: cfg.city,
    keyword: cfg.keyword,
    maxResults: cfg.maxResults,
    mapsDepth: cfg.mapsDepth,
    mapsApiKey: mapsKey,
    zirelOnly: cfg.zirelOnly
  });

  let leads: Lead[] = rankLeads(raw);

  if (cfg.aiEnrich) {
    const geminiKey = loadEnvKey("GEMINI_API_KEY");
    leads = await aiEnrichLeads(leads, {
      enabled: true,
      apiKey: geminiKey,
      model: cfg.aiModel,
      max: cfg.aiMax
    });
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const safeCity = cfg.city.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const safeKeyword = cfg.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  const fullPath = path.resolve(`leads_${safeCity}_${safeKeyword}_${stamp}.csv`);

  await writeLeadsCsv(fullPath, leads);

  console.log(`[TS] Lead salvati: ${leads.length}`);
  console.log(`[TS] CSV: ${fullPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
