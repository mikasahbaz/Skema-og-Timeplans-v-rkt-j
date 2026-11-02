# SPEC – Ugeskema for balletskole

Kravspecifikation for første version. Krav er nummereret efter afsnit, så de kan
refereres i kode, tests og WORK_STATUS.md. Antagelser er markeret **Antagelse**.

## 1. Formål og afgrænsning

- 1.1 Webapp til at planlægge én fælles **grunduge** (mandag–lørdag), som gentages i alle
  skoleårets undervisningsuger. Ingen datoer, ferier eller undtagelser i v1.
- 1.2 Opret, placér, flyt og kopiér undervisningsblokke i otte rumkolonner.
- 1.3 Følg pr. lærer: undervisningstid, forberedelse, lørdagstillæg, samlet medregnet tid,
  årsfremskrivning og resterende årstimer.
- 1.4 Ikke i v1: automatisk skemalægning, elevregister, fravær, løn, flere organisationer,
  samtidig flerbrugerredigering.

## 2. Begreber og data

| Begreb | Indhold |
|---|---|
| Fag | id, navn, arkiveret |
| Hold | id, navn, arkiveret |
| Lærer | id, initialer (unikke), valgfrit navn, fast farve, årsarbejdstimer A (tom = mangler), arkiveret |
| Sal | id, navn; præcis 8, rækkefølgen kan ændres |
| Blok | id, fagId, holdId, lærerIds (1–2 forskellige), ugedag (0=man … 5=lør), salId, start, slut (minutter efter midnat), note |
| Dagdel | Morgen, Formiddag, Eftermiddag, Aften – afledt af blokkens starttid og redigerbare skel |

- 2.1 Lærere er knyttet til blokken, ikke til faget.
- 2.2 Referencer sker via stabile ID'er. Omdøbning ændrer ikke blokke.
- 2.3 Stamdata i brug kan arkiveres, ikke slettes. Ubrugte stamdata kan slettes.
  Arkiverede elementer vises fortsat på eksisterende blokke, men tilbydes ikke til nye.
- 2.4 Nye lærere får automatisk en tydeligt adskilt pastelfarve, som gemmes. Kan ændres manuelt.

## 3. Skemaets opbygning

- 3.1 Otte kolonner: Sal 1–7 og Motionsrum (navn og rækkefølge kan ændres).
- 3.2 Seks dagsgrupper × fire dagdele = 24 rækker. Dag- og dagdelsmærkater er overskriftsfelter.
- 3.3 En celle kan rumme flere blokke, sorteret efter starttid. Intet skjules.
- 3.4 Standardskel: Formiddag fra 10.00, Eftermiddag fra 13.00, Aften fra 18.00 (redigerbare).
  En blok placeres i dagdelen for sin starttid; en blok over et skel er stadig én blok.
- 3.5 Kolonneoverskrifter og dagmærkater er fastlåst ved rulning.

## 4. Opret, rediger, flyt og kopiér

- 4.1 Opret via knap eller tom celle (sal, dag og dagdel forudvalgt, tid foreslået i dagdelen).
- 4.2 Klik på blok åbner kompakt redigering (fag, hold, lærere, dag, sal, tid, note).
- 4.3 Drag-and-drop med mus og touch: tydelig målcelle; samme dagdel bevarer tid og varighed;
  anden dagdel åbner tidsvælger med forslag og bevaret varighed; annullering bevarer original.
- 4.4 Tilsvarende uden træk: Flyt- og Kopiér-handling på blokken → vælg målcelle (klik eller
  tastatur) → evt. tidsvælger.
- 4.5 Kopi får nyt id, bevarer fag, hold, lærere og varighed og redigeres uafhængigt. Kopi til
  samme celle foreslår en tid efter de eksisterende blokke (ingen utilsigtet kopi oven på originalen).
