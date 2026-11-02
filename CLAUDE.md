# CLAUDE.md

Ugeskema for en balletskole. Krav: [SPEC.md](SPEC.md). Opstart/drift: [README.md](README.md).
Status og næste skridt: [WORK_STATUS.md](WORK_STATUS.md).

## Retningslinjer

- UI-tekster og dokumentation på dansk; kode og identifikatorer på engelsk.
- Al beregning af lærertimer sker i `shared/calc.ts`. Lav aldrig parallelle beregninger i UI.
- Al validering sker i `shared/validate.ts` (+ zod-skema i `shared/schema.ts`) og bruges af både
  klient (`store.commit`) og server (`PUT /api/data`).
- Tider er hele minutter efter midnat. Afrund kun i visning (`shared/time.ts`).
- `null` betyder "mangler" og må aldrig behandles som 0.
- Hver brugerhandling = ét `commit(label, nextData)` = ét fortryd-trin. Brug rene funktioner i
  `client/src/ops.ts` til at lave ny data.
- Blokændringer går gennem `proposeBlock` i `Editor.tsx` (validering + konfliktdialog).
- Serveren er autoritativ; skriv kun med administratorsession og `baseVersion`.
- Demodata kun via `DEMO_MODE` (egen DB-fil) eller i et helt tomt skema.

## Kommandoer

- `npm run dev` – udvikling (Vite på 5173, API på 3000, adgangskode `admin`)
- `npm run typecheck` · `npm test` · `npm run build` · `npm run test:e2e`
- Tilføj afhængigheder med `npm install` (`.npmrc` sætter `legacy-peer-deps` pga. en npm-fejl med vitest).
