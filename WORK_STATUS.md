# WORK_STATUS

Opdateret: 2. november 2026 (version 2: enklere skematavle og automatiske tider fra KDS-arket).

## Verificeret status

- `npm run typecheck` og `npm run build` er rene.
- `npm test`: 51 enheds- og API-tests består. De dækker:
  - eksempel A–D
  - fælles klasser uden dobbelttælling
  - morgensamlingens timer og forberedelse
  - tidsregler: entydig, valg og ingen regel
  - flytning mandag → fredag → lørdag med ny varighed og nyt tillæg
  - egne tider ved alle flytninger
  - genberegning ved ændret regel
  - kildeudtrækket (stikprøver mod KDS-celler, ingen opdigtede tider)
  - migrering fra version 1, også ved serverstart og ved import
  - konflikter med morgensamlingen
  - adgang, versionskontrol, backup og sikkerhed
- `npm run test:e2e`: 14 Playwright-tests i Chromium består. De dækker SPEC.md's kontrolpunkter 1–13
  plus konflikter, ændret tidsregel, lagringsfejl, forældet vindue, læseadgang og en tæt uge
  (67 klasser fra kilden).
- Skærmbilleder er gennemset ved 1440×900, 1366×768, iPad vandret 1180×820 (touch) og 390 px.

## Kendte begrænsninger og åbne spørgsmål til kilden

Se også Indstillinger → Tidsregler og morgensamling → Kilde, og `docs/tidstabel-kds.md`.

1. Kilden har 9 rum, appen 8 kolonner. K-salen mangler, så KDS!P5, P6 og P29 kan ikke placeres
   ved indlæsning af ugeskemaet. Deres tidsregler findes.
2. Morgensamlingen angiver "DT/CO". Appen tilknytter én lærer, og ingen er forvalgt.
3. "÷ p" er ikke forklaret og bruges ikke i beregningen.
4. Undergrupper torsdag morgen er oprettet som egne hold.
5. Hold 1 findes ikke i KDS og har derfor ingen tidsregler.
6. Docker-imaget og online drift er stadig ikke sat op (kræver hosting). Kun Chromium er testet.

## Næste skridt

1. Få afklaret punkt 1–3 ovenfor, og ret tidstabellen eller kolonnerne, hvis det er nødvendigt.
2. Flet grenen `design-og-robusthed` ind i `main`, og sæt appen online (README → Online drift).
3. Afprøv på en rigtig iPad i Safari.
