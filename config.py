import os
from dotenv import load_dotenv

load_dotenv()


def _get_secret(key: str, default=None):
    """환경변수 또는 Streamlit secrets에서 값을 가져옴 (Cloud 배포 호환)."""
    val = os.getenv(key)
    if val:
        return val
    try:
        import streamlit as st
        return st.secrets.get(key, default)
    except Exception:
        return default


INOREADER_APP_ID = _get_secret("INOREADER_APP_ID")
INOREADER_APP_KEY = _get_secret("INOREADER_APP_KEY")

INOREADER_BASE_URL = "https://www.inoreader.com"
INOREADER_AUTH_URL = f"{INOREADER_BASE_URL}/oauth2/auth"
INOREADER_TOKEN_URL = f"{INOREADER_BASE_URL}/oauth2/token"
INOREADER_REDIRECT_URI = "http://localhost:8501"
INOREADER_SCOPE = "read"

TOKEN_FILE = ".inoreader_token.json"

# ── LLM 스코어링 설정 (Gemini) ──
GEMINI_API_KEY = _get_secret("GEMINI_API_KEY")
LLM_MODEL = "gemini-2.5-flash-lite"
LLM_SCORING_ENABLED = bool(GEMINI_API_KEY)
LLM_BATCH_SIZE = 20
LLM_TIMEOUT = 60
LLM_MAX_RETRIES = 3
LLM_KEYWORD_WEIGHT = 0.3
LLM_RELEVANCE_WEIGHT = 0.7
MIN_KEYWORD_SCORE = 3
