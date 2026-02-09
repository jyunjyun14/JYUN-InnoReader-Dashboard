import datetime

import pandas as pd
import streamlit as st

from inoreader import (
    exchange_code_for_token,
    fetch_articles,
    get_auth_url,
    get_folder_list,
    get_subscriptions,
    get_valid_token,
    logout,
    save_token,
)
from scorer import get_criteria_for_folder, select_top_articles, SCORING_CRITERIA
from utils import dataframe_to_excel, dataframes_to_excel

st.set_page_config(page_title="InnoReader Dashboard", layout="wide")
st.title("InnoReader RSS Dashboard")

# ── OAuth2 로그인 처리 ──────────────────────────────────────────

query_params = st.query_params
auth_code = query_params.get("code")

if auth_code and "access_token" not in st.session_state:
    try:
        token_data = exchange_code_for_token(auth_code)
        save_token(token_data)
        st.session_state["access_token"] = token_data["access_token"]
        st.query_params.clear()
        st.rerun()
    except Exception as e:
        st.error(f"토큰 교환 실패: {e}")

if "access_token" not in st.session_state:
    token = get_valid_token()
    if token:
        st.session_state["access_token"] = token

if "access_token" not in st.session_state:
    st.info("InnoReader 계정에 로그인이 필요합니다.")
    auth_url = get_auth_url()
    st.markdown(f"### [InnoReader 로그인]({auth_url})")
    st.caption("위 링크를 클릭하면 InnoReader 로그인 페이지로 이동합니다. 로그인 후 자동으로 돌아옵니다.")
    st.stop()

access_token = st.session_state["access_token"]

# 사이드바 로그아웃
if st.sidebar.button("로그아웃"):
    logout()
    st.session_state.clear()
    st.rerun()

# ── 구독 목록 로드 ──────────────────────────────────────────────

try:
    subscriptions = get_subscriptions(access_token)
except Exception as e:
    st.error(f"구독 목록을 불러올 수 없습니다: {e}")
    st.caption("토큰이 만료되었을 수 있습니다. 로그아웃 후 다시 로그인해 주세요.")
    st.stop()

folders = get_folder_list(subscriptions)

# ── 메인 탭 구조 ──────────────────────────────────────────────

tab1, tab2 = st.tabs(["📰 전체 피드", "⭐ 우수 기사 선별"])

# ═══════════════════════════════════════════════════════════════
# TAB 1: 전체 피드 (기존 기능)
# ═══════════════════════════════════════════════════════════════

