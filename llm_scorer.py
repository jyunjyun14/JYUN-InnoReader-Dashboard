"""Pass 2: Gemini 기반 LLM 적합도 스코어링 모듈."""

import json
import logging
import re
import threading
import time

from config import (
    GEMINI_API_KEY,
    LLM_BATCH_SIZE,
    LLM_KEYWORD_WEIGHT,
    LLM_MAX_RETRIES,
    LLM_MODEL,
    LLM_RELEVANCE_WEIGHT,
)

logger = logging.getLogger(__name__)

# ── Gemini 무료 티어 속도 제한 ──
_rate_lock = threading.Lock()
_last_call_time = 0.0
_MIN_CALL_INTERVAL = 7.0  # 초 (10 req/min → 6초 간격 + 1초 여유)
_daily_quota_exhausted = False  # 일일 한도 소진 시 True

_client = None
try:
    from google import genai
    _client = genai.Client(api_key=GEMINI_API_KEY)
except Exception:
    logger.info("Gemini 초기화 실패 — LLM 스코어링 비활성화")

SYSTEM_PROMPT = (
    "You are a senior biohealth industry analyst at a Korean government research institute. "
    "Your job is to curate a weekly '바이오헬스 산업 동향' (Biohealth Industry Trends) briefing. "
    "You read articles in both Korean and English.\n\n"
    "SCORING PRINCIPLES:\n"
    "- You are selecting articles that provide actionable intelligence about the biohealth industry.\n"
    "- Prioritize: regulatory decisions, major corporate deals, breakthrough technologies, "
    "policy changes, and market-moving events.\n"
    "- Deprioritize: routine company PR, opinion pieces without data, "
    "articles only tangentially mentioning biohealth keywords, "
    "and news from unrelated industries that happen to share keywords "
    "(e.g. 'FDA' in food context, 'robot' in manufacturing, 'AI' in gaming).\n"
    "- An article that merely contains a keyword but is NOT substantively about the category "
    "should score 1-3.\n\n"
    "Respond ONLY with a JSON array of integers (1-10), one score per article. "
    "No explanation, no markdown, just the array."
)


def _strip_markdown_json(text: str) -> str:
    """Gemini가 ```json ... ``` 으로 감싸는 경우 제거."""
    text = text.strip()
    if text.startswith("```"):
        # 첫 줄 (```json) 제거
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        # 마지막 ``` 제거
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def _wait_rate_limit():
    """무료 티어 속도 제한 준수를 위한 대기."""
    global _last_call_time
    with _rate_lock:
        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < _MIN_CALL_INTERVAL:
            wait = _MIN_CALL_INTERVAL - elapsed
            logger.info("Rate limit 대기: %.1f초", wait)
            time.sleep(wait)
        _last_call_time = time.time()


def _is_daily_quota_error(error_msg: str) -> bool:
    """일일 한도 소진 에러인지 확인."""
    return "PerDay" in str(error_msg) or "per_day" in str(error_msg)


def _call_gemini(prompt: str, *, system: str = None, max_tokens: int = 1024) -> str:
    """Gemini API 호출 (속도 제한 + 재시도 포함)."""
    global _daily_quota_exhausted

    if _daily_quota_exhausted:
        raise RuntimeError("Gemini 일일 한도 소진 — LLM 건너뜀")

    sys_prompt = system or SYSTEM_PROMPT
    last_error = None

    for attempt in range(1, LLM_MAX_RETRIES + 1):
        _wait_rate_limit()
        try:
            response = _client.models.generate_content(
                model=LLM_MODEL,
                contents=prompt,
                config={
                    "system_instruction": sys_prompt,
                    "temperature": 0.1,
                    "max_output_tokens": max_tokens,
                },
            )
            return response.text.strip()
        except Exception as e:
            last_error = e
            error_str = str(e)
            logger.warning("Gemini 호출 시도 %d/%d 실패: %s", attempt, LLM_MAX_RETRIES, e)

            # 일일 한도 소진이면 즉시 중단
            if _is_daily_quota_error(error_str):
                _daily_quota_exhausted = True
                logger.warning("Gemini 일일 한도 소진 — 이후 LLM 호출 모두 건너뜀")
                raise

            if attempt < LLM_MAX_RETRIES:
                wait = min(2 ** attempt, 10)  # 최대 10초 대기
                time.sleep(wait)

    raise last_error


# ── Pass 2: 적합도 스코어링 ──────────────────────────────────

