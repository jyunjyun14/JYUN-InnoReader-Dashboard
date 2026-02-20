import datetime
import logging
import re

import pandas as pd
import streamlit as st
from deep_translator import GoogleTranslator

from rss_fetcher import fetch_folder_articles, fetch_keyword_search_articles
from config import LLM_SCORING_ENABLED
from scorer import get_criteria_for_folder, select_top_articles
from utils import dataframes_to_excel
import settings_manager as sm

logger = logging.getLogger(__name__)

st.set_page_config(page_title="바이오헬스 주간동향", layout="wide")

# ── 커스텀 테마 CSS ──
st.markdown("""
<style>
/* 탭 스타일 */
div[data-baseweb="tab-list"] {
    background-color: #F0DEFE;
    border-radius: 8px;
    padding: 4px;
}
div[data-baseweb="tab-list"] button[aria-selected="true"] {
    background-color: #E3C3FD;
    border-radius: 6px;
    font-weight: 700;
}

/* 사이드바 */
section[data-testid="stSidebar"] {
    background-color: #F0DEFE;
}
section[data-testid="stSidebar"] .stExpander {
    background-color: #FFFFFF;
    border-radius: 8px;
}

/* 상단 타이틀 */
h1 {
    color: #6B21A8;
}
h2, h3 {
    color: #7C3AED;
}

/* 버튼 */
div.stButton > button {
    background-color: #E3C3FD;
    color: #1E1E1E;
    border: 1px solid #D4A0F7;
    border-radius: 6px;
}
div.stButton > button:hover {
    background-color: #D4A0F7;
    border-color: #B57EE0;
}

/* info 박스 */
div[data-testid="stAlert"] {
    background-color: #FEF7DE;
    border-left-color: #E3C3FD;
    border-radius: 6px;
}

/* 슬라이더 */
div[data-testid="stSlider"] > div > div > div[role="slider"] {
    background-color: #9B59B6;
}

/* 프로그레스바 */
div[data-testid="stProgress"] > div > div > div {
    background-color: #E3C3FD;
}

/* 체크박스 */
span[data-testid="stCheckbox"] label span[aria-checked="true"] {
    background-color: #9B59B6;
    border-color: #9B59B6;
}

/* expander 헤더 */
details summary {
    background-color: #FEF7DE;
    border-radius: 6px;
    padding: 4px 8px;
}

/* 다운로드 버튼 */
div.stDownloadButton > button {
    background-color: #9B59B6;
    color: white;
    border: none;
}
div.stDownloadButton > button:hover {
    background-color: #7C3AED;
}

/* divider */
hr {
    border-color: #E3C3FD;
}
</style>
""", unsafe_allow_html=True)

# ── 설정 로드 ──
if "settings" not in st.session_state:
    st.session_state["settings"] = sm.load_settings()
settings = st.session_state["settings"]

st.title("바이오헬스 주간동향 뉴스 수집 RSS 대시보드")

# ═══════════════════════════════════════════════════════════════
# 사이드바: 설정 관리 (메인 콘텐츠보다 먼저 렌더링)
# ═══════════════════════════════════════════════════════════════

