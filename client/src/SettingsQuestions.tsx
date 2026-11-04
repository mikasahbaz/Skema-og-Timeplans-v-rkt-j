// Indstillinger → Spørgsmål: én ting ad gangen, ét klik pr. svar. Svaret bruges straks og kan fortrydes.
import type { AppData } from '../../shared/schema';
import { CommitNumber, cleanErrors } from './fields';
import * as ops from './ops';
import { answerQuestion, QUESTIONS, teachersMissingContract } from './questions';
import { Icon, TeacherChip } from './ui';

export function QuestionsSection({ data, onCommit }: { data: AppData; onCommit: (label: string, next: AppData) => string[] | null }) {
  const missing = teachersMissingContract(data);
  const open = QUESTIONS.filter((q) => !data.settings.answers[q.id]);
  const answered = QUESTIONS.filter((q) => data.settings.answers[q.id]);
  return (
    <div className="section-body">
      <p className="hint">
        Tryk på det svar, der passer. Svaret bruges med det samme i skemaet og timerne, og du kan altid ændre det eller fortryde.
      </p>
      {open.length === 0 && missing.length === 0 && (
        <p className="all-done">
          <Icon name="check" size={16} /> Alle spørgsmål er besvaret.
        </p>
      )}
      {[...open, ...answered].map((q) => {
        const current = data.settings.answers[q.id]?.answer;
        return (
          <div key={q.id} className={`question${current ? ' answered' : ''}`}>
            <h4>{q.title}</h4>
            <p className="hint">{q.context}</p>
            <div className="answer-row" role="group" aria-label={q.title}>
              {q.answers.map((a) => (
                <button
                  key={a.value}
                  className={`btn btn-sm${current === a.value ? ' btn-primary' : ''}`}
                  aria-pressed={current === a.value}
                  onClick={() => current !== a.value && onCommit(`Svar: ${a.label}`, answerQuestion(data, q, a.value))}
                >
                  {current === a.value && <Icon name="check" size={14} />} {a.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {missing.length > 0 && (
        <div className="question">
          <h4>Kontrakttimer pr. uge mangler</h4>
          <p className="hint">Uden kontrakttimer kan timebanken ikke beregnes. FM har 26 t ifølge timeopgørelsen. Skriv timerne fra hver lærers kontrakt.</p>
          <div className="missing-list">
            {missing.map((t) => (
              <label key={t.id} className="missing-row">
                <TeacherChip teacher={t} />
                <CommitNumber value={t.contractHours} label={`Kontrakttimer for ${t.initials}`} suffix="t pr. uge" onCommit={(v) => cleanErrors(onCommit(`Kontrakt for ${t.initials}`, ops.updateTeacher(data, t.id, { contractHours: v })))} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