def apply_llm_scores(
    articles: list[dict], folder_name: str, criteria: dict
) -> list[dict]:
    """배치 단위로 LLM 스코어링 후 키워드 점수와 결합하여 반환."""
    if not _client:
        logger.warning("Gemini 모델 없음 — LLM 스코어링 건너뜀")
        return articles

    description = criteria.get("description", folder_name)

    for batch_start in range(0, len(articles), LLM_BATCH_SIZE):
        batch = articles[batch_start : batch_start + LLM_BATCH_SIZE]
        prompt = _build_batch_prompt(batch, folder_name, description)

        try:
            raw = _call_gemini(prompt)
            parsed = _parse_llm_response(raw, len(batch))

            for i, art in enumerate(batch):
                art["llm_score"] = parsed[i]
                art["score"] = _combine_scores(art["keyword_score"], parsed[i])
        except Exception as e:
            logger.warning(
                "LLM 배치(%d~%d) 실패, 키워드 점수 유지: %s",
                batch_start, batch_start + len(batch), e,
            )

    return articles


def _build_batch_prompt(
    articles: list[dict], folder_name: str, description: str
) -> str:
    """기사 배치를 하나의 프롬프트로 구성."""
    lines = [
        f"## Category: {folder_name}",
        "",
        description,
        "",
        "Rate each article's relevance to this SPECIFIC category for a biohealth industry trends briefing.",
        "Be strict: an article must be SUBSTANTIVELY about this category's focus, not just mention a keyword.",
        "Score 1-10. Return ONLY a JSON array, e.g. [7, 3, 9, ...]",
        "",
        "Articles:",
    ]

    for idx, art in enumerate(articles, 1):
        title = (art.get("title") or "")[:200]
        summary = (art.get("summary") or "")[:300]
        lines.append(f"\n[{idx}] Title: {title}")
        lines.append(f"    Summary: {summary}")

    return "\n".join(lines)


def _parse_llm_response(response_text: str, expected_count: int) -> list[int]:
    """LLM 응답에서 JSON 배열 파싱. 실패 시 중립값(5) 사용."""
    text = _strip_markdown_json(response_text)
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start : end + 1]

    try:
        scores = json.loads(text)
        if isinstance(scores, list):
            result = [max(1, min(10, int(s))) for s in scores]
            while len(result) < expected_count:
                result.append(5)
            return result[:expected_count]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.warning("LLM 응답 파싱 실패: %s — 중립값(5) 사용", e)

    return [5] * expected_count


def _combine_scores(keyword_score: float, llm_score: int) -> float:
    """키워드 점수(정규화)와 LLM 점수의 가중 평균."""
    kw_normalized = min(keyword_score / 3.0, 10.0)
    kw_normalized = max(kw_normalized, 1.0)
    combined = (LLM_KEYWORD_WEIGHT * kw_normalized) + (LLM_RELEVANCE_WEIGHT * llm_score)
    return round(combined, 1)


# ── 한국어 번역 ──────────────────────────────────────────────

TRANSLATE_SYSTEM_PROMPT = (
    "You are a Korean translator for a biohealth industry briefing.\n"
    "For each article, provide:\n"
    "  1. title_kr: Korean translation of the title (keep it concise)\n"
    "  2. summary_kr: 2-sentence Korean summary of the article content\n"
    "If the original is already in Korean, clean up the title and summarize in 2 sentences.\n"
    "Respond ONLY with a JSON array of objects: "
    '[{"title_kr":"...","summary_kr":"..."}, ...]'
)


def translate_summaries(articles: list[dict]) -> list[dict]:
    """선별된 기사들의 제목+요약을 한국어로 번역."""
    if not _client or not articles:
        return articles

    for batch_start in range(0, len(articles), LLM_BATCH_SIZE):
        batch = articles[batch_start : batch_start + LLM_BATCH_SIZE]
        prompt = _build_translate_prompt(batch)

        try:
            raw = _call_gemini(prompt, system=TRANSLATE_SYSTEM_PROMPT, max_tokens=4096)
            parsed = _parse_translate_response(raw, len(batch))

            for i, art in enumerate(batch):
                if parsed[i].get("title_kr"):
                    art["title_kr"] = parsed[i]["title_kr"]
                if parsed[i].get("summary_kr"):
                    art["summary_kr"] = parsed[i]["summary_kr"]
        except Exception as e:
            logger.warning("번역 배치(%d~%d) 실패: %s", batch_start, batch_start + len(batch), e)

    return articles


def _build_translate_prompt(articles: list[dict]) -> str:
    lines = [
        "For each article below, provide a Korean title translation and a 2-sentence Korean summary.",
        'Return ONLY a JSON array: [{"title_kr":"...","summary_kr":"..."}, ...]',
        "",
    ]
    for idx, art in enumerate(articles, 1):
        title = (art.get("title") or "")[:200]
        summary = (art.get("summary") or "")[:500]
        lines.append(f"[{idx}] Title: {title}")
        lines.append(f"    Summary: {summary}")
        lines.append("")
    return "\n".join(lines)


