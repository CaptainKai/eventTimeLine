"""
NLP Event Extraction Service
FastAPI server providing English and Chinese event extraction endpoints.
"""

import argparse
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from .english_pipeline import EnglishEventExtractor
from .chinese_pipeline import ChineseEventExtractor


app = FastAPI(
    title="Event Extraction NLP Service",
    description="English and Chinese event extraction using spaCy and jieba",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize extractors
english_extractor: Optional[EnglishEventExtractor] = None
chinese_extractor: Optional[ChineseEventExtractor] = None


class ParseRequest(BaseModel):
    text: str
    lang: Optional[str] = None


class BatchParseRequest(BaseModel):
    texts: List[str]
    lang: Optional[str] = None


class ParseResponse(BaseModel):
    success: bool
    events: List[Dict[str, Any]]
    error: Optional[str] = None


@app.on_event("startup")
async def startup_event():
    """Initialize NLP extractors on startup."""
    global english_extractor, chinese_extractor

    try:
        print("Loading English spaCy model...")
        english_extractor = EnglishEventExtractor()
        print("English extractor ready")
    except Exception as e:
        print(f"Warning: Failed to load English extractor: {e}")
        english_extractor = None

    try:
        print("Loading Chinese jieba...")
        chinese_extractor = ChineseEventExtractor()
        print("Chinese extractor ready")
    except Exception as e:
        print(f"Warning: Failed to load Chinese extractor: {e}")
        chinese_extractor = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "running",
        "service": "Event Extraction NLP Service",
        "english_available": english_extractor is not None,
        "chinese_available": chinese_extractor is not None,
    }


@app.post("/parse/english", response_model=ParseResponse)
async def parse_english(request: ParseRequest):
    """Extract events from English text using spaCy."""
    if english_extractor is None:
        raise HTTPException(status_code=503, detail="English extractor not available")

    try:
        events = english_extractor.parse(request.text)
        return ParseResponse(success=True, events=events)
    except Exception as e:
        return ParseResponse(success=False, events=[], error=str(e))


@app.post("/parse/chinese", response_model=ParseResponse)
async def parse_chinese(request: ParseRequest):
    """Extract events from Chinese text using jieba."""
    if chinese_extractor is None:
        raise HTTPException(status_code=503, detail="Chinese extractor not available")

    try:
        events = chinese_extractor.parse(request.text)
        return ParseResponse(success=True, events=events)
    except Exception as e:
        return ParseResponse(success=False, events=[], error=str(e))


@app.post("/parse/auto", response_model=ParseResponse)
async def parse_auto(request: ParseRequest):
    """Auto-detect language and extract events."""
    text = request.text

    if not text or len(text.strip()) == 0:
        return ParseResponse(success=False, events=[], error="Empty text")

    has_chinese = any('一' <= c <= '鿿' for c in text)
    has_english = any(c.isascii() and c.isalpha() for c in text)

    if has_chinese and not has_english:
        return await parse_chinese(request)
    elif has_english and not has_chinese:
        return await parse_english(request)
    elif has_chinese and has_english:
        results = []

        if english_extractor:
            try:
                eng_events = english_extractor.parse(text)
                results.extend(eng_events)
            except Exception:
                pass

        if chinese_extractor:
            try:
                chn_events = chinese_extractor.parse(text)
                results.extend(chn_events)
            except Exception:
                pass

        return ParseResponse(success=True, events=results)

    return ParseResponse(success=False, events=[], error="No detectable language")


@app.post("/parse/batch", response_model=ParseResponse)
async def parse_batch(request: BatchParseRequest):
    """Batch extract events from multiple texts."""
    lang = request.lang
    all_events = []

    for text in request.texts:
        if not text or len(text.strip()) == 0:
            continue

        has_chinese = any('一' <= c <= '鿿' for c in text)

        if lang == "en" or (lang is None and not has_chinese):
            if english_extractor:
                try:
                    events = english_extractor.parse(text)
                    all_events.extend(events)
                except Exception:
                    pass
        elif lang == "zh" or (lang is None and has_chinese):
            if chinese_extractor:
                try:
                    events = chinese_extractor.parse(text)
                    all_events.extend(events)
                except Exception:
                    pass

    return ParseResponse(success=True, events=all_events)


@app.get("/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "english_extractor": "ready" if english_extractor else "not_available",
        "chinese_extractor": "ready" if chinese_extractor else "not_available",
    }


def main():
    """Run the FastAPI server."""
    parser = argparse.ArgumentParser(description="NLP Event Extraction Service")
    parser.add_argument("--port", type=int, default=5001, help="Port to run server on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()

    import uvicorn
    uvicorn.run(
        "nlp.service:app",
        host=args.host,
        port=args.port,
        reload=args.reload
    )


if __name__ == "__main__":
    main()