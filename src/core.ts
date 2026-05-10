import { BusinessSize, Lead, NextAction, ProductOpportunity } from "./models.js";
import { searchMapsPlaces } from "./providers/maps.js";

const EMAIL_RE_GLOBAL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const INVALID_EMAIL_PATTERNS = [".png", ".jpg", ".jpeg", ".webp", ".svg", "@2x", "@3x", ".gif", ".avif"];
const BOOKING_TEXT_PATTERNS = [
  "prenota", "prenotazione", "booking", "reserva", "reservation", "book now",
  "check-in", "check-out", "cerca disponibilita", "cerca disponibilità"
];
const BOOKING_PATH_PATTERNS = [
  "/booking", "/book", "/reservation", "/reservations", "/prenota", "/prenotazioni",
  "/rooms", "/camere", "/availability"
];
const BOOKING_PROVIDER_PATTERNS = [
  "amenitiz", "booking engine", "simplebooking", "vertical booking", "blastness", "ericsoft",
  "cubilis", "roomcloud", "bedzzle", "hotelcinquestelle", "zak", "octorate", "bookassist",
  "synxis", "d-edge", "hotelnerds", "mirai"
];
const CORE_HOSPITALITY_PATTERNS = /(hotel|lodging|bed_and_breakfast|guest[_\s-]?house|affittacamere|inn|motel|pensione|residence|aparthotel|camping|village)/;
const WHATSAPP_PATTERNS = ["wa.me", "api.whatsapp.com", "whatsapp://", "whatsapp"];
const CHATBOT_PROVIDERS: Array<{ name: string; re: RegExp }> = [
  { name: "intercom", re: /intercom/ },
  { name: "drift", re: /drift/ },
  { name: "tawk", re: /tawk/ },
  { name: "crisp", re: /crisp/ },
  { name: "zendesk", re: /zendesk chat/ },
  { name: "hubspot", re: /hubspot.*chat|chat.*hubspot/ },
  { name: "livechat", re: /livechat/ },
  { name: "messenger", re: /facebook.*messenger|messenger/ },
  { name: "whatsapp_widget", re: /whatsapp.*widget|wa\.me/ }
];

function normalizeDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function isMobileIT(phone: string): boolean {
  let d = normalizeDigits(phone);
  if (d.startsWith("0039")) d = d.slice(4);
  while (d.startsWith("39") && d.length > 9) d = d.slice(2);
  if (d.startsWith("0")) return false;
  return d.startsWith("3") && d.length >= 9 && d.length <= 11;
}

function contactPriority(mobile: string, landline: string, email: string): string {
  if (mobile) return "mobile_first";
  if (landline) return "landline_only";
  if (email) return "email_only";
  return "no_contact";
}

function nextActionFor(contact: string): NextAction {
  if (contact === "mobile_first") return "test_whatsapp";
  if (contact === "landline_only") return "call_now_low_priority";
  if (contact === "email_only") return "email_first";
  return "manual_review";
}

function verticalWeight(keyword: string): { fit: string; seasonal: string; bonus: number } {
  const k = keyword.toLowerCase();
  if (/estet|dent|fisio|parruc|medic|b&b|bb|hotel|nolegg|officin/.test(k)) {
    return { fit: "HOT", seasonal: /b&b|bb|hotel/.test(k) ? "HIGH" : "MEDIUM", bonus: 20 };
  }
  if (/ristor|pizzer|bar|negoz/.test(k)) return { fit: "MEDIUM", seasonal: "MEDIUM", bonus: 10 };
  return { fit: "LOW", seasonal: "LOW", bonus: 0 };
}

export function classifyCategoryFit(name: string, types: string[], keyword: string): "core" | "semi_core" | "borderline" | "non_core" {
  const hay = `${name} ${(types || []).join(" ")} ${keyword}`.toLowerCase();
  if (/(charger|distributore|ufficio|office)/.test(hay)) return "non_core";
  if (/(arena|event|teatro|ristor|bar|stabilimento balneare|beach club|parcheggio|shop|negozio)/.test(hay)) return "borderline";
  if (/(camping|village|agriturismo|resort)/.test(hay)) return "semi_core";
  if (/(hotel|pensione|bed[_\s-]?and[_\s-]?breakfast|b&b|guest[_\s-]?house|affittacamere|residence|aparthotel)/.test(hay)) return "core";
  return "semi_core";
}

function isLikelyRelevant(name: string, keyword: string, types: string[]): boolean {
  const n = (name || "").toLowerCase();
  const k = (keyword || "").toLowerCase();
  const t = (types || []).join(" ").toLowerCase();
  if (/destination charger|tesla/.test(n)) return false;
  if (/b&b|bb|hotel/.test(k)) return /(hotel|lodging|guest house|bed|resort|inn|affittacamere|b&b)/.test(`${n} ${t}`);
  if (/estet/.test(k)) return /(beauty|spa|estet|salon|nail)/.test(`${n} ${t}`);
  if (/dent|odont/.test(k)) return /(dent|odont|clinic|doctor)/.test(`${n} ${t}`);
  return true;
}

function businessRelevanceForHotelKeyword(name: string, types: string[], keyword: string): "core" | "non_core" {
  const k = keyword.toLowerCase();
  if (!/(hotel|b&b|bb|affittacamere|pensione|residence|aparthotel|camping|village)/.test(k)) return "core";
  const hay = `${name} ${(types || []).join(" ")}`.toLowerCase();
  if (/(arena|event|teatro|ristor|bar|stabilimento balneare|beach club)/.test(hay)) return "non_core";
  const valid = CORE_HOSPITALITY_PATTERNS.test(hay);
  return valid ? "core" : "non_core";
}

