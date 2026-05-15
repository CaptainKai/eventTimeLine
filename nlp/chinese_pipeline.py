"""
Chinese Event Extraction Pipeline using jieba POS tagging and rule-based extraction
"""

import jieba
import jieba.posseg as pseg
from typing import List, Dict, Any, Optional
from .event_schema import EVENT_SCHEMAS, get_all_trigger_words


# Chinese POS tag to argument role mapping
POS_ROLE_MAP = {
    'nr': 'person',      # 人名
    'ns': 'location',    # 地名
    'nt': 'organization', # 机构名
    'nz': 'otherNamed',  # 其他专名
    'n': 'noun',         # 名词
    'v': 'verb',         # 动词
    'vn': 'verbNoun',    # 动名词
    'an': 'adjective',   # 形容词
    'd': 'adverb',       # 副词
    'p': 'preposition',  # 介词
    'c': 'conjunction',  # 连词
    'u': 'particle',     # 助词
    'm': 'numeral',      # 数词
    'q': 'measure',      # 量词
    't': 'time',         # 时间词
    'g': 'word',         # 学术语
    'b': 'distinction',  # 区别词
    'i': 'idiom',        # 成语
    'l': 'idiom',        # 习用语
    'j': 'abbreviation', # 简称
    'h': 'prefix',       # 前缀
    'k': 'suffix',       # 后缀
    'x': 'unknown',      # 未知
    'w': 'punctuation',  # 标点
}

# Preposition words for location detection
LOCATION_PREPS = ['在', '于', '到', '至', '向', '从', '朝', '往']


class ChineseEventExtractor:
    def __init__(self):
        """Initialize jieba for Chinese word segmentation and POS tagging."""
        jieba.setLogLevel(jieba.logging.INFO)
        self.trigger_words = get_all_trigger_words()

    def parse(self, text: str) -> List[Dict[str, Any]]:
        """Extract events from Chinese text."""
        words = list(pseg.cut(text))
        events = []

        for i, (word, flag) in enumerate(words):
            if self._is_trigger(word):
                event = self._extract_event_arguments(word, i, words, text)
                if event:
                    events.append(event)

        return events

    def _is_trigger(self, word: str) -> bool:
        """Check if word is an event trigger."""
        word_lower = word.lower()

        for trigger in self.trigger_words:
            if trigger in word_lower:
                return True
        return False

    def _extract_event_arguments(self, trigger_word: str, trigger_idx: int,
                                   words: List, full_text: str) -> Optional[Dict[str, Any]]:
        """Extract event arguments based on Chinese POS patterns."""
        args = {}
        word_list = [(w, f) for w, f in words]

        # Find actor (主语) - noun/pronoun before trigger
        for i in range(trigger_idx - 1, max(0, trigger_idx - 5) - 1, -1):
            if i < 0:
                break
            w, f = word_list[i]
            if f in ['nr', 'nt', 'nz', 'n', 'r'] and w not in LOCATION_PREPS:
                args['actor'] = w
                break
            if f in ['v', 'vn'] and i != trigger_idx - 1:
                break

        # Find target (宾语) - noun after trigger
        for i in range(trigger_idx + 1, min(len(word_list), trigger_idx + 5)):
            w, f = word_list[i]
            if f in ['nr', 'nt', 'nz', 'n'] and w not in LOCATION_PREPS:
                args['target'] = w
                break
            if f in ['v', 'vn', 'x', 'u'] and w not in LOCATION_PREPS:
                break

        # Find location (地点) - preposition + location
        for i, (w, f) in enumerate(word_list):
            if w in LOCATION_PREPS and i + 1 < len(word_list):
                next_w, next_f = word_list[i + 1]
                if next_f in ['ns', 'nt', 'nr', 'n']:
                    args['location'] = next_w
                    break

        # Find time (时间)
        for i, (w, f) in enumerate(word_list):
            if f == 't' or (w in ['在', '于'] and i + 1 < len(word_list)):
                if w in LOCATION_PREPS and i + 1 < len(word_list):
                    next_w, next_f = word_list[i + 1]
                    if next_f == 't':
                        args['time'] = next_w
                elif f == 't':
                    if 'time' not in args:
                        args['time'] = w

        event_type = self._detect_event_type(trigger_word)

        return {
            'event_type': event_type,
            'trigger': trigger_word,
            'confidence': self._calculate_confidence(trigger_word, args),
            'arguments': args,
            'sent_text': full_text,
            'pos_tags': [(w, f) for w, f in word_list],
            'cameo_code': EVENT_SCHEMAS.get(event_type, {}).get('cameo_code', '000'),
        }

    def _detect_event_type(self, word: str) -> str:
        """Detect event type from trigger word."""
        word_lower = word.lower()

        for event_type, schema in EVENT_SCHEMAS.items():
            for keyword in schema.get('trigger_keywords', []):
                if keyword.lower() == word_lower:
                    return event_type

        return 'unknown'

    def _calculate_confidence(self, trigger_word: str, args: Dict) -> float:
        """Calculate confidence score."""
        confidence = 0.4

        if 'actor' in args:
            confidence += 0.25
        if 'target' in args:
            confidence += 0.25
        if 'location' in args:
            confidence += 0.1

        return min(confidence, 1.0)


def extract_events(text: str) -> List[Dict[str, Any]]:
    """Convenience function for Chinese event extraction."""
    extractor = ChineseEventExtractor()
    return extractor.parse(text)


if __name__ == "__main__":
    import json

    test_cases = [
        "商务部宣布对日本实施新的制裁措施",
        "中国对美国官员实施制裁",
        "朝鲜向日本海发射导弹",
        "民众在街头举行抗议活动",
        "两国领导人举行会谈",
    ]

    extractor = ChineseEventExtractor()

    for text in test_cases:
        print(f"\n{'='*60}")
        print(f"Text: {text}")
        print("-" * 40)

        events = extractor.parse(text)
        print(f"Events found: {len(events)}")
        for event in events:
            print(json.dumps(event, indent=2, ensure_ascii=False))