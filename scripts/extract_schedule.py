"""Udtrækker tidsregler og ugeskema fra skolens skemadokument (xlsx).

Brug:  python3 -I scripts/extract_schedule.py <fil.xlsx> <ark> <udfil.ts>
Skriver et TypeScript-modul med kildeposter (én pr. celle), afledte tidsregler og
usikkerheder. Kræver openpyxl. Køres kun, når dokumentet ændres.

Dokumentets opbygning (Ark1 og KDS):
  - En dagsoverskrift (fx "Mandag") i kolonne A, derefter en rumrække og fire rækker:
    "Morg.", "Form.", "Mid.", "Efter."
  - Ni rum à to flettede kolonner: B..N = 7 x "Balletsal", P = "K-salen", R = "Motionsrum".
  - Cellerne skrives "8.10-9.55  [aktivitet]  Hold 6  AK  [÷ p]".
"""
import json
import re
import sys

import openpyxl

DAYS = {"mandag": 0, "tirsdag": 1, "onsdag": 2, "torsdag": 3, "fredag": 4, "lørdag": 5}
PERIODS = {"morg.": 0, "form.": 1, "mid.": 2, "efter.": 3}
ROOM_COLS = ["B", "D", "F", "H", "J", "L", "N", "P", "R"]

TIME_RE = re.compile(r"^\s*(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})(?:[.:](\d{2}))?\s*(.*)$", re.S)
# Holdangivelser, længste mønstre først. Grupperne returneres som en liste af holdnavne.
GROUP_PATTERNS = [
    (re.compile(r"\b6\s*\.?\s*\+\s*7\s*\.?\s*kl\.?\s*drenge\b", re.I), lambda m: ["6.+7. kl. drenge"]),
    (re.compile(r"\b6\s*\.?\s*\+\s*7\s*\.?\s*kl\.?\s*piger\b", re.I), lambda m: ["6.+7. kl. piger"]),
    (re.compile(r"\bHold\s+(\d)\s*(?:\.?\s*\+|&)\s*(\d)\s+(drenge|piger)\b", re.I), lambda m: [f"Hold {m[1]}+{m[2]} {m[3].lower()}"]),
    (re.compile(r"\bHold\s+(\d)\s+(drenge|piger)\b", re.I), lambda m: [f"Hold {m[1]} {m[2].lower()}"]),
    (re.compile(r"\bHold\s+(\d)\s*(?:\.?\s*\+|&)\s*(\d)\b", re.I), lambda m: [f"Hold {m[1]}", f"Hold {m[2]}"]),
    (re.compile(r"\bHold\s+(\d)\s*-\s*(\d)\b", re.I), lambda m: [f"Hold {i}" for i in range(int(m[1]), int(m[2]) + 1)]),
    (re.compile(r"\bHold\s+(\d)\b", re.I), lambda m: [f"Hold {m[1]}"]),
    (re.compile(r"\bKompagni\s+B\b", re.I), lambda m: ["Kompagni B"]),
    (re.compile(r"\bOne2One\b", re.I), lambda m: ["One2One"]),
]
TEACHER_TOKEN = re.compile(r"^(?:[A-ZÆØÅ]{2,3}|ABo|Arina)$")


def clean(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def parse_cell(text):
    t = clean(text)
    m = TIME_RE.match(t)
    if not m:
        return None
    sh, sm, eh, em, rest = m.groups()
    start = int(sh) * 60 + int(sm)
    end = int(eh) * 60 + int(em or 0)
    no_prep_mark = bool(re.search(r"÷\s*p\b", rest))
    rest_wo = re.sub(r"÷\s*p\b", "", rest).strip()
    groups, gspan = None, None
    for pat, fn in GROUP_PATTERNS:
        g = pat.search(rest_wo)
        if g:
            groups, gspan = fn(g), g.span()
            break
    if groups is None:
        return {"start": start, "end": end, "activity": rest_wo, "groups": [], "teachers": [], "mark": no_prep_mark}
    activity = clean(rest_wo[: gspan[0]])
    tail = clean(rest_wo[gspan[1]:])
    # Aktiviteter kan også stå efter holdet (fx "Hold 7 TH POINT").
    tokens = [x for x in re.split(r"\s*(?:\+|&|/)\s*|\s+", tail) if x]
    teachers = [x for x in tokens if TEACHER_TOKEN.match(x)]
    extra = [x for x in tokens if not TEACHER_TOKEN.match(x)]
    if extra:
        activity = clean(f"{activity} {' '.join(extra)}")
    return {"start": start, "end": end, "activity": activity, "groups": groups, "teachers": teachers, "mark": no_prep_mark}


def main(path, sheet, out):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet]
    entries, notes = [], []
    day = None
    assembly = None
    room_labels = None
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
        a = clean(row[0].value or "").lower()
        r = row[0].row
        if a in DAYS:
            day = DAYS[a]
            # Fredagens morgensamling står i dagsoverskriftens række.
            for c in row[1:]:
                if c.value and "morgensamling" in str(c.value).lower():
                    p = parse_cell(c.value)
                    txt = clean(c.value)
                    loc = re.search(r"\bi\s+([A-ZÆØÅ][a-zæøå]+)", txt)
                    after = txt.split(loc.group(0))[-1] if loc else ""
                    teachers = [x for x in re.split(r"[/\s+&]+", after) if TEACHER_TOKEN.match(x)]
                    g = GROUP_PATTERNS[5][0].search(txt)
                    assembly = {
                        "day": day,
                        "start": p["start"],
                        "end": p["end"],
                        "groups": GROUP_PATTERNS[5][1](g) if g else [],
                        "location": loc.group(1) if loc else "",
                        "teachers": teachers,
                        "source": f"{sheet}!{c.coordinate}",
                        "raw": txt,
                    }
            continue
        if day is None:
            continue
        if a == "" and any(clean(c.value or "") == "Balletsal" for c in row):
            room_labels = [clean(ws[f"{col}{r}"].value or "") for col in ROOM_COLS]
            continue
        if a not in PERIODS:
            continue
        period = PERIODS[a]
        for ri, col in enumerate(ROOM_COLS):
            cell = ws[f"{col}{r}"]
            raw = clean(cell.value or "")
            if not raw or raw in {",", ".", " ,"}:
                continue
            p = parse_cell(raw)
            ref = f"{sheet}!{cell.coordinate}"
            if not p:
                notes.append({"source": ref, "raw": raw, "issue": "Kunne ikke læse et tidsrum"})
                continue
            entries.append({"day": day, "period": period, "room": ri, "roomLabel": room_labels[ri] if room_labels else "", "source": ref, "raw": raw, **p})
    json_out = {"file": path.split("/")[-1], "sheet": sheet, "roomLabels": room_labels, "entries": entries, "assembly": assembly, "unparsed": notes}
    with open(out, "w", encoding="utf-8") as f:
        f.write("// GENERERET af scripts/extract_schedule.py – rediger ikke i hånden.\n")
        f.write(f"// Kilde: {json_out['file']}, ark '{sheet}'.\n")
        f.write("export const SOURCE = ")
        json.dump(json_out, f, ensure_ascii=False, indent=1)
        f.write(" as const;\n")
    print(f"{len(entries)} poster, {len(notes)} ulæselige, morgensamling: {assembly}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