with st.sidebar:
    st.header("설정 관리")

    # ── 1. 분야 추가 ──
    with st.expander("분야 추가", expanded=False):
        new_folder = st.text_input("새 분야 이름", key="new_folder_name", placeholder="예: 재생의료")
        if st.button("분야 추가", key="btn_add_folder") and new_folder.strip():
            name = new_folder.strip()
            if name in sm.get_folder_names(settings):
                st.warning(f"'{name}' 분야가 이미 존재합니다.")
            else:
                settings = sm.add_folder(settings, name)
                sm.save_settings(settings)
                st.session_state["settings"] = settings
                st.success(f"'{name}' 분야가 추가되었습니다.")
                st.rerun()

    # ── 2. 분야 삭제 ──
    with st.expander("분야 삭제", expanded=False):
        del_folder = st.selectbox(
            "삭제할 분야", sm.get_folder_names(settings), key="del_folder_select"
        )
        if st.button("분야 삭제", key="btn_del_folder", type="primary"):
            settings = sm.delete_folder(settings, del_folder)
            sm.save_settings(settings)
            st.session_state["settings"] = settings
            st.success(f"'{del_folder}' 분야가 삭제되었습니다.")
            st.rerun()

    st.divider()

    # ── 3. 분야별 설정 편집 ──
    edit_folder = st.selectbox(
        "편집할 분야 선택", sm.get_folder_names(settings), key="edit_folder_select"
    )

    if edit_folder:
        cur_criteria = sm.get_criteria(settings, edit_folder)
        cur_feeds = sm.get_feeds(settings, edit_folder)

        # ── 3a. 선별 기준 편집 ──
        with st.expander(f"선별 기준 편집 — {edit_folder}", expanded=False):
            new_top_n = st.number_input(
                "상위 N개 선별",
                min_value=5, max_value=100,
                value=cur_criteria.get("top_n", 20),
                key=f"topn_{edit_folder}",
            )

            new_desc = st.text_area(
                "분야 설명 (AI 스코어링용, 영문 권장)",
                value=cur_criteria.get("description", ""),
                height=100,
                key=f"desc_{edit_folder}",
            )

            new_kw_kr = st.text_area(
                "한국어 키워드 (줄바꿈으로 구분)",
                value="\n".join(cur_criteria.get("keywords", [])),
                height=150,
                key=f"kw_kr_{edit_folder}",
            )

            new_kw_en = st.text_area(
                "영어 키워드 (줄바꿈으로 구분)",
                value="\n".join(cur_criteria.get("keywords_en", [])),
                height=150,
                key=f"kw_en_{edit_folder}",
            )

            new_neg_kw = st.text_area(
                "감점 키워드 (줄바꿈으로 구분)",
                value="\n".join(cur_criteria.get("negative_keywords", [])),
                height=100,
                key=f"neg_kw_{edit_folder}",
                help="매칭 시 점수를 감점합니다 (제목 -3, 요약 -1)",
            )

            new_excl_kw = st.text_area(
                "제외 키워드 (줄바꿈으로 구분)",
                value="\n".join(cur_criteria.get("exclude_keywords", [])),
                height=100,
                key=f"excl_kw_{edit_folder}",
                help="이 키워드가 포함된 기사는 완전히 제외됩니다",
            )

            if st.button("선별 기준 저장", key=f"btn_save_criteria_{edit_folder}"):
                updated = {
                    "top_n": new_top_n,
                    "description": new_desc.strip(),
                    "keywords": [k.strip() for k in new_kw_kr.strip().split("\n") if k.strip()],
                    "keywords_en": [k.strip() for k in new_kw_en.strip().split("\n") if k.strip()],
                    "negative_keywords": [k.strip() for k in new_neg_kw.strip().split("\n") if k.strip()],
                    "exclude_keywords": [k.strip() for k in new_excl_kw.strip().split("\n") if k.strip()],
                    "country_boost": cur_criteria.get("country_boost", {}),
                }
                settings = sm.update_criteria(settings, edit_folder, updated)
                sm.save_settings(settings)
                st.session_state["settings"] = settings
                st.success("선별 기준이 저장되었습니다.")
                st.rerun()

        # ── 3b. RSS 피드 관리 ──
        with st.expander(f"RSS 피드 관리 — {edit_folder}", expanded=False):
            if cur_feeds:
                st.write(f"등록된 피드: **{len(cur_feeds)}개**")
                for fi, feed in enumerate(cur_feeds):
                    col_name, col_del = st.columns([4, 1])
                    with col_name:
                        st.caption(f"{feed.get('name', '')} — {feed.get('url', '')[:60]}...")
                    with col_del:
                        if st.button("삭제", key=f"btn_del_feed_{edit_folder}_{fi}"):
                            settings = sm.delete_feed(settings, edit_folder, fi)
                            sm.save_settings(settings)
                            st.session_state["settings"] = settings
                            st.rerun()
            else:
                st.info("등록된 RSS 피드가 없습니다.")

            st.write("---")
            st.write("**새 RSS 피드 추가**")
            new_feed_name = st.text_input(
                "피드 이름", key=f"new_feed_name_{edit_folder}",
                placeholder="예: FDA approval news",
            )
            new_feed_url = st.text_input(
                "RSS URL", key=f"new_feed_url_{edit_folder}",
                placeholder="https://www.google.co.kr/alerts/feeds/...",
            )
            if st.button("피드 추가", key=f"btn_add_feed_{edit_folder}") and new_feed_url.strip():
                fname = new_feed_name.strip() or "새 피드"
                settings = sm.add_feed(settings, edit_folder, fname, new_feed_url.strip())
                sm.save_settings(settings)
                st.session_state["settings"] = settings
                st.success(f"'{fname}' 피드가 추가되었습니다.")
                st.rerun()

        # ── 3c. 구글 뉴스 검색 키워드 관리 ──
        with st.expander(f"구글 뉴스 검색 키워드 — {edit_folder}", expanded=False):
            cur_queries = sm.get_search_queries(settings, edit_folder)

            if cur_queries:
                st.write(f"등록된 검색어: **{len(cur_queries)}개**")
                for qi, q in enumerate(cur_queries):
                    col_q, col_qdel = st.columns([4, 1])
                    with col_q:
                        st.caption(q)
                    with col_qdel:
                        if st.button("삭제", key=f"btn_del_q_{edit_folder}_{qi}"):
                            cur_queries.pop(qi)
                            settings = sm.update_search_queries(settings, edit_folder, cur_queries)
                            sm.save_settings(settings)
                            st.session_state["settings"] = settings
                            st.rerun()
            else:
                st.info("검색어 미등록 시 스코어링 키워드에서 자동 생성됩니다.")

            # ── 추천 검색어 자동 추가 ──
            edit_criteria = sm.get_criteria(settings, edit_folder)
            suggest_kr = edit_criteria.get("keywords", [])[:3]
            suggest_en = edit_criteria.get("keywords_en", [])[:3]
            suggested = suggest_kr + suggest_en
            # 이미 등록된 검색어 제외
            suggested = [s for s in suggested if s not in cur_queries]

            if suggested and st.button("추천 검색어 자동 추가", key=f"btn_suggest_q_{edit_folder}",
                                       help="스코어링 키워드에서 상위 검색어를 자동 추가합니다"):
                new_queries = list(cur_queries) + suggested
                settings = sm.update_search_queries(settings, edit_folder, new_queries)
                sm.save_settings(settings)
                st.session_state["settings"] = settings
                st.success(f"{len(suggested)}개 추천 검색어가 추가되었습니다.")
                st.rerun()

            if suggested:
                st.caption(f"추천 검색어: {', '.join(suggested)}")

            st.write("---")
            st.write("**새 검색어 추가**")
            new_query = st.text_input(
                "검색어", key=f"new_query_{edit_folder}",
                placeholder="예: cosmetic ingredient research",
            )
            if st.button("검색어 추가", key=f"btn_add_q_{edit_folder}") and new_query.strip():
                cur_queries.append(new_query.strip())
                settings = sm.update_search_queries(settings, edit_folder, cur_queries)
                sm.save_settings(settings)
                st.session_state["settings"] = settings
                st.success(f"'{new_query.strip()}' 검색어가 추가되었습니다.")
                st.rerun()

