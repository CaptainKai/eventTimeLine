import { query, queryOne } from './connection.mjs';

/**
 * 创建事件关系
 */
export async function createEventRelationship(relationship) {
  const sql = `
    INSERT INTO event_relationships (
      source_event_id, target_event_id, relationship_type,
      is_direct, confidence, weight, description, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (source_event_id, target_event_id, relationship_type)
    DO UPDATE SET
      is_direct = $4,
      confidence = $5,
      weight = $6,
      description = $7,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;

  const result = await query(sql, [
    relationship.source_event_id,
    relationship.target_event_id,
    relationship.relationship_type,
    relationship.is_direct !== false,
    relationship.confidence || 0.8,
    relationship.weight || 1.0,
    relationship.description || null
  ]);

  return result.rows[0].id;
}

/**
 * 获取事件的所有关系
 */
export async function getEventRelationships(eventId, options = {}) {
  const conditions = ['source_event_id = $1'];
  const params = [eventId];
  let paramIndex = 2;

  if (options.relationshipType) {
    conditions.push(`relationship_type = $${paramIndex}`);
    params.push(options.relationshipType);
    paramIndex++;
  }

  const sql = `
    SELECT
      er.*,
      e2.id as target_event_id,
      e2.event_type as target_event_type,
      e2.start_time as target_event_time
    FROM event_relationships er
    JOIN events e2 ON er.target_event_id = e2.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY er.relationship_type, er.weight DESC, er.confidence DESC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取事件的反向关系
 */
export async function getEventReverseRelationships(eventId, options = {}) {
  const conditions = ['target_event_id = $1'];
  const params = [eventId];
  let paramIndex = 2;

  if (options.relationshipType) {
    conditions.push(`relationship_type = $${paramIndex}`);
    params.push(options.relationshipType);
    paramIndex++;
  }

  const sql = `
    SELECT
      er.*,
      e1.id as source_event_id,
      e1.event_type as source_event_type,
      e1.start_time as source_event_time
    FROM event_relationships er
    JOIN events e1 ON er.source_event_id = e1.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY er.relationship_type, er.weight DESC, er.confidence DESC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取事件的所有关系（双向）
 */
export async function getEventAllRelationships(eventId, options = {}) {
  const [outgoing, incoming] = await Promise.all([
    getEventRelationships(eventId, options),
    getEventReverseRelationships(eventId, options)
  ]);

  return {
    outgoing: outgoing,
    incoming: incoming
  };
}

/**
 * 删除事件的所有关系
 */
export async function deleteEventRelationships(eventId) {
  const sql = `
    DELETE FROM event_relationships
    WHERE source_event_id = $1 OR target_event_id = $1
    RETURNING id;
  `;

  const result = await query(sql, [eventId]);
  return result.rows.map(row => row.id);
}

/**
 * 批量创建事件关系
 */
export async function bulkCreateEventRelationships(relationships) {
  const results = [];

  for (const relationship of relationships) {
    const id = await createEventRelationship(relationship);
    results.push(id);
  }

  return results;
}

/**
 * 查找事件的父事件（如果有）
 */
export async function getParentEvents(eventId) {
  const sql = `
    SELECT
      er.*,
      e1.id as parent_event_id,
      e1.event_type as parent_event_type,
      e1.start_time as parent_event_time
    FROM event_relationships er
    JOIN events e1 ON er.source_event_id = e1.id
    WHERE er.target_event_id = $1
      AND er.relationship_type = 'parent_child'
    ORDER BY er.confidence DESC, er.weight DESC;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 查找事件的子事件
 */
export async function getChildEvents(eventId) {
  const sql = `
    SELECT
      er.*,
      e2.id as child_event_id,
      e2.event_type as child_event_type,
      e2.start_time as child_event_time
    FROM event_relationships er
    JOIN events e2 ON er.target_event_id = e2.id
    WHERE er.source_event_id = $1
      AND er.relationship_type = 'parent_child'
    ORDER BY er.confidence DESC, er.weight DESC;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 查找事件的因果关系
 */
export async function getCauseEvents(eventId) {
  const sql = `
    SELECT
      er.*,
      e1.id as cause_event_id,
      e1.event_type as cause_event_type,
      e1.start_time as cause_event_time
    FROM event_relationships er
    JOIN events e1 ON er.source_event_id = e1.id
    WHERE er.target_event_id = $1
      AND er.relationship_type = 'cause_effect'
    ORDER BY er.confidence DESC;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 查找事件的影响事件
 */
export async function getEffectEvents(eventId) {
  const sql = `
    SELECT
      er.*,
      e2.id as effect_event_id,
      e2.event_type as effect_event_type,
      e2.start_time as effect_event_time
    FROM event_relationships er
    JOIN events e2 ON er.target_event_id = e2.id
    WHERE er.source_event_id = $1
      AND er.relationship_type = 'cause_effect'
    ORDER BY er.confidence DESC;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 获取全量关系列表（带事件详情），分页
 */
export async function getAllRelationships(page = 1, limit = 50, options = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.relationshipType) {
    conditions.push(`er.relationship_type = $${paramIndex}`);
    params.push(options.relationship_type);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      er.id,
      er.source_event_id,
      er.target_event_id,
      er.relationship_type,
      er.confidence,
      er.weight,
      er.description,
      s.event_type as source_event_type,
      (s.normalized_data->>'title') as source_title,
      s.start_time as source_time,
      s1.canonical_name as source_actor1,
      t.event_type as target_event_type,
      (t.normalized_data->>'title') as target_title,
      t.start_time as target_time,
      t1.canonical_name as target_actor1
    FROM event_relationships er
    JOIN events s ON er.source_event_id = s.id
    LEFT JOIN entity_mapping s1 ON s.actor1_id = s1.id
    JOIN events t ON er.target_event_id = t.id
    LEFT JOIN entity_mapping t1 ON t.actor1_id = t1.id
    ${whereClause}
    ORDER BY er.weight DESC, er.confidence DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;
  const result = await query(sql, [...params, limit, offset]);
  return result.rows;
}

/**
 * 获取全量关系总数
 */
export async function getAllRelationshipsCount() {
  const sql = `SELECT COUNT(*) FROM event_relationships;`;
  const result = await query(sql);
  return parseInt(result.rows[0].count);
}

/**
 * 获取关系图数据
 */
export async function getRelationshipGraph(eventIds = []) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return { nodes: [], links: [] };
  }

  const nodesSql = `
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') as title,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    WHERE e.id = ANY($1::int[])
    ORDER BY e.start_time DESC;
  `;

  const linksSql = `
    SELECT
      er.id,
      er.source_event_id as source,
      er.target_event_id as target,
      er.relationship_type,
      er.confidence,
      er.weight,
      er.description
    FROM event_relationships er
    WHERE
      -- 内部边：两端都在最新事件集合内
      (er.source_event_id = ANY($1::int[]) AND er.target_event_id = ANY($1::int[]))
      -- 出边：source 在最新事件集合内，target 不在（这些新事件指向老事件）
      OR (er.source_event_id = ANY($1::int[]) AND NOT (er.target_event_id = ANY($1::int[])))
      -- 入边：target 在最新事件集合内，source 不在（老事件指向新事件）
      OR (er.target_event_id = ANY($1::int[]) AND NOT (er.source_event_id = ANY($1::int[])))
    ORDER BY er.weight DESC, er.confidence DESC;
  `;

  // 获取每个标准事件对应的一个原子事件标题
  const protoEventsSql = `
    SELECT DISTINCT ON (pe.canonical_event_id)
      pe.canonical_event_id,
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw,
      n.title as news_title
    FROM proto_events pe
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.canonical_event_id = ANY($1::int[])
    ORDER BY pe.canonical_event_id, pe.created_at DESC;
  `;

  // 先查 links（用原始 eventIds），收集所有涉及的节点 ID
  const rawLinks = await query(linksSql, [eventIds]);

  // 合并原始节点 ID 和外部 connected 节点 ID
  const connectedIds = new Set(eventIds);
  rawLinks.rows.forEach(link => {
    connectedIds.add(link.source);
    connectedIds.add(link.target);
  });
  const allConnectedIds = Array.from(connectedIds);

  // 用 allConnectedIds 查 nodes 和 protoEvents（一次查询，不用第二次 links 查询）
  const [nodesResult, protoEventsResult] = await Promise.all([
    query(nodesSql, [allConnectedIds]),
    query(protoEventsSql, [allConnectedIds]),
  ]);

  // nodes 的 ID 集合（来自 DB 查到的真实 ID）
  const validNodeIds = new Set(nodesResult.rows.map(row => row.id));

  // 只保留 source 和 target 都在 validNodeIds 里的 links（过滤 dangling）
  const validLinks = rawLinks.rows.filter(
    row => validNodeIds.has(row.source) && validNodeIds.has(row.target)
  );

  const validNodes = nodesResult.rows;

  // 创建原子事件标题的映射
  const protoEventInfo = {};
  protoEventsResult.rows.forEach(row => {
    if (row.canonical_event_id) {
      protoEventInfo[row.canonical_event_id] = {
        news_title: row.news_title,
        actor: row.actor_raw,
        action: row.action_raw,
        object: row.object_raw
      };
    }
  });

  // 事件类型中文映射 (GDELT 核心类型)
  const eventTypeMap = {
    'Fight': '军事冲突',
    'Protest': '抗议活动',
    'Assault': '袭击事件',
    'Consult': '外交磋商',
    'Make statement': '发表声明',
    'Appeal': '发出呼吁',
    'Cooperate': '展开合作',
    'Demand': '提出要求',
    'Disapprove': '表示反对',
    'Negotiate': '进行谈判',
    'Threaten': '发出威胁',
    'Mediate': '进行调解',
    'Acknowledge': '承认/认可',
    'Expel': '驱逐行动',
    'Seize': '扣押/没收',
    'Reject': '予以拒绝',
    'Sanction': '实施制裁',
    'Mobilize': '军事动员',
    'Warn': '发出警告',
    'Host visit': '主持访问',
    'Sign a treaty or agreement': '签署条约/协议',
    'Exhibit force posture': '展示武力姿态',
    'Engage in material cooperation': '开展实质性合作',
    'Engage in diplomatic cooperation': '开展外交合作',
    'Engage in symbolic act': '进行象征性行动',
    'Use conventional military force': '使用常规武力',
    'Impose embargo': '实施禁运',
    'Occupy territory': '占领领土',
    'Arrest': '逮捕/拘留',
    'Increase military capability': '增强军事能力',
    'Provide military aid': '提供军事援助'
  };


  // 翻译函数辅助
  const translate = (val) => {
    if (!val) return '';
    return eventTypeMap[val] || val;
  };

  console.log('[getRelationshipGraph] 为以下事件合成名称:', eventIds);

  return {
    nodes: validNodes.map(row => {
      const info = protoEventInfo[row.id] || {};
      
      // 1. 优先尝试从原子事件合成一个描述性的中文名称 [主体] [动作] [客体]
      let nodeName = '';
      
      if (info.actor || info.action) {
        const parts = [];
        if (info.actor) parts.push(info.actor);
        // 对动作进行尝试翻译，处理 GDELT 原始标签
        if (info.action) parts.push(translate(info.action));
        if (info.object) parts.push(info.object);
        nodeName = parts.join('');
      }
      
      // 2. 如果合成名称太短或不存在，尝试使用标准标题
      if (!nodeName || nodeName.length < 5) {
        nodeName = row.title || nodeName;
      }
      
      // 3. 如果还是没有，尝试使用 [主体] [类型] @ [地点] 的中文格式
      if (!nodeName || nodeName.length < 3) {
        const actor = row.actor1_name || '';
        const type = translate(row.event_type) || '事件';
        const location = row.location_name ? `在${row.location_name}` : '';
        
        if (actor) {
          nodeName = `${actor}${location}${type}`;
        } else {
          nodeName = `${location}${type} #${row.id}`;
        }
      }
      
      // 4. 极端兜底：新闻标题
      if (!nodeName && info.news_title) {
        nodeName = info.news_title;
      }
      
      // 再次清理可能的残留英文括号或特殊字符 (针对 GDELT)
      if (nodeName) {
        nodeName = nodeName.replace(/, not specified below/g, '');
      }

      console.log(`[getRelationshipGraph] 节点 ${row.id} -> 最终名称: "${nodeName}"`);


      
      return {
        id: row.id,
        type: row.event_type,
        name: nodeName,
        start_time: row.start_time,
        importance: Number(row.current_importance || 0),
        total_news_count: Number(row.total_news_count || 0),
      };
    }),
    links: validLinks.map(row => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.relationship_type,
      confidence: Number(row.confidence || 0),
      weight: Number(row.weight || 0),
      description: row.description,
    })),
  };
}

