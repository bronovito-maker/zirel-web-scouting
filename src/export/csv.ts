import fs from "node:fs";
import { format } from "fast-csv";
import { Lead } from "../models.js";

export async function writeLeadsCsv(path: string, leads: Lead[]): Promise<void> {
  const formatMapsRating = (rating: number): string => (rating > 0 ? `${rating.toFixed(1)}/5` : "");

  const rows = leads.map((l) => ({
    business_name: l.businessName,
    maps_rating: formatMapsRating(l.rating),
    mobile_phone: l.mobilePhone || "",
    landline_phone: l.landlinePhone || "",
    email: l.email,
    email_quality: l.emailQuality,
    valid_emails: l.validEmails,
    invalid_email_reason: l.invalidEmailReason,
    city_address: l.address,
    call_priority: l.callPriority,
    priority: l.priority,
    next_action: l.nextAction,
    detected_pain: l.detectedPain,
    proof_signal: l.proofSignal,
    has_booking: l.hasBooking,
    booking_visibility: l.bookingVisibility,
    booking_provider: l.bookingProvider,
    booking_evidence: l.bookingEvidence,
    has_whatsapp: l.hasWhatsapp,
    whatsapp_evidence: l.whatsappEvidence,
    has_chatbot: l.hasChatbot,
    chatbot_provider: l.chatbotProvider,
    chatbot_evidence: l.chatbotEvidence,
    site_structure_type: l.siteStructureType,
    funnel_complexity: l.funnelComplexity,
    has_flow_booking: l.hasFlowBooking,
    requires_manual_review: l.requiresManualReview,
    checked_urls: l.checkedUrls,
    evidence_level: l.evidenceLevel,
    business_relevance: l.businessRelevance,
    category_fit: l.categoryFit,
    business_size: l.businessSize,
    buyer_fit_score: l.buyerFitScore,
    sales_ease_score: l.salesEaseScore,
    why_this_lead_is_sellable: l.whyThisLeadIsSellable,
    opening_line: l.openingLine,
    call_script: l.callScript,
    maps_url: l.mapsUrl,
    website: l.website
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
