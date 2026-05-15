import { query, queryOne } from './connection.mjs';

/**
 * 获取或创建实体映射
 */
export async function getOrCreateEntity(rawName, entityType, canonicalName = null, confidence = 1.0) {
  // 先尝试查找已存在的映射
  const existing = await getEntityByRawName(rawName, entityType);
  if (existing) {
    return existing;
  }

  // 如果没有提供标准化名称，使用原始名称
  const finalCanonicalName = canonicalName || rawName;

  // 查找是否已存在相同的标准化名称
  const existingCanonical = await getEntityByCanonicalName(finalCanonicalName, entityType);
  if (existingCanonical) {
    // 创建一个指向已有标准化实体的新映射
    return await createEntityMapping(rawName, finalCanonicalName, entityType, confidence);
  }

  // 创建新的实体
  const sql = `
    INSERT INTO entity_mapping (raw_name, canonical_name, entity_type, confidence)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const result = await query(sql, [rawName, finalCanonicalName, entityType, confidence]);
  return result.rows[0];
}

/**
 * 创建实体映射（指向已有标准化实体）
 */
export async function createEntityMapping(rawName, canonicalName, entityType, confidence = 1.0) {
  const sql = `
    INSERT INTO entity_mapping (raw_name, canonical_name, entity_type, confidence)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (raw_name, entity_type)
    DO UPDATE SET
      canonical_name = EXCLUDED.canonical_name,
      confidence = EXCLUDED.confidence,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const result = await query(sql, [rawName, canonicalName, entityType, confidence]);
  return result.rows[0];
}

/**
 * 根据原始名称和类型获取实体
 */
export async function getEntityByRawName(rawName, entityType) {
  const sql = 'SELECT * FROM entity_mapping WHERE raw_name = $1 AND entity_type = $2;';
  return await queryOne(sql, [rawName, entityType]);
}

/**
 * 根据标准化名称和类型获取实体
 */
export async function getEntityByCanonicalName(canonicalName, entityType) {
  const sql = 'SELECT * FROM entity_mapping WHERE canonical_name = $1 AND entity_type = $2 LIMIT 1;';
  return await queryOne(sql, [canonicalName, entityType]);
}

/**
 * 根据名称做精确匹配（优先 raw_name，其次 canonical_name）
 */
export async function findExactEntityByName(name, entityTypes = []) {
  const cleanedName = String(name || '').trim();
  if (!cleanedName) return null;

  const params = [cleanedName.toLowerCase()];
  const filters = ['(LOWER(raw_name) = $1 OR LOWER(canonical_name) = $1)'];
  let paramIndex = 2;

  if (Array.isArray(entityTypes) && entityTypes.length > 0) {
    filters.push(`entity_type = ANY($${paramIndex}::text[])`);
    params.push(entityTypes);
    paramIndex++;
  }

  const sql = `
    SELECT *,
      CASE
        WHEN LOWER(raw_name) = $1 THEN 2
        WHEN LOWER(canonical_name) = $1 THEN 1
        ELSE 0
      END AS match_priority
    FROM entity_mapping
    WHERE ${filters.join(' AND ')}
    ORDER BY match_priority DESC, confidence DESC, updated_at DESC, id ASC
    LIMIT 1;
  `;

  return await queryOne(sql, params);
}

/**
 * 候选召回：为 LLM 对齐提供少量候选实体
 */
