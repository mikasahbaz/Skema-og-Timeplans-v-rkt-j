// Demonstrationsdata: skolens eget ugeskema fra kildedokumentet (KDS-arket) med eksempelsatser.
// Bruges KUN i demotilstand, i prøveversionen eller som bevidst tilvalg i et tomt skema.
import { emptyAppData, SCHOOL_RULES_26_27, type AppData } from './schema.js';
import { sourceWeek } from './source/index.js';

export function demoAppData(): AppData {
  const { data } = sourceWeek(emptyAppData());
  return {
    ...data,
    // Skolens regler og FM's kontrakt fra timeopgørelsen 26/27; øvrige læreres kontrakter mangler.
    teachers: data.teachers.map((t) => (t.initials === 'FM' ? { ...t, contractHours: 26 } : t)),
    settings: { ...data.settings, ...SCHOOL_RULES_26_27 },
  };
}

/** Udgangspunkt for en ny installation: tidstabel, hold og morgensamling fra kilden, ingen klasser. */
export function initialAppData(): AppData {
  const { data } = sourceWeek(emptyAppData());
  return { ...data, teachers: [], blocks: [], settings: { ...data.settings, ...SCHOOL_RULES_26_27 } };
}
