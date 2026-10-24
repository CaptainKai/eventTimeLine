import hashlib
import json
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalize_source(source) -> str:
    return str(source or "unknown").strip().lower()


def normalize_url(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
        hostname = (parsed.hostname or "").lower()
        port = parsed.port
        if (parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443):
            port = None
        userinfo = ""
        if parsed.username:
            userinfo = parsed.username
            if parsed.password:
                userinfo += f":{parsed.password}"
            userinfo += "@"
        netloc = f"{userinfo}{hostname}{f':{port}' if port else ''}"
        path = parsed.path.rstrip("/") if len(parsed.path) > 1 else parsed.path
        query = urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
        return urlunsplit((parsed.scheme, netloc, path, query, ""))
    except ValueError:
        return raw


def create_news_stable_id(source, source_url=None, source_event_id=None) -> str:
    source_key = normalize_source(source)
    identity = f"native:{str(source_event_id).strip()}" if source_event_id else f"url:{normalize_url(source_url)}"
    if identity == "url:":
        raise ValueError("source_url or source_event_id is required")
    return _sha256(f"news\x1f{source_key}\x1f{identity}")


def create_proto_event_stable_id(news_id, parser_version, event_index, payload) -> str:
    if not news_id or not parser_version:
        raise ValueError("news_id and parser_version are required")
    if not isinstance(event_index, int) or event_index < 0:
        raise ValueError("event_index must be a non-negative integer")
    return _sha256(f"proto\x1f{news_id}\x1f{parser_version}\x1f{event_index}\x1f{canonical_json(payload)}")


def create_relationship_stable_id(source_proto_id, target_proto_id, relationship_type, logic_version) -> str:
    if not all((source_proto_id, target_proto_id, relationship_type, logic_version)):
        raise ValueError("all relationship identity fields are required")
    return _sha256(f"relationship\x1f{source_proto_id}\x1f{target_proto_id}\x1f{relationship_type}\x1f{logic_version}")