export async function searchEntityCandidates(name, entityTypes = [], limit = 8) {
  const cleanedName = String(name || '').trim();
  if (!cleanedName) return [];

  const params = [cleanedName.toLowerCase(), `%${cleanedName}%`];
  const filters = ['(LOWER(raw_name) = $1 OR LOWER(canonical_name) = $1 OR raw_name ILIKE $2 OR canonical_name ILIKE $2)'];
  let paramIndex = 3;

  if (Array.isArray(entityTypes) && entityTypes.length > 0) {
    filters.push(`entity_type = ANY($${paramIndex}::text[])`);
    params.push(entityTypes);
    paramIndex++;
  }

  params.push(limit);

  const sql = `
    SELECT *,
      CASE
        WHEN LOWER(raw_name) = $1 THEN 100
        WHEN LOWER(canonical_name) = $1 THEN 95
        WHEN raw_name ILIKE $2 THEN 70
        WHEN canonical_name ILIKE $2 THEN 60
        ELSE 0
      END AS match_score
    FROM entity_mapping
    WHERE ${filters.join(' AND ')}
    ORDER BY match_score DESC, confidence DESC, updated_at DESC, id ASC
    LIMIT $${paramIndex};
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 根据ID获取实体
 */
export async function getEntityById(id) {
  const sql = 'SELECT * FROM entity_mapping WHERE id = $1;';
  return await queryOne(sql, [id]);
}

/**
 * 为已有标准实体补一个新的 raw_name 别名
 */
export async function ensureEntityAlias(rawName, existingEntity, confidence = null) {
  if (!existingEntity || !rawName) return existingEntity;

  const cleanedRawName = String(rawName).trim();
  if (!cleanedRawName) return existingEntity;

  const alreadyExists = await getEntityByRawName(cleanedRawName, existingEntity.entity_type);
  if (alreadyExists) {
    return alreadyExists;
  }

  const sql = `
    INSERT INTO entity_mapping (
      raw_name, canonical_name, entity_type, parent_entity_id, confidence
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (raw_name, entity_type)
    DO UPDATE SET
      canonical_name = EXCLUDED.canonical_name,
      parent_entity_id = COALESCE(entity_mapping.parent_entity_id, EXCLUDED.parent_entity_id),
      confidence = GREATEST(entity_mapping.confidence, EXCLUDED.confidence),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  return await queryOne(sql, [
    cleanedRawName,
    existingEntity.canonical_name,
    existingEntity.entity_type,
    existingEntity.parent_entity_id || null,
    confidence ?? existingEntity.confidence ?? 0.8
  ]);
}

/**
 * 获取所有实体类型
 */
export async function getEntityTypes() {
  const sql = 'SELECT DISTINCT entity_type FROM entity_mapping ORDER BY entity_type;';
  const result = await query(sql);
  return result.rows.map(r => r.entity_type);
}

/**
 * 获取某种类型的所有实体
 */
export async function getEntitiesByType(entityType, page = 1, limit = 100) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT DISTINCT canonical_name, entity_type, MIN(id) as id
    FROM entity_mapping
    WHERE entity_type = $1
    GROUP BY canonical_name, entity_type
    ORDER BY canonical_name
    LIMIT $2 OFFSET $3;
  `;
  const result = await query(sql, [entityType, limit, offset]);
  return result.rows;
}

/**
 * 搜索实体
 */
export async function searchEntities(q, entityType = null) {
  const conditions = ['(raw_name ILIKE $1 OR canonical_name ILIKE $1)'];
  const params = [`%${q}%`];

  if (entityType) {
    conditions.push('entity_type = $2');
    params.push(entityType);
  }

  const sql = `
    SELECT DISTINCT canonical_name, entity_type, MIN(id) as id
    FROM entity_mapping
    WHERE ${conditions.join(' AND ')}
    GROUP BY canonical_name, entity_type
    ORDER BY canonical_name
    LIMIT 50;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 更新实体
 */
export async function updateEntity(id, updates) {
  const allowedFields = ['canonical_name', 'entity_type', 'confidence'];
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `
    UPDATE entity_mapping
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *;
  `;

  return await queryOne(sql, params);
}

/**
 * 删除实体映射（同时更新所有指向该实体的映射）
 */
export async function deleteEntityMapping(id) {
  const sql = 'DELETE FROM entity_mapping WHERE id = $1 RETURNING *;';
  return await queryOne(sql, [id]);
}

/**
 * 获取或创建带层级的实体
 * @param {string} rawName - 原始名称
 * @param {string} canonicalName - 标准化名称
 * @param {string} entityType - 实体类型
 * @param {string|null} parentCanonicalName - 父实体标准化名称（可选）
 * @param {number} confidence - 置信度
 * @returns {object} { entity, parentEntity }
 */
export async function getOrCreateEntityWithHierarchy(rawName, canonicalName, entityType, parentCanonicalName = null, confidence = 1.0, options = {}) {
  let parentEntityId = null;

  // 如果有父实体，先获取或创建父实体
  if (isPositiveInt(options.parentEntityId)) {
    parentEntityId = Number(options.parentEntityId);
  } else if (parentCanonicalName) {
    const parentEntity = await getOrCreateEntity(parentCanonicalName, options.parentEntityType || 'organization', parentCanonicalName, confidence);
    parentEntityId = parentEntity.id;
  }
  const entitySubtype = String(options.entitySubtype || '').trim() || null;

  // 先检查是否已存在
  const existing = await getEntityByRawName(rawName, entityType);
  if (existing) {
    // 如果已有记录但没有 parent_entity_id，且现在有父实体，则更新
    if (parentEntityId && !existing.parent_entity_id) {
      const updateSql = `
        UPDATE entity_mapping
        SET parent_entity_id = $1,
            entity_subtype = COALESCE(entity_subtype, $3),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *;
      `;
      const updated = await queryOne(updateSql, [parentEntityId, existing.id, entitySubtype]);
      return { entity: updated, parentEntity: parentEntityId ? await getEntityById(parentEntityId) : null };
    }
    if (entitySubtype && !existing.entity_subtype) {
      const updated = await queryOne(`
        UPDATE entity_mapping
        SET entity_subtype = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *;
      `, [entitySubtype, existing.id]);
      return { entity: updated, parentEntity: parentEntityId ? await getEntityById(parentEntityId) : null };
    }
    return { entity: existing, parentEntity: parentEntityId ? await getEntityById(parentEntityId) : null };
  }

  // 创建新实体
  const sql = `
    INSERT INTO entity_mapping (raw_name, canonical_name, entity_type, parent_entity_id, entity_subtype, confidence)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const result = await query(sql, [rawName, canonicalName, entityType, parentEntityId, entitySubtype, confidence]);
  return { entity: result.rows[0], parentEntity: parentEntityId ? await getEntityById(parentEntityId) : null };
}

/**
 * 获取实体的完整层级链
 * @param {number} entityId - 实体ID
 * @returns {array} 层级链，从顶层父实体到当前实体
 */
export async function getEntityHierarchy(entityId) {
  const hierarchy = [];
  let currentId = entityId;

  while (currentId) {
    const entity = await getEntityById(currentId);
    if (!entity) break;
    hierarchy.unshift(entity);
    currentId = entity.parent_entity_id;
  }

  return hierarchy;
}

/**
 * 根据父实体ID获取所有子实体
 * @param {number} parentEntityId - 父实体ID
 * @returns {array} 子实体列表
 */
export async function getEntitiesByParent(parentEntityId) {
  const sql = 'SELECT * FROM entity_mapping WHERE parent_entity_id = $1 ORDER BY canonical_name;';
  const result = await query(sql, [parentEntityId]);
  return result.rows;
}

function isPositiveInt(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}
