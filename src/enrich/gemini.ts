import { z } from "zod";
import { Lead } from "../models.js";

const aiSchema = z.object({
  reason_summary_ai: z.string().min(1),
  opening_line_ai: z.string().min(1),
  recommended_offer: z.enum(["zirel", "website_refresh", "new_website", "both"]).optional(),
  priority_band: z.enum(["hot", "warm", "cold"]).optional()
});

export interface AiEnrichConfig {
  enabled: boolean;
  model: string;
  apiKey: string;
  max: number;
}

function promptForLead(lead: Lead): string {
  return [
    "Sei un sales assistant B2B locale.",
    "Dato il lead, genera JSON con chiavi: reason_summary_ai, opening_line_ai, recommended_offer, priority_band.",
    "Stile: concreto, non aggressivo, max 2 frasi per campo testo.",
    "Lead:",
    JSON.stringify({
      business_name: lead.businessName,
      city: lead.address,
      website: lead.website,
      mobile_phone: lead.mobilePhone,
      landline_phone: lead.landlinePhone,
      email: lead.email,
      product_opportunity: lead.productOpportunity,
      sales_angle: lead.salesAngle,
      reason_flags: lead.reasonFlags,
      rating_reviews_from_flags: lead.reasonFlags
    })
  ].join("\n");
}

async function geminiGenerate(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") throw new Error("Gemini empty response");
  return text;
}

export async function aiEnrichLeads(leads: Lead[], cfg: AiEnrichConfig): Promise<Lead[]> {
  if (!cfg.enabled || !cfg.apiKey) return leads;
  const out: Lead[] = [];
  let done = 0;
  for (const lead of leads) {
    if (done >= cfg.max) {
      out.push(lead);
      continue;
    }
    try {
      const raw = await geminiGenerate(cfg.apiKey, cfg.model, promptForLead(lead));
      const parsed = aiSchema.parse(JSON.parse(raw));
      out.push({
        ...lead,
        reasonSummary: parsed.reason_summary_ai,
        openingLine: parsed.opening_line_ai
      });
      done += 1;
    } catch {
      out.push(lead);
    }
  }
  return out;
}
