/**
 * BIOZAR — Moteur de synchronisation semi-offline
 * ─────────────────────────────────────────────────────────────────────
 * Deux flux indépendants :
 *
 *   PUSH  rejeu strictement séquentiel de la file d'attente (outbox),
 *         avec backoff exponentiel et reprise après interruption.
 *
 *   PULL  récupération des changements distants postérieurs à
 *         `last_synced_at` (persisté en base, PAS en mémoire), appliqués
 *         ligne par ligne avec Last-Write-Wins.
 *
 * Résolution de conflits — par entité, jamais sur un document entier :
 *   1. `updated_at` le plus récent gagne ;
 *   2. à égalité (±TIE_WINDOW_MS), l'horloge locale n'étant pas fiable,
 *      arbitrage déterministe sur `device_id` ;
 *   3. le perdant est archivé dans `conflicts_log` (rien n'est jeté) ;
 *   4. les champs `unionFields` dont la valeur diverge sont signalés
 *      pour revue opérateur au lieu d'être écrasés en silence.
 */

import { ENTITY_SPECS } from './schema.js';

const TIE_WINDOW_MS = 50; // en dessous, on considère les horloges indiscernables
const MAX_ATTEMPTS = 8; // au-delà → status 'dead', intervention humaine
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

// ═══════════════════════════════════════════════════════════════
//  Résolution de conflits (pure, testable isolément)
// ═══════════════════════════════════════════════════════════════

/**
 * @returns {'local'|'remote'} qui gagne entre la ligne locale et la distante
 */
function resolveWinner(local, remote) {
  const lt = Number(local.updated_at) || 0;
  const rt = Number(remote.updated_at) || 0;

  if (rt > lt + TIE_WINDOW_MS) return 'remote';
  if (lt > rt + TIE_WINDOW_MS) return 'local';

  // Égalité : les horloges embarquées dérivent. On arbitre de façon
  // déterministe et reproductible sur l'identifiant d'appareil.
  return String(remote.device_id) > String(local.device_id) ? 'remote' : 'local';
}

/** Champs critiques dont la divergence doit être signalée, pas effacée. */
function divergentUnionFields(entity, local, remote) {
  const spec = ENTITY_SPECS[entity];
  if (!spec || !spec.unionFields) return [];

  return spec.unionFields.filter((field) => {
    const l = local[field];
    const r = remote[field];
    const lEmpty = l === null || l === undefined || l === '' || l === 0;
    const rEmpty = r === null || r === undefined || r === '' || r === 0;
    if (lEmpty || rEmpty) return false;
    return String(l) !== String(r);
  });
}