def _parse_translate_response(response_text: str, expected_count: int) -> list[dict]:
    text = _strip_markdown_json(response_text)
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start : end + 1]

    try:
        results = json.loads(text)
        if isinstance(results, list):
            result = []
            for item in results:
                if isinstance(item, dict):
                    result.append({
                        "title_kr": item.get("title_kr", ""),
                        "summary_kr": item.get("summary_kr", ""),
                    })
                else:
                    result.append({"title_kr": "", "summary_kr": str(item)})
            while len(result) < expected_count:
                result.append({"title_kr": "", "summary_kr": ""})
            return result[:expected_count]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.warning("번역 응답 파싱 실패: %s", e)

    return [{"title_kr": "", "summary_kr": ""}] * expected_count


# ── 엑셀 내보내기용 기사 분석 ──────────────────────────────────

ANALYZE_SYSTEM_PROMPT = (
    "You are a Korean biohealth industry analyst preparing a weekly briefing report.\n"
    "For each article, extract structured metadata in Korean.\n"
    "Respond ONLY with a JSON array of objects with these exact keys:\n"
    '  - "country": The main country, region, or company that is the subject (e.g. "미국", "EU", "삼성바이오로직스"). '
    'If multiple, pick the most prominent one.\n'
    '  - "oneliner": A single Korean sentence summarizing what happened (e.g. "FDA, AI 기반 폐암 진단기기 최초 승인")\n'
    '  - "hashtags": 5+ Korean hashtags separated by spaces (e.g. "#FDA #AI진단 #폐암 #의료기기 #디지털헬스")\n'
    '  - "summary_3sent": Exactly 3 Korean sentences summarizing the key content of the article. '
    "This is the most important field — be specific with names, numbers, and facts.\n"
    "If the article is in English, translate everything to Korean.\n"
    "If already in Korean, keep the language and refine.\n"
)


def analyze_articles_for_excel(articles: list[dict]) -> list[dict]:
    """기사 목록을 분석하여 엑셀 메타데이터 추가."""
    if not _client or not articles:
        return articles

    for batch_start in range(0, len(articles), LLM_BATCH_SIZE):
        batch = articles[batch_start : batch_start + LLM_BATCH_SIZE]
        prompt = _build_analyze_prompt(batch)

        try:
            raw = _call_gemini(prompt, system=ANALYZE_SYSTEM_PROMPT, max_tokens=4096)
            parsed = _parse_analyze_response(raw, len(batch))

            for i, art in enumerate(batch):
                for key in ("country", "oneliner", "hashtags", "summary_3sent"):
                    if parsed[i].get(key):
                        art[key] = parsed[i][key]
        except Exception as e:
            logger.warning("기사 분석 배치(%d~%d) 실패: %s", batch_start, batch_start + len(batch), e)

    return articles


def _build_analyze_prompt(articles: list[dict]) -> str:
    lines = [
        "For each article below, extract: country, oneliner, hashtags, summary_3sent.",
        'Return ONLY a JSON array: [{"country":"...","oneliner":"...","hashtags":"...","summary_3sent":"..."}, ...]',
        "",
    ]
    for idx, art in enumerate(articles, 1):
        title = (art.get("title") or "")[:200]
        summary = (art.get("summary") or "")[:600]
        source = (art.get("source") or "")[:50]
        lines.append(f"[{idx}] Title: {title}")
        lines.append(f"    Source: {source}")
        lines.append(f"    Summary: {summary}")
        lines.append("")
    return "\n".join(lines)


def _parse_analyze_response(response_text: str, expected_count: int) -> list[dict]:
    empty = {"country": "", "oneliner": "", "hashtags": "", "summary_3sent": ""}
    text = _strip_markdown_json(response_text)
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start : end + 1]

    try:
        results = json.loads(text)
        if isinstance(results, list):
            result = []
            for item in results:
                if isinstance(item, dict):
                    result.append({
                        "country": item.get("country", ""),
                        "oneliner": item.get("oneliner", ""),
                        "hashtags": item.get("hashtags", ""),
                        "summary_3sent": item.get("summary_3sent", ""),
                    })
                else:
                    result.append(dict(empty))
            while len(result) < expected_count:
                result.append(dict(empty))
            return result[:expected_count]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.warning("기사 분석 응답 파싱 실패: %s", e)

    return [dict(empty)] * expected_count