with tab1:
    # ── 사이드바 필터 ──
    st.sidebar.header("필터")

    selected_folders = st.sidebar.multiselect("폴더 선택", folders, default=folders)

    filtered_feeds = [
        s for s in subscriptions
        if not selected_folders or any(f in selected_folders for f in s["folders"])
    ]
    feed_titles = [s["title"] for s in filtered_feeds]

    selected_feeds = st.sidebar.multiselect("피드 선택", feed_titles, default=feed_titles)

    today = datetime.date.today()
    week_ago = today - datetime.timedelta(days=7)
    date_range = st.sidebar.date_input("날짜 범위", value=(week_ago, today))

    max_articles = st.sidebar.slider("기사 수 제한", 10, 500, 100, step=10)

    search_query = st.sidebar.text_input("검색어 (제목/본문)")

    # ── 기사 수집 ──
    if not selected_feeds:
        st.info("사이드바에서 피드를 선택하세요.")
        st.stop()

    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_date, end_date = date_range
    else:
        start_date, end_date = week_ago, today

    newer_than = int(datetime.datetime.combine(start_date, datetime.time.min).timestamp())
    older_than = int(datetime.datetime.combine(end_date, datetime.time.max).timestamp())

    all_articles: list[dict] = []
    feed_map = {s["title"]: s["id"] for s in filtered_feeds}

    progress = st.progress(0, text="기사를 불러오는 중...")
    for idx, feed_title in enumerate(selected_feeds):
        stream_id = feed_map.get(feed_title)
        if not stream_id:
            continue
        try:
            articles = fetch_articles(
                access_token,
                stream_id,
                count=max_articles,
                newer_than=newer_than,
                older_than=older_than,
            )
            all_articles.extend(articles)
        except Exception as e:
            st.warning(f"'{feed_title}' 로드 실패: {e}")
        progress.progress((idx + 1) / len(selected_feeds))

    progress.empty()

    if not all_articles:
        st.info("선택한 조건에 맞는 기사가 없습니다.")
        st.stop()

    # ── DataFrame 변환 ──
    df = pd.DataFrame(all_articles)
    df["published"] = pd.to_datetime(df["published"])
    df = df.sort_values("published", ascending=False).reset_index(drop=True)

    if search_query:
        mask = (
            df["title"].str.contains(search_query, case=False, na=False)
            | df["summary"].str.contains(search_query, case=False, na=False)
        )
        df = df[mask].reset_index(drop=True)

    st.subheader(f"기사 목록 ({len(df)}건)")

    # ── 엑셀 내보내기 ──
    export_df = df.copy()
    export_df.insert(0, "번호", range(1, len(export_df) + 1))
    export_df = export_df.rename(
        columns={
            "title": "제목",
            "source": "출처",
            "published": "날짜",
            "url": "URL",
            "summary": "본문요약",
            "categories": "카테고리",
        }
    )

    excel_bytes = dataframe_to_excel(export_df)
    st.download_button(
        label="엑셀 다운로드 (.xlsx)",
        data=excel_bytes,
        file_name=f"articles_{datetime.date.today()}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    # ── 기사 목록 표시 ──
    display_df = df[["title", "source", "published", "url"]].copy()
    display_df.columns = ["제목", "출처", "날짜", "링크"]
    display_df["날짜"] = display_df["날짜"].dt.strftime("%Y-%m-%d %H:%M")

    st.dataframe(
        display_df,
        column_config={
            "링크": st.column_config.LinkColumn("링크", display_text="원문 보기"),
        },
        use_container_width=True,
        hide_index=True,
    )

    # ── 기사 상세 (expander) ──
    st.subheader("기사 상세")
    for _, row in df.iterrows():
        with st.expander(f"{row['title']} — {row['source']}"):
            st.write(f"**날짜**: {row['published'].strftime('%Y-%m-%d %H:%M')}")
            st.write(f"**출처**: {row['source']}")
            st.markdown(f"[원문 링크]({row['url']})")
            st.write(row["summary"][:500] if row["summary"] else "(본문 없음)")

# ═══════════════════════════════════════════════════════════════
# TAB 2: 우수 기사 선별
# ═══════════════════════════════════════════════════════════════

with tab2:
    st.subheader("우수 기사 자동 선별")
    st.caption("각 폴더별 키워드 기준으로 자동 스코어링하여 우수 기사를 선별합니다. 체크박스로 최종 선택 후 엑셀로 내보내세요.")

    # ── 날짜 범위 (최근 1주일 기본) ──
    today2 = datetime.date.today()
    # 최근 월요일 기준
    days_since_monday = today2.weekday()  # 0=월
    last_monday = today2 - datetime.timedelta(days=days_since_monday)
    last_sunday = last_monday + datetime.timedelta(days=6)

    col_d1, col_d2 = st.columns(2)
    with col_d1:
        sel_start = st.date_input("시작일", value=last_monday, key="sel_start")
    with col_d2:
        sel_end = st.date_input("종료일", value=min(last_sunday, today2), key="sel_end")

    sel_newer = int(datetime.datetime.combine(sel_start, datetime.time.min).timestamp())
    sel_older = int(datetime.datetime.combine(sel_end, datetime.time.max).timestamp())

    # 스코어링 대상 폴더 (SCORING_CRITERIA에 정의된 폴더만)
    target_folders = list(SCORING_CRITERIA.keys())

    # 폴더 → 구독 피드 매핑
    def get_feeds_for_folder(folder_name: str) -> list[dict]:
        matched = []
        for s in subscriptions:
            for f in s["folders"]:
                if folder_name in f or f in folder_name:
                    matched.append(s)
                    break
        return matched

    # ── 폴더별 탭 ──
    folder_tabs = st.tabs(target_folders)

    # session_state에 선택 상태 저장
    if "selected_articles" not in st.session_state:
        st.session_state["selected_articles"] = {}

    for folder_idx, folder_name in enumerate(target_folders):
        with folder_tabs[folder_idx]:
            criteria = get_criteria_for_folder(folder_name)
            st.info(f"선별 기준: 상위 **{criteria['top_n']}개** | 키워드: {', '.join(criteria['keywords'][:6])}...")

            # 해당 폴더의 피드에서 기사 수집
            folder_feeds = get_feeds_for_folder(folder_name)

            if not folder_feeds:
                st.warning(f"'{folder_name}' 폴더에 해당하는 구독 피드가 없습니다.")
                continue

            folder_articles: list[dict] = []
            with st.spinner(f"'{folder_name}' 기사 불러오는 중..."):
                for feed in folder_feeds:
                    try:
                        arts = fetch_articles(
                            access_token,
                            feed["id"],
                            count=200,
                            newer_than=sel_newer,
                            older_than=sel_older,
                        )
                        folder_articles.extend(arts)
                    except Exception as e:
                        st.warning(f"'{feed['title']}' 로드 실패: {e}")

            if not folder_articles:
                st.info("해당 기간에 기사가 없습니다.")
                continue

            # 스코어링 & 선별
            top_articles = select_top_articles(folder_articles, folder_name)

            if not top_articles:
                st.info("스코어링 결과 선별된 기사가 없습니다.")
                continue

            st.write(f"총 {len(folder_articles)}건 중 **{len(top_articles)}건** 선별됨")

            # 기본적으로 전부 선택
            state_key = f"sel_{folder_name}"
            if state_key not in st.session_state:
                st.session_state[state_key] = [True] * len(top_articles)

            # 전체 선택/해제 버튼
            col_all, col_none, _ = st.columns([1, 1, 6])
            with col_all:
                if st.button("전체 선택", key=f"all_{folder_name}"):
                    st.session_state[state_key] = [True] * len(top_articles)
                    st.rerun()
            with col_none:
                if st.button("전체 해제", key=f"none_{folder_name}"):
                    st.session_state[state_key] = [False] * len(top_articles)
                    st.rerun()

            # 기사 목록 + 체크박스
            for i, article in enumerate(top_articles):
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
                    st.write(f"**{article['score']:.0f}점**")

                with col_title:
                    pub_str = ""
                    if article.get("published"):
                        pub_str = article["published"].strftime(" | %Y-%m-%d")
                    source = article.get("source", "")
                    st.write(f"**{article['title']}** — {source}{pub_str}")

                # expander로 요약 확인
                with st.expander(f"📄 요약 보기 — {article['title'][:50]}", expanded=False):
                    summary = article.get("summary", "")
                    st.write(summary[:800] if summary else "(본문 없음)")
                    if article.get("url"):
                        st.markdown(f"[원문 링크]({article['url']})")

            # 선택된 기사를 session_state에 저장
            selected = [
                top_articles[i]
                for i in range(len(top_articles))
                if i < len(st.session_state[state_key]) and st.session_state[state_key][i]
            ]
            st.session_state["selected_articles"][folder_name] = selected

    # ── 엑셀 내보내기 버튼 (탭 바깥, tab2 내부) ──
    st.divider()

    # 선택 현황 요약
    total_selected = 0
    summary_parts = []
    for fn in target_folders:
        sel_list = st.session_state.get("selected_articles", {}).get(fn, [])
        count = len(sel_list)
        total_selected += count
        summary_parts.append(f"{fn}: {count}건")

    st.write(f"**선택된 기사 합계: {total_selected}건** ({' | '.join(summary_parts)})")

    if total_selected > 0:
        # 폴더별 시트로 엑셀 생성
        sheets = {}
        for fn in target_folders:
            sel_list = st.session_state.get("selected_articles", {}).get(fn, [])
            if not sel_list:
                continue
            rows = []
            for idx, a in enumerate(sel_list, 1):
                pub = a.get("published")
                rows.append({
                    "번호": idx,
                    "점수": a.get("score", 0),
                    "제목": a.get("title", ""),
                    "출처": a.get("source", ""),
                    "날짜": pub.strftime("%Y-%m-%d") if pub else "",
                    "URL": a.get("url", ""),
                    "본문요약": (a.get("summary", "") or "")[:500],
                })
            sheets[fn] = pd.DataFrame(rows)

        if sheets:
            excel_bytes2 = dataframes_to_excel(sheets)
            st.download_button(
                label=f"선택한 기사 엑셀 내보내기 ({total_selected}건)",
                data=excel_bytes2,
                file_name=f"selected_articles_{datetime.date.today()}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                key="export_selected",
            )
    else:
        st.info("내보낼 기사가 없습니다. 위에서 기사를 선택해 주세요.")
