# Local Lead Finder (Mac M1)

Tool CLI per trovare siti locali per citta e raccogliere solo dati pubblici:
- sito web
- telefono
- email
- intestatario dominio (solo se disponibile via WHOIS pubblico)
- score automatico "sito outdated" (0-100)

## Installazione

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
python3 lead_finder.py --city "Milano" --keyword "dentista" --max-results 40 --with-whois --out milano_dentisti.csv
```

Output CSV con colonne:
- `business_name`
- `website`
- `mobile_phone` (solo cellulare, strict)
- `landline_phone` (solo informativo)
- `email`
- `owner`
- `city_match_score` (0-100)
- `fit_score` (0-100)
- `refresh_opportunity_score` (0-100, piu alto = piu opportunita di refresh)
- `reason_flags` (motivi diagnostici e segnali principali)

Il CSV include solo righe con almeno un contatto reale (`mobile_phone` o `email`) e scarta domini generici/social.
Pipeline:
- Fase A: discovery + filtro qualità + shortlist top 15 candidati
- Fase B: scoring refresh approfondito solo sui candidati validi

## Note importanti (legali/qualita)

- I contatti estratti sono solo quelli pubblici trovati sul sito.
- Con GDPR e privacy by design, usa i dati solo per outreach B2B legittimo e trasparente.
- Molti domini hanno WHOIS oscurato (privacy proxy), quindi `owner` spesso sara vuoto.
- Lo score e euristico e va usato per priorita commerciale, non come verita assoluta.
- Per produzione conviene aggiungere deduplica avanzata e coda asincrona per crawling piu robusto.

## Modalita

Default consigliato: `hybrid` (Maps-first + analisi siti da Maps).

`run_lead_finder.command` salva la API key una sola volta in `~/.lead_finder.env`.

Modalita disponibili:
- `hybrid` (default): incrocia Maps e sito web
- `web`: solo scouting web
- `maps`: solo attività Maps senza sito

## Modalita Google Maps (attivita senza sito)

Richiede Places API key:
```bash
export GOOGLE_MAPS_API_KEY="la_tua_api_key"
python3 lead_finder.py --mode maps --city "Riccione" --keyword "dentista" --max-results 40 --out riccione_maps_missing_site.csv
```

## Diagnostica Google API Key

Per testare velocemente la key senza eseguire tutto lo scouting:
```bash
python3 lead_finder.py --check-google-key --city "Rimini" --keyword "estetista"
```

## One Tap Launcher (TypeScript)

Doppio click su:
- `/Users/bronovito/Documents/New project/run_zirel_ts.command`

Il launcher:
- chiede citta/keyword
- salva API key una sola volta in `~/.lead_finder.env`
- esegue `npm run check`, `npm run build`, e run `hybrid`
- genera un solo CSV operativo
