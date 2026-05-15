import crypto from 'crypto';
import { getEventByHash } from '../db/events-queries.mjs';

/**
 * 事件去重哈希生成算法
 */
export function generateEventHash(eventData) {
    const keyFields = [
        eventData.actor1?.id || eventData.actor1_raw || '',
        eventData.actor2?.id || eventData.actor2_raw || '',
        eventData.event_type || '',
        formatDate(eventData.start_time || eventData.event_time, 'YYYY-MM-DD'), // 按天聚合
        eventData.location?.id || eventData.location_raw || ''
    ];

    const sortedKey = keyFields.map(field => field.toString().trim().toLowerCase())
                              .filter(Boolean)
                              .sort()
                              .join('|');

    return crypto.createHash('sha256').update(sortedKey).digest('hex');
}

/**
 * 查找或创建事件（带去重）
 */
export async function findOrCreateEvent(eventData) {
    const eventHash = generateEventHash(eventData);

    let event = await getEventByHash(eventHash);

    if (event) {
        return {
            event: event,
            isNew: false,
            hash: eventHash
        };
    }

    return {
        event: null,
        isNew: true,
        hash: eventHash
    };
}

/**
 * 格式化日期
 */
function formatDate(dateString, format) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);

        if (isNaN(date.getTime())) {
            return '';
        }

        switch (format) {
            case 'YYYY-MM-DD':
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            default:
                return date.toISOString().slice(0, 10);
        }
    } catch (error) {
        return '';
    }
}

/**
 * 计算事件属性（带时间衰减加权）
 */
export function calculateEventAttributes(newsItems, options = {}) {
    if (newsItems.length === 0) return null;

    const now = new Date();
    let totalWeight = 0;
    let weightedSentiment = 0;
    let weightedTone = 0;
    let weightedImportance = 0;
    let totalMentions = 0;

    // 时间衰减因子：新新闻权重更大
    const timeDecayFactor = options.timeDecayFactor || 0.95; // 每24小时衰减95%

    for (const newsItem of newsItems) {
        const ageHours = (now - new Date(newsItem.published_at)) / (1000 * 60 * 60);
        const weight = Math.pow(timeDecayFactor, ageHours / 24); // 按天衰减

        // 考虑新闻自身的可靠性和关联置信度
        const finalWeight = weight *
                           (newsItem.reliability_score || 1.0) *
                           (newsItem.association_confidence || 1.0);

        totalWeight += finalWeight;
        weightedSentiment += (newsItem.sentiment || 0) * finalWeight;
        weightedTone += (newsItem.tone || 0) * finalWeight;
        weightedImportance += (newsItem.importance || 0) * finalWeight;
        totalMentions += newsItem.mentions || 0;
    }

    return {
        sentiment: totalWeight > 0 ? weightedSentiment / totalWeight : 0,
        tone: totalWeight > 0 ? weightedTone / totalWeight : 0,
        importance: totalWeight > 0 ? weightedImportance / totalWeight : 0,
        mentions: totalMentions,
        news_count: newsItems.length,
        calculation_method: 'time_decay_weighted_avg',
        last_updated: new Date()
    };
}
