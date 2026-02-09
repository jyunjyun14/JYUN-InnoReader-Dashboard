import json
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
import streamlit as st

from config import (
    INOREADER_APP_ID,
    INOREADER_APP_KEY,
    INOREADER_AUTH_URL,
    INOREADER_BASE_URL,
    INOREADER_REDIRECT_URI,
    INOREADER_SCOPE,
    INOREADER_TOKEN_URL,
    TOKEN_FILE,
)
from utils import strip_html_tags


# ── OAuth2 인증 ──────────────────────────────────────────────


def get_auth_url(state: str = "login") -> str:
    """InnoReader OAuth2 인증 URL 생성."""
    params = {
        "client_id": INOREADER_APP_ID,
        "redirect_uri": INOREADER_REDIRECT_URI,
        "response_type": "code",
        "scope": INOREADER_SCOPE,
        "state": state,
    }
    return f"{INOREADER_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code_for_token(code: str) -> dict:
    """인증 코드를 액세스 토큰으로 교환."""
    resp = requests.post(
        INOREADER_TOKEN_URL,
        data={
            "code": code,
            "redirect_uri": INOREADER_REDIRECT_URI,
            "client_id": INOREADER_APP_ID,
            "client_secret": INOREADER_APP_KEY,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    resp.raise_for_status()
    token_data = resp.json()
    token_data["obtained_at"] = int(time.time())
    return token_data


def refresh_access_token(refresh_token: str) -> dict:
    """리프레시 토큰으로 새 액세스 토큰 발급."""
    resp = requests.post(
        INOREADER_TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": INOREADER_APP_ID,
            "client_secret": INOREADER_APP_KEY,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    resp.raise_for_status()
    token_data = resp.json()
    token_data["obtained_at"] = int(time.time())
    return token_data


def save_token(token_data: dict) -> None:
    """토큰을 파일에 저장."""
    Path(TOKEN_FILE).write_text(json.dumps(token_data), encoding="utf-8")


def load_token() -> Optional[dict]:
    """저장된 토큰 로드. 없으면 None."""
    p = Path(TOKEN_FILE)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def get_valid_token() -> Optional[str]:
    """유효한 액세스 토큰 반환. 만료 시 자동 갱신."""
    token_data = load_token()
    if not token_data:
        return None

    # 만료 확인 (여유 60초)
    expires_in = token_data.get("expires_in", 3600)
    obtained_at = token_data.get("obtained_at", 0)
    if time.time() > obtained_at + expires_in - 60:
        refresh_tok = token_data.get("refresh_token")
        if not refresh_tok:
            return None
        try:
            new_data = refresh_access_token(refresh_tok)
            # refresh_token이 응답에 없으면 기존 것 유지
            if "refresh_token" not in new_data:
                new_data["refresh_token"] = refresh_tok
            save_token(new_data)
            token_data = new_data
        except Exception:
            return None

    return token_data.get("access_token")


def logout() -> None:
    """토큰 파일 삭제."""
    p = Path(TOKEN_FILE)
    if p.exists():
        p.unlink()


# ── API 호출 ──────────────────────────────────────────────────


def _get_headers(access_token: str) -> dict:
    return {
        "AppId": INOREADER_APP_ID,
        "AppKey": INOREADER_APP_KEY,
        "Authorization": f"Bearer {access_token}",
    }


def _get(endpoint: str, access_token: str, params: Optional[dict] = None) -> dict:
    """InnoReader API GET 요청."""
    url = f"{INOREADER_BASE_URL}{endpoint}"
    resp = requests.get(
        url, headers=_get_headers(access_token), params=params, timeout=30
    )
    resp.raise_for_status()
    return resp.json()


@st.cache_data(ttl=600)
def get_subscriptions(access_token: str) -> list[dict]:
    """구독 목록 조회. 폴더 정보 포함."""
    data = _get("/reader/api/0/subscription/list", access_token)
    subs = []
    for s in data.get("subscriptions", []):
        folders = [
            c.get("label", "")
            for c in s.get("categories", [])
            if c.get("label")
        ]
        subs.append(
            {
                "id": s["id"],
                "title": s.get("title", ""),
                "folders": folders,
                "url": s.get("url", ""),
            }
        )
    return subs


def get_folder_list(subscriptions: list[dict]) -> list[str]:
    """구독 목록에서 중복 없는 폴더 이름 목록 반환."""
    folders: set[str] = set()
    for s in subscriptions:
        for f in s["folders"]:
            folders.add(f)
    return sorted(folders)


@st.cache_data(ttl=600)
def fetch_articles(
    access_token: str,
    stream_id: str,
    count: int = 100,
    older_than: Optional[int] = None,
    newer_than: Optional[int] = None,
) -> list[dict]:
    """
    특정 스트림(피드)의 기사 목록 조회.
    페이지네이션(continuation)을 통해 count만큼 수집.
    """
    articles: list[dict] = []
    continuation: Optional[str] = None

    while len(articles) < count:
        params: dict = {"n": min(100, count - len(articles))}
        if continuation:
            params["c"] = continuation
        if newer_than is not None:
            params["ot"] = newer_than
        if older_than is not None:
            params["nt"] = older_than

        encoded_id = requests.utils.quote(stream_id, safe="")
        data = _get(
            f"/reader/api/0/stream/contents/{encoded_id}", access_token, params
        )

        for item in data.get("items", []):
            canonical = item.get("canonical", [{}])
            url = canonical[0].get("href", "") if canonical else ""
            published_ts = item.get("published", 0)
            published_dt = (
                datetime.fromtimestamp(published_ts) if published_ts else None
            )
            summary_html = item.get("summary", {}).get("content", "")

            categories = []
            for c in item.get("categories", []):
                label = c.rsplit("/", 1)[-1] if "/" in c else c
                if label not in ("read", "reading-list", "starred"):
                    categories.append(label)

            articles.append(
                {
                    "title": item.get("title", ""),
                    "url": url,
                    "source": item.get("origin", {}).get("title", ""),
                    "published": published_dt,
                    "summary": strip_html_tags(summary_html),
                    "categories": ", ".join(categories),
                }
            )

        continuation = data.get("continuation")
        if not continuation:
            break

    return articles[:count]
