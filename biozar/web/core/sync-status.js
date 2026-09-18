/**
 * BIOZAR — Indicateur d'état réseau & synchronisation
 * ─────────────────────────────────────────────────────────────────────
 * Un seul composant, discret, en pied de sidebar (l'emplacement
 * `#cloud-status` existant est réutilisé).
 *
 * Parti pris : aucune animation permanente, aucun halo, aucun dégradé.
 * Un état = une couleur + un libellé explicite + un compteur réel.
 * Le compteur informe là où une pulsation ne ferait que décorer.
 *
 *   ● Synchronisé            vert   — file vide, serveur joignable
 *   ● 3 en attente           ambre  — travail local non poussé
 *   ○ Hors-ligne             gris   — point creux, aucune animation
 *   ! Échec · 2 en attente   rouge  — avec action « Réessayer »
 */

const STATES = {
  online: {
    glyph: '●',
    label: 'Synchronisé',
    color: 'var(--green-mid, #2d6a35)',
    action: null
  },
  offline: {
    glyph: '○',
    label: 'Hors-ligne',
    color: 'var(--text-muted, #8a8f8c)',
    action: null
  },
  syncing: {
    glyph: '◐',
    label: 'Synchronisation…',
    color: 'var(--gold, #f9a825)',
    action: null
  },
  sync_error: {
    glyph: '!',
    label: 'Échec de synchro',
    color: '#c0392b',
    action: 'Réessayer'
  }
};

const CSS = `
.sync-indicator{display:flex;align-items:center;gap:8px;padding:8px 10px;
  border:1px solid var(--border,rgba(255,255,255,.14));border-radius:8px;
  background:transparent;font-size:12px;line-height:1.2;
  color:var(--sync-fg,rgba(255,255,255,.72));transition:border-color .15s ease,color .15s ease}
.sync-indicator__glyph{width:14px;flex:0 0 14px;text-align:center;font-size:11px;
  color:var(--sync-color);font-weight:700}
.sync-indicator__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sync-indicator__count{flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:600;
  padding:1px 6px;border-radius:10px;border:1px solid var(--sync-color);color:var(--sync-color);font-size:11px}
.sync-indicator__action{flex:0 0 auto;background:none;border:1px solid currentColor;
  color:inherit;font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer}
.sync-indicator__action:hover{background:rgba(255,255,255,.10)}
.sync-indicator__action:focus-visible{outline:2px solid var(--sync-color);outline-offset:2px}
.sync-indicator[data-state='sync_error']{border-color:#c0392b;color:#f0b9b5}
.sync-indicator[data-state='offline']{color:var(--sync-fg,rgba(255,255,255,.5))}
@media (prefers-reduced-motion: no-preference){
  .sync-indicator[data-state='syncing'] .sync-indicator__glyph{animation:sync-turn 1.1s steps(2) infinite}
}
@keyframes sync-turn{from{opacity:1}to{opacity:.35}}
`;

/**
 * Rend l'indicateur dans un conteneur existant.
 *
 * @param {HTMLElement} host       ex. document.getElementById('cloud-status')
 * @param {object} [opts]
 * @param {(state: string) => void} [opts.onRetry]  action du bouton « Réessayer »
 */
function createSyncIndicator(host, opts = {}) {
  if (!host) return null;

  if (!document.getElementById('sync-indicator-css')) {
    const style = document.createElement('style');
    style.id = 'sync-indicator-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  host.className = 'sync-indicator';
  host.innerHTML =
    '<span class="sync-indicator__glyph" aria-hidden="true"></span>' +
    '<span class="sync-indicator__label"></span>' +
    '<span class="sync-indicator__count" hidden></span>' +
    '<button type="button" class="sync-indicator__action" hidden></button>';

  const glyph = host.querySelector('.sync-indicator__glyph');
  const label = host.querySelector('.sync-indicator__label');
  const count = host.querySelector('.sync-indicator__count');
  const action = host.querySelector('.sync-indicator__action');

  if (opts.onRetry) action.addEventListener('click', () => opts.onRetry(host.dataset.state));

  function render(state, info = {}) {
    const def = STATES[state] || STATES.offline;
    const pending = Number(info.pending) || 0;

    host.dataset.state = state;
    host.style.setProperty('--sync-color', def.color);
    host.setAttribute(
      'role',
      state === 'sync_error' ? 'alert' : 'status'
    );

    glyph.textContent = def.glyph;

    // Le compteur remplace l'animation : il donne l'information utile.
    const showCount = pending > 0 && state !== 'syncing';
    count.hidden = !showCount;
    if (showCount) count.textContent = pending;

    label.textContent =
      state === 'sync_error' && pending > 0 ? `${def.label} · ${pending} en attente` : def.label;

    host.setAttribute(
      'aria-label',
      `${def.label}${showCount ? `, ${pending} élément(s) en attente` : ''}`
    );

    action.hidden = !def.action;
    if (def.action) action.textContent = def.action;
  }

  render('offline');
  return { render, el: host };
}

export { createSyncIndicator, STATES };
