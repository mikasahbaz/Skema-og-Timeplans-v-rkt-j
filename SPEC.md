# SPEC – Ugeskema for balletskole

Kravspecifikation. **Version 2** (denne udgave) har forrang, hvor den ændrer version 1:
en væsentligt enklere brugerflade og automatiske undervisningstider fra skolens skemadokument.
**Tilføjelse 3. nov. 2026:** en flytning giver aldrig en fejlmelding – en klasse får altid en tid
(holdets egen tid fra en anden dag eller dagdelens standardtid), og en manuel rettelse af tiden gør
klassen til en "anden slags" blok med egne tider.
Antagelser er markeret **Antagelse**.

## 1. Formål

- 1.1 En rolig, visuel skematavle for én fælles grunduge (mandag–lørdag) i otte rum, hvor
  klasser placeres og flyttes, mens lærernes timeoptælling ses samtidig.
- 1.2 Målgruppe: dansere og undervisere, der ikke nødvendigvis er teknisk rutinerede.
- 1.3 Ikke i v1: datoer/ferier, automatisk skemalægning, elevregister, fravær, løn, flere
  organisationer, samtidig flerbrugerredigering.

## 2. Hovedskærmen – kun fire elementer

1. Ugeskemaet (fylder mest; ruller internt).
2. Kompakt, løbende timeoptælling (smal kolonne til højre): lærere og samlet medregnet ugetid.
   Tryk på en lærer viser undervisning, forberedelse og evt. lørdagstillæg.
3. Én primær knap: **Tilføj ny klasse**.
4. Et lille tandhjul (trykflade ≥ 44 px) til alle øvrige funktioner.

- 2.1 Ingen filterbjælker, menuer, statistikfelter eller permanente handlingsknapper på blokke.
- 2.2 Tryk på en klasse åbner et lille midlertidigt panel (Redigér, Flyt, Kopiér, Slet).
- 2.3 Fortryd/Gentag findes bag tandhjulet og som tastaturgenveje; kort "Fortryd" efter ændring.
- 2.4 Diskret "Gemt"; en reel lagringsfejl vises tydeligt med "Prøv igen".
- 2.5 Konflikter markeres på klasserne; optællingen viser en kort linje, når der er konflikter.

## 3. Designsprog (afledt af kglteater.dk)

