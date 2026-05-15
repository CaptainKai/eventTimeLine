"""
Event Schema Definitions
Defines event templates for both English (spaCy) and Chinese (jieba) extraction.
"""

# Event schemas with trigger keywords, dependency patterns, and argument roles
EVENT_SCHEMAS = {
    # ========== ECONOMIC EVENTS ==========
    'sanction': {
        'trigger_keywords': [
            'sanction', 'sanctions', 'sanctioned', 'embargo', 'penalty', 'penalize',
            'restrict', 'restriction', 'tariff', 'tariffs', 'levy', 'impose',
            '制裁', '关税', '禁运', '限制', '处罚'
        ],
        'arguments': ['actor', 'target', 'sanction_type'],
        'cameo_code': '171',
        'event_type': 'economic',
    },
    'price_change': {
        'trigger_keywords': [
            'rise', 'fall', 'surge', 'drop', 'increase', 'decrease', 'jump', 'plunge',
            'rally', 'gain', 'loss', 'decline', 'soar', 'slump',
            '上涨', '下跌', '飙升', '暴跌', '涨幅', '跌幅'
        ],
        'arguments': ['actor', 'change_magnitude', 'target'],
        'cameo_code': '012',
        'event_type': 'financial',
    },
    'trade_deal': {
        'trigger_keywords': [
            'trade', 'export', 'import', 'deal', 'agreement', 'purchase', 'buy', 'sell',
            '贸易', '出口', '进口', '协议', '采购', '购买'
        ],
        'arguments': ['actor', 'target', 'trade_type', 'value'],
        'cameo_code': '036',
        'event_type': 'economic',
    },

    # ========== MILITARY EVENTS ==========
    'military_attack': {
        'trigger_keywords': [
            'attack', 'attacks', 'attacked', 'strike', 'strikes', 'struck', 'bomb',
            'bombing', 'raided', 'assault', 'assaulted', 'missile', 'drone',
            '袭击', '轰炸', '导弹', '空袭', '攻击', '炮击'
        ],
        'arguments': ['actor', 'target', 'location', 'weapon'],
        'cameo_code': '18',
        'event_type': 'military',
    },
    'troop_movement': {
        'trigger_keywords': [
            'deploy', 'deployed', 'deployment', 'withdraw', 'withdrawn', 'withdrawal',
            'troop', 'troops', 'military', 'soldiers', 'forces', 'mobilize', 'mobilization',
            '部署', '撤军', '调动', '军队', '部队', '军事'
        ],
        'arguments': ['actor', 'target_location', 'origin', 'number'],
        'cameo_code': '150',
        'event_type': 'military',
    },
    'threat': {
        'trigger_keywords': [
            'threat', 'threaten', 'threatened', 'warn', 'warned', 'ultimatum', 'menace',
            '威胁', '警告', '最后通牒', '恫吓'
        ],
        'arguments': ['actor', 'target', 'threat_type'],
        'cameo_code': '130',
        'event_type': 'military',
    },
    'ceasefire': {
        'trigger_keywords': [
            'ceasefire', 'truce', 'cease', 'armistice', 'pause', 'end hostilities',
            '停火', '休战', '停战'
        ],
        'arguments': ['actor', 'target', 'location'],
        'cameo_code': '035',
        'event_type': 'military',
    },

    # ========== DIPLOMATIC EVENTS ==========
    'diplomatic_meeting': {
        'trigger_keywords': [
            'meet', 'met', 'meeting', 'talks', 'talk', 'summit', 'negotiate', 'negotiation',
            'negotiated', 'visit', 'visited', 'summit', 'conference',
            '会晤', '会谈', '访问', '峰会', '磋商', '谈判'
        ],
        'arguments': ['actor', 'target', 'location', 'topic'],
        'cameo_code': '04',
        'event_type': 'diplomacy',
    },
    'cooperation_agreement': {
        'trigger_keywords': [
            'agree', 'agreed', 'agreement', 'sign', 'signed', 'signing', 'deal',
            'cooperate', 'cooperation', 'partnership', 'accord', 'treaty', 'pact',
            '协议', '签署', '合作', '条约', '协定', '共识'
        ],
        'arguments': ['actor', 'target', 'agreement_type'],
        'cameo_code': '055',
        'event_type': 'diplomacy',
    },
    'diplomatic_relation': {
        'trigger_keywords': [
            'establish', 'establishes', 'break', 'cut', 'restore', 'resume',
            'relations', 'diplomatic', 'ties', 'bonds',
            '建交', '断交', '复交', '外交关系'
        ],
        'arguments': ['actor', 'target', 'relation_type'],
        'cameo_code': '060',
        'event_type': 'diplomacy',
    },

    # ========== PROTEST EVENTS ==========
    'protest': {
        'trigger_keywords': [
            'protest', 'protesters', 'protesting', 'demonstration', 'demonstrate',
            'demonstrators', 'rally', 'rallying', 'march', 'marched', 'clash',
            'riot', 'riots', 'unrest', 'strike', 'striking', 'walkout',
            '抗议', '示威', '游行', '集会', '罢工', '冲突'
        ],
        'arguments': ['actor', 'location', 'participant_count'],
        'cameo_code': '14',
        'event_type': 'protest',
    },

    # ========== POLITICAL EVENTS ==========
    'statement': {
        'trigger_keywords': [
            'say', 'says', 'said', 'statement', 'announce', 'announced', 'announcement',
            'declare', 'declared', 'declaration', 'comment', 'comments', 'remark',
            'respond', 'responded', 'response', 'explain',
            '声明', '宣布', '表示', '回应', '称', '指出'
        ],
        'arguments': ['actor', 'content', 'topic'],
        'cameo_code': '010',
        'event_type': 'political',
    },
    'election': {
        'trigger_keywords': [
            'election', 'elect', 'elected', 'vote', 'voting', 'ballot', 'poll',
            'win', 'won', 'lose', 'lost', 'victory', 'defeat',
            '选举', '投票', '获胜', '败选'
        ],
        'arguments': ['actor', 'target', 'location', 'result'],
        'cameo_code': '086',
        'event_type': 'political',
    },
    'leadership_change': {
        'trigger_keywords': [
            'resign', 'resigned', 'resignation', 'quit', 'step down', 'fire', 'fired',
            'dismiss', 'dismissed', 'appoint', 'appointed', 'successor',
            '辞职', '下台', '解雇', '任命', '接任'
        ],
        'arguments': ['actor', 'new_actor', 'position'],
        'cameo_code': '103',
        'event_type': 'political',
    },

    # ========== DISASTER EVENTS ==========
    'disaster': {
        'trigger_keywords': [
            'earthquake', 'flood', 'flooding', 'tsunami', 'hurricane', 'typhoon',
            'storm', 'drought', 'fire', 'wildfire', 'eruption', 'volcano',
            '地震', '洪水', '海啸', '飓风', '台风', '干旱', '火灾', '火山'
        ],
        'arguments': ['location', 'severity', 'casualties'],
        'cameo_code': '190',
        'event_type': 'disaster',
    },

    # ========== ENERGY EVENTS ==========
    'energy_supply': {
        'trigger_keywords': [
            'oil', 'gas', 'petroleum', 'energy', 'supply', 'output', 'production',
            'export', 'import', 'barrel', 'pipeline',
            '石油', '天然气', '能源', '产量', '出口', '进口'
        ],
        'arguments': ['actor', 'target', 'supply_type', 'quantity'],
        'cameo_code': '070',
        'event_type': 'energy',
    },
}