- 4.6 Kopiering og flytning har forskellig visuel feedback.
- 4.7 Tastaturgenveje supplerer, men alt kan gøres via synlige knapper.
- 4.8 Ekstra: "Del blok" deler en blok ved et tidspunkt i to sammenhængende blokke (til delvis
  deltagelse af en ekstra lærer, jf. 5.8).

## 5. To lærere på samme blok

- 5.1 Én blok, begge initialer og begge faste farver (to farvefelter, ingen blandingsfarve).
- 5.2 Sal og hold optages én gang.
- 5.3 Begge lærere får hele varigheden; tiden deles aldrig automatisk.
- 5.4 F og L beregnes pr. lærer.
- 5.5 Begge lærere kontrolleres for overlap.
- 5.6 Lærerfilter viser fællesblokken én gang.
- 5.7 Ændring af lærerlisten opdaterer straks alle berørte opgørelser.
- 5.8 Delvis deltagelse modelleres som sammenhængende blokke (fx 09–10 TH, 10–11 TH+CO).

## 6. Design

- 6.1 Lys, rolig baggrund, læselig typografi, kompakt top, arbejdsfladen prioriteres.
- 6.2 Blok viser fag, hold, initialer og klokkeslæt; lange tekster ombrydes; intet kun i hover.
- 6.3 Initialer gør farvekoden forståelig uden farve. God kontrast.
- 6.4 Desktop/bærbar prioriteres; tablet med touch; mobil får dagsvisning og adgang til overblik.

## 7. Skema og timeoverblik samtidig

- 7.1 Skema og justerbart timepanel på samme flade (til højre eller nederst); skemaet ruller
  uafhængigt.
- 7.2 Panelet: kompakt lærerliste med ugetotaler; valgt lærers detaljer pr. ugedag, fag og hold;
  særskilt boks med ugesum; årsfremskrivning og resterende årstimer.
- 7.3 Tal opdateres straks ved enhver ændring og fortryd.
- 7.4 Skemafiltre påvirker ikke opgørelsen; den omfatter altid hele grundugen.

## 8. Beregningsregler

Tider gemmes som heltal minutter efter midnat; slut > start, inden for samme døgn.
Fuld præcision bevares; afrunding kun i visning.

Indstillinger: p (forberedelse %), s (lørdagstillæg %), forberedelsesgrundlag
(`faktisk` = standard, eller `inkl. lørdagstillæg`). p vises også som minutter pr. 60 min.

Pr. lærer og dag:

```
U = faktisk undervisningstid
L = U × s/100 om lørdagen, ellers 0
F = U × p/100            (grundlag: faktisk)
F = (U + L) × p/100      (grundlag: inkl. lørdagstillæg)
K = U + F + L
```

- 8.1 Vis U, F, U+F, L og K pr. ugedag og som ugesum (ugesum = sum af dagstal).
- 8.2 Detaljer viser fordeling på fag og hold.
- 8.3 Én fælles beregningsfunktion bruges til alle visninger og årstal.
- 8.4 Tidsformat "1 t 30 min"; decimaltimer vises som "1,50 t" og klokkeslæt som "kl. 01.50".

## 9. Årsarbejdstid

- 9.1 Indstilling W = antal undervisningsuger. Pr. lærer A = forventede årsarbejdstimer.
- 9.2 Planlagt årstid = ugens K × W. Resterende = A − planlagt. Negativ = overplanlagt (tydeligt).
- 9.3 Forudsætningstekst: samme grunduge alle uger; møder, forestillinger m.m. ikke indregnet.
- 9.4 Tomme felter er "mangler", aldrig 0. Et indtastet 0 er gyldigt.
- 9.5 Ændringer genberegner straks og kan fortrydes.

## 10. Konflikter og validering

- 10.1 Overlap på samme ugedag med samme sal, fælles lærer eller samme hold er en konflikt
  (halvåbne intervaller: 09–10 og 10–11 er ikke en konflikt). Kontrol over hele dagen.
