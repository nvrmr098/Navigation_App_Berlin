import React from 'react';
import { tr } from './i18n.js';

/* Train symbol: six coaches, the coach to board is lit, an arrow shows the direction of travel.
 * The front of the train is on the right, in the direction of travel. */
const LIT = { front: [5], middle: [2, 3], rear: [0] };

export function CoachGuide({ pos, toward, color }) {
  const lit = LIT[pos] || [];
  const col = color || '#4f6bff';
  const W = 44, G = 4, X0 = 6;
  return (
    <figure className="coach" aria-label={tr('coachBoard') + ': ' + tr(pos)}>
      <div className="co-dir">
        <span className="co-line" />
        <svg viewBox="0 0 24 12" width="26" height="13" aria-hidden="true" className="co-head"><path d="M2 6h17M14 1.5L20 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="co-txt">{tr('coachDir')}{toward ? ': ' + toward : ''}</span>
      </div>
      <svg viewBox="0 0 296 50" className="co-train" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const x = X0 + i * (W + G), on = lit.indexOf(i) > -1;
          return (
            <g key={i} className={on ? 'on' : ''}>
              <rect x={x} y="6" width={W} height="30" rx={i === 5 ? 13 : 7} fill={on ? col : 'currentColor'} opacity={on ? 1 : 0.22} />
              {[0, 1, 2].map((k) => <rect key={k} x={x + 6 + k * 12} y="12" width="8" height="8" rx="2" fill={on ? '#fff' : 'currentColor'} opacity={on ? 0.95 : 0.35} />)}
              <circle cx={x + 11} cy="40" r="3.2" fill="currentColor" opacity=".45" /><circle cx={x + W - 11} cy="40" r="3.2" fill="currentColor" opacity=".45" />
              {on && <g><path d={'M' + (x + W / 2) + ' 49l-5-6h10z'} fill={col} /></g>}
            </g>
          );
        })}
      </svg>
      <figcaption>{tr('coachBoard')}: <b>{tr(pos)}</b></figcaption>
    </figure>
  );
}