export function detectBookingReliably(htmlLower: string, links: string[], url: string): {
  hasBooking: boolean;
  bookingVisibility: "above_fold" | "below_fold" | "hidden" | "subflow" | "none";
  bookingEvidence: string[];
  bookingProvider: string;
} {
  const evidence: string[] = [];
  let provider = "";
  const earlyChunk = htmlLower.slice(0, 35000);
  const aroundFirstBooking = (() => {
    const idx = htmlLower.search(/prenot|booking|reservation|book now|availability|check-in|check-out/);
    if (idx < 0) return "";
    return htmlLower.slice(Math.max(0, idx - 450), Math.min(htmlLower.length, idx + 450));
  })();

  for (const p of BOOKING_PROVIDER_PATTERNS) {
    if (htmlLower.includes(p)) {
      provider = p;
      evidence.push(`provider:${p}`);
      break;
    }
  }
  for (const p of BOOKING_TEXT_PATTERNS) {
    if (htmlLower.includes(p)) {
      evidence.push(`text:${p}`);
      break;
    }
  }
  const normalizedLinks = links.map((l) => l.toLowerCase());
  for (const p of BOOKING_PATH_PATTERNS) {
    if (normalizedLinks.some((l) => l.includes(p))) {
      evidence.push(`path:${p}`);
      break;
    }
  }
  const bookingFormSignal = /(check-?in|check-?out|adulti|bambini|ospiti|availability).{0,200}(<input|<select)/.test(htmlLower);
  if (bookingFormSignal) evidence.push("form:booking_fields");

  const hasBooking = evidence.length > 0;
  if (!hasBooking) return { hasBooking: false, bookingVisibility: "none", bookingEvidence: [], bookingProvider: "" };

  const hidden = /display\s*:\s*none|visibility\s*:\s*hidden|aria-hidden\s*=\s*["']?true/.test(aroundFirstBooking);
  if (hidden) return { hasBooking: true, bookingVisibility: "hidden", bookingEvidence: evidence, bookingProvider: provider };

  const subflow = normalizedLinks.some((l) => {
    if (!BOOKING_PATH_PATTERNS.some((p) => l.includes(p))) return false;
    try {
      const target = new URL(l, url);
      const base = new URL(url);
      return target.hostname !== base.hostname;
    } catch {
      return false;
    }
  });
  if (subflow) return { hasBooking: true, bookingVisibility: "subflow", bookingEvidence: evidence, bookingProvider: provider };

  if (BOOKING_TEXT_PATTERNS.some((p) => earlyChunk.includes(p)) || /<header|<nav|hero|cta|prenota/.test(earlyChunk)) {
    return { hasBooking: true, bookingVisibility: "above_fold", bookingEvidence: evidence, bookingProvider: provider };
  }
  return { hasBooking: true, bookingVisibility: "below_fold", bookingEvidence: evidence, bookingProvider: provider };
}

export function detectWhatsapp(htmlLower: string, links: string[]): { hasWhatsapp: boolean; evidence: string[] } {
  const evidence: string[] = [];
  const bag = `${htmlLower}\n${links.join("\n")}`.toLowerCase();
  for (const p of WHATSAPP_PATTERNS) {
    if (bag.includes(p)) evidence.push(`wa:${p}`);
  }
  return { hasWhatsapp: evidence.length > 0, evidence: [...new Set(evidence)] };
}

export function detectChatbot(htmlLower: string): { hasChatbot: boolean; provider: string; evidence: string[] } {
  const evidence: string[] = [];
  let provider = "";
  for (const p of CHATBOT_PROVIDERS) {
    if (p.re.test(htmlLower)) {
      if (!provider) provider = p.name;
      evidence.push(`chat:${p.name}`);
    }
  }
  return { hasChatbot: evidence.length > 0, provider, evidence: [...new Set(evidence)] };
}

async function fetchWebsiteSignals(website: string): Promise<{
  hasWhatsapp: boolean;
  whatsappEvidence: string[];
  hasBooking: boolean;
  bookingVisibility: "above_fold" | "below_fold" | "hidden" | "subflow" | "none";
  bookingProvider: string;
  bookingEvidence: string[];
  hasIndirectBooking: boolean;
  siteStructureType: "single_site" | "multi_site" | "hub_gateway";
  funnelComplexity: "simple" | "multi_step" | "fragmented";
  hasFlowBooking: boolean;
  hasChatbot: boolean;
  chatbotProvider: string;
  chatbotEvidence: string[];
  hasContactForm: boolean;
  email: string;
  emailQuality: "high" | "medium" | "low" | "none";
  validEmails: string[];
  invalidEmailReason: string;
  checkedUrls: string[];
  evidenceLevel: "high" | "medium" | "low";
}> {
  if (!website) return {
    hasWhatsapp: false, whatsappEvidence: [], hasBooking: false, bookingVisibility: "none", bookingProvider: "", bookingEvidence: [], hasIndirectBooking: false,
    siteStructureType: "single_site", funnelComplexity: "simple", hasFlowBooking: false,
    hasChatbot: false, chatbotProvider: "", chatbotEvidence: [], hasContactForm: false, email: "", emailQuality: "none", validEmails: [], invalidEmailReason: "no_website", checkedUrls: [], evidenceLevel: "low"
  };
  try {
    const res = await fetch(website, { redirect: "follow" });
    if (!res.ok) throw new Error("HTTP");
    const html = (await res.text()).slice(0, 250_000);
    const low = html.toLowerCase();
    const links = extractHrefLinks(low).map((l) => toAbsoluteUrl(website, l)).filter(Boolean);
    const { email, quality, validEmails, invalidReason } = extractCleanEmails(low, links);
    const bookingRe = /booking|prenot|book now|booknow|reserv|check-?in|check-?out|availability/;
    const indirectBookingRe = /booking\.com|expedia|airbnb|tripadvisor|trivago|agoda|hotels\.com|hrs\.com/;
    const bookingDetect = detectBookingReliably(low, links, website);
    const hasBooking = bookingDetect.hasBooking;
    const hasIndirectBooking = indirectBookingRe.test(low);
    const flow = await analyzeRealUserFlow(website, low, bookingRe, indirectBookingRe, links);
    const checkedSet = new Set<string>(flow.checkedUrls);
    const allHtmlChunks: string[] = [low];
    for (const probe of flow.probeUrls.slice(0, 8)) {
      try {
        checkedSet.add(probe);
        const rr = await fetch(probe, { redirect: "follow" });
        if (!rr.ok) continue;
        const h = (await rr.text()).slice(0, 180_000).toLowerCase();
        allHtmlChunks.push(h);
      } catch {
        continue;
      }
    }
    const mergedHtml = allHtmlChunks.join("\n");
    const mergedLinks = [...new Set(
      allHtmlChunks.flatMap((h) => extractHrefLinks(h).map((l) => toAbsoluteUrl(website, l)).filter(Boolean))
    )];
    const wa = detectWhatsapp(mergedHtml, mergedLinks);
    const chat = detectChatbot(mergedHtml);
    const combinedEmails = extractCleanEmails(mergedHtml, mergedLinks);
    const mergedBooking = detectBookingReliably(mergedHtml, mergedLinks, website);
    const bookingVisibility = flow.hasFlowBooking && !hasBooking ? "subflow" : bookingDetect.bookingVisibility;
    const pagesChecked = checkedSet.size;
    const evidenceLevel: "high" | "medium" | "low" =
      pagesChecked >= 3 ? "high" : pagesChecked >= 2 ? "medium" : "low";
    return {
      hasWhatsapp: wa.hasWhatsapp,
      whatsappEvidence: wa.evidence,
      hasBooking: mergedBooking.hasBooking || flow.hasFlowBooking,
      bookingVisibility: flow.hasFlowBooking && !mergedBooking.hasBooking ? "subflow" : bookingVisibility,
      bookingProvider: mergedBooking.bookingProvider || bookingDetect.bookingProvider,
      bookingEvidence: [...new Set([...bookingDetect.bookingEvidence, ...mergedBooking.bookingEvidence])],
      hasIndirectBooking,
      siteStructureType: flow.siteStructureType,
      funnelComplexity: flow.funnelComplexity,
      hasFlowBooking: flow.hasFlowBooking,
      hasChatbot: chat.hasChatbot,
      chatbotProvider: chat.provider,
      chatbotEvidence: chat.evidence,
      hasContactForm: /<form|contattaci|contact us/.test(low),
      email: combinedEmails.email || email,
      emailQuality: combinedEmails.quality || quality,
      validEmails: combinedEmails.validEmails.length ? combinedEmails.validEmails : validEmails,
      invalidEmailReason: combinedEmails.invalidReason || invalidReason,
      checkedUrls: [...checkedSet],
      evidenceLevel
    };
  } catch {
    return {
      hasWhatsapp: false, whatsappEvidence: [], hasBooking: false, bookingVisibility: "none", bookingProvider: "", bookingEvidence: [], hasIndirectBooking: false,
      siteStructureType: "single_site", funnelComplexity: "simple", hasFlowBooking: false,
      hasChatbot: false, chatbotProvider: "", chatbotEvidence: [], hasContactForm: false, email: "", emailQuality: "none", validEmails: [], invalidEmailReason: "fetch_error", checkedUrls: [], evidenceLevel: "low"
    };
  }
}

function extractHrefLinks(htmlLower: string): string[] {
  const links: string[] = [];
  const hrefRe = /href\s*=\s*["']([^"'#\s>]+)["']/gi;
  let m: RegExpExecArray | null = null;
  while ((m = hrefRe.exec(htmlLower)) !== null) {
    if (m[1]) links.push(m[1].trim());
  }
  return links;
}

function toAbsoluteUrl(base: string, link: string): string {
  try {
    return new URL(link, base).toString();
  } catch {
    return "";
  }
}

function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

async function analyzeRealUserFlow(
  website: string,
  homepageLower: string,
  bookingRe: RegExp,
  indirectBookingRe: RegExp,
  homepageLinks: string[]
): Promise<{
  siteStructureType: "single_site" | "multi_site" | "hub_gateway";
  funnelComplexity: "simple" | "multi_step" | "fragmented";
  hasFlowBooking: boolean;
  checkedUrls: string[];
  probeUrls: string[];
}> {
  try {
    const base = new URL(website);
    const baseRoot = rootDomain(base.hostname);
    const links = homepageLinks.length
      ? homepageLinks
      : extractHrefLinks(homepageLower).map((l) => toAbsoluteUrl(website, l)).filter(Boolean);

    const sameRootHosts = new Set<string>();
    const subdomainLinks: string[] = [];
    let crossRootCount = 0;
    for (const link of links) {
      try {
        const u = new URL(link);
        const r = rootDomain(u.hostname);
        if (r === baseRoot) {
          sameRootHosts.add(u.hostname.toLowerCase());
          if (u.hostname.toLowerCase() !== base.hostname.toLowerCase()) subdomainLinks.push(link);
        } else {
          crossRootCount += 1;
        }
      } catch {
        continue;
      }
    }

    let siteStructureType: "single_site" | "multi_site" | "hub_gateway" = "single_site";
    if (subdomainLinks.length >= 2) siteStructureType = "hub_gateway";
    else if (sameRootHosts.size > 1 || crossRootCount > 8) siteStructureType = "multi_site";

    let hasFlowBooking = bookingRe.test(homepageLower) || indirectBookingRe.test(homepageLower);
    const shouldProbe = siteStructureType !== "single_site" || links.some((l) =>
      BOOKING_PATH_PATTERNS.some((p) => l.toLowerCase().includes(p)) || /\/contatti|\/contact|\/prenota|\/camere|\/rooms/.test(l.toLowerCase())
    );
    const probes = [
        ...subdomainLinks,
        ...links.filter((l) => BOOKING_PATH_PATTERNS.some((p) => l.toLowerCase().includes(p))),
        ...links.filter((l) => /\/contatti|\/contact|\/prenota|\/camere|\/rooms|\/reservation/.test(l.toLowerCase()))
      ].slice(0, 8);
    const checkedUrls: string[] = [website];
    if (!hasFlowBooking && shouldProbe) {
      for (const probe of probes) {
        try {
          checkedUrls.push(probe);
          const rr = await fetch(probe, { redirect: "follow" });
          if (!rr.ok) continue;
          const h = (await rr.text()).slice(0, 160_000).toLowerCase();
          if (bookingRe.test(h) || indirectBookingRe.test(h)) {
            hasFlowBooking = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    let funnelComplexity: "simple" | "multi_step" | "fragmented" = "simple";
    if (siteStructureType === "hub_gateway") funnelComplexity = "fragmented";
    else if (siteStructureType === "multi_site") funnelComplexity = "multi_step";
    return { siteStructureType, funnelComplexity, hasFlowBooking, checkedUrls: [...new Set(checkedUrls)], probeUrls: probes };
  } catch {
    return {
      siteStructureType: "single_site",
      funnelComplexity: "simple",
      hasFlowBooking: bookingRe.test(homepageLower),
      checkedUrls: [website],
      probeUrls: []
    };
  }
}

function isValidBusinessEmail(email: string): boolean {
  const e = email.toLowerCase().trim();
  if (!e || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return false;
  if (/[\/?&=()[\]{}]/.test(e)) return false;
  if (e.length > 80) return false;
  return !INVALID_EMAIL_PATTERNS.some((p) => e.includes(p));
}

function emailQuality(email: string): "high" | "medium" | "low" | "none" {
  if (!email) return "none";
  const e = email.toLowerCase();
  if (/(booking|reserv|prenot)/.test(e)) return "high";
  if (/^info@|^contact@|^office@|^hello@/.test(e)) return "medium";
  if (/@gmail\.|@hotmail\.|@outlook\.|@yahoo\./.test(e)) return "low";
  return "medium";
}

export function extractCleanEmails(htmlLower: string, links: string[]): {
  email: string;
  quality: "high" | "medium" | "low" | "none";
  validEmails: string[];
  invalidReason: string;
} {
  const candidates: string[] = [];

  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#\s>]+)/gi;
  let m: RegExpExecArray | null = null;
  while ((m = mailtoRe.exec(htmlLower)) !== null) {
    const addr = decodeURIComponent((m[1] || "").trim()).replace(/^mailto:/i, "");
    if (addr) candidates.push(addr);
  }

  const rawMatches = htmlLower.match(EMAIL_RE_GLOBAL) || [];
  for (const c of rawMatches) candidates.push(c);
  for (const l of links) {
    const m = l.toLowerCase().match(EMAIL_RE_GLOBAL) || [];
    for (const c of m) candidates.push(c);
  }

  const unique = [...new Set(candidates.map((c) => c.toLowerCase()))].filter(isValidBusinessEmail);
  if (!unique.length) return { email: "", quality: "none", validEmails: [], invalidReason: candidates.length ? "invalid_pattern_or_asset_like" : "not_found" };

  const scored = unique.map((e) => {
    const q = emailQuality(e);
    const score = q === "high" ? 3 : q === "medium" ? 2 : q === "low" ? 1 : 0;
    return { e, q, score };
  }).sort((a, b) => b.score - a.score);

  return { email: scored[0].e, quality: scored[0].q, validEmails: unique, invalidReason: "" };
}

function inferBusinessSize(name: string, reviews: number, types: string[]): BusinessSize {
  const n = name.toLowerCase();
  const t = types.join(" ").toLowerCase();
  const enterpriseWords = /(grand hotel|palace|resort|spa resort|collection|hilton|marriott|best western|nh |holiday inn)/;
  if (enterpriseWords.test(n) || reviews > 1800) return "enterprise";
  if (reviews > 700 || /(resort|conference|4 stelle|5 stelle)/.test(`${n} ${t}`)) return "large";
  if (reviews > 180) return "medium";
  return "small";
}

function inferOpportunity(
  hasWebsite: boolean,
  hasChatbot: boolean,
  hasWhatsapp: boolean,
  hasBooking: boolean,
  bookingVisibility: "above_fold" | "below_fold" | "hidden" | "subflow" | "none"
): ProductOpportunity {
  if (!hasWebsite) return "website_only";
  const bookingWeak = !hasBooking || bookingVisibility === "below_fold" || bookingVisibility === "hidden" || bookingVisibility === "subflow";
  const missing = Number(!hasWhatsapp) + Number(!hasChatbot) + Number(bookingWeak);
  if (missing >= 3) return "both_strong";
  if (missing >= 2) return "zirel_strong";
  if (missing >= 1) return "zirel_medium";
  return "skip";
}

function generateCallScript(leadName: string, pain: string, traffic: string): string {
  return `Ciao, ti rubo 20 secondi: ho visto ${leadName}. ${pain} ${traffic} Ti va se ti faccio vedere una demo rapida di Zirel?`;
}

interface ZirelClassification {
  callPriority: Lead["callPriority"];
  priority: Lead["priority"];
  detectedPain: string;
  proofSignal: string;
  hookType: Lead["hookType"];
  urgencyReason: string;
  strongProof: boolean;
}

export function classifyLeadForZirel(params: {
  inCity: boolean;
  hasWebsite: boolean;
  hasWhatsapp: boolean;
  hasBooking: boolean;
  bookingVisibility: "above_fold" | "below_fold" | "hidden" | "subflow" | "none";
  hasIndirectBooking: boolean;
  siteStructureType: "single_site" | "multi_site" | "hub_gateway";
  funnelComplexity: "simple" | "multi_step" | "fragmented";
  hasFlowBooking: boolean;
  hasChatbot: boolean;
  hasContactForm: boolean;
  onlyLandline: boolean;
  reviews: number;
  keyword: string;
  businessSize: BusinessSize;
  businessRelevance: "core" | "non_core";
  categoryFit: "core" | "semi_core" | "borderline" | "non_core";
  evidenceLevel: "high" | "medium" | "low";
}): ZirelClassification {
  const {
    inCity, hasWebsite, hasWhatsapp, hasBooking, bookingVisibility, hasIndirectBooking, siteStructureType, funnelComplexity, hasFlowBooking, hasChatbot, hasContactForm, onlyLandline, reviews, keyword, businessSize, businessRelevance, categoryFit, evidenceLevel
  } = params;
  const strongProof = !hasBooking && !hasFlowBooking && !hasWhatsapp && onlyLandline && !hasIndirectBooking;
  const missingBits = [
    !hasWhatsapp ? "no whatsapp link" : "",
    !hasBooking ? "no booking link" : "",
    hasFlowBooking ? "booking in subflow" : "",
    hasIndirectBooking ? "indirect ota booking" : "",
    hasBooking && bookingVisibility === "below_fold" ? "booking below fold" : "",
    hasBooking && bookingVisibility === "hidden" ? "booking hidden" : "",
    !hasChatbot ? "no chatbot" : "",
    onlyLandline ? "only landline" : "",
    hasContactForm && !hasWhatsapp && !hasBooking ? "contact form only" : ""
  ].filter(Boolean);
  const proofSignal = missingBits.length ? missingBits.join(", ") : "contatto digitale non immediato";

  let detectedPain = "Contatto principale via telefono, senza canali immediati visibili per richieste rapide.";
  if (!hasWebsite) detectedPain = "Attivita senza sito ufficiale: acquisizione richieste debole.";
  else if (strongProof) detectedPain = "Solo numero fisso, senza WhatsApp e senza prenotazione diretta: rischio richieste perse fuori orario.";
  else if (siteStructureType !== "single_site" || funnelComplexity !== "simple") detectedPain = "Sito principale a passaggi multipli: l'utente deve scegliere tra strutture separate prima di arrivare alla richiesta/prenotazione.";
  else if (hasBooking && bookingVisibility === "below_fold") detectedPain = "Il bottone prenota e poco visibile (sotto scroll): rischio perdita richieste da mobile.";
  else if (hasBooking && bookingVisibility === "hidden") detectedPain = "Prenotazione presente ma poco accessibile: frizione alta nella conversione.";
  else if (!hasBooking && !hasWhatsapp) detectedPain = "Mancano WhatsApp e prenotazione diretta: attrito alto nel contatto.";
  else if (!hasBooking) detectedPain = "Manca prenotazione diretta: attrito nel passaggio richiesta->cliente.";
  else if (hasIndirectBooking && !hasWhatsapp) detectedPain = "Prenotazioni demandate a portali esterni, ma canale diretto rapido debole.";
  else if (onlyLandline) detectedPain = "Solo telefono fisso visibile: contatto meno rapido su mobile.";

  const urgencyReason =
    reviews > 250 ? `${reviews} recensioni: volume richieste molto alto.` :
    /(hotel|b&b|bb)/.test(keyword.toLowerCase()) ? "Business stagionale: picchi richiesta da gestire rapidamente." :
    "Canali immediati migliorabili: rischio richieste perse.";

  const hookType: Lead["hookType"] =
    strongProof ? "lost_leads" :
    !hasBooking ? "no_booking" :
    onlyLandline ? "friction_contact" :
    !hasWhatsapp ? "no_after_hours" :
    reviews > 100 ? "busy_staff" : "friction_contact";

  let callPriority: Lead["callPriority"] = "WARM";
  if (!inCity) callPriority = "SKIP";
  else if (
    businessSize === "small" &&
    siteStructureType === "single_site" &&
    funnelComplexity === "simple" &&
    !hasBooking &&
    !hasFlowBooking &&
    onlyLandline &&
    reviews >= 80
  ) callPriority = "SUPER_HOT";
  else if (strongProof && reviews >= 150) callPriority = "SUPER_HOT";
  else if ((strongProof && reviews >= 70) || (!hasBooking && onlyLandline && reviews >= 100)) callPriority = "HOT";
  else if (hasBooking && bookingVisibility !== "above_fold" && reviews >= 120) callPriority = "HOT";
  else if (!hasWebsite || (!hasBooking && reviews >= 40)) callPriority = "HOT";

  if (hasFlowBooking && callPriority === "SUPER_HOT") callPriority = "HOT";
  if (hasBooking && callPriority === "SUPER_HOT") callPriority = "HOT";
  if (funnelComplexity === "fragmented" && callPriority === "WARM") callPriority = "HOT";
  if ((siteStructureType === "multi_site" || funnelComplexity !== "simple") && callPriority === "SUPER_HOT") callPriority = "HOT";
  else if ((siteStructureType === "multi_site" || funnelComplexity !== "simple") && callPriority === "HOT") callPriority = "WARM";

  if (businessSize === "enterprise") {
    callPriority = callPriority === "SUPER_HOT" ? "WARM" : callPriority === "HOT" ? "WARM" : callPriority;
  } else if (businessSize === "large" && callPriority === "SUPER_HOT") {
    callPriority = "HOT";
  }
  if (businessRelevance === "non_core") {
    callPriority = callPriority === "SUPER_HOT" ? "WARM" : callPriority === "HOT" ? "WARM" : callPriority;
  }
  if (categoryFit === "non_core") callPriority = "SKIP";
  if (categoryFit === "borderline" && callPriority !== "SKIP") callPriority = "WARM";
  if (hasBooking && callPriority === "SUPER_HOT") callPriority = "HOT";
  if (evidenceLevel === "low" && callPriority === "SUPER_HOT") callPriority = "HOT";

  const priority: Lead["priority"] =
    !inCity ? "SKIP" :
    callPriority === "SUPER_HOT" || callPriority === "HOT" ? "HOT" :
    callPriority === "WARM" ? "WARM" : "SKIP";

  return { callPriority, priority, detectedPain, proofSignal, hookType, urgencyReason, strongProof };
}

export interface HybridParams {
  city: string;
  keyword: string;
  maxResults: number;
  mapsDepth: "fast" | "deep";
  mapsApiKey: string;
  zirelOnly?: boolean;
}

export async function runHybrid(params: HybridParams): Promise<Lead[]> {
  const places = await searchMapsPlaces(`${params.keyword} ${params.city}`, params.mapsApiKey, params.maxResults, params.mapsDepth === "deep");
  const leads: Lead[] = [];

  for (const p of places) {
    if (!isLikelyRelevant(p.name, params.keyword, p.types)) continue;
    const hasWebsite = Boolean(p.website);
    const websiteSignals = await fetchWebsiteSignals(p.website);

    const mobilePhone = isMobileIT(p.phoneRaw) ? p.phoneRaw : "";
    const landlinePhone = p.phoneRaw && !mobilePhone ? p.phoneRaw : "";
    const email = websiteSignals.email;

    const hasWhatsapp = websiteSignals.hasWhatsapp;
    const whatsappEvidence = websiteSignals.whatsappEvidence;
    const hasBooking = websiteSignals.hasBooking;
    const bookingVisibility = websiteSignals.bookingVisibility;
    const bookingProvider = websiteSignals.bookingProvider;
    const bookingEvidence = websiteSignals.bookingEvidence;
    const hasIndirectBooking = websiteSignals.hasIndirectBooking;
    const siteStructureType = websiteSignals.siteStructureType;
    const funnelComplexity = websiteSignals.funnelComplexity;
    const hasFlowBooking = websiteSignals.hasFlowBooking;
    const hasChatbot = websiteSignals.hasChatbot;
    const chatbotProvider = websiteSignals.chatbotProvider;
    const chatbotEvidence = websiteSignals.chatbotEvidence;
    const hasContactForm = websiteSignals.hasContactForm;
    const emailQualityValue = websiteSignals.emailQuality;
    const validEmails = websiteSignals.validEmails;
    const invalidEmailReason = websiteSignals.invalidEmailReason;
    const checkedUrls = websiteSignals.checkedUrls;
    const evidenceLevel = websiteSignals.evidenceLevel;
    const requiresManualReview = ((siteStructureType !== "single_site" || funnelComplexity !== "simple") && !hasFlowBooking) || evidenceLevel === "low";

    const onlyPhone = Boolean((mobilePhone || landlinePhone) && !email);
    const onlyLandline = Boolean(landlinePhone && !mobilePhone);

    const category = verticalWeight(params.keyword);
    const categoryFit = classifyCategoryFit(p.name, p.types, params.keyword);
    const businessSize = inferBusinessSize(p.name, p.reviews, p.types);
    const businessRelevance = businessRelevanceForHotelKeyword(p.name, p.types, params.keyword);
    const contactP = contactPriority(mobilePhone, landlinePhone, email);

    const missingChannelsArr = [
      !hasWhatsapp ? "no_whatsapp_link" : "",
      !hasChatbot ? "no_chatbot" : "",
      !hasBooking ? "no_booking_link" : "",
      onlyLandline ? "only_landline" : "",
      hasContactForm && !hasWhatsapp && !hasBooking ? "contact_form_only" : ""
    ].filter(Boolean);

    const zirelProblemScore = Math.max(0, Math.min(100,
      (!hasWhatsapp ? 15 : 0) +
      (!hasBooking && !hasFlowBooking ? 20 : bookingVisibility === "below_fold" ? 12 : bookingVisibility === "hidden" ? 15 : 0) +
      (hasIndirectBooking && !hasBooking ? 5 : 0) +
      (funnelComplexity === "fragmented" ? 15 : funnelComplexity === "multi_step" ? 8 : 0) +
      (!hasChatbot ? 10 : 0) +
      (onlyLandline ? 15 : 0) +
      (p.reviews > 120 ? 22 : p.reviews > 50 ? 15 : 5) +
      category.bonus +
      (category.seasonal === "HIGH" ? 10 : 0)
    ));

    const businessQuality = Math.min(100, Math.round((p.rating / 5) * 50 + Math.min(50, p.reviews / 4)));
    const contactability = mobilePhone ? 90 : landlinePhone ? 70 : email ? 60 : 20;
    const urgency = Math.min(100, Math.round((p.reviews > 80 ? 40 : 20) + (p.rating >= 4.3 ? 30 : 10) + (!hasWebsite ? 20 : 0)));
    const newWebsite = hasWebsite ? 0 : 90;
    const refresh = hasWebsite ? 60 : 0;
    const zirelFit = hasChatbot ? 15 : 75;
    const finalPriority = Math.round((businessQuality * 0.2) + (contactability * 0.2) + (urgency * 0.2) + (zirelProblemScore * 0.4));
    const moneyOpportunityScore = Math.max(0, Math.min(100,
      (p.reviews > 200 ? 40 : p.reviews > 100 ? 25 : p.reviews > 40 ? 15 : 5) +
      (p.rating > 4.4 ? 20 : p.rating > 4.1 ? 12 : 6) +
      (/(hotel|b&b|bb|estet|dent|fisio|parruc|medic|officin|nolegg)/.test(params.keyword.toLowerCase()) ? 20 : 0) +
      (!hasBooking && !hasFlowBooking ? 20 : 0) +
      (hasBooking && bookingVisibility !== "above_fold" ? 10 : 0) +
      (hasIndirectBooking ? -10 : 0) +
      (funnelComplexity === "fragmented" ? 8 : 0) +
      (onlyLandline ? 10 : 0)
    ));
    const inCity = new RegExp(params.city, "i").test(p.address);
    const buyerFitScore = Math.max(0, Math.min(100,
      (businessSize === "small" ? 35 : businessSize === "medium" ? 28 : businessSize === "large" ? 16 : 5) +
      (!hasIndirectBooking ? 25 : 10) +
      (!hasChatbot ? 15 : 5) +
      ((!hasBooking || bookingVisibility !== "above_fold") ? 15 : 5) +
      (inCity ? 10 : 0) +
      (businessRelevance === "core" ? 10 : -15) +
      (categoryFit === "core" ? 10 : categoryFit === "semi_core" ? 5 : categoryFit === "borderline" ? -10 : -25)
    ));
    const salesEaseScore = Math.max(0, Math.min(100,
      (businessSize === "small" ? 40 : businessSize === "medium" ? 28 : businessSize === "large" ? 12 : 4) +
      (!hasWebsite ? 30 : 0) +
      (siteStructureType === "single_site" && funnelComplexity === "simple" ? 20 : siteStructureType === "multi_site" ? -20 : -10) +
      ((!hasBooking && !hasFlowBooking && !hasWhatsapp) ? 20 : 8) +
      (businessRelevance === "core" ? 8 : -25) +
      (categoryFit === "core" ? 8 : categoryFit === "semi_core" ? 4 : categoryFit === "borderline" ? -8 : -30)
    ));

    const productOpportunity = inferOpportunity(hasWebsite, hasChatbot, hasWhatsapp, hasBooking, bookingVisibility);

    const classification = classifyLeadForZirel({
      inCity,
      hasWebsite,
      hasWhatsapp,
      hasBooking,
      bookingVisibility,
      hasChatbot,
      hasContactForm,
      onlyLandline,
      reviews: p.reviews,
      keyword: params.keyword,
      hasIndirectBooking,
      siteStructureType,
      funnelComplexity,
      hasFlowBooking,
      businessSize,
      businessRelevance,
      categoryFit,
      evidenceLevel
    });
    if (params.zirelOnly && classification.priority === "SKIP") continue;
    let detectedPain = classification.detectedPain;

    let openingLine = `Buongiorno, sono Niki. Ho visto ${p.name} e volevo proporti un miglioramento pratico per aumentare richieste e conversioni.`;
    const kw = params.keyword.toLowerCase();
    if (/b&b|bb|hotel/.test(kw)) {
      openingLine = `Buongiorno, sono Niki. Ho visto ${p.name}: non sembra esserci un canale immediato per gestire richieste fuori orario e domande pre-prenotazione.`;
    } else if (/estet/.test(kw)) {
      openingLine = `Buongiorno, sono Niki. Ho visto ${p.name}: quando siete occupati con i clienti, rischiate di perdere richieste senza un assistente automatico.`;
    } else if (/dent|odont/.test(kw)) {
      openingLine = `Buongiorno, sono Niki. Ho visto ${p.name}: possiamo filtrare automaticamente richieste, urgenze e appuntamenti prima del contatto umano.`;
    }

    const salesAngle = !hasWebsite
      ? "no_website_high_priority"
      : (!hasChatbot && !hasBooking ? "chatbot_opportunity" : "site_refresh_opportunity");

    const proofSignal = classification.proofSignal;
    const hookType = classification.hookType;
    const urgencyReason = classification.urgencyReason;
    const trafficSignal =
      p.reviews > 200 ? `${p.reviews} recensioni: traffico molto alto.` :
      p.reviews > 80 ? `${p.reviews} recensioni: traffico alto.` :
      p.reviews > 20 ? `${p.reviews} recensioni: attivita attiva.` :
      "Traffico non evidente da recensioni.";
    if (hasBooking && bookingVisibility === "above_fold") {
      detectedPain = "Prenotazione online presente: opportunita Zirel sulle richieste pre-booking, domande frequenti e contatti fuori orario.";
      openingLine = "Ciao, ti rubo 20 secondi — ho visto che avete gia la prenotazione online, ma volevo capire come gestite le domande prima del booking o fuori orario.";
    } else if (hasBooking && bookingVisibility === "below_fold") {
      detectedPain = "Prenotazione presente ma poco visibile: possibile frizione nel percorso utente, soprattutto da mobile.";
      openingLine = "Ciao, ti rubo 20 secondi — ho visto che la prenotazione c'e, ma non e subito evidente. Vi capita che i clienti chiamino o scrivano prima di prenotare?";
    } else if (siteStructureType !== "single_site" || funnelComplexity !== "simple") {
      openingLine = "Ciao, ti rubo 20 secondi — ho visto che il sito principale porta a piu strutture separate. Volevo capire se vi capita di perdere richieste in quel passaggio.";
    } else if (!hasWebsite) {
      openingLine = "Ciao, ti rubo 20 secondi — ho visto che su Google avete traffico, ma non sembra esserci un sito ufficiale che raccolga richieste in modo strutturato.";
    }
    const callScript = generateCallScript(p.name, detectedPain, trafficSignal);

    let nextAction = nextActionFor(contactP);
    if (classification.callPriority === "SUPER_HOT") nextAction = mobilePhone ? "test_whatsapp" : "call_now_high_priority";
    else if (classification.callPriority === "HOT" && nextAction === "call_now_low_priority") nextAction = "call_now_high_priority";
    if (siteStructureType === "multi_site" || funnelComplexity !== "simple") nextAction = "manual_review";
    if (businessRelevance === "non_core") nextAction = "manual_review";
    if (requiresManualReview) nextAction = "manual_review";
    if (evidenceLevel === "low") nextAction = "manual_review";
    if (categoryFit === "borderline") nextAction = "manual_review";

    const whyThisLeadIsSellable = [
      categoryFit === "core" ? "categoria ricettiva core" : `categoria ${categoryFit}`,
      hasBooking ? `booking ${bookingVisibility}` : "no booking verificato",
      hasWhatsapp ? "whatsapp presente" : "whatsapp assente",
      hasChatbot ? `chatbot ${chatbotProvider || "presente"}` : "chatbot assente",
      `reviews:${p.reviews}`,
      `size:${businessSize}`
    ].join("; ");

    leads.push({
      source: hasWebsite ? "maps_site" : "maps_no_site",
      businessName: p.name,
      website: p.website,
      mobilePhone,
      landlinePhone,
      email,
      emailQuality: emailQualityValue,
      owner: "",
      cityMatchScore: inCity ? 85 : 20,
      fitScore: 75,
      refreshOpportunityScore: refresh,
      salesAngle,
      contactPriority: contactP,
      outreachTemplate: `Ciao ${p.name}, possiamo aiutarti a gestire richieste e prenotazioni con Zirel su www.zirel.org.`,
      reasonFlags: `maps_rating:${p.rating}; maps_reviews:${p.reviews}; ${missingChannelsArr.join(",")}`,
      address: p.address,
      mapsUrl: p.mapsUrl,
      productOpportunity,
      zirelFitScore: zirelFit,
      websiteRefreshScore: refresh,
      newWebsiteScore: newWebsite,
      urgencyScore: urgency,
      contactabilityScore: contactability,
      businessQualityScore: businessQuality,
      finalPriorityScore: finalPriority,
      nextAction,
      reasonSummary: detectedPain,
      openingLine,
      zirelProblemScore,
      detectedPain,
      missingChannels: missingChannelsArr.join("|"),
      hasWhatsapp,
      whatsappEvidence: whatsappEvidence.join("|"),
      hasBooking,
      bookingVisibility,
      bookingProvider,
      bookingEvidence: bookingEvidence.join("|"),
      hasIndirectBooking,
      siteStructureType,
      funnelComplexity,
      hasFlowBooking,
      requiresManualReview,
      businessRelevance,
      businessSize,
      buyerFitScore,
      salesEaseScore,
      hasChatbot,
      chatbotProvider,
      chatbotEvidence: chatbotEvidence.join("|"),
      hasContactForm,
      onlyPhone,
      onlyLandline,
      reviewsCount: p.reviews,
      rating: p.rating,
      categoryFit,
      seasonalityFit: category.seasonal,
      priority: classification.priority,
      callPriority: classification.callPriority,
      moneyOpportunityScore,
      proofSignal,
      hookType,
      urgencyReason,
      objectionAngle: !hasBooking ? "Niente booking immediato: rischio richieste perse." : "Canale risposta non automatizzato.",
      trafficSignal,
      callScript,
      validEmails: validEmails.join("|"),
      invalidEmailReason,
      checkedUrls: checkedUrls.join("|"),
      evidenceLevel,
      whyThisLeadIsSellable
    });
  }

  return leads;
}
