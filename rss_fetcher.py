"""Google RSS 피드 직접 파싱 모듈."""

import calendar
import re
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse, unquote, quote

import feedparser

from feeds import RSS_FEEDS
from utils import strip_html_tags


def _extract_source_from_title(raw_title: str) -> tuple[str, str]:
    """
    Google Alerts 제목에서 언론사명을 분리.
    예: "Article Title | The Star" → ("Article Title", "The Star")
        "Article Title - BBC" → ("Article Title", "BBC")
    """
    # HTML 태그 제거
    title = strip_html_tags(raw_title)

    # " | " 또는 " - " 로 분리 (마지막 구분자 기준)
    for sep in [" | ", " - "]:
        if sep in title:
            parts = title.rsplit(sep, 1)
            candidate = parts[1].strip()
            # 언론사명은 보통 짧음 (50자 이하)
            if len(candidate) <= 50:
                return parts[0].strip(), candidate

    return title, ""


def _extract_domain_source(url: str) -> str:
    """URL에서 도메인을 추출하여 출처명으로 사용."""
    # Google redirect URL에서 실제 URL 추출
    if "google.com/url" in url and "url=" in url:
        real_url = url.split("url=")[1].split("&")[0]
        url = unquote(real_url)

    try:
        domain = urlparse(url).netloc
        # www. 제거
        domain = re.sub(r"^www\.", "", domain)
        return domain
    except Exception:
        return ""


def fetch_rss_articles(
    feed_url: str,
    newer_than: Optional[int] = None,
    older_than: Optional[int] = None,
) -> list[dict]:
    """
    RSS 피드 URL을 파싱하여 기사 목록을 반환.

    Args:
        feed_url: RSS 피드 URL
        newer_than: 이 Unix timestamp 이후의 기사만 포함 (선택)
        older_than: 이 Unix timestamp 이전의 기사만 포함 (선택)

    Returns:
        기존 article dict 형식의 리스트:
        [{title, url, source, published, summary, categories}, ...]
    """
    feed = feedparser.parse(feed_url)
    articles: list[dict] = []

    for entry in feed.entries:
        # 발행일 파싱
        published_dt = None
        published_ts = None

        time_struct = entry.get("published_parsed") or entry.get("updated_parsed")
        if time_struct:
            published_ts = int(calendar.timegm(time_struct))
            published_dt = datetime.utcfromtimestamp(published_ts)

        # 날짜 필터링
        if published_ts is not None:
            if newer_than is not None and published_ts < newer_than:
                continue
            if older_than is not None and published_ts > older_than:
                continue

        # 제목에서 언론사명 분리 (Google Alerts 특성)
        raw_title = entry.get("title", "")
        title, source_from_title = _extract_source_from_title(raw_title)

        # 출처 우선순위: 제목에서 추출 → entry.source → URL 도메인
        source = ""
        if source_from_title:
            source = source_from_title
        elif hasattr(entry, "source") and isinstance(entry.source, dict):
            source = entry.source.get("title", "")
        else:
            source = _extract_domain_source(entry.get("link", ""))

        # 요약 추출 (HTML 태그 제거)
        summary_html = entry.get("summary", "") or entry.get("description", "")
        summary = strip_html_tags(summary_html)

        articles.append(
            {
                "title": title,
                "url": entry.get("link", ""),
                "source": source,
                "published": published_dt,
                "summary": summary,
                "categories": ", ".join(
                    t.get("term", "") for t in entry.get("tags", [])
                ),
            }
        )

    return articles


def fetch_folder_articles(
    folder_name: str,
    newer_than: Optional[int] = None,
    older_than: Optional[int] = None,
    feed_list: Optional[list[dict]] = None,
) -> list[dict]:
    """
    해당 폴더의 모든 RSS 피드를 가져와 기사를 수집.

    Args:
        folder_name: 폴더(카테고리) 이름
        newer_than: 이 Unix timestamp 이후의 기사만 포함 (선택)
        older_than: 이 Unix timestamp 이전의 기사만 포함 (선택)
        feed_list: RSS 피드 리스트 (없으면 feeds.py에서 로드)

    Returns:
        모든 피드의 기사를 합친 리스트
    """
    if feed_list is None:
        feed_list = RSS_FEEDS.get(folder_name, [])
    all_articles: list[dict] = []

    for feed_info in feed_list:
        url = feed_info.get("url", "")
        if not url:
            continue
        try:
            articles = fetch_rss_articles(url, newer_than, older_than)
            all_articles.extend(articles)
        except Exception:
            # 개별 피드 실패 시 건너뜀 (호출 측에서 경고 표시)
            continue

    return all_articles


def _is_korean(text: str) -> bool:
    """텍스트에 한국어가 포함되어 있는지 판별."""
    korean_chars = sum(1 for c in text if '\uac00' <= c <= '\ud7a3')
    return korean_chars / max(len(text), 1) > 0.3


def fetch_google_news_articles(
    query: str,
    newer_than: Optional[int] = None,
    older_than: Optional[int] = None,
) -> list[dict]:
    """
    Google News RSS 검색으로 기사를 수집.

    Args:
        query: 검색어
        newer_than: 이 Unix timestamp 이후의 기사만 포함 (선택)
        older_than: 이 Unix timestamp 이전의 기사만 포함 (선택)

    Returns:
        기사 dict 리스트
    """
    encoded_query = quote(query)

    if _is_korean(query):
        url = (
            f"https://news.google.com/rss/search?"
            f"q={encoded_query}+when:14d&hl=ko&gl=KR&ceid=KR:ko"
        )
    else:
        url = (
            f"https://news.google.com/rss/search?"
            f"q={encoded_query}+when:14d&hl=en&gl=US&ceid=US:en"
        )

    return fetch_rss_articles(url, newer_than, older_than)


def fetch_keyword_search_articles(
    search_queries: list[str],
    newer_than: Optional[int] = None,
    older_than: Optional[int] = None,
) -> list[dict]:
    """
    여러 검색어로 Google News를 검색하여 기사를 수집.

    Args:
        search_queries: 검색어 리스트
        newer_than: 이 Unix timestamp 이후의 기사만 포함 (선택)
        older_than: 이 Unix timestamp 이전의 기사만 포함 (선택)

    Returns:
        중복 제거된 기사 dict 리스트
    """
    all_articles: list[dict] = []
    seen_titles: set[str] = set()

    for query in search_queries:
        if not query.strip():
            continue
        try:
            articles = fetch_google_news_articles(query.strip(), newer_than, older_than)
            for art in articles:
                title_key = art.get("title", "").strip().lower()
                if title_key and title_key not in seen_titles:
                    seen_titles.add(title_key)
                    all_articles.append(art)
        except Exception:
            continue
        time.sleep(0.5)

    return all_articles
