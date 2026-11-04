# WORK_STATUS

Opdateret: 4. november 2026 (beregning som skolens timeopgørelse + spørgsmål under tandhjulet).

## Verificeret status

- `npm run typecheck` og `npm run build` er rene.
- 4. nov.: Timeberegningen følger `Fernando_Mora_timer_26_27.docx`: kontrakt − 1 t orientering,
  25 min forberedelse pr. time, lørdage × 1,25 fordelt på 18 lørdage / 41 uger, timebank pr. uge
  og sæson, afrunding til hele minutter i hvert trin. FM's tal genskabes præcist (unit-test).
  Datamodel version 4 (kontrakttimer, orientering og lørdage pr. lærer, "uden forberedelse" pr.
  klasse, svar på spørgsmål, mulig 9. kolonne). Åbne spørgsmål besvares med ét klik under
  tandhjulet → Spørgsmål.
- 3. nov.: En flytning giver aldrig "ingen tidsregel" længere. Tiden kommer fra holdets egen tid
  samme dag, holdets tid i samme dagdel en anden dag eller dagdelens standardtid (redigerbar).
  En manuel rettelse af tiden gør klassen til en "anden slags" blok med egne tider.
  Datamodellen er version 3 (standardtider) og migreres automatisk.
- `npm test`: 55 enheds- og API-tests består. De dækker:
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
- `npm run test:e2e`: 15 Playwright-tests i Chromium består. De dækker SPEC.md's kontrolpunkter 1–13
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

1. Besvar spørgsmålene under tandhjulet → Spørgsmål, og udfyld kontrakttimer for de øvrige lærere.
2. Flet grenen `design-og-robusthed` ind i `main`, og sæt appen online (README → Online drift).
3. Afprøv på en rigtig iPad i Safari.