# ── Google Translate 헬퍼 ──
_translator = GoogleTranslator(source="auto", target="ko")


def _translate_ko(text: str, max_len: int = 4500) -> str:
    """텍스트를 한국어로 번역. 이미 한국어면 그대로 반환."""
    if not text or not text.strip():
        return text
    # 한국어 비율이 높으면 번역 불필요
    korean_chars = sum(1 for c in text if '\uac00' <= c <= '\ud7a3')
    if korean_chars / max(len(text), 1) > 0.3:
        return text
    try:
        return _translator.translate(text[:max_len])
    except Exception as e:
        logger.warning("번역 실패: %s", e)
        return text


def _extract_3_sentences(text: str) -> str:
    """텍스트에서 최대 3문장을 추출. 문장이 부족하면 있는 만큼 반환."""
    if not text or not text.strip():
        return text
    # 문장 분리: 마침표/느낌표/물음표 + 공백 또는 줄바꿈 기준
    sentences = re.split(r'(?<=[.!?。])\s+', text.strip())
    # 빈 문장 제거
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return text
    result = " ".join(sentences[:3])
    # 마지막에 마침표가 없으면 추가
    if result and result[-1] not in ".!?。":
        result += "."
    return result


# ── 국가 감지 (URL 도메인 + 텍스트 키워드) ──
_COUNTRY_BY_TLD = {
    ".kr": "한국", ".jp": "일본", ".cn": "중국", ".tw": "대만",
    ".sg": "싱가포르", ".in": "인도", ".th": "태국", ".vn": "베트남",
    ".id": "인도네시아", ".my": "말레이시아", ".ph": "필리핀",
    ".uk": "영국", ".de": "독일", ".fr": "프랑스", ".it": "이탈리아",
    ".es": "스페인", ".nl": "네덜란드", ".se": "스웨덴", ".ch": "스위스",
    ".au": "호주", ".ca": "캐나다", ".br": "브라질", ".mx": "멕시코",
    ".sa": "사우디", ".ae": "UAE", ".qa": "카타르", ".il": "이스라엘",
}
_COUNTRY_KEYWORDS = {
    "미국": ["FDA", "NIH", "CDC", "United States", "U.S.", "American"],
    "EU": ["European Union", "EMA", "EU ", "European Commission"],
    "영국": ["UK ", "MHRA", "NHS", "United Kingdom", "Britain"],
    "중국": ["China", "NMPA", "Chinese", "Beijing", "Shanghai"],
    "일본": ["Japan", "PMDA", "Japanese", "Tokyo"],
    "한국": ["Korea", "MFDS", "식약처", "한국"],
    "인도": ["India", "Indian", "CDSCO", "Mumbai"],
    "사우디": ["Saudi", "사우디"],
    "UAE": ["UAE", "Dubai", "Abu Dhabi", "두바이"],
}