- Varm offwhite #F5F4F2 som baggrund, hvid #FFFFFF til skemaflader, mørk gråsort #282828 til tekst.
- Én sparsom accent fra teatrets palette (#CC003C) til valgt tilstand, målcelle og konflikt.
- Lærernes faste pastelfarver er appens vigtigste farvekoder; to lærere = to farvefelter.
- Skrift: KGL Sharp Sans er teatrets egen licenserede skrift. **Tilpasning:** Plus Jakarta Sans
  (fri licens, selvhostet), tal i faste bredder.
- Få størrelser (13–16 px til betjening/info, 22 px til sidetitel), versalmærker med
  bogstavafstand som teatrets knapper, tynde linjer, afstande 4/8/12/16/24 px, afrunding 8–12 px.
- Skygger kun for løftet blok under træk og åbne paneler. Kort, rolig bevægelse; respekterer
  reduceret bevægelse.
- iPad: trykflader 44–48 px, træk med langt tryk, paneler åbner tæt på indholdet, intet kræver hover.

## 4. Tilføj ny klasse

- 4.1 Panelet har: Hold (ét eller flere = fælles klasse), Lærer(e) (1–2), Titel (standard
  "Balletklasse", frit redigerbar) og et diskret valg **Egne tider**. Kun ved Egne tider vises
  start og slut.
- 4.2 Uden Egne tider spørges der ikke om tid; tiden kommer fra tidsreglerne ved placering.
- 4.3 Efter oprettelse er klassen en kladde (tæller ikke med), indtil den placeres med tryk på en
  celle eller træk. Tryk på en tom celle åbner panelet med placeringen valgt.
- 4.4 Lærere tilknyttes klassen. Begge lærere får hele den faktiske tid. Flere hold på én klasse
  er én blok og tælles én gang pr. lærer.

## 5. Tidsregler fra skemadokumentet

- 5.1 Kilde: `Balletskole_Skema_26_27_Master_fra_uge_43.xlsx`, ark **KDS** (bekræftet af skolen).
  Udtrækket ligger i `shared/source/kds.ts` (genereret af `scripts/extract_schedule.py`), og
  tabellen kan ses i `docs/tidstabel-kds.md`.
- 5.2 En regel = hold eller eksplicit holdkombination + ugedag + dagdel → start/slut, evt. variant
  (aktiviteten i kilden), note og cellehenvisning. Hver ugedag har egne regler.
- 5.3 Dagdelene følger dokumentet: **Morgen, Formiddag, Middag, Eftermiddag**. Klokkeslætsgrænser
  bruges ikke til at omfortolke kilden.
- 5.4 Kun tider med belæg i kilden. En tom celle giver ingen regel. Samme tidsrum i flere celler
  bliver én regel med flere kilder; forskellige tidsrum bliver separate varianter.
- 5.5 Forkortelser (÷ p, POINT, BV, PDD, Bourn, Tech/rep, Contemp.) bevares som tekst og
  fortolkes ikke. "÷ p" påvirker ikke forberedelsen.
- 5.6 Tidstabellen er redigerbar under Indstillinger og viser dækning og manglende regler.

## 6. Almindelige klasser får tiden automatisk

- 6.1 Tidsmodellen er et selvstændigt felt: `rule` (tid fra tidstabellen) eller `custom` (egne tider).
  Titlen afgør aldrig tidsmodellen.
- 6.2 Ved oprettelse, flytning, kopiering og ændret hold: find reglen for hold + ugedag + dagdel,
  vis forventet tid i målcellen/den løftede blok, opdatér tider, kontrollér konflikter, opdatér
  optælling, gem. Det er én handling og ét fortryd-trin.
- 6.3 Kun ny sal (samme dag og dagdel): tiden bevares. Anden dag/dagdel: tid og varighed kan ændres.
  Lørdag bruger lørdagens regel; tillægget beregnes af den nye varighed.
- 6.4 Tiden findes i denne rækkefølge, og klassen placeres direkte uden dialog:
  1. holdets egen regel den dag i dagdelen;
  2. fælles klasse: hvert hold har netop én regel med samme tidsrum ("fælles tid for holdene");
  3. holdets egen tid i samme dagdel en anden dag (fx Hold 2's middagstid 11.50–13.05 på en ny dag);
     har holdet flere, bevares klassens nuværende tidsrum, hvis det er et af dem, ellers det mest
     almindelige;
  4. dagdelens standardtid for ugedagen.
  Kun hvis der er flere dokumenterede tider for holdet samme dag og dagdel, vises et lille valg.
  Kun hvis alt mangler (ingen standardtid), bedes brugeren angive tiden.
- 6.5 Standardtider pr. ugedag og dagdel udledes af dokumentet (mest almindelige tid den dag i
  dagdelen; ellers i dagdelen hele ugen) og kan rettes under Indstillinger. Fredag og lørdag morgen
  er 8.25–9.55.
- 6.6 Annulleret placering efterlader klassen uændret.

## 7. Anden slags blok (Egne tider)

- 7.0 Retter man tidspunktet på en klasse manuelt, bliver den en "anden slags" blok med egne tider.
  Den kan sættes tilbage til automatisk tid fra redigeringen.

- 7.1 Bevarer præcist sit tidsrum ved flytning til anden sal, dag, dagdel og lørdag. Den visuelle
  dagdel er uafhængig af klokkeslættet. Lørdagstillæg følger den nye dag.
- 7.2 Viser altid det faktiske klokkeslæt og et låsesymbol. Konflikter og optælling bruger det
  faktiske tidsrum. Kopiering bevarer tiderne. Ændringer af tidstabellen rører dem aldrig.

## 8. Fredagens morgensamling

- 8.1 Fast begivenhed fra kilden: fredag 8.10–8.20, Hold 3–9, Malersalen (KDS!D26).
- 8.2 Vises diskret ved fredagens overskrift og booker ingen af de otte sale. Kan ikke trækkes
  eller kopieres.
- 8.3 Lærervalg under Indstillinger: ingen lærer = ingen lærertimer; valgt lærer = vises med farve
  og indgår én gang; skift/fjernelse opdaterer straks. Ingen dubletter.
- 8.4 Egen forberedelsesregel (samme som klasser / ingen / egen sats), der ikke ændrer klassernes.
- 8.5 Fredagens øvrige tider følger fredagsreglerne uanset bemanding.

## 9. Beregning – som skolens timeopgørelse (tilføjet 4. nov. 2026)

Reference: `Fernando_Mora_timer_26_27.docx` (FM, sæson 26/27).

```
Undervisning ma–fre U        klassernes faktiske tid + evt. morgensamling
Forberedelse ma–fre          U × 25 min pr. undervisningstime
Lørdag pr. lørdag            lørdagstid × 1,25            (lørdagstillæg 25 %)
Forberedelse pr. lørdag      lørdag inkl. tillæg × 25 min pr. time
Lørdage pr. uge (gns.)       pr. lørdag × 18 lørdage ÷ 41 undervisningsuger
I alt pr. uge K              U + forberedelse + lørdage (gns.) + forberedelse lørdage (gns.)
Til rådighed pr. uge         kontrakt (fx 26 t) − 1 t orientering og mails
Timebank                     til rådighed − K pr. uge;  × 41 uger pr. sæson
```

- 9.1 Bruger den aktuelle tid efter regelopslag. Afrunding som dokumentet: hele minutter i hvert
  trin (kan skiftes til præcis beregning). FM giver præcis dokumentets tal: 10 t 25, 4 t 20,
  3 t 51, 69 t 18, 1 t 41, 28 t 48, 42 min, 7 t 52 og 322 t 32.
- 9.2 Kontrakttimer, orientering og antal lørdage pr. lærer (tomt = skolens fælles værdi).
  Klasser kan markeres "uden forberedelse". Manglende oplysninger vises som manglende; 0 er gyldigt.
- 9.3 Aflyst undervisning, der lægges i timebanken senere, møder og forestillinger er ikke indregnet.
- 9.4 Opstillingen pr. lærer, satser, kontrakt og timebank ligger bag tandhjulet.
- 9.5 Åbne spørgsmål til skolen besvares med ét klik under tandhjulet → Spørgsmål; svaret bruges
  straks og kan fortrydes. En lille prik på tandhjulet viser åbne punkter.

## 10. Indstillinger (bag tandhjulet, ét afsnit åbent ad gangen)

1. **Lærere og hold** – lærere (initialer, navn, farve), hold, salenes navne/rækkefølge.
2. **Tidsregler og morgensamling** – tidstabel, dækning, morgensamling, kilde og spørgsmål.
3. **Arbejdstid, forberedelse og lørdagstillæg** – satser, årsarbejdstid, opgørelse pr. lærer.
4. **Øvrige værktøjer** – fortryd/gentag, konflikter, læsevisning, backup, versioner, log ud.

Når panelet lukkes, er man tilbage samme sted i skemaet.

## 11. Data, lagring og adgang

- 11.1 Én autoritativ SQLite-database, autogem med versionskontrol, administrator- og
  læseadgang, konfliktkontrol, fortryd, backup og versionshistorik som i version 1.
- 11.2 Otte rumkolonner bevares. Kilden har ni rum (7 balletsale, K-salen, Motionsrum); K-salen har
  ingen kolonne, og forskellen vises under Indstillinger.
- 11.3 **Migrering fra version 1**: intet slettes. Fag bliver titel, hold bliver en holdliste.
  Klasser, der præcist matcher en dokumenteret regel (hold, dag, tidsrum), knyttes til reglen; alle
  andre beholder deres tider som Egne tider, med dagdel efter klokkeslættet. Sker automatisk ved
  serverstart og ved import af ældre backup; den gamle version kan gendannes.
- 11.4 Ændringer af tidsregler genberegner berørte regelklasser samlet, kontrollerer nye konflikter
  og kan fortrydes. En regel i brug kan ikke slettes.

## 12. Kontrolpunkter

1. Hovedskærmen viser kun skema, kompakt optælling, "Tilføj ny klasse" og tandhjul.
2. Oprettelse starter med hold, lærer(e) og "Balletklasse"; tidsfelter kun ved Egne tider.
3. En almindelig klasse får kildens tid ved placering og flytning.
4. Ændret ugedag kan ændre varigheden; optællingen følger.
5. Lørdagsregler og lørdagstillæg håndteres korrekt.
6. Fredagens tider bevares uanset morgensamlingens bemanding.
7. En specialklasse bevarer sine klokkeslæt ved alle flytninger.
8. To lærere får hele tiden; flere hold giver ikke dobbelttælling.
9. Manglende/tvetydige regler giver ingen opdigtede tider.
10. Morgensamlingen giver kun timer med en lærer og findes kun én gang.
11. Fortryd gendanner placering, tidsmodel, tider og opgørelser.
12. Data og tidsmodel bevares efter genindlæsning.
13. Skema og optælling kan bruges samtidig på bærbar og iPad (vandret).

## Antagelser

- **Antagelse**: Morgensamlingen tilknyttes én lærer (kilden angiver "DT/CO"); ingen forvalgt.
- **Antagelse**: Undergrupper ("Hold 6 piger", "Hold 5 & 6 drenge", "Hold 5 piger") er egne hold.
- **Antagelse**: Ved genindlæsning af tidstabellen beholder en regelklasse uden entydig ny regel sit
  tidsrum som Egne tider, og brugeren får det at vide.
- **Antagelse**: Dagdel for migrerede klasser: før 10.00 morgen, før 11.30 formiddag, før 16.00
  middag, ellers eftermiddag (kun ved migrering).
