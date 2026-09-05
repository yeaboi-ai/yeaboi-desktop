// The masthead: the nameplate between two hairlines, the folio line under it
// (the date, the volume, the edition with its refresh button), and the double rule.

import { MASTHEAD_WORD } from '@/lib/news/masthead';

export function Masthead({
  dateline,
  volume,
  edition,
  refreshLabel = '',
  onRefresh,
}: {
  dateline: string;
  volume: string;
  edition: string;
  /** The words on the refresh button; "" hides it. */
  refreshLabel?: string;
  onRefresh?: () => void;
}) {
  return (
    <header className="paper-masthead">
      <h1 className="paper-nameplate">{MASTHEAD_WORD}</h1>
      <p className="paper-folio">
        <span>{dateline}</span>
        <span>{volume}</span>
        <span>
          {edition}
          {refreshLabel && onRefresh && (
            <>
              {' '}
              <button type="button" className="paper-refresh" onClick={onRefresh}>
                {refreshLabel}
              </button>
            </>
          )}
        </span>
      </p>
      <hr className="paper-rule" />
    </header>
  );
}
