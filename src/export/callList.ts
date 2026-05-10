import fs from "node:fs";
import { format } from "fast-csv";
import { Lead } from "../models.js";

export async function writeCallListCsv(path: string, leads: Lead[]): Promise<void> {
  const formatMapsRating = (rating: number): string => (rating > 0 ? `${rating.toFixed(1)}/5` : "");

  const rows = leads.map((l) => ({
    priority: l.callPriority,
    business_name: l.businessName,
    maps_rating: formatMapsRating(l.rating),
    phone: l.mobilePhone || l.landlinePhone || "",
    next_action: l.nextAction,
    detected_pain: l.detectedPain,
    opening_line: l.openingLine,
    call_script: l.callScript,
    why_this_lead_is_sellable: l.whyThisLeadIsSellable,
    maps_url: l.mapsUrl,
    website: l.website,
    requires_manual_review: l.requiresManualReview
  }));

  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(path);
    const csv = format({ headers: true, delimiter: ";" });
    csv.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", () => resolve());
    csv.pipe(ws);
    for (const row of rows) csv.write(row);
    csv.end();
  });
}