def _detect_country(article: dict) -> str:
    """기사에서 국가/지역을 추출. 공란 없이 반드시 값 반환."""
    # 1) 스코어링에서 이미 감지된 국가
    matched_countries = article.get("matched_countries", [])
    if matched_countries:
        # 한글 국가명으로 정규화
        return _normalize_country(matched_countries[0])

    # 2) URL 도메인의 TLD로 감지
    url = article.get("url", "")
    for tld, country in _COUNTRY_BY_TLD.items():
        if tld + "/" in url or url.endswith(tld):
            return country

    # 3) 제목+요약 텍스트에서 국가 키워드 감지
    text = (article.get("title", "") + " " + article.get("summary", "")).upper()
    for country, keywords in _COUNTRY_KEYWORDS.items():
        for kw in keywords:
            if kw.upper() in text:
                return country

    # 4) URL 도메인에서 추정
    from urllib.parse import urlparse
    try:
        domain = urlparse(url).netloc.lower()
        if ".com" in domain or ".org" in domain or ".net" in domain:
            return "글로벌"
    except Exception:
        pass

    return "글로벌"


_COUNTRY_NORMALIZE = {
    "US": "미국", "USA": "미국", "UK": "영국",
    "EU": "EU", "Saudi": "사우디아라비아",
    "Dubai": "UAE", "Qatar": "카타르",
}


def _normalize_country(name: str) -> str:
    """영문 국가명을 한글로 정규화."""
    return _COUNTRY_NORMALIZE.get(name, name)


