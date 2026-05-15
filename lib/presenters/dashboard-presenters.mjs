const EVENT_TYPE_LABELS = {
  'Make statement': '发表声明',
  'Consult': '外交磋商',
  'Fight': '军事冲突',
  'Protest': '抗议活动',
  'Assault': '袭击事件',
  'Demand': '提出要求',
  'Threaten': '发出威胁',
  'Negotiate': '进行谈判',
  'Express intent to cooperate': '表达合作意向',
  'Provide aid': '提供支持',
  'Provide diplomatic aid': '提供外交支持',
  'Discuss material cooperation': '讨论实质合作',
  'Sign a treaty or agreement': '签署协议',
  'Exhibit force posture': '展示武力姿态',
  'cause_effect': '因果关系',
  'parent_child': '父子关系',
  'evolution': '演变关系',
  'trigger': '触发关系',
  'temporal': '时间关系',
  'sub_event': '子事件',
  'related': '相关关系',
};

function cleanText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function formatShortDate(value) {
  if (!value) return '';

  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const PENDING_KIND_LABELS = {
  entity: '实体',
  action: '动作',
};

const PENDING_ROLE_LABELS = {
  actor: 'Actor',
  object: 'Object',
  location: 'Location',
};

export function humanizeEventType(type) {
  return EVENT_TYPE_LABELS[type] || cleanText(type) || '事件';
}

export function humanizeRelationshipType(type) {
  return EVENT_TYPE_LABELS[type] || cleanText(type) || '关系';
}

export function buildEventFallbackTitle(event = {}) {
  const actor1 = cleanText(event.actor1_name || event.actor_name);
  const actor2 = cleanText(event.actor2_name || event.object_name);
  const location = cleanText(event.location_name);
  const action = humanizeEventType(event.event_type || event.action_raw);

  const parts = [actor1, action, actor2].filter(Boolean);
  if (location) parts.push(`@${location}`);

  return parts.join(' ') || cleanText(event.description) || (event.id ? `事件 #${event.id}` : '未命名事件');
}

export function buildEventDisplay(event = {}, extras = {}) {
  const title = cleanText(event.title);
  const description = cleanText(event.description);
  const latestNewsTitle = cleanText(extras.latest_news_title || event.latest_news_title);
  const relationshipCount = Number(
    extras.relationship_count ??
    event.relationship_count ??
    (Array.isArray(event.relationships_out) ? event.relationships_out.length : 0)
  ) || 0;
  const hypothesisCount = Number(
    extras.hypothesis_count ??
    event.hypothesis_count ??
    (Array.isArray(event.hypotheses) ? event.hypotheses.length : 0)
  ) || 0;
  const sourceNewsCount = Number(
    extras.source_news_count ??
    event.source_news_count ??
    event.total_news_count ??
    0
  ) || 0;
  const protoEventCount = Number(
    extras.proto_event_count ??
    event.proto_event_count ??
    0
  ) || 0;
  const displayTitle = title || buildEventFallbackTitle(event);
  const displaySummary = description
    || latestNewsTitle
    || [
      sourceNewsCount ? `${sourceNewsCount} 条来源新闻` : null,
      protoEventCount ? `${protoEventCount} 个原子事件` : null,
      relationshipCount ? `${relationshipCount} 条关系` : null,
    ].filter(Boolean).join('，')
    || displayTitle;

  const subtitleParts = [];
  const dateText = formatShortDate(extras.latest_news_at || event.latest_news_at || event.start_time || event.event_time);
  if (dateText) subtitleParts.push(dateText);
  if (event.location_name) subtitleParts.push(event.location_name);
  if (sourceNewsCount) subtitleParts.push(`${sourceNewsCount} 新闻`);
  if (protoEventCount) subtitleParts.push(`${protoEventCount} 原子`);
  if (relationshipCount) subtitleParts.push(`${relationshipCount} 关系`);
  if (event.story_name) subtitleParts.push(`叙事: ${event.story_name}`);

  return {
    ...event,
    relationship_count: relationshipCount,
    hypothesis_count: hypothesisCount,
    source_news_count: sourceNewsCount,
    proto_event_count: protoEventCount,
    latest_news_at: extras.latest_news_at || event.latest_news_at || null,
    latest_news_title: latestNewsTitle || null,
    display_title: displayTitle,
    display_summary: displaySummary,
    display_subtitle: subtitleParts.join(' · '),
  };
}

function buildStorySummaryFromEvents(events = [], hypotheses = []) {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const firstTitle = firstEvent?.display_title || firstEvent?.title || firstEvent?.event_type;
  const lastTitle = lastEvent?.display_title || lastEvent?.title || lastEvent?.event_type;

  if (firstTitle && lastTitle && firstTitle !== lastTitle) {
    return `从“${firstTitle}”发展到“${lastTitle}”，当前包含 ${events.length} 个标准事件与 ${hypotheses.length} 条推演假设。`;
  }

  if (firstTitle) {
    return `围绕“${firstTitle}”形成的叙事链条，当前包含 ${events.length} 个标准事件与 ${hypotheses.length} 条推演假设。`;
  }

  return `当前包含 ${events.length} 个标准事件与 ${hypotheses.length} 条推演假设。`;
}

export function buildStoryDisplay(story = {}, extras = {}) {
  const existingTitle = cleanText(story.title);
  const events = extras.events || story.events || [];
  const leadActors = uniqueList(extras.lead_actors || story.lead_actors || story.key_actors || events.flatMap(event => [event.actor1_name, event.actor2_name]));
  const eventTypes = uniqueList(extras.event_types || story.event_types || events.map(event => humanizeEventType(event.event_type)));
  const hypothesisCount = Number(extras.hypothesis_count ?? story.hypothesis_count ?? (story.hypotheses?.length || 0)) || 0;
  const pendingHypothesisCount = Number(extras.pending_hypothesis_count ?? story.pending_hypothesis_count ?? 0) || 0;
  const isGenericTitle = !existingTitle || /^叙事[:：]/.test(existingTitle);

  const leadActor = leadActors[0] || '多方参与者';
  const theme = eventTypes[0] || cleanText(story.theme) || '事件';
  const displayTitle = isGenericTitle ? `${leadActor} 的 ${theme} 演变` : existingTitle;
  const displaySummary = cleanText(story.summary)
    || cleanText(story.description)
    || buildStorySummaryFromEvents(events, story.hypotheses || extras.hypotheses || []);

  const subtitleParts = [];
  if (story.status) subtitleParts.push(`状态: ${story.status}`);
  if (story.event_count || events.length) subtitleParts.push(`${Number(story.event_count || events.length)} 个事件`);
  if (hypothesisCount) subtitleParts.push(`${hypothesisCount} 条假设`);
  if (pendingHypothesisCount) subtitleParts.push(`${pendingHypothesisCount} 条待验证`);

  return {
    ...story,
    lead_actors: leadActors,
    event_types: eventTypes,
    hypothesis_count: hypothesisCount,
    pending_hypothesis_count: pendingHypothesisCount,
    display_title: displayTitle,
    display_summary: displaySummary,
    display_subtitle: subtitleParts.join(' · '),
  };
}

export function buildHypothesisDisplay(hypothesis = {}, extras = {}) {
  const probability = Number(hypothesis.probability ?? hypothesis.confidence ?? 0);
  return {
    ...hypothesis,
    story_title: extras.story_title || hypothesis.story_title || null,
    display_title: cleanText(hypothesis.predicted_event || hypothesis.content || hypothesis.prediction) || '未命名假设',
    display_summary: cleanText(hypothesis.content || hypothesis.predicted_event || hypothesis.prediction) || '暂无描述',
    probability,
    probability_pct: Math.round(probability * 100),
  };
}

export function groupProtoEventsByCanonical(protoEvents = []) {
  const grouped = new Map();

  protoEvents.forEach(proto => {
    if (!proto.canonical_event_id) return;

    if (!grouped.has(proto.canonical_event_id)) {
      grouped.set(proto.canonical_event_id, {
        canonical_event_id: proto.canonical_event_id,
        proto_event_count: 0,
        source_news_count: 0,
        latest_news_at: proto.news_published_at || null,
        latest_news_title: proto.news_title || null,
        llm_parsed_count: 0,
        news_ids: new Set(),
        proto_events: [],
      });
    }

    const item = grouped.get(proto.canonical_event_id);
    item.proto_event_count += 1;
    item.proto_events.push(proto);
    if (proto.news_id) item.news_ids.add(proto.news_id);
    if (proto.llm_parse_id) item.llm_parsed_count += 1;

    if (!item.latest_news_at || new Date(proto.news_published_at || 0) > new Date(item.latest_news_at || 0)) {
      item.latest_news_at = proto.news_published_at || item.latest_news_at;
      item.latest_news_title = proto.news_title || item.latest_news_title;
    }
  });

  return [...grouped.values()].map(item => ({
    ...item,
    source_news_count: item.news_ids.size,
    news_ids: [...item.news_ids],
  }));
}

export function groupProtoEventsByNews(protoEvents = []) {
  const grouped = new Map();

  protoEvents.forEach(proto => {
    if (!proto.news_id) return;

    if (!grouped.has(proto.news_id)) {
      grouped.set(proto.news_id, {
        news_id: proto.news_id,
        title: proto.news_title || '未命名新闻',
        source: proto.news_source || '未知',
        lang: proto.news_lang || '',
        published_at: proto.news_published_at || null,
        importance: Number(proto.news_importance || 0),
        canonical_ids: new Set(),
        proto_event_count: 0,
        llm_proto_count: 0,
        proto_events: [],
      });
    }

    const item = grouped.get(proto.news_id);
    item.proto_event_count += 1;
    item.proto_events.push(proto);
    if (proto.llm_parse_id) item.llm_proto_count += 1;
    if (proto.canonical_event_id) item.canonical_ids.add(proto.canonical_event_id);
  });

  return [...grouped.values()]
    .map(item => ({
      ...item,
      canonical_ids: [...item.canonical_ids],
      canonical_count: item.canonical_ids.size,
      is_llm_parsed: item.llm_proto_count > 0,
      parser_method: item.llm_proto_count > 0 ? 'llm' : 'traditional',
      has_multi_proto: item.proto_event_count > 1,
      is_unmapped: item.canonical_ids.size === 0,
    }))
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
}

export function buildNewsParseItem(group, canonicalMap = new Map()) {
  const canonicalPreview = group.canonical_ids
    .map(id => canonicalMap.get(id)?.display_title)
    .filter(Boolean)
    .slice(0, 2);

  return {
    ...group,
    display_title: cleanText(group.title) || `新闻 #${group.news_id}`,
    display_subtitle: [
      group.source,
      group.lang || null,
      formatShortDate(group.published_at),
      group.is_llm_parsed ? 'LLM 解析' : '传统解析',
      `${group.proto_event_count} 个原子事件`,
      group.canonical_count ? `${group.canonical_count} 个标准事件` : '未归并标准事件',
    ].filter(Boolean).join(' · '),
    canonical_preview: canonicalPreview,
  };
}

export function buildPendingNormalizationDisplay(row = {}) {
  const itemKind = cleanText(row.item_kind) || (row.normalized_type === 'unknown_action' ? 'action' : 'entity');
  const role = cleanText(row.role);
  const rawValue = cleanText(row.raw_value);
  const provisionalName = cleanText(row.provisional_name || row.suggested_normalization || rawValue) || `待验证项 #${row.id}`;
  const provisionalType = cleanText(row.provisional_type || row.normalized_type);
  const parentEntityName = cleanText(row.parent_entity_name);
  const entitySubtype = cleanText(row.entity_subtype);
  const status = cleanText(row.status) || 'pending';
  const kindLabel = PENDING_KIND_LABELS[itemKind] || itemKind || '待验证项';
  const roleLabel = PENDING_ROLE_LABELS[role] || role;
  const occurrenceCount = toNumber(row.occurrence_count);
  const protoReferenceCount = toNumber(row.proto_reference_count);
  const eventReferenceCount = toNumber(row.event_reference_count);
  const newsReferenceCount = toNumber(row.news_reference_count);
  const evidence = parseJsonValue(row.evidence, []);
  const context = parseJsonValue(row.context, {});
  const firstEvidence = Array.isArray(evidence) ? evidence.find(Boolean) : null;
  const evidenceText = cleanText(
    typeof firstEvidence === 'string'
      ? firstEvidence
      : firstEvidence?.snippet || firstEvidence?.text || firstEvidence?.news_title || firstEvidence?.sentence
  );
  const contextText = cleanText(
    context?.news_title || context?.title || context?.sentence || context?.action || context?.event_summary
  );
  const displayReason = cleanText(row.audit_reason)
    || evidenceText
    || contextText
    || (rawValue && rawValue !== provisionalName ? `原始文本: ${rawValue}` : '等待 LLM/人工巡检确认');

  return {
    ...row,
    id: toNumber(row.id),
    item_kind: itemKind,
    item_kind_label: kindLabel,
    role,
    role_label: roleLabel,
    raw_value: rawValue,
    provisional_key: cleanText(row.provisional_key),
    provisional_name: provisionalName,
    provisional_type: provisionalType,
    parent_entity_name: parentEntityName,
    parent_entity_id: row.parent_entity_id ? toNumber(row.parent_entity_id) : null,
    entity_subtype: entitySubtype,
    hierarchy_confidence: row.hierarchy_confidence === null || row.hierarchy_confidence === undefined ? null : Number(row.hierarchy_confidence),
    status,
    occurrence_count: occurrenceCount,
    proto_reference_count: protoReferenceCount,
    event_reference_count: eventReferenceCount,
    news_reference_count: newsReferenceCount,
    last_seen_at: row.last_seen_at || null,
    audit_decision: cleanText(row.audit_decision),
    audit_reason: cleanText(row.audit_reason),
    display_title: provisionalName,
    display_lineage: parentEntityName ? `${provisionalName} -> ${parentEntityName}` : provisionalName,
    display_subtitle: [
      kindLabel,
      roleLabel,
      provisionalType,
      entitySubtype,
      parentEntityName ? `parent: ${parentEntityName}` : null,
      occurrenceCount ? `出现 ${occurrenceCount} 次` : null,
      row.last_seen_at ? `最近 ${formatShortDate(row.last_seen_at)}` : null,
    ].filter(Boolean).join(' · '),
    display_reason: displayReason,
    identity_key: `${itemKind === 'action' ? 'pending_action' : 'pending_entity'}:${row.id}`,
  };
}

export function buildNormalizationAuditLogDisplay(row = {}) {
  const itemKind = cleanText(row.item_kind) || 'entity';
  const decision = cleanText(row.decision) || 'keep_pending';
  const reason = cleanText(row.reason);
  const pendingName = cleanText(row.pending_provisional_name || row.pending_raw_value);
  const pendingType = cleanText(row.pending_provisional_type);
  const pendingRole = cleanText(row.pending_role);
  const targetEntityName = cleanText(row.target_entity_name);
  const targetActionName = cleanText(row.target_action_name || row.target_action_key);
  const metadata = parseJsonValue(row.metadata, {}) || {};
  const llmResult = metadata?.decision || null;
  const llmResultText = llmResult ? JSON.stringify(llmResult, null, 2) : '{}';

  const outcomeLabel = decision === 'promote_to_standard'
    ? '新增标准'
    : decision === 'merge_to_existing'
      ? '合并已有'
      : decision === 'reject_noise'
        ? '标记噪声'
        : '保持待审';

  return {
    ...row,
    id: toNumber(row.id),
    item_kind: itemKind,
    decision,
    reason,
    pending_name: pendingName || `pending:${toNumber(row.pending_id)}`,
    pending_type: pendingType,
    pending_role: pendingRole,
    pending_status: cleanText(row.pending_status),
    target_entity_name: targetEntityName,
    target_action_name: targetActionName,
    affected_proto_count: toNumber(row.affected_proto_count),
    affected_event_count: toNumber(row.affected_event_count),
    affected_story_count: toNumber(row.affected_story_count),
    affected_news_count: toNumber(row.affected_news_count),
    rebuild_status: cleanText(row.rebuild_status),
    executed_at: row.executed_at || null,
    llm_result: llmResult,
    llm_result_text: llmResultText,
    display_target: pendingName
      ? `${pendingName}${pendingType ? ` (${pendingType})` : ''}`
      : `pending:${toNumber(row.pending_id)}`,
    display_decision: `${outcomeLabel}${reason ? ` · ${reason}` : ''}`,
    display_outcome: outcomeLabel,
  };
}

export function buildStoryBuckets(canonicalEvents = []) {
  const grouped = new Map();

  canonicalEvents.forEach(event => {
    if (!event.story_id) return;

    if (!grouped.has(event.story_id)) {
      grouped.set(event.story_id, {
        story_id: event.story_id,
        title: event.story_name || '',
        summary: event.story_summary || '',
        status: 'active',
        event_count: 0,
        events: [],
        hypotheses: [],
        lead_actors: new Set(),
        event_types: new Set(),
      });
    }

    const bucket = grouped.get(event.story_id);
    bucket.event_count += 1;
    bucket.events.push(event);
    [event.actor1_name, event.actor2_name].filter(Boolean).forEach(actor => bucket.lead_actors.add(actor));
    if (event.event_type) bucket.event_types.add(humanizeEventType(event.event_type));
    (event.hypotheses || []).forEach(hypothesis => {
      if (!bucket.hypotheses.some(item => item.id === hypothesis.id)) {
        bucket.hypotheses.push(hypothesis);
      }
    });
  });

  return [...grouped.values()].map(bucket => buildStoryDisplay({
    id: bucket.story_id,
    title: bucket.title,
    summary: bucket.summary,
    status: bucket.status,
    event_count: bucket.event_count,
    hypotheses: bucket.hypotheses,
  }, {
    events: bucket.events,
    lead_actors: [...bucket.lead_actors],
    event_types: [...bucket.event_types],
    hypothesis_count: bucket.hypotheses.length,
    pending_hypothesis_count: bucket.hypotheses.filter(item => item.status === 'pending').length,
  }));
}
