"""
English Event Extraction Pipeline using spaCy Dependency Parsing
"""

import spacy
from typing import List, Dict, Any, Optional
from .event_schema import EVENT_SCHEMAS, get_all_trigger_words


class EnglishEventExtractor:
    def __init__(self, model_name: str = "en_core_web_sm"):
        """Initialize spaCy model for English NER and dependency parsing."""
        try:
            self.nlp = spacy.load(model_name)
        except OSError:
            raise ImportError(
                f"spaCy model '{model_name}' not found. "
                f"Run: python -m spacy download {model_name}"
            )

        if "sentencizer" not in self.nlp.pipe_names:
            self.nlp.add_pipe("sentencizer")

        self.trigger_words = get_all_trigger_words()

    def parse(self, text: str) -> List[Dict[str, Any]]:
        """Extract events from English text."""
        doc = self.nlp(text)
        events = []

        for sent in doc.sents:
            sent_events = self._extract_from_sentence(sent)
            events.extend(sent_events)

        return events

    def _extract_from_sentence(self, sent) -> List[Dict[str, Any]]:
        """Extract events from a single sentence using dependency parsing."""
        events = []
        tokens = list(sent)

        for token in tokens:
            if self._is_trigger(token):
                event = self._extract_event_arguments(token, sent)
                if event:
                    events.append(event)

        return events

    def _is_trigger(self, token) -> bool:
        """Check if token is an event trigger word."""
        token_lemma = token.lemma_.lower()
        token_text = token.text.lower()

        for trigger in self.trigger_words:
            if trigger in token_lemma or trigger in token_text:
                return True
        return False

    def _extract_event_arguments(self, trigger_token, sent) -> Optional[Dict[str, Any]]:
        """Extract event arguments based on dependency arcs."""
        args = {}

        for token in sent:
            if token.dep_ == "nsubj" and token.head == trigger_token:
                args["actor"] = token.text
            elif token.dep_ == "nsubjpass" and token.head == trigger_token:
                args["actor"] = token.text

            if token.dep_ == "dobj" and token.head == trigger_token:
                args["target"] = token.text

            if token.dep_ == "pobj" and token.head.dep_.startswith("prep"):
                prep = token.head
                if prep.text.lower() in ["in", "at", "on", "to", "from", "near"]:
                    if "location" not in args:
                        args["location"] = token.text
                    elif args["location"] != token.text:
                        args["secondary_location"] = token.text

            if token.dep_ == "nmod" and token.head == trigger_token:
                if "instrument" not in args:
                    args["instrument"] = token.text

        for token in sent:
            if token.dep_ == "nsubj" and token.head.head == trigger_token:
                if "actor" not in args:
                    args["actor"] = token.text

        event_type = self._detect_event_type(trigger_token)

        return {
            "event_type": event_type,
            "trigger": trigger_token.text,
            "trigger_lemma": trigger_token.lemma_,
            "trigger_pos": trigger_token.pos_,
            "trigger_dep": trigger_token.dep_,
            "confidence": self._calculate_confidence(trigger_token, args),
            "arguments": args,
            "sent_text": sent.text,
            "dep_tree": [(t.text, t.dep_, t.head.text) for t in sent],
            "cameo_code": EVENT_SCHEMAS.get(event_type, {}).get("cameo_code", "000"),
        }

    def _detect_event_type(self, token) -> str:
        """Detect event type from trigger token."""
        token_text = token.text.lower()
        token_lemma = token.lemma_.lower()

        for event_type, schema in EVENT_SCHEMAS.items():
            for keyword in schema.get("trigger_keywords", []):
                if keyword.lower() in token_text or keyword.lower() in token_lemma:
                    return event_type

        return "unknown"

    def _calculate_confidence(self, trigger_token, args: Dict) -> float:
        """Calculate confidence score based on extracted arguments."""
        confidence = 0.4

        if "actor" in args:
            confidence += 0.2
        if "target" in args:
            confidence += 0.2
        if "location" in args:
            confidence += 0.1

        if trigger_token.dep_ == "ROOT":
            confidence += 0.1

        lemma_match = any(
            trigger_token.lemma_.lower() == kw.lower()
            for schema in EVENT_SCHEMAS.values()
            for kw in schema.get("trigger_keywords", [])
        )
        if lemma_match:
            confidence += 0.1

        return min(confidence, 1.0)


def extract_events(text: str) -> List[Dict[str, Any]]:
    """Convenience function for event extraction."""
    extractor = EnglishEventExtractor()
    return extractor.parse(text)


if __name__ == "__main__":
    import json

    test_cases = [
        "US imposes new sanctions on Russia over Ukraine conflict",
        "North Korea launched another ballistic missile into the Sea of Japan",
        "China sanctions US officials over Taiwan arms sale",
        "Russia withdrew its troops from the border area",
        "Protesters clashed with police in downtown Seoul",
    ]

    extractor = EnglishEventExtractor()

    for text in test_cases:
        print(f"\n{'='*60}")
        print(f"Text: {text}")
        print("-" * 40)

        events = extractor.parse(text)
        print(f"Events found: {len(events)}")
        for event in events:
            print(json.dumps(event, indent=2, ensure_ascii=False))