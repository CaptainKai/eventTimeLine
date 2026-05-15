import { query, queryOne } from './connection.mjs';
import { ACTION_SYNONYM_MAP, ACTION_TAXONOMY } from '../config/event-taxonomy.mjs';

export async function seedStandardActionsFromConfig() {
  for (const [category, actions] of Object.entries(ACTION_TAXONOMY)) {
    for (const actionKey of actions) {
      await upsertStandardAction({
        actionKey,
        displayName: actionKey,
        actionCategory: category,
        confidence: 1.0
      });
    }
  }

  for (const [rawAction, standardAction] of Object.entries(ACTION_SYNONYM_MAP)) {
    const action = await findStandardAction(standardAction);
    if (action) {
      await ensureActionMapping(rawAction, action.id, 0.9, 'config');
    }
  }
}

export async function findStandardAction(rawAction) {
  const cleaned = normalizeAction(rawAction);
  if (!cleaned) return null;

  const direct = await queryOne(`
    SELECT *
    FROM standard_actions
    WHERE LOWER(action_key) = LOWER($1)
       OR LOWER(display_name) = LOWER($1)
    ORDER BY confidence DESC, id ASC
    LIMIT 1
  `, [cleaned]);
  if (direct) return direct;

  const mapped = await queryOne(`
    SELECT sa.*, am.raw_action, am.confidence AS mapping_confidence
    FROM action_mappings am
    JOIN standard_actions sa ON sa.id = am.action_id
    WHERE LOWER(am.raw_action) = LOWER($1)
    ORDER BY am.confidence DESC, sa.confidence DESC, sa.id ASC
    LIMIT 1
  `, [cleaned]);
  if (mapped) return mapped;

  const configMatch = ACTION_SYNONYM_MAP[cleaned] || ACTION_SYNONYM_MAP[rawAction];
  if (configMatch) {
    return findStandardAction(configMatch);
  }

  return null;
}

export async function searchActionCandidates(rawAction, limit = 8) {
  const cleaned = normalizeAction(rawAction);
  if (!cleaned) return [];

  const result = await query(`
    SELECT DISTINCT ON (sa.id)
      sa.*,
      am.raw_action,
      CASE
        WHEN LOWER(sa.action_key) = LOWER($1) THEN 100
        WHEN LOWER(sa.display_name) = LOWER($1) THEN 95
        WHEN LOWER(am.raw_action) = LOWER($1) THEN 90
        WHEN sa.action_key ILIKE $2 THEN 70
        WHEN sa.display_name ILIKE $2 THEN 65
        WHEN am.raw_action ILIKE $2 THEN 60
        ELSE 0
      END AS match_score
    FROM standard_actions sa
    LEFT JOIN action_mappings am ON am.action_id = sa.id
    WHERE sa.action_key ILIKE $2
       OR sa.display_name ILIKE $2
       OR am.raw_action ILIKE $2
    ORDER BY sa.id, match_score DESC, sa.confidence DESC
    LIMIT $3
  `, [cleaned, `%${cleaned}%`, limit]);

  return result.rows.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0));
}

export async function upsertStandardAction({ actionKey, displayName = null, actionCategory = null, description = null, confidence = 0.85 }) {
  const cleanedKey = normalizeActionKey(actionKey || displayName);
  if (!cleanedKey) throw new Error('actionKey is required');

  const result = await query(`
    INSERT INTO standard_actions (action_key, display_name, action_category, description, confidence)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (action_key) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, standard_actions.display_name),
      action_category = COALESCE(EXCLUDED.action_category, standard_actions.action_category),
      description = COALESCE(EXCLUDED.description, standard_actions.description),
      confidence = GREATEST(standard_actions.confidence, EXCLUDED.confidence),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [cleanedKey, displayName || cleanedKey, actionCategory, description, confidence]);

  return result.rows[0];
}

export async function ensureActionMapping(rawAction, actionId, confidence = 0.8, source = 'manual') {
  const cleaned = normalizeAction(rawAction);
  if (!cleaned || !actionId) return null;

  const result = await query(`
    INSERT INTO action_mappings (raw_action, action_id, confidence, source)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (raw_action) DO UPDATE SET
      action_id = EXCLUDED.action_id,
      confidence = GREATEST(action_mappings.confidence, EXCLUDED.confidence),
      source = EXCLUDED.source,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [cleaned, actionId, confidence, source]);

  return result.rows[0];
}

function normalizeAction(value) {
  return String(value || '').trim();
}

function normalizeActionKey(value) {
  return normalizeAction(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

