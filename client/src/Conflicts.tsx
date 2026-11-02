// Visning af konflikter: konkret liste, bekræftelsesdialog og samlet oversigt.
import { allConflicts, describeConflict, type Conflict } from '../../shared/conflicts';
import { DAY_NAMES, type AppData, type Block } from '../../shared/schema';
import { formatRange } from '../../shared/time';
import { Icon, Modal } from './ui';

const blockTitle = (b: Block, data: AppData) =>
  `${data.subjects.find((s) => s.id === b.subjectId)?.name ?? '?'} · ${data.groups.find((g) => g.id === b.groupId)?.name ?? '?'} (${b.teacherIds
    .map((t) => data.teachers.find((x) => x.id === t)?.initials ?? '?')
    .join(' + ')})`;

export function ConflictList({ conflicts, data }: { conflicts: Conflict[]; data: AppData }) {
  return (
    <ul className="conflict-list">
      {conflicts.map((c) => {
        const { resources, other } = describeConflict(c, data);
        if (!other) return null;
        return (
          <li key={c.otherId}>
            <strong>{capitalize(resources.join(', '))}</strong> er optaget af {blockTitle(other, data)} i{' '}
            {data.rooms.find((r) => r.id === other.roomId)?.name} kl. {formatRange(other.start, other.end)}
          </li>
        );
      })}
    </ul>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ConflictDialog({
  conflicts,
  data,
  actionLabel,
  onKeep,
  onCancel,
}: {
  conflicts: Conflict[];
  data: AppData;
  actionLabel: string;
  onKeep: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={
        <>
          <Icon name="alert" /> Konflikt ved {actionLabel.toLowerCase()}
        </>
      }
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel} data-autofocus>
            Annuller ændringen
          </button>
          <button className="btn btn-warn" onClick={onKeep}>
            Behold med konflikt
          </button>
        </>
      }
    >
      <p>Ændringen overlapper med anden undervisning samme dag:</p>
      <ConflictList conflicts={conflicts} data={data} />
      <p className="muted small">
        Annuller bevarer den tidligere tilstand. Beholder du konflikten, markeres blokkene i skemaet og i konfliktoversigten, og de
        tæller fortsat med i timeopgørelsen. Andre blokke flyttes aldrig automatisk.
      </p>
    </Modal>
  );
}

export function ConflictOverview({ data, onClose, onShow }: { data: AppData; onClose: () => void; onShow: (b: Block) => void }) {
  const { pairs } = allConflicts(data.blocks);
  return (
    <Modal title={`Konflikter (${pairs.length})`} onClose={onClose}>
      {pairs.length === 0 ? (
        <p>Ingen konflikter i skemaet.</p>
      ) : (
        <ul className="conflict-overview">
          {pairs.map((c) => {
            const a = data.blocks.find((b) => b.id === c.blockId)!;
            const b = data.blocks.find((x) => x.id === c.otherId)!;
            const { resources } = describeConflict(c, data);
            return (
              <li key={`${c.blockId}-${c.otherId}`}>
                <div className="co-head">
                  <span className="co-day">{DAY_NAMES[a.day]}</span>
                  <span className="co-res">Fælles: {resources.join(', ')}</span>
                </div>
                {[a, b].map((x) => (
                  <button key={x.id} className="co-block" onClick={() => onShow(x)}>
                    <span className="tabular">{formatRange(x.start, x.end)}</span> {blockTitle(x, data)} ·{' '}
                    {data.rooms.find((r) => r.id === x.roomId)?.name}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
