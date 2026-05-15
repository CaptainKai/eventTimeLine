import { mapCameoCode, calculateImportance, cleanText } from '../utils/parser.mjs';
import { getOrCreateEntity } from '../../lib/db/entity-queries.mjs';

/**
 * 解析原始GDELT事件数据
 */
export function parseGDELTRaw(rawEvent) {
  if (!rawEvent) return null;

  try {
    // GDELT CSV格式解析 (简化版)
    const fields = Array.isArray(rawEvent) ? rawEvent : rawEvent.split('\t');

    // 检查是否有足够的字段（我们的模拟数据有25个字段）
    if (fields.length < 25) {
      return null;
    }

    return {
      source: 'gdelt',
      source_event_id: fields[0], // GlobalEventID
      event_time: parseGDELTDate(fields[1]), // Day
      actor1_raw: fields[5], // Actor1Code
      actor1_name: fields[6], // Actor1Name
      actor1_country: fields[37], // Actor1Geo_CountryCode
      actor2_raw: fields[15], // Actor2Code
      actor2_name: fields[16], // Actor2Name
      actor2_country: fields[47], // Actor2Geo_CountryCode
      event_code: fields[26], // EventCode
      event_base_code: fields[27], // EventBaseCode
      event_root_code: fields[28], // EventRootCode
      quad_class: parseInt(fields[29]), // QuadClass
      goldstein_scale: parseFloat(fields[30]), // GoldsteinScale
      num_mentions: parseInt(fields[31]), // NumMentions
      num_sources: parseInt(fields[32]), // NumSources
      num_articles: parseInt(fields[33]), // NumArticles
      avg_tone: parseFloat(fields[34]), // AvgTone
      action_geo_type: fields[35], // ActionGeo_Type
      action_geo_fullname: fields[36], // ActionGeo_FullName
      action_geo_country: fields[39], // ActionGeo_CountryCode
      source_url: fields[57], // SOURCEURL
      raw_data: rawEvent,
    };
  } catch (error) {
    console.error('[GDELT Parser] Failed to parse raw event:', error);
    return null;
  }
}

/**
 * 解析GDELT日期格式
 */
function parseGDELTDate(dateStr) {
  if (!dateStr || dateStr.length < 8) {
    return new Date().toISOString();
  }

  try {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);

    return new Date(`${year}-${month}-${day}`).toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

/**
 * 将解析后的GDELT事件转换为标准化事件
 */
export async function normalizeGDELTEvent(parsedEvent) {
  if (!parsedEvent) return null;

  try {
    // 获取或创建实体
    let actor1Id = null;
    if (parsedEvent.actor1_country) {
      const entity = await getOrCreateEntity(
        parsedEvent.actor1_country,
        'country',
        null,
        1.0
      );
      actor1Id = entity.id;
    }

    let actor2Id = null;
    if (parsedEvent.actor2_country) {
      const entity = await getOrCreateEntity(
        parsedEvent.actor2_country,
        'country',
        null,
        1.0
      );
      actor2Id = entity.id;
    }

    let locationId = null;
    if (parsedEvent.action_geo_country) {
      const entity = await getOrCreateEntity(
        parsedEvent.action_geo_country,
        'location',
        null,
        1.0
      );
      locationId = entity.id;
    }

    // 映射事件类型
    const eventType = mapCameoCode(parsedEvent.event_code);

    // 计算重要性
    const importance = calculateImportance({
      mentions: parsedEvent.num_mentions,
      tone: parsedEvent.avg_tone,
      event_code: parsedEvent.event_code,
    });

    // 生成标题
    const title = generateEventTitle(parsedEvent, eventType);

    return {
      event_type: eventType,
      event_time: parsedEvent.event_time,
      actor1_id: actor1Id,
      actor2_id: actor2Id,
      sentiment: parsedEvent.goldstein_scale,
      importance: importance,
      location: parsedEvent.action_geo_fullname,
      location_id: locationId,
      event_code: parsedEvent.event_code,
      tone: parsedEvent.avg_tone,
      mentions: parsedEvent.num_mentions,
      title: title,
      description: null, // 可从新闻源获取
      normalized_data: {
        quad_class: parsedEvent.quad_class,
        goldstein_scale: parsedEvent.goldstein_scale,
        num_sources: parsedEvent.num_sources,
        num_articles: parsedEvent.num_articles,
        action_geo_type: parsedEvent.action_geo_type,
      },
    };
  } catch (error) {
    console.error('[GDELT Parser] Failed to normalize event:', error);
    return null;
  }
}

/**
 * 生成事件标题
 */
function generateEventTitle(parsedEvent, eventType) {
  const parts = [];

  if (parsedEvent.actor1_name) {
    parts.push(cleanText(parsedEvent.actor1_name));
  }

  parts.push(eventType);

  if (parsedEvent.actor2_name) {
    parts.push('towards');
    parts.push(cleanText(parsedEvent.actor2_name));
  }

  if (parsedEvent.action_geo_fullname) {
    parts.push('in');
    parts.push(cleanText(parsedEvent.action_geo_fullname));
  }

  return parts.join(' ');
}

/**
 * 完整解析GDELT事件流程
 */
export async function parseGDELTEvent(rawEvent) {
  const parsed = parseGDELTRaw(rawEvent);
  if (!parsed) return null;

  const normalized = await normalizeGDELTEvent(parsed);
  if (!normalized) return null;

  return {
    raw: parsed,
    normalized: normalized,
  };
}