# ── 엑셀 행 생성 헬퍼 ──
def _build_excel_rows(articles: list[dict], progress_callback=None) -> list[dict]:
    """기사 리스트를 엑셀 행 딕셔너리 리스트로 변환. 번역 포함."""
    rows = []
    total = len(articles)
    for idx, a in enumerate(articles, 1):
        if progress_callback:
            progress_callback(idx, total)

        pub = a.get("published")
        title_orig = a.get("title", "")
        summary_orig = (a.get("summary") or "")[:500]

        # ── 키워드1(국가): AI → 자동 감지 (공란 없음)
        country = a.get("country", "")
        if not country:
            country = _detect_country(a)

        # ── 키워드2: AI oneliner → 제목 한글 번역
        kw2 = a.get("oneliner", "")
        if not kw2:
            kw2 = a.get("title_kr", "")
        if not kw2:
            kw2 = _translate_ko(title_orig)

        # ── 키워드3(해시태그): AI → 매칭 키워드를 한글 해시태그로
        kw3 = a.get("hashtags", "")
        if not kw3:
            matched = a.get("matched_keywords", [])
            translated_tags = []
            for kw in matched:
                kw_kr = _translate_ko(kw) if all(ord(c) < 128 for c in kw if not c.isspace()) else kw
                translated_tags.append(f"#{kw_kr.replace(' ', '_')}")
            kw3 = " ".join(translated_tags) if translated_tags else ""

        # ── 주요내용: AI 3문장 → 번역 후 3문장 추출
        main_content = a.get("summary_3sent", "")
        if not main_content:
            translated = a.get("summary_kr", "") or _translate_ko(summary_orig)
            main_content = _extract_3_sentences(translated)

        # ── 추천기준
        kw_score = a.get("keyword_score", 0)
        llm_score = a.get("llm_score")
        matched_kws = a.get("matched_keywords", [])
        if llm_score is not None:
            criteria_text = f"KW:{kw_score:.0f} AI:{llm_score} 종합:{a.get('score', 0):.1f}"
        else:
            criteria_text = f"KW:{kw_score:.0f}"
        if matched_kws:
            criteria_text += f" [{', '.join(matched_kws[:5])}]"

        rows.append({
            "구분": idx,
            "호수": "",
            "채택": "",
            "키워드1(국가)": country,
            "키워드2": kw2,
            "키워드3(해시태그)": kw3,
            "원제목(원문)": title_orig,
            "주요내용": main_content,
            "발행기관": a.get("source", ""),
            "발간일": pub.strftime("%Y-%m-%d") if pub else "",
            "URL": a.get("url", ""),
            "추천기준": criteria_text,
        })
    return rows


# ═══════════════════════════════════════════════════════════════
# 우수 기사 선별
# ═══════════════════════════════════════════════════════════════

st.subheader("우수 기사 자동 선별")
if LLM_SCORING_ENABLED:
    st.caption("각 폴더별 **키워드 + AI 분석** 기준으로 자동 스코어링하여 우수 기사를 선별합니다. 체크박스로 최종 선택 후 엑셀로 내보내세요.")
else:
    st.caption("각 폴더별 **키워드 기준**으로 자동 스코어링하여 우수 기사를 선별합니다. 체크박스로 최종 선택 후 엑셀로 내보내세요.")

# ── 날짜 범위 (최근 1주일 기본) ──
today = datetime.date.today()
days_since_monday = today.weekday()  # 0=월
last_monday = today - datetime.timedelta(days=days_since_monday)
last_sunday = last_monday + datetime.timedelta(days=6)

col_d1, col_d2, col_btn = st.columns([2, 2, 2])
with col_d1:
    sel_start = st.date_input("시작일", value=last_monday, key="sel_start")
with col_d2:
    sel_end = st.date_input("종료일", value=min(last_sunday, today), key="sel_end")
with col_btn:
    st.write("")  # spacing for alignment
    do_refresh = st.button("새로 수집", key="btn_refresh")

sel_newer = int(datetime.datetime.combine(sel_start, datetime.time.min).timestamp())
sel_older = int(datetime.datetime.combine(sel_end, datetime.time.max).timestamp())

# 스코어링 대상 폴더 (settings.json 기준)
target_folders = sm.get_folder_names(settings)
date_key = f"{sel_start}_{sel_end}"

# ── 캐시 무효화: 새로 수집 버튼 또는 날짜 변경 ──
if do_refresh:
    for key in list(st.session_state.keys()):
        if key.startswith("cache_"):
            del st.session_state[key]

# ═══════════════════════════════════════════════════════════════
# Phase 1: 데이터 수집 (캐시 미스 시에만 실행 — 느린 작업)
# ═══════════════════════════════════════════════════════════════

folders_to_fetch = [
    fn for fn in target_folders
    if f"cache_{fn}_{date_key}" not in st.session_state
]

