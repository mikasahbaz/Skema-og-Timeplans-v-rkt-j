// Demonstrationsdata: skolens eget ugeskema fra kildedokumentet (KDS-arket) med eksempelsatser.
// Bruges KUN i demotilstand, i prøveversionen eller som bevidst tilvalg i et tomt skema.
import { emptyAppData, type AppData } from './schema.js';
import { sourceWeek } from './source/index.js';

export function demoAppData(): AppData {
  const { data } = sourceWeek(emptyAppData());
  return {
    ...data,
    settings: { ...data.settings, prepPercent: 25, saturdayPercent: 50, teachingWeeks: 36 },
  };
}

/** Udgangspunkt for en ny installation: tidstabel, hold og morgensamling fra kilden, ingen klasser. */
export function initialAppData(): AppData {
  const { data } = sourceWeek(emptyAppData());
  return { ...data, teachers: [], blocks: [] };
}
