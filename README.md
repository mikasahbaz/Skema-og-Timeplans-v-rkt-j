# Ugeskema – balletskole

Webapp til at planlægge skolens faste undervisningsuge (mandag–lørdag) i otte rum og samtidig
følge hver lærers undervisningstid, forberedelse, lørdagstillæg og resterende årstimer.

- **Redigering** (administrator): `/admin`
- **Læsevisning** (kun skemaet, opdateres automatisk): `/`

Krav og beregningsregler står i [SPEC.md](SPEC.md). Status står i [WORK_STATUS.md](WORK_STATUS.md).

![Skema og timeoverblik på desktop](docs/skema-desktop.png)

## Kom i gang lokalt

Kræver Node.js 22 eller nyere.

```bash
npm install
```

```bash
npm run dev
```

Åbn http://localhost:5173/admin. Uden `ADMIN_PASSWORD` bruger udviklingsserveren adgangskoden
`admin` (kun uden for produktion). Databasen ligger i `data/ugeskema.sqlite`.

Et tomt skema kan fyldes med eksempeldata under **Indstillinger → Data og backup**. Det er kun
muligt, når skemaet er helt tomt, så rigtige data aldrig overskrives.

### Produktion på egen maskine

```bash
npm run build
```

```bash
ADMIN_PASSWORD='et-langt-kodeord' npm start
```

Appen kører derefter på http://localhost:3000.

### Prøveversion uden server

```bash
npm run build:standalone
```

Bygger `dist/standalone/ugeskema-proeve.html`: én fil, hvor serveren er erstattet af en udgave,
der kører i browseren (samme validering og beregning). Data gemmes kun i den enkelte browser, og
download af backup er slået fra. Bruges til at prøve appen uden hosting – ikke til rigtig drift.

### Demotilstand

```bash
DEMO_MODE=1 ADMIN_PASSWORD='demo-kodeord' npm start
```

Demotilstand bruger en separat databasefil (`data/demo.sqlite`), starter med eksempeldata og
viser et tydeligt **DEMOTILSTAND**-mærke. Produktionsdatabasen berøres ikke.

## Konfiguration (miljøvariabler)

| Variabel | Standard | Betydning |
|---|---|---|
| `ADMIN_PASSWORD` | – (kræves i produktion, min. 8 tegn) | Adgangskode til redigering |
| `VIEWER_PASSWORD` | tom | Hvis sat, kræver læsevisningen denne adgangskode. Tom = læsevisningen er åben for alle med linket |
| `PORT` | `3000` | HTTP-port |
| `DATA_DIR` | `./data` | Mappe til databasen |
| `DB_FILE` | `DATA_DIR/ugeskema.sqlite` | Præcis databasefil (overstyrer `DATA_DIR`) |
| `DEMO_MODE` | – | `1` = demotilstand med egen database |
| `SESSION_SECRET` | genereres og gemmes i databasen | Nøgle til at signere login-cookies |
| `COOKIE_SECURE` | `true` i produktion | Kræv HTTPS for login-cookien. Sæt `false` kun ved ren http på et lokalnet |
| `TRUST_PROXY` | `false` | Sæt `true` bag en HTTPS-proxy/hostingplatform (ellers ser login-spærringen alle brugere som samme IP) |
| `BACKUP_DIR` | `<databasemappe>/backups` | Mappe til den daglige kopi af databasen. `off` slår det fra |
| `BACKUP_KEEP` | `14` | Antal daglige kopier, der beholdes |

## Brug

1. **Indstillinger → Lærere / Fag / Hold**: opret stamdata. Lærere får automatisk en fast
   pastelfarve. Angiv årsarbejdstimer pr. lærer (tomt felt = mangler; 0 er en gyldig værdi).
2. **Indstillinger → Beregning**: forberedelsesprocent, lørdagstillæg, forberedelsesgrundlag og
   antal undervisningsuger. **Sale** og **Dagdele** kan omdøbes/justeres.
3. **Opret blok**: klik i en tom celle (dag, sal og dagdel er forudvalgt) eller på **Ny blok** (`N`).
4. **Rediger**: klik på en blok. Vælg 1–2 lærere, tid, hold, fag og evt. note. **Del** deler en blok
   i to sammenhængende blokke, fx når en ekstra lærer kun er med en del af tiden.
5. **Flyt**: træk blokken (mus, eller hold fingeren på den et øjeblik på touch). Samme dagdel
   bevarer klokkeslættet; en anden dagdel åbner en tidsvælger med bevaret varighed. Alternativt
   ⋯-menuen → **Flyt…** eller tasten `M`, og vælg målcelle med klik eller piletaster + Enter.