if folders_to_fetch:
    _fetch_progress = st.progress(0, text="기사 수집 준비 중...")

    for _fi, _fn in enumerate(folders_to_fetch):
        _fetch_progress.progress(
            _fi / len(folders_to_fetch),
            text=f"'{_fn}' 수집 중... ({_fi + 1}/{len(folders_to_fetch)})",
        )

        # ── 피드 & 검색어 ──
        _feed_list = sm.get_feeds(settings, _fn)
        _search_queries = sm.get_search_queries(settings, _fn)

        # 검색어 미등록 시 → 스코어링 키워드에서 자동 생성
        if not _search_queries:
            _c = sm.get_criteria(settings, _fn)
            _search_queries = _c.get("keywords", [])[:3] + _c.get("keywords_en", [])[:3]

        if not _feed_list and not _search_queries:
            st.session_state[f"cache_{_fn}_{date_key}"] = {
                "top_articles": [], "rss_count": 0,
                "search_count": 0, "total_count": 0,
                "search_queries_used": [],
            }
            continue

        # ── RSS 피드 수집 ──
        _folder_articles: list[dict] = []
        _rss_count = 0
        _search_count = 0

        if _feed_list:
            _folder_articles = fetch_folder_articles(
                _fn, newer_than=sel_newer, older_than=sel_older, feed_list=_feed_list
            )
            _rss_count = len(_folder_articles)

        # ── Google News 키워드 검색 수집 ──
        if _search_queries:
            _search_articles = fetch_keyword_search_articles(
                _search_queries, newer_than=sel_newer, older_than=sel_older
            )
            _existing_titles = {a.get("title", "").strip().lower() for a in _folder_articles}
            for _art in _search_articles:
                _title_key = _art.get("title", "").strip().lower()
                if _title_key and _title_key not in _existing_titles:
                    _existing_titles.add(_title_key)
                    _folder_articles.append(_art)
                    _search_count += 1

        if not _folder_articles:
            st.session_state[f"cache_{_fn}_{date_key}"] = {
                "top_articles": [], "rss_count": _rss_count,
                "search_count": _search_count, "total_count": 0,
                "search_queries_used": _search_queries,
            }
            continue

        # ── 스코어링 ──
        _top = select_top_articles(_folder_articles, _fn, settings)

        if not _top:
            st.session_state[f"cache_{_fn}_{date_key}"] = {
                "top_articles": [], "rss_count": _rss_count,
                "search_count": _search_count,
                "total_count": len(_folder_articles),
                "search_queries_used": _search_queries,
            }
            continue

        # ── 번역 (Google Translate) ──
        for _art in _top:
            if not _art.get("title_kr"):
                _art["title_kr"] = _translate_ko(_art.get("title", ""))
            if not _art.get("summary_kr"):
                _art["summary_kr"] = _translate_ko((_art.get("summary") or "")[:800])

        # ── LLM 추가 번역 (Gemini 활성 시) ──
        if LLM_SCORING_ENABLED:
            try:
                from llm_scorer import translate_summaries, _daily_quota_exhausted
                if not _daily_quota_exhausted:
                    _top = translate_summaries(_top)
            except Exception:
                pass

        # ── 캐시 저장 ──
        st.session_state[f"cache_{_fn}_{date_key}"] = {
            "top_articles": _top,
            "rss_count": _rss_count,
            "search_count": _search_count,
            "total_count": len(_folder_articles),
            "search_queries_used": _search_queries,
        }

    _fetch_progress.progress(1.0, text="수집 완료!")

# ═══════════════════════════════════════════════════════════════
# Phase 2: 표시 (캐시에서 읽기 — 빠름)
# ═══════════════════════════════════════════════════════════════

folder_tabs = st.tabs(target_folders)

if "selected_articles" not in st.session_state:
    st.session_state["selected_articles"] = {}

