// Konfliktdialog: viser konkret, hvilken ressource og hvilken anden klasse der konfliktes med.
import { describeConflict, slotTitle, type Conflict } from '../../shared/conflicts';
import type { AppData } from '../../shared/schema';
import { formatRange } from '../../shared/time';
import { Icon, Modal } from './ui';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ConflictList({ conflicts, data }: { conflicts: Conflict[]; data: AppData }) {
  return (
    <ul className="conflict-list">
      {conflicts.map((c) => {
        const { resources, other } = describeConflict(c, data);
        if (!other) return null;
        const room = data.rooms.find((r) => r.id === other.roomId)?.name;
        return (
          <li key={`${c.blockId}-${c.otherId}`}>
            <strong>{capitalize(resources.join(', '))}</strong> er optaget af {slotTitle(c.otherId, data)}
            {room ? ` i ${room}` : ''} kl. {formatRange(other.start, other.end)}
          </li>
        );
      })}
    </ul>
  );
}

export function ConflictDialog({ conflicts, data, actionLabel, onKeep, onCancel }: { conflicts: Conflict[]; data: AppData; actionLabel: string; onKeep: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={
        <>
          <Icon name="alert" size={20} /> Konflikt
        </>
      }
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onCancel} data-autofocus>
            Annuller
          </button>
          <button className="btn btn-primary" onClick={onKeep}>
            Behold med konflikt
          </button>
        </>
      }
    >
      <p>
        <strong>{actionLabel}</strong> overlapper med anden undervisning samme dag:
      </p>
      <ConflictList conflicts={conflicts} data={data} />
      <p className="hint">Annuller bevarer det tidligere skema. Beholder du konflikten, markeres klasserne, og de tæller fortsat med i timerne.</p>
    </Modal>
  );
}