- 10.2 Egen blok ignoreres ved redigering; to lærere i samme blok er ikke en konflikt.
- 10.3 Konflikt viser konkret ressource og modstående blok; ændringen gennemføres kun ved
  "Behold med konflikt", ellers bevares tidligere tilstand.
- 10.4 Bevarede konflikter markeres på blokken og i en samlet konfliktoversigt.
- 10.5 Konfliktblokke tæller med i opgørelsen; opgørelsen viser en advarsel.
- 10.6 Afvis: ugyldige tider, manglende felter, dublerede lærere, ugyldige tal. Andre blokke flyttes
  aldrig automatisk.

## 11. Lagring, adgang og fortryd

- 11.1 Én fælles autoritativ SQLite-database på serveren.
- 11.2 Browserlagring kun til præferencer og sikring af ikke-gemte ændringer.
- 11.3 Administrator (adgangskode) kan redigere; skriveadgang håndhæves på serveren.
  Læsevisning viser kun skemaet (ingen årstimer/satser).
- 11.4 Autogem med status Gemmer / Gemt / Kunne ikke gemme; fejl vises ærligt; ikke-gemte
  ændringer bevares med "Prøv igen".
- 11.5 Læsevisning henter ændringer automatisk (polling).
- 11.6 Versionskontrol: gem kræver kendt version; forældet vindue afvises (409) og brugeren vælger.
- 11.7 Fortryd/Annuller fortryd (≥ 50 trin), Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y. Én handling = ét
  trin. Gælder blokke, lærerliste, stamdata og beregningsindstillinger.
- 11.8 Eksport af alle data som JSON; import valideres og viser konkret, hvad der erstattes,
  før den gennemføres.
- 11.9 Demodata kun i markeret demotilstand eller som bevidst tilvalg i et tomt skema.
  Produktionsdata overskrives aldrig af demodata.

## 12. Kontroleksempler (testdata)

p = 25 %, s = 50 %, W = 36, A(TH) = 1.600.

- A: Man 09–11, TH → U 2 t, F 0,5 t, L 0, K 2,5 t.
- B: Lør 09–11, TH+CO → hver: U 2, F 0,5, L 1, K 3,5. Sal og hold optaget 2 t.
- C: A+B → TH: U 4, F 1, L 1, K 6 pr. uge, 216 planlagte, 1.384 resterende. CO: K 3,5.
  Skemaet: 4 t undervisning i salene, 6 lærertimer (U) i alt.
- D: Grundlag inkl. lørdagstillæg → lørdagsblok hver: U 2, L 1, F 0,75, K 3,75.
- 08.10–09.50 = 100 min. Fredag→lørdag ændrer L, ikke varighed. Overlap fanges for 2. lærer.
  Kopi/original uafhængige. Fortryd gendanner alt. Persistens efter genindlæsning og i anden
  session. Lagringsfejl og forældede versioner uden tavst tab. Læseadgang kan ikke skrive.
  Manglende satser ≠ 0.

## Antagelser

- **Antagelse**: "Ingen flere brugere" = én administratoradgangskode (env `ADMIN_PASSWORD`) og en
  læsevisning, som er åben eller beskyttet af valgfri `VIEWER_PASSWORD`.
- **Antagelse**: Hele appens data gemmes som ét versioneret dokument i SQLite (plus
  revisionshistorik). Det passer til én redaktør, gør versionskontrol, fortryd og backup enkle.
- **Antagelse**: Hvis s mangler, men læreren ikke underviser om lørdagen, er L = 0 (kendt). Hvis
  læreren underviser lørdag, er L og K "mangler". Tilsvarende for p.
- **Antagelse**: Undervisningsuger W må være decimaltal (0–60); procentsatser 0–1000.
- **Antagelse**: Navne på fag og hold, og initialer for lærere, skal være unikke (uden hensyn til
  store/små bogstaver).
- **Antagelse**: Morgen har ingen nedre grænse; forslag til ny blok om morgenen er 08.00.