for folder_idx, folder_name in enumerate(target_folders):
    with folder_tabs[folder_idx]:
        criteria = get_criteria_for_folder(folder_name, settings)
        kw_preview = criteria.get("keywords", [])[:4] + criteria.get("keywords_en", [])[:3]
        st.info(f"선별 기준: 상위 **{criteria['top_n']}개** | 키워드: {', '.join(kw_preview)}...")

        # ── 캐시에서 데이터 읽기 ──
        cached = st.session_state.get(f"cache_{folder_name}_{date_key}")
        if not cached:
            st.info("기사를 수집 중입니다... 잠시 후 새로고침해 주세요.")
            continue

        top_articles = cached["top_articles"]
        rss_count = cached["rss_count"]
        search_count = cached["search_count"]
        total_count = cached["total_count"]
        search_queries_used = cached.get("search_queries_used", [])

        if not top_articles:
            st.info("해당 기간에 기사가 없습니다.")
            continue

        # ── 점수 필터 (동적 — 캐시 불필요) ──
        scores = [a.get("score", 0) for a in top_articles]
        slider_max = max(int(max(scores)) + 1, 2)

        col_filter, col_count = st.columns([3, 5])
        with col_filter:
            score_threshold = st.slider(
                "최소 점수 필터",
                min_value=1,
                max_value=slider_max,
                value=1,
                step=1,
                key=f"filter_{folder_name}",
                help="설정한 점수 이상의 기사만 표시합니다.",
            )

        filtered_articles = [a for a in top_articles if a.get("score", 0) >= score_threshold]

        with col_count:
            st.write("")  # spacing
            source_detail = f"RSS {rss_count}건"
            if search_count > 0:
                source_detail += f" + 검색 {search_count}건"
            st.write(
                f"총 {total_count}건 수집 ({source_detail}) → "
                f"**{len(top_articles)}건** 스코어링 → "
                f"**{len(filtered_articles)}건** 표시 (≥{score_threshold}점)"
            )

        if search_queries_used:
            st.caption(f"검색 키워드: {', '.join(search_queries_used)}")

        if not filtered_articles:
            st.info(f"{score_threshold}점 이상 기사가 없습니다. 필터를 낮춰 주세요.")
            continue

        # ── 체크박스 상태 관리 ──
        state_key = f"sel_{folder_name}"
        if state_key not in st.session_state or len(st.session_state[state_key]) != len(filtered_articles):
            st.session_state[state_key] = [True] * len(filtered_articles)

        col_all, col_none, _ = st.columns([1, 1, 6])
        with col_all:
            if st.button("전체 선택", key=f"all_{folder_name}"):
                st.session_state[state_key] = [True] * len(filtered_articles)
                st.rerun()
        with col_none:
            if st.button("전체 해제", key=f"none_{folder_name}"):
                st.session_state[state_key] = [False] * len(filtered_articles)
                st.rerun()

        # ── 기사 목록 ──
        for i, article in enumerate(filtered_articles):
            col_chk, col_score, col_title = st.columns([0.5, 1, 10])

            with col_chk:
                checked = st.checkbox(
                    "선택",
                    value=st.session_state[state_key][i] if i < len(st.session_state[state_key]) else True,
                    key=f"chk_{folder_name}_{i}",
                    label_visibility="collapsed",
                )
                st.session_state[state_key][i] = checked

            with col_score:
                kw_s = article.get("keyword_score", article["score"])
                llm_s = article.get("llm_score")
                if llm_s is not None:
                    st.write(f"**{article['score']:.1f}** (KW:{kw_s:.0f} AI:{llm_s})")
                else:
                    st.write(f"**{article['score']:.0f}점**")

            with col_title:
                pub_str = ""
                if article.get("published"):
                    pub_str = article["published"].strftime(" | %Y-%m-%d")
                source = article.get("source", "")
                title_kr = article.get("title_kr", "")
                matched_kws = article.get("matched_keywords", [])
                kw_tags = " ".join(f"`{kw}`" for kw in matched_kws[:3]) if matched_kws else ""

                if title_kr and title_kr != article.get("title", ""):
                    st.write(f"**{title_kr}** — {source}{pub_str}")
                    st.caption(f"{article['title']}  {kw_tags}")
                else:
                    st.write(f"**{article['title']}** — {source}{pub_str}")
                    if kw_tags:
                        st.caption(kw_tags)

            with st.expander(f"요약 보기 — {(title_kr or article['title'])[:50]}", expanded=False):
                summary_kr = article.get("summary_kr", "")
                summary_orig = article.get("summary", "")
                if summary_kr:
                    st.write("**[한글 요약]**")
                    st.write(summary_kr)
                    if summary_orig and summary_kr != summary_orig:
                        st.caption(f"원문: {summary_orig[:300]}...")
                else:
                    st.write(summary_orig[:800] if summary_orig else "(본문 없음)")
                if article.get("url"):
                    st.markdown(f"[원문 링크]({article['url']})")

        # ── 선택 상태 저장 ──
        selected = [
            filtered_articles[i]
            for i in range(len(filtered_articles))
            if i < len(st.session_state[state_key]) and st.session_state[state_key][i]
        ]
        st.session_state["selected_articles"][folder_name] = selected

        # ── 분야별 엑셀 내보내기 ──
        st.divider()
        sel_count = len(selected)
        if sel_count > 0:
            if st.button(f"'{folder_name}' 엑셀 생성하기 ({sel_count}건)", key=f"btn_excel_{folder_name}"):
                export_list = list(selected)
                if LLM_SCORING_ENABLED:
                    try:
                        from llm_scorer import analyze_articles_for_excel, _daily_quota_exhausted
                        if not _daily_quota_exhausted:
                            with st.spinner(f"'{folder_name}' AI 분석 중..."):
                                export_list = analyze_articles_for_excel(export_list)
                    except Exception:
                        pass

                pb = st.progress(0, text="번역 및 엑셀 생성 중...")
                def _update_pb(cur, tot):
                    pb.progress(cur / max(tot, 1), text=f"번역 중... ({cur}/{tot}건)")
                rows = _build_excel_rows(export_list, progress_callback=_update_pb)
                pb.progress(1.0, text="완료!")
                df = pd.DataFrame(rows)
                excel_bytes = dataframes_to_excel({folder_name: df})
                st.session_state[f"excel_{folder_name}"] = excel_bytes
                st.session_state[f"excel_count_{folder_name}"] = sel_count

            if st.session_state.get(f"excel_{folder_name}"):
                st.download_button(
                    label=f"'{folder_name}' 엑셀 다운로드 ({st.session_state.get(f'excel_count_{folder_name}', 0)}건)",
                    data=st.session_state[f"excel_{folder_name}"],
                    file_name=f"biohealth_{folder_name}_{datetime.date.today()}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    key=f"dl_excel_{folder_name}",
                )
        else:
            st.info("선택된 기사가 없습니다.")

