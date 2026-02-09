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
