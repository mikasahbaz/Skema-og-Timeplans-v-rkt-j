# WORK_STATUS

Opdateret: 2. november 2026.

## Verificeret status

Første version er færdig i forhold til SPEC.md og kører lokalt. Følgende er kørt og bestået:

- `npm run typecheck` (klient + server) og `npm run build`.
- `npm test`: 37 enheds- og API-tests. Det omfatter eksempel A–D, 08.10–09.50 = 100 min,
  fredag→lørdag, tilføj/fjern anden lærer, manglende værdier ≠ 0, et indtastet 0 som gyldig værdi,
  konflikter, validering, forslag til ledig tid, kopi/del blok, adgang, 409 ved forældet version,
  serverens validering, persistens efter genstart, import/eksport og beskyttelse mod demodata.
- `npm run test:e2e`: 17 Playwright-tests i Chromium mod den byggede app. Det omfatter
  timeoverblik for eksempel A–D, oprettelse fra celle, genindlæsning, en anden browsersession,
  afvisning af ugyldige data, træk med mus inden for samme dagdel og til en anden dagdel
  (tidsvælger og annuller), touch-træk via CDP, Alt+træk-kopi, kopi via menu, konfliktdialog
  (annuller / behold), tastatur-flyt, fortryd og annuller fortryd, simuleret lagringsfejl med
  "Prøv igen", et forældet vindue, manglende satser, læseadgang uden skriveret og automatisk
  opdatering af læsevisningen.
- En ren `npm ci` → build → `npm prune --omit=dev` → start i en frisk kopi virker. Det er de
  samme trin som i Dockerfilen.
- Skærmbilleder i 1440×900, 1280×800 og iPhone 13 er gennemset (`docs/`).

## Ikke verificeret / begrænsninger

- **Docker-image er ikke bygget her.** Containeren kunne ikke nå npm-registret gennem
  sandkassens proxy. Dockerfilens trin er i stedet verificeret uden container (se ovenfor).
- **Ikke sat online.** Det kræver et hostingvalg og en konto (se README → Online drift).
- Kun testet i Chromium. Safari/iPad og Firefox er ikke afprøvet. Touch er testet med emulerede
  touch-events, ikke på en fysisk tablet.
- Fortryd-historikken gælder den aktuelle fane og nulstilles, når data hentes fra en anden
  session eller importeres.
- Stamdata (fag, hold, lærere) oprettes under Indstillinger. Der er ingen hurtig oprettelse direkte
  i blokredigeringen.

## Næste konkrete skridt

1. Vælg hosting med vedvarende disk, fx Render (`render.yaml`) eller en VPS med
   `docker compose`. Sæt `ADMIN_PASSWORD` (og evt. `VIEWER_PASSWORD`) og slå HTTPS til.
2. Byg Docker-imaget i et miljø med normal netadgang: `docker build -t ballet-ugeskema .`
3. Afprøv på en rigtig iPad og i Safari, især langt tryk + træk og panelets størrelse.
4. Indtast skolens rigtige satser, undervisningsuger og årsarbejdstimer, og tag en første backup.
