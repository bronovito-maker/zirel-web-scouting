import { z } from "zod";

const textResultSchema = z.object({
  place_id: z.string(),
  name: z.string().optional(),
  formatted_address: z.string().optional(),
  rating: z.number().optional(),
  user_ratings_total: z.number().optional()
}).passthrough();

const textSearchSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
  next_page_token: z.string().optional(),
  results: z.array(textResultSchema).default([])
});

const detailsSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
  result: z.record(z.any()).optional()
});

export interface MapsPlace {
  placeId: string;
  name: string;
  website: string;
  phoneRaw: string;
  address: string;
  rating: number;
  reviews: number;
  mapsUrl: string;
  types: string[];
}

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return schema.parse(json);
}

async function placeDetails(placeId: string, apiKey: string): Promise<MapsPlace | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,website,formatted_phone_number,international_phone_number,formatted_address,rating,user_ratings_total,url,types");
  url.searchParams.set("key", apiKey);

  const payload = await fetchJson(url.toString(), detailsSchema);
  if (payload.status !== "OK" || !payload.result) return null;
  const r = payload.result;
  return {
    placeId,
    name: String(r.name ?? "").trim(),
    website: String(r.website ?? "").trim(),
    phoneRaw: String(r.international_phone_number ?? r.formatted_phone_number ?? "").trim(),
    address: String(r.formatted_address ?? "").trim(),
    rating: Number(r.rating ?? 0),
    reviews: Number(r.user_ratings_total ?? 0),
    mapsUrl: String(r.url ?? "").trim(),
    types: Array.isArray(r.types) ? r.types.map(String) : []
  };
}

export async function searchMapsPlaces(query: string, apiKey: string, maxResults: number, deep = false): Promise<MapsPlace[]> {
  const out: MapsPlace[] = [];
  const seen = new Set<string>();
  let pageToken = "";
  let pageCount = 0;
  const maxPages = deep ? 4 : 2;

  while (out.length < maxResults && pageCount < maxPages) {
    pageCount += 1;
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    if (pageToken) {
      await new Promise((r) => setTimeout(r, deep ? 1800 : 1200));
      url.searchParams.set("pagetoken", pageToken);
    } else {
      url.searchParams.set("query", query);
    }
    url.searchParams.set("key", apiKey);

    const payload = await fetchJson(url.toString(), textSearchSchema);
    if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
      if (payload.status === "INVALID_REQUEST" && pageToken) break;
      throw new Error(`Maps TextSearch: ${payload.status} ${payload.error_message ?? ""}`.trim());
    }

    for (const item of payload.results ?? []) {
      if (seen.has(item.place_id)) continue;
      seen.add(item.place_id);
      const details = await placeDetails(item.place_id, apiKey);
      if (!details) continue;
      out.push(details);
      if (out.length >= maxResults) break;
    }

    pageToken = payload.next_page_token ?? "";
    if (!pageToken) break;
  }

  return out;
}
