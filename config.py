import os
from dotenv import load_dotenv

load_dotenv()

INOREADER_APP_ID = os.getenv("INOREADER_APP_ID")
INOREADER_APP_KEY = os.getenv("INOREADER_APP_KEY")

INOREADER_BASE_URL = "https://www.inoreader.com"
INOREADER_AUTH_URL = f"{INOREADER_BASE_URL}/oauth2/auth"
INOREADER_TOKEN_URL = f"{INOREADER_BASE_URL}/oauth2/token"
INOREADER_REDIRECT_URI = "http://localhost:8501"
INOREADER_SCOPE = "read"

TOKEN_FILE = ".inoreader_token.json"

# ── LLM 스코어링 설정 (Gemini) ──
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
LLM_MODEL = "gemini-2.5-flash-lite"
LLM_SCORING_ENABLED = bool(GEMINI_API_KEY)
LLM_BATCH_SIZE = 20
LLM_TIMEOUT = 60
LLM_MAX_RETRIES = 3
LLM_KEYWORD_WEIGHT = 0.3
LLM_RELEVANCE_WEIGHT = 0.7
MIN_KEYWORD_SCORE = 1