function backoffMs(attempts) {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

// ═══════════════════════════════════════════════════════════════
//  Moteur
// ═══════════════════════════════════════════════════════════════

class SyncEngine {
  /**
   * @param {Db} db
   * @param {object} transport  { push(entity, rows), pull(entity, since), health() }
   * @param {object} [opts]     { onStatus, logger }
   */
  constructor(db, transport, opts = {}) {
    this.db = db;
    this.transport = transport;
    this.onStatus = opts.onStatus || (() => {});
    this.log = opts.logger || console;

    this.running = false;
    this.aborted = false;
    this.stats = { pushed: 0, pulled: 0, conflicts: 0, errors: 0, dead: 0 };
  }

  // ── Cycle complet ─────────────────────────────────────────

  /**
   * push() puis pull(). Idempotent : peut être relancé autant de fois
   * que nécessaire, y compris après une coupure en cours de route.
   */
  async syncOnce({ signal, ignoreBackoff = false } = {}) {
    if (this.running) {
      return { skipped: true, reason: 'already-running' };
    }

    this.running = true;
    this.aborted = false;
    this.stats = { pushed: 0, pulled: 0, conflicts: 0, errors: 0, dead: 0 };
    this.onStatus('syncing', { pending: await this.db.countPending() });

    try {
      // Une synchro interrompue laisse des lignes 'in_flight' :
      // on les remet en file avant tout, sinon elles sont perdues.
      await this.recoverInterrupted();

      const pushResult = await this.push({ signal, ignoreBackoff });
      const pullResult = await this.pull({ signal });

      // Point critique : on n'avance `last_synced_at` que si le cycle est
      // allé au bout. L'avancer après une coupure ferait croire au prochain
      // pull que tout est à jour, et les changements distants intermédiaires
      // seraient définitivement manqués.
      if (!this.aborted && this.stats.errors === 0) {
        await this.db.setSetting('last_synced_at', String(Date.now()));
      }

      const pending = await this.db.countPending();
      const state = this.aborted || pending > 0 ? 'sync_error' : 'online';
      this.onStatus(state, { pending, ...this.stats });

      return {
        ...this.stats,
        ok: !this.aborted && this.stats.errors === 0,
        aborted: this.aborted,
        pushed: pushResult.sent,
        pulled: pullResult.applied,
        pending
      };
    } catch (e) {
      this.log.warn('[sync] échec du cycle :', e.message);
      this.onStatus('sync_error', { pending: await this.db.countPending(), error: e.message });
      throw e;
    } finally {
      this.running = false;
    }
  }

  /** Remet en file les opérations interrompues par un crash / kill. */
  async recoverInterrupted() {
    const r = await this.db.exec(
      "UPDATE outbox SET status = 'pending' WHERE status = 'in_flight'"
    );
    const recovered = (r && r.changes) || 0;
    if (recovered > 0) {
      this.log.info(`[sync] ${recovered} opération(s) interrompue(s) remise(s) en file`);
    }
    return recovered;
  }

  // ── PUSH ──────────────────────────────────────────────────

  async push({ signal, ignoreBackoff = false } = {}) {
    let sent = 0;

    for (;;) {
      if (this.aborted || (signal && signal.aborted)) {
        this.aborted = true;
        break;
      }

      const item = await this.db.get(
        `SELECT * FROM outbox
          WHERE status IN ('pending','conflict') AND next_retry <= ?
          ORDER BY seq ASC LIMIT 1`,
        [ignoreBackoff ? Number.MAX_SAFE_INTEGER : Date.now()]
      );
      if (!item) break;

      // Réserver la ligne : si le processus meurt ici, recoverInterrupted()
      // la remettra en file au prochain démarrage.
      await this.db.exec("UPDATE outbox SET status = 'in_flight' WHERE seq = ?", [item.seq]);

      try {
        const payload = JSON.parse(item.payload);
        const result = await this.transport.push(item.entity, [payload]);
        const applied = (result && result.applied && result.applied[0]) || null;

        await this.db.transaction(async (tx) => {
          if (applied && applied.server_rev != null) {
            await tx.exec(
              `UPDATE ${item.entity}
                  SET server_rev = ?, dirty = 0
                WHERE id = ?`,
              [Number(applied.server_rev), item.entity_id]
            );
          } else {
            await tx.exec(`UPDATE ${item.entity} SET dirty = 0 WHERE id = ?`, [item.entity_id]);
          }
          await tx.exec("UPDATE outbox SET status = 'done' WHERE seq = ?", [item.seq]);
        });

        sent += 1;
        this.stats.pushed += 1;
      } catch (e) {
        const attempts = item.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        const status = terminal ? 'dead' : 'pending';

        await this.db.exec(
          `UPDATE outbox
              SET attempts = ?, status = ?, last_error = ?, next_retry = ?
            WHERE seq = ?`,
          [attempts, status, String(e.message).slice(0, 500), Date.now() + backoffMs(attempts), item.seq]
        );

        this.stats.errors += 1;
        if (terminal) {
          this.stats.dead += 1;
          this.log.warn(`[sync] opération #${item.seq} abandonnée après ${attempts} tentatives`);
        }

        // Une erreur réseau interrompt le cycle : on ne vide pas la file
        // en boucle contre un serveur injoignable.
        if (isNetworkError(e)) {
          this.aborted = true;
          break;
        }
      }
    }

    return { sent };
  }

  // ── PULL ──────────────────────────────────────────────────

  async pull({ signal } = {}) {
    const since = Number((await this.db.getSetting('last_synced_at')) || 0);
    let applied = 0;

    for (const entity of Object.keys(ENTITY_SPECS)) {
      if (this.aborted || (signal && signal.aborted)) {
        this.aborted = true;
        break;
      }

      let rows;
      try {
        rows = await this.transport.pull(entity, since);
      } catch (e) {
        this.stats.errors += 1;
        if (isNetworkError(e)) {
          this.aborted = true;
          break;
        }
        this.log.warn(`[sync] pull ${entity} ignoré : ${e.message}`);
        continue;
      }

      for (const remote of rows || []) {
        const outcome = await this.applyRemote(entity, remote);
        applied += outcome === 'applied' ? 1 : 0;
      }
    }

    this.stats.pulled = applied;
    return { applied };
  }

  /**
   * Applique une ligne distante en respectant le LWW par entité.
   * @returns {'applied'|'kept_local'|'logged'}
   */
  async applyRemote(entity, remote) {
    const spec = ENTITY_SPECS[entity];
    if (!spec) return 'kept_local';

    const local = await this.db.findById(entity, remote.id);

    // Ligne inconnue localement → insertion propre, non marquée dirty.
    if (!local) {
      const columns = ['id', 'device_id', 'updated_at', 'server_rev', 'deleted', 'dirty',
        ...spec.columns.map(([c]) => c)];
      const values = [
        remote.id,
        remote.device_id || this.db.deviceId,
        Number(remote.updated_at) || Date.now(),
        Number(remote.server_rev) || 0,
        Number(remote.deleted) || 0,
        0, // pas dirty : ça vient du serveur
        ...spec.columns.map(([c]) => (remote[c] === undefined ? null : remote[c]))
      ];

      await this.db.exec(
        `INSERT INTO ${entity} (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
        values
      );
      return 'applied';
    }

    const winner = resolveWinner(local, remote);
    const divergences = divergentUnionFields(entity, local, remote);

    if (divergences.length > 0) {
      await this.db.exec(
        `INSERT INTO conflicts_log
           (entity, entity_id, resolution, local_json, remote_json, winner, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entity,
          remote.id,
          'union_divergence:' + divergences.join(','),
          JSON.stringify(local),
          JSON.stringify(remote),
          winner,
          Date.now()
        ]
      );
      this.stats.conflicts += 1;
    }

    if (winner === 'local') {
      // Le distant est périmé (réplica en retard, pull rejoué…). On ne touche
      // à rien : si notre version était déjà dirty, elle partira au prochain
      // push ; sinon elle n'a pas besoin d'être repoussée. Remettre dirty à 1
      // ici créerait une boucle de re-push inutile.
      return 'kept_local';
    }

    // Le distant gagne.
    const assignments = spec.columns.map(([c]) => `${c} = ?`).join(', ');
    await this.db.exec(
      `UPDATE ${entity}
          SET ${assignments},
              device_id = ?, updated_at = ?, server_rev = ?, deleted = ?, dirty = 0
        WHERE id = ?`,
      [
        ...spec.columns.map(([c]) => (remote[c] === undefined ? null : remote[c])),
        remote.device_id || this.db.deviceId,
        Number(remote.updated_at) || Date.now(),
        Number(remote.server_rev) || 0,
        Number(remote.deleted) || 0,
        remote.id
      ]
    );

    // Notre version perdue est archivée : l'opérateur peut la retrouver.
    await this.db.exec(
      `INSERT INTO conflicts_log
         (entity, entity_id, resolution, local_json, remote_json, winner, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entity,
        remote.id,
        'last_write_wins',
        JSON.stringify(local),
        JSON.stringify(remote),
        'remote',
        Date.now()
      ]
    );
    this.stats.conflicts += 1;

    // Notre écriture locale devenue obsolète ne doit plus être poussée.
    await this.db.exec(
      `DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ('pending','conflict')`,
      [entity, remote.id]
    );

    return 'applied';
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function isNetworkError(e) {
  const msg = String(e && e.message ? e.message : e).toLowerCase();
  return (
    e instanceof TypeError ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  );
}

export { SyncEngine, resolveWinner, divergentUnionFields, backoffMs, isNetworkError, TIE_WINDOW_MS, MAX_ATTEMPTS };