# ═══════════════════════════════════════════════════════════════
# 전체 엑셀 내보내기
# ═══════════════════════════════════════════════════════════════
st.divider()

total_selected = 0
summary_parts = []
for fn in target_folders:
    sel_list = st.session_state.get("selected_articles", {}).get(fn, [])
    count = len(sel_list)
    total_selected += count
    summary_parts.append(f"{fn}: {count}건")

st.write(f"**전체 선택 합계: {total_selected}건** ({' | '.join(summary_parts)})")

if total_selected > 0:
    if st.button(f"전체 분야 엑셀 생성하기 ({total_selected}건)", key="btn_generate_excel_all"):
        analyzed_sheets = {}
        progress_bar = st.progress(0, text="엑셀 생성 준비 중...")
        folder_count = sum(1 for fn in target_folders if st.session_state.get("selected_articles", {}).get(fn))

        done = 0
        for fn in target_folders:
            sel_list = st.session_state.get("selected_articles", {}).get(fn, [])
            if not sel_list:
                continue

            export_list = list(sel_list)
            if LLM_SCORING_ENABLED:
                try:
                    from llm_scorer import analyze_articles_for_excel, _daily_quota_exhausted
                    if not _daily_quota_exhausted:
                        progress_bar.progress(
                            done / max(folder_count, 1),
                            text=f"'{fn}' AI 분석 중... ({len(export_list)}건)",
                        )
                        export_list = analyze_articles_for_excel(export_list)
                except Exception:
                    pass

            def _update_all(cur, tot):
                progress_bar.progress(
                    (done + cur / max(tot, 1)) / max(folder_count, 1),
                    text=f"'{fn}' 번역 중... ({cur}/{tot}건)",
                )
            rows = _build_excel_rows(export_list, progress_callback=_update_all)
            analyzed_sheets[fn] = pd.DataFrame(rows)
            done += 1

        progress_bar.progress(1.0, text="엑셀 생성 완료!")

        if analyzed_sheets:
            excel_bytes = dataframes_to_excel(analyzed_sheets)
            st.session_state["excel_data_all"] = excel_bytes
            st.session_state["excel_count_all"] = total_selected
            st.success(f"전체 엑셀 파일이 생성되었습니다. ({total_selected}건)")

    if st.session_state.get("excel_data_all"):
        st.download_button(
            label=f"전체 엑셀 다운로드 ({st.session_state.get('excel_count_all', 0)}건)",
            data=st.session_state["excel_data_all"],
            file_name=f"biohealth_weekly_{datetime.date.today()}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="export_all",
        )
else:
    st.info("내보낼 기사가 없습니다. 위에서 기사를 선택해 주세요.")

