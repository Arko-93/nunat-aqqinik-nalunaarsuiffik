# Research: West Greenland official hydro follow-on path

**Ticket:** [#7](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/7) · Map: [#3](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/3)  
**Question:** What official hydrographic chart products cover West Greenland (Qaarsut→Kullorsuaq), who licenses them, and what would it take to move from open-grid depth to chart-grade authority later — without blocking v1?  
**Date:** 2026-08-05

## Recommendation (one-liner)

Treat **Geodatastyrelsen (Danish Geodata Agency / GST)** as the CHS equivalent for Greenland; keep v1 on open-grid depth with a non-nav disclaimer; later pursue a **GST royalty / reproduction licence** (or corridor depth-data purchase) for chart-grade layers — never ship GST ENC/raster as free open tiles.

## Authority (CHS equivalent)

| Role | Body | Primary source |
|---|---|---|
| Official hydrographic office for Greenland waters | **Danish Geodata Agency** (Geodatastyrelsen, GST / DGA) | GST Danish Hydrographic Office pages[^gst-dho][^gst-office] |
| Statutory monopoly on producing søkort for Denmark, Faroe Islands, and Greenland waters | Minister under *Lov om stedbestemt information* § 5(2); exercised by GST | Retsinformation LOV nr 380 af 26/04/2017[^lov-380]; GST terms[^gst-terms] |
| Copyright / public redistribution control | GST must grant permission before charts are sold, rented, lent, or otherwise distributed to the public | GST terms[^gst-terms]; GST anvendelse page[^gst-anvendelse] |
| IHO Arctic reporting | Kingdom of Denmark national reports to ARHC | IHO ARHC14 Denmark national report (2024)[^arhc14] |
| Greenland mariner portal | navigation.gl (GST-backed planning guidance) | eng.navigation.gl[^nav-gl] |

Supreme Court confirmation of GST chart copyright: judgement of **6 February 2014**, cited on GST terms pages.[^gst-terms][^gst-anvendelse]

**Not the Greenland authority:** Canadian Hydrographic Service (CHS) is Canada’s HO — useful as product analogy (Siku), not as a licensor for Greenland waters.

## Products that cover West Greenland

Corridor context: Qaarsut (Uummannaq area) north through Upernavik to Kullorsuaq. Exact cell/chart IDs are on GST’s interactive index (not a static public list in prose).[^gst-paper][^gst-enc]

| Product | Format / channel | Coverage notes for corridor | Use class |
|---|---|---|---|
| **Official paper charts (POD)** | Print-on-Demand via GST distributors (Weilbach, Todd Navigation, etc.)[^prisliste] | ~105 Greenland paper charts; coastal/approach/harbour scales[^gst-paper][^arhc14] | Navigation (with corrections) |
| **Official ENC (S-57)** | IC-ENC → Value Added Resellers (VAR) for ECDIS[^gst-enc][^ic-enc] | Greenland ENC portfolio ~231 cells (ARHC14 2024); **not full coverage** of Greenland waters[^gst-enc][^arhc14] | SOLAS / ECDIS navigation |
| **2025 Greenland ENC production** | Same ENC channel | New/updated ENC around **Upernavik, Uummannaq, Sisimiut** — directly overlaps Qaarsut–Upernavik; Kullorsuaq needs index check[^gst-2025] | Navigation |
| **Limited Content ENCs** | Same ENC channel | Multibeam-only depth + modern coastline + AtoN; mainly SW Greenland acceleration programme; older paper charts may still be needed outside multibeam areas[^gst-limited][^nav-gl] | Navigation (with caveats) |
| **Digital paper charts** | TIFF / GeoTIFF / PDF from GST (`policyogsalg@gst.dk`)[^gst-paper][^prisliste] | Whole Greenland pack priced as 104 charts[^prisliste] | **Non-navigation**, typically internal / licensed |
| **Shore-based vector (ENC cells)** | `.000` / WGS84 from GST[^prisliste] | Per-cell or all Greenland cells[^prisliste] | **Non-navigation** shore use; “må ikke anvendes til navigation” |
| **Depth / survey data** | Approved sale; Defence security clearance required before transfer[^gst-depth] | Survey polygons for Greenland published as GeoPackage overview (updated daily)[^gst-depth] | Raw bathymetry; purpose-approved |
| **Nautical publications / harbour pilot** | GST + navigation.gl / grønlandske havnelods[^nav-gl][^arhc14] | Complements charts | Planning / publications |
| **Denmark’s Depth Model (DDM)** | Free via Dataforsyningen | **Denmark EEZ only** (50 m grid) — **not Greenland**[^gst-depth][^gst-dho] | Out of scope for corridor |

Survey priority (ARHC14): Priority 1 inland routes on Greenland’s west coast from Nunap Isua to **Upernavik** — aligns with the southern/mid corridor; Kullorsuaq is north of that stated Priority 1 endpoint and may lag.[^arhc14]

## Licensing and cost shape (2026 price list)

GST charts and marine data are **not open / frikøbt**.[^gst-repro] Contact: `policyogsalg@gst.dk` (also `soe_policy@gst.dk` / `soe@gst.dk` on English pages).[^gst-terms][^prisliste]

### Published list prices (ex VAT; Prisliste 2026)[^prisliste]

| Purchase | Price (DKK ex moms) | Notes |
|---|---|---|
| One digital paper chart (private, one user) | 760 | Raster TIFF/GeoTIFF/PDF |
| One digital paper chart (business) | 2,450 | Same |
| All Greenland digital paper charts (104) | 120,100 / year | Updates included for one year; **not for navigation**; limited reproduction permission may accompany whole-area buy |
| One ENC cell, vector, shore-based | 2,450 | No update in single-cell price; **not for navigation** |
| All Greenland vector cells | 120,100 / year | Weekly updates option with whole-area buy |
| Depth data | 55 / km² + 935 / started hour delivery | Requires approval of customer + purpose; Defence clearance[^gst-depth][^prisliste] |
| Reproduction / royalty for excerpts, marketing, websites, derived products | **Case-by-case** | Not a fixed public tariff[^prisliste][^gst-repro] |

### Paths relevant to a web app

1. **Reproduction permission (*reproduktionstilladelse*)**  
   Needed to reuse chart excerpts on a website, article, video, etc. Usually limited excerpts, time-bounded, individually priced.[^gst-repro][^gst-erhverv]  
   → Fits small static excerpts; **poor fit** for interactive nationwide or corridor depth tiling.

2. **Royalty-based licence for unofficial derived products**  
   Company reworks GST data into its own product and sells to end users; pays royalties; receives weekly updates. GST does **not** QA the third-party product.[^gst-uofficiel]  
   Current licensees include (examples) Garmin Italy, Navico, Skippo AB, Orca Technologies, Chartworld, Mapmedia.[^gst-uofficiel]  
   → Closest analogue to “Siku uses CHS” for a consumer web/app with depth from official data.

3. **Shore-based internal vector/raster purchase**  
   Explicit non-navigation; whole Greenland ~120k DKK/year. List text frames this as internal business use; public web redistribution still needs GST permission.[^prisliste][^gst-erhverv]

4. **IC-ENC VAR (ECDIS ENC) or DP (non-ECDIS navigation)**  
   Official ENC folio including Denmark–Greenland folios; navigation end-user licensing via channel partners — **not** a free tile CDN for a Decision Geography map.[^ic-enc][^gst-enc]

5. **Depth-data purchase for corridor surveys**  
   Possible raw input to meter bands, but: purpose approval, Defence clearance, km² cost, and still no automatic right to present as a navigational chart.[^gst-depth]

### Redistribution constraints (web app)

- GST monopoly + copyright → **no silent redistribution** of søkort specimens or public display without permission.[^gst-terms][^lov-380]
- Official ENC for navigation goes through IC-ENC; unofficial derived products need a GST licence agreement.[^gst-erhverv][^gst-uofficiel]
- Even after purchase, shore-based vector/raster carries **“must not be used for navigation”**.[^prisliste]
- Chart-grade UI claims would require both **licence terms** and product **disclaimer** language (open-grid v1 already planned as non-nav).

## What it takes later (without blocking v1)

v1 should stay on best **open bathymetry grid** (e.g. EMODnet is what GST itself points to as free/low-res) plus clear “not for navigation” copy.[^gst-depth]

### Cost / process unknowns (must ask GST)

1. Whether a **public web map** (family dogfood, free or paid) is allowed under reproduction vs requires a **royalty licence**.
2. Royalty rate, minimums, update obligations, attribution, and whether **depth-only derived tiles** (meter bands) are acceptable without full ENC symbology.
3. Exact ENC/paper cells for bbox ≈ Qaarsut→Kullorsuaq and whether Kullorsuaq is in modern ENC or still sparse / limited content.
4. Depth-data sale: Defence clearance timeline, which survey polygons exist along the corridor, and whether derived public tiles are in scope.
5. Whether partnering with an **existing GST licensee** (e.g. Skippo / Navico class) is cheaper than a direct licence.

### Recommended later ticket sequence

1. **Coverage inventory** — Pull GST ENC/paper web index + Greenland hydrographic survey GeoPackage; list cells/charts/survey polygons for the corridor bbox; note gaps at Kullorsuaq.
2. **Licence inquiry** — Email `policyogsalg@gst.dk` with product intent (non-nav Decision Geography depth bands vs chart overlay), corridor extent, and redistribution model; request quote path (reproduction vs royalty vs depth-data).
3. **Path decision** — Choose A) open-grid forever + disclaimer, B) licensed derived meter-band tiles, C) partner with existing licensee, or D) corridor depth-data buy only.
4. **Legal/product copy** — Separate tickets for disclaimer, CATZOC/quality messaging, and never claiming ECDIS/nav authority without ENC channel compliance.
5. **Implementation** — Only after written GST terms: ingest, tile build, update cadence, offline pack rights.