6. **Kopiér**: ⋯ → **Kopiér…** (eller `K`, eller hold `Alt` mens du trækker). Kopien får nyt id.
7. **Konflikter** (samme sal, lærer eller hold på samme tid) vises før ændringen gemmes. Vælg
   **Behold med konflikt** eller **Annuller ændringen**. Beholdte konflikter markeres med orange
   ramme og samles under konfliktknappen i topbjælken.
8. **Timeoverblik** til højre (eller nederst – skift med knappen i topbjælken; træk i kanten for at
   ændre størrelse). Vælg en lærer for detaljer pr. ugedag, fag og hold og årsfremskrivning.
   Filtre i topbjælken ændrer kun skemavisningen, aldrig opgørelsen.
9. **Fortryd / Annuller fortryd**: knapperne i topbjælken, `Ctrl/⌘+Z` og `Ctrl/⌘+Shift+Z` /
   `Ctrl+Y` (op til 100 trin i den aktuelle session). `?` viser alle genveje.
10. **Backup**: **Indstillinger → Data og backup** → *Download backup* (JSON). Import kontrolleres
    først og viser præcis, hvad der erstattes. Under **Tidligere versioner** kan enhver af de
    seneste 500 gemte versioner gendannes (det kan fortrydes).

Ændringer gemmes automatisk. Status vises som **Gemmer…**, **Gemt** eller **Kunne ikke gemme**.
Ved fejl bevares ændringerne i browseren og kan prøves igen. Hvis skemaet er ændret i et andet
vindue, afvises gemningen, og du vælger selv: hent nyeste, overskriv bevidst eller download dine
ændringer.

## Online drift

Appen er klar til drift som én Node-proces med en SQLite-fil på en **vedvarende disk**.
Hostingvalget kræver en konto, som ikke er oprettet endnu.

**Docker / docker compose** (fx på en VPS):

```bash
ADMIN_PASSWORD='et-langt-kodeord' docker compose up -d --build
```

Databasen ligger i volumen `ugeskema-data` (`/data` i containeren). Sæt en HTTPS-proxy (fx Caddy
eller nginx) foran og `TRUST_PROXY=true`.

**Render**: `render.yaml` beskriver en Docker-webservice med 1 GB vedvarende disk på `/data`.
Opret en Blueprint fra repoet og udfyld `ADMIN_PASSWORD` (og evt. `VIEWER_PASSWORD`).
Persistente diske kræver en betalt instans. Andre platforme med vedvarende volumen (Fly.io,
Railway m.fl.) kan bruge samme `Dockerfile` med en volumen monteret på `/data`.

Vigtigt ved drift:

- Kør **én** instans (SQLite-filen må ikke deles mellem flere servere).
- Serveren tager selv en daglig kopi af databasen i `/data/backups` (14 dage) og gemmer de
  seneste 500 versioner, som kan gendannes fra appen. Kopierne ligger på samme disk, så tag også
  jævnligt en ekstern backup (*Download backup* eller en kopi af `/data`).
- Brug HTTPS. Login-cookien er `HttpOnly`, `SameSite=Strict` og `Secure` i produktion. Skiftes
  `ADMIN_PASSWORD`, logges alle administratorer automatisk ud.
- Serveren sender sikkerhedsheadere (CSP, X-Frame-Options m.fl.), spærrer login efter 20
  forkerte forsøg pr. IP på 10 minutter og kontrollerer databasens integritet ved opstart.

## Tests

```bash
npm test
```

Kører enhedstests (beregninger, konflikter, validering, tidsforslag) og API-tests (adgang,
versionskontrol, validering, persistens, import, demobeskyttelse).

```bash
npm run test:e2e
```

Kører browsertests med Playwright mod den byggede app (kræver `npm run build` først og en
installeret Chromium): eksempel A–D, opret, træk med mus og touch, tidsvælger, kopiér, konflikter,
tastatur, fortryd, lagringsfejl, forældet vindue, læseadgang.

```bash
npm run test:all
```

Typekontrol, enhedstests, build og browsertests i ét.

## Arkitektur

```
shared/   Datamodel (zod), validering, beregning (calc.ts), konflikter, tid – bruges af både klient og server
server/   Express 5 + better-sqlite3: adgang, versioneret lagring, eksport/import
client/   React 19 + Vite + @dnd-kit: skema, redigering, timepanel, indstillinger, læsevisning
tests/    unit/ og api/ (Vitest), e2e/ (Playwright)
```

- Hele appens data er ét JSON-dokument med versionsnummer i SQLite. Hver gemning sender
  `baseVersion`; serveren afviser forældede versioner (HTTP 409) og validerer hele dokumentet med
  samme regler som klienten.
- Beregninger findes ét sted (`shared/calc.ts`) og bruges til alle visninger og årstal.
- Fortryd er snapshots af dokumentet i klienten; hver brugerhandling er ét trin.
