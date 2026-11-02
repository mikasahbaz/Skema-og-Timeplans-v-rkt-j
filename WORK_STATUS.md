# WORK_STATUS

Opdateret: 2. november 2026 (efter designgennemgang, stresstest og sikkerhedsgennemgang).

## Verificeret status

Første version er færdig i forhold til SPEC.md og kører lokalt. Følgende er kørt og bestået:

- `npm run typecheck` og `npm run build`.
- `npm test`: 43 enheds- og API-tests. De dækker beregningseksempel A–D, konflikter, validering,
  adgang, versionskontrol, persistens, import og demobeskyttelse. Desuden dækkes skift af
  adgangskode (gamle logins bliver ugyldige), en forfalsket rolle i cookien, login-spærring,
  versionshistorik, sikkerhedsheadere, danske fejlbeskeder og daglig backup.
- `npm run test:e2e`: 19 Playwright-tests i Chromium. Ud over de oprindelige forløb dækkes
  gendannelse af en tidligere version og at en besked aldrig blokerer en dialogknap.

### Designgennemgang (1280–1920 px)

Rettet:
- Alle 8 sale er synlige uden vandret rulning ved 1366, 1440 og 1920 px med timepanelet til højre.
- Timepanelet er bredere på store skærme, og dagstabellen klippes ikke længere.
- "+"-knappen dækker ikke længere lærerinitialer.
- Konfliktbeskederne vises på én linje.
- Klokkeslæt klippes ikke af ⋯-knappen på bærbare.
- En gammel "Fortryd"-besked erstattes af den nyeste, så den ikke kan fortryde en anden handling.
- Beskeder ligger under dialoger, så de ikke blokerer knapper.
- Fejlteksten ved serverfejl er tydeligere.

### Stresstest

Testdata: 568 blokke, 60 lærere, 30 fag og 20 hold.
- Server: et stort skema gemmes på 42 ms. Af 100 samtidige gemninger lykkedes præcis én, og 99
  blev afvist med 409. 300 gemninger i træk tog 2,2 s. 14 slags ugyldige eller ondsindede data
  blev alle afvist uden at ændre databasen.
- Browser: første visning tager 0,5 s, en gemning fra redigeringen ca. 150 ms, træk kører ved
  ca. 60 billeder i sekundet, og 40 fortryd/gentag tager 0,8 s. Der var ingen konsolfejl.
- Netværk: langsomt net med 15 hurtige ændringer gav samme data i klient og server. Efter et
  netudfald gemte appen automatisk igen efter 2,3 s. Ændringer fra en fane, der blev lukket
  midt i en fejlet gemning, blev tilbudt og gendannet ved næste besøg.
- Script-injektion i navne og noter vises som tekst og køres ikke.

### Sikkerhed og robusthed (tilføjet)

- CSP og andre sikkerhedsheadere, samt HSTS bag HTTPS.
- Login-cookies er bundet til adgangskoden: skiftes den, bliver gamle logins ugyldige.
- Login-spærring efter 20 forkerte forsøg pr. IP på 10 minutter (tidligere 8, hvilket kunne
  spærre en hel skole bag én IP-adresse ude). Hukommelsesforbruget er begrænset.
- Daglig online-kopi af databasen (14 dage), integritetskontrol ved opstart og pæn nedlukning.
- Gendannelse af en vilkårlig af de seneste 500 versioner fra appen.

## Ikke verificeret / begrænsninger

- Docker-imaget er ikke bygget her (sandkassens proxy blokerer npm i containeren). Trinene er
  verificeret uden container.
- Appen er ikke sat online; det kræver hostingvalg og en konto.
- Kun testet i Chromium. Safari og Firefox er ikke afprøvet. Touch er kun testet med
  emulerede touch-events.
- De daglige backupkopier ligger på samme disk som databasen. En ekstern backup skal ordnes
  ved drift.

## Næste konkrete skridt

1. Gennemse og flet grenen `design-og-robusthed` ind i `main`.
2. Vælg hosting med vedvarende disk (Render via `render.yaml` eller VPS med `docker compose`),
   sæt `ADMIN_PASSWORD` og `TRUST_PROXY=true`, og slå HTTPS til.
3. Afprøv i Safari/Firefox og på en rigtig iPad.
4. Indtast skolens rigtige satser, undervisningsuger og årsarbejdstimer, og tag en første backup.