# Map event_type to cameo category
EVENT_TYPE_TO_CAMEO_CATEGORY = {
    'military': ['15', '16', '17', '18', '19'],
    'diplomacy': ['04', '05', '06'],
    'economic': ['17', '171'],
    'energy': ['07'],
    'protest': ['14'],
    'disaster': ['19'],
    'political': ['10', '12', '13'],
    'financial': ['01', '012', '013'],
}


def get_event_schema(event_type):
    """Get event schema by type."""
    return EVENT_SCHEMAS.get(event_type)


def get_trigger_keywords(event_type):
    """Get trigger keywords for an event type."""
    schema = EVENT_SCHEMAS.get(event_type, {})
    return schema.get('trigger_keywords', [])


def is_trigger_word(word, event_type=None):
    """Check if a word is a trigger for the given event type (or any type)."""
    word_lower = word.lower()

    if event_type:
        keywords = get_trigger_keywords(event_type)
        return any(keyword.lower() in word_lower for keyword in keywords)

    # Check all event types
    for schema in EVENT_SCHEMAS.values():
        for keyword in schema.get('trigger_keywords', []):
            if keyword.lower() in word_lower:
                return True
    return False


def get_all_trigger_words():
    """Get a flat set of all trigger keywords."""
    triggers = set()
    for schema in EVENT_SCHEMAS.values():
        for keyword in schema.get('trigger_keywords', []):
            triggers.add(keyword.lower())
    return triggers


if __name__ == '__main__':
    # Test
    print(f"Total event types: {len(EVENT_SCHEMAS)}")
    print(f"Trigger keywords: {len(get_all_trigger_words())}")
    print(f"Sample: sanction triggers: {get_trigger_keywords('sanction')[:5]}")