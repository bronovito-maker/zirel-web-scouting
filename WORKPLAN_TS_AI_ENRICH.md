# Workplan - Lead Finder TS + AI Enrich (Gemini)

## Obiettivo
Trasformare il tool da semplice finder a macchina commerciale:
- trovare lead realmente utili
- assegnare priorità di vendita
- preparare apertura chiamata/messaggio
- distinguere opportunità `zirel`, `website_refresh`, `new_website`, `both`

## KPI iniziali
- Precisione lead utili >= 60%
- Almeno 30 lead/giorno con `next_action` valorizzato
- `call_list.csv` pronto all'uso senza pulizia manuale

## Fase 0 - Criteri di successo
1. Definire soglie di priorità:
   - `final_priority_score >= 70` -> `call_now`
   - `50-69` -> `manual_review`
   - `< 50` -> `skip`
2. Definire verticali target iniziali:
   - estetista, dentista, fisioterapista, parrucchiere, b&b/hotel, ristorante

## Fase 1 - Fondamenta TypeScript
1. Setup progetto TS:
   - Node + TypeScript + tsx
   - zod, undici/axios, cheerio, fast-csv
2. Struttura:
   - `src/cli.ts`
   - `src/providers/maps.ts`
   - `src/providers/web.ts`
   - `src/scoring/*.ts`
   - `src/enrich/gemini.ts`
   - `src/export/csv.ts`
   - `src/models.ts`
3. Config:
   - `.env` + `~/.lead_finder.env`
   - `GOOGLE_MAPS_API_KEY`
   - `GEMINI_API_KEY`

## Fase 2 - Pipeline Hybrid (default)
1. Maps-first:
   - Text Search + Details
   - paginazione con circuit breaker
2. Branch A (no sito):
   - candidato `new_website`
3. Branch B (sito presente):
   - crawl homepage + `/contatti`, `/contattaci`, `/dove-siamo`
4. Merge + dedup:
   - per `place_id` e dominio

## Fase 3 - Scoring commerciale separato
Calcolare campi:
- `zirel_fit_score`
- `website_refresh_score`
- `new_website_score`
- `urgency_score`
- `contactability_score`
- `business_quality_score`
- `final_priority_score`

Derivare:
- `product_opportunity`: `zirel | website_refresh | new_website | both`
- `next_action`: `call_now | whatsapp_first | email_first | skip | manual_review`

Generare:
- `reason_summary`
- `opening_line`

## Fase 4 - Rilevazioni sito orientate vendita
Campi tecnici/commerciali:
- `has_https`
- `mobile_friendly_guess`
- `has_contact_form`
- `has_whatsapp_link`
- `has_booking_link`
- `has_chat_widget`
- `cms_detected`
- `broken_links_count`
- `website_issues`
- `contact_gaps`
- `detected_tools`

Regola business:
- se c'e solo WhatsApp widget -> NON scartare (opportunita Zirel)
- se c'e chatbot competitor (Intercom/Drift/Tawk/Livechat ecc.) -> de-prioritizzare o scartare

## Fase 5 - `--ai-enrich` con Gemini
1. Flag CLI:
   - `--ai-enrich`
   - `--ai-model`
   - `--ai-max`
2. Input lead per AI:
   - maps + audit sito + score
3. Output JSON (validato zod):
   - `reason_summary_ai`
   - `opening_line_ai`
   - `recommended_offer`
   - `priority_band`
4. Fallback:
   - se AI fallisce/rate limit -> testi rule-based
5. Cache:
   - hash lead (`place_id`/dominio) per ridurre costi

## Fase 6 - Export operativo
1. `leads_full.csv` con tutte le colonne
2. `call_list.csv` con campi essenziali:
   - `business_name, phone, city, product_opportunity, opening_line, reason_summary, priority, maps_url, website`
3. Ordinamento commerciale:
   1. `no_website_high_priority`
   2. `chatbot_opportunity`
   3. `site_refresh_opportunity`
   poi score desc

## Fase 7 - QA e tuning
1. Test su dataset reali per verticale
2. Metriche:
   - false positive rate
   - copertura contatti
   - tempo esecuzione (`fast` vs `deep`)
3. Tuning soglie per verticale

## Nota operativa
Default consigliato: `hybrid`.
`deep` attivo per verticali hospitality (hotel/b&b/ristoranti) quando serve copertura maggiore.