## Sources

[^gst-dho]: Danish Geodata Agency — Danish Hydrographic Office overview. https://eng.gst.dk/danish-hydrographic-office
[^gst-office]: Danish Geodata Agency — About the Danish Hydrographic Office. https://eng.gst.dk/about-us/offices/danish-hydrographic-office
[^gst-terms]: Danish Geodata Agency — Price list / terms (copyright, IC-ENC VAR). https://eng.gst.dk/danish-hydrographic-office/terms-and-prices
[^gst-anvendelse]: Geodatastyrelsen — Anvendelse af søkort og dybdedata. https://gst.dk/data-og-kort/soekort-og-marine-data/anvendelse-af-soekort-og-dybdedata
[^gst-repro]: Geodatastyrelsen — Reproduktionstilladelse. https://gst.dk/data-og-kort/koeb-af-data-og-kort/priser-og-vilkaar/reproduktionstilladelse
[^gst-uofficiel]: Geodatastyrelsen — Køb af uofficielle afledte produkter via licenskøbende tredjeparter. https://gst.dk/data-og-kort/koeb-af-data-og-kort/priser-og-vilkaar/koeb-af-uofficielle-afledte-produkter-
[^gst-erhverv]: Geodatastyrelsen — Køb af søkort og marine data (erhverv og myndigheder). https://gst.dk/data-og-kort/koeb-af-data-og-kort/koeb-af-soekort-og-marine-data/for-erhverv-og-myndigheder
[^gst-paper]: Danish Geodata Agency — Paper Charts (Greenland ~105 charts; digital TIFF/GeoTIFF/PDF). https://eng.gst.dk/danish-hydrographic-office/nautical-charts/paper-charts
[^gst-enc]: Danish Geodata Agency — Electronic Charts (ENC); Greenland not fully covered. https://eng.gst.dk/danish-hydrographic-office/nautical-charts/electronic-charts-enc
[^gst-limited]: Danish Geodata Agency — ENCs with limited content. https://eng.gst.dk/danish-hydrographic-office/greenland-waters/encs-with-limited-content
[^gst-2025]: Danish Geodata Agency — 2025 ENC production for Greenland (Upernavik, Uummannaq, Sisimiut). https://eng.gst.dk/about-us/news-archive/2025/2025-enc-production-for-greenland-released-new-nautical-charts-for-three-key-areas
[^gst-depth]: Danish Geodata Agency — Purchase of depth data and bathymetric data (incl. Greenland survey overview; DDM Denmark-only; EMODnet pointer). https://eng.gst.dk/danish-hydrographic-office/terms-and-prices/purchase-of-depth-data-and-bathymetric-data
[^prisliste]: Geodatastyrelsen — Prisliste for søkort og relaterede produkter (2026 PDF). Linked from https://eng.gst.dk/danish-hydrographic-office/terms-and-prices
[^lov-380]: Lov om stedbestemt information, LOV nr 380 af 26/04/2017, § 5. https://www.retsinformation.dk/eli/lta/2017/380
[^arhc14]: IHO ARHC14 (2024) — National Report of Denmark (survey priorities; 231 Greenland ENCs; paper chart counts). https://iho.int/uploads/user/Inter-Regional%20Coordination/RHC/ARHC/ARHC14/ARHC14_2024_B3A_EN_National%20Report%20DK.pdf
[^nav-gl]: Navigation.gl — Navigational Planning (GST as publisher; Limited Content ENC guidance; IHO catalogue pointer). https://eng.navigation.gl/navigational-planning
[^ic-enc]: IC-ENC — Distribution (VAR for ECDIS; DP for non-ECDIS). https://www.ic-enc.org/distribution
