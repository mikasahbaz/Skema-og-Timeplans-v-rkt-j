import type { Counts } from './api';
import { Icon, Modal } from './ui';

export interface ImportState {
  fileName: string;
  json: unknown;
  preview: { ok: boolean; errors: string[]; incoming: Counts | null; current: Counts; currentVersion: number };
}

const line = (c: Counts) => `${c.blocks} blokke, ${c.teachers} lærere, ${c.subjects} fag og ${c.groups} hold`;

export function ImportDialog({ state, onCancel, onConfirm }: { state: ImportState; onCancel: () => void; onConfirm: () => void }) {
  const { preview } = state;
  return (
    <Modal
      title="Importér backup"
      onClose={onCancel}
      footer={
        preview.ok ? (
          <>
            <button className="btn" onClick={onCancel} data-autofocus>
              Annuller
            </button>
            <a className="btn" href="/api/export" download>
              <Icon name="download" size={14} /> Gem nuværende først
            </a>
            <button className="btn btn-warn" onClick={onConfirm}>
              Erstat alle data
            </button>
          </>
        ) : (
          <button className="btn" onClick={onCancel} data-autofocus>
            Luk
          </button>
        )
      }
    >
      <p>
        Fil: <strong>{state.fileName}</strong>
      </p>
      {preview.ok && preview.incoming ? (
        <>
          <div className="notice notice-warn">
            <strong>Alle nuværende data erstattes.</strong> Det gælder skemaet med {line(preview.current)}, samt salenavne, farver og
            beregningsindstillinger (version {preview.currentVersion}).
          </div>
          <p>Filen indeholder {line(preview.incoming)}. Filen er kontrolleret og gyldig.</p>
          <p className="muted small">Fortryd-historikken nulstilles efter import. Serveren gemmer den tidligere version som revision.</p>
        </>
      ) : (
        <>
          <div className="notice notice-conflict">Filen kan ikke importeres. Intet er ændret.</div>
          <ul className="errors">
            {preview.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
