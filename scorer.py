"""기사 스코어링 및 우수 기사 선별 모듈 (2-Pass: 키워드 + LLM)."""

import logging
import re

from config import MIN_KEYWORD_SCORE, LLM_SCORING_ENABLED

logger = logging.getLogger(__name__)

PAYWALL_KEYWORDS = [
    "구독자 전용", "유료", "premium", "subscribe", "paywall",
    "로그인 후", "전문보기", "유료기사", "구독 후", "멤버십",
    "subscribers only", "paid content",
]

# 동영상/비뉴스 매체 필터링 (언론보도만 허용)
EXCLUDED_URL_PATTERNS = [
    "youtube.com", "youtu.be",
    "vimeo.com", "dailymotion.com",
    "tiktok.com", "instagram.com",
    "facebook.com/watch", "twitter.com/i/spaces",
    "podcasts.apple.com", "spotify.com/episode",
]
EXCLUDED_SOURCE_KEYWORDS = [
    "youtube", "유튜브", "podcast", "팟캐스트",
    "tiktok", "틱톡", "instagram", "인스타그램",
]

# 한국 언론매체 필터링 (글로벌 기사만 수집)
KOREAN_URL_PATTERNS = [
    ".kr/", ".kr?", ".co.kr",
    "chosun.com", "chosunbiz", "donga.com", "joongang.co", "hankyung.com", "hani.co",
    "yna.co", "yonhapnews", "mk.co", "edaily.co", "etnews.com",
    "zdnet.co.kr", "newsis.com", "newspim.com", "news1.kr",
    "sedaily.com", "fnnews.com", "mt.co.kr", "thebell.co",
    "pharmnews.com", "yakup.com", "bosa.co", "doctorstimes.com",
    "medigatenews.com", "hkn24.com", "whosaeng.com",
    "medipana.com", "dailypharm.com", "health.chosun",
    "digitaltoday.co", "asiae.co", "ajunews.com", "inews24.com",
    "dt.co.kr", "bloter.net", "ddaily.co", "bizwatch.co",
    "olyx.co", "gangnamunni",
]
KOREAN_SOURCE_KEYWORDS = [
    "조선", "chosunbiz", "동아", "중앙", "한겨레", "경향", "매일경제", "한국경제",
    "연합뉴스", "뉴시스", "뉴스1", "이데일리", "파이낸셜", "머니투데이",
    "서울경제", "아시아경제", "헤럴드", "the bell", "더벨",
    "약업신문", "팜뉴스", "메디게이트", "보사", "의사신문", "메디파나",
    "데일리팜", "헬스조선", "코리아", "korea times", "korea herald",
    "디지털투데이", "digitaltoday", "강남언니", "gangnam unni",
    "breaknews", "브레이크뉴스", "newdaily", "뉴데일리", "medicaltimes",
    "newsway", "뉴스웨이", "kukinews", "국민일보", "segye", "세계일보",
    "hankyoreh", "biz.heraldcorp", "biomedipharma",
]

SCORING_CRITERIA = {
    "의료서비스": {
        "top_n": 40,
        "description": (
            "FOCUS: International biohealth cooperation & healthcare globalization trends.\n"
            "HIGH relevance (8-10): Country-to-country public health cooperation agreements, "
            "strategies to attract foreign hospitals or establish hospitals overseas, "
            "medical license reciprocity/recognition issues across borders, "
            "telemedicine technology and cross-border remote care platforms, "
            "international patient attraction policies, medical tourism industry trends.\n"
            "MEDIUM relevance (5-7): General hospital management news with international angle, "
            "healthcare workforce migration.\n"
            "LOW relevance (1-4): Domestic-only hospital news, local clinic operations, "
            "general health tips, unrelated policy news, entertainment, real estate."
        ),
        "keywords": [
            "외국인환자", "외국인 환자", "외국인환자유치",
            "의료인 면허", "의료인면허", "의료인 진출", "의료인진출",
            "비대면", "원격진료", "원격 진료",
            "보건의료협력", "보건의료 협력", "보건 의료 협력",
            "병원 해외진출", "병원해외진출", "병원 설립", "해외 병원",
            "의료관광", "의료 관광", "메디컬 투어",
        ],
        "keywords_en": [
            "medical tourism", "international patient",
            "telemedicine", "telehealth", "remote healthcare",
            "hospital overseas", "healthcare cooperation",
            "foreign patient", "medical travel",
            "cross-border healthcare", "global health",
        ],
        "negative_keywords": [
            "산업로봇", "industrial robot", "제조로봇",
            "부동산", "real estate", "stock market", "주식",
            "entertainment", "연예",
        ],
        "country_boost": {
            "미국": 2, "USA": 2, "US": 2,
            "유럽": 2, "EU": 2, "영국": 2, "독일": 2, "프랑스": 2,
            "중동": 3, "사우디": 3, "사우디아라비아": 3, "Saudi": 3,
            "UAE": 3, "아랍에미리트": 3, "두바이": 3, "Dubai": 3,
            "카타르": 3, "Qatar": 3, "오만": 3, "쿠웨이트": 3, "바레인": 3,
            "아시아": 1, "일본": 1, "중국": 1, "베트남": 1,
            "태국": 1, "인도": 1, "인도네시아": 1, "싱가포르": 1,
        },
    },
    "디지털헬스": {
        "top_n": 40,
        "description": (
            "FOCUS: AI and digital technology applied to healthcare/medicine.\n"
            "HIGH relevance (8-10): AI-powered medical diagnosis or treatment tools, "
            "AI drug discovery, machine learning in clinical settings, "
            "digital therapeutics (DTx) development/approval, "
            "AI medical imaging analysis, LLM/foundation models for healthcare, "
            "FDA/regulatory decisions on AI medical software (SaMD).\n"
            "MEDIUM relevance (5-7): General digital health platforms, wearable health devices, "
            "remote patient monitoring technology, health data interoperability.\n"
            "LOW relevance (1-4): General AI news NOT related to healthcare (chatbots, autonomous driving, fintech AI), "
            "basic fitness apps, consumer electronics, gaming, EdTech, "
            "AI in non-medical industries."
        ),
        "keywords": [
            "AI 의료기기", "AI의료기기", "AI 의료 기기", "인공지능 의료기기",
            "AI 의료서비스", "AI의료서비스", "AI 의료 서비스", "인공지능 의료",
            "디지털치료기기", "디지털 치료기기", "디지털치료제", "DTx",
            "디지털헬스", "디지털 헬스", "디지털건강", "digital health",
            "연구동향", "기술동향", "기술 동향",
            "SaMD", "웨어러블", "헬스케어 AI", "헬스케어AI",
            "원격모니터링", "원격 모니터링",
        ],
        "keywords_en": [
            "digital health", "digital therapeutics", "DTx",
            "AI medical device", "AI healthcare", "AI diagnosis",
            "SaMD", "software as medical device",
            "wearable health", "remote monitoring",
            "health tech", "healthtech", "medtech AI",
            "clinical decision support",
        ],
        "negative_keywords": [
            "자율주행", "autonomous driving", "self-driving",
            "fintech", "핀테크", "edtech", "에드테크",
            "gaming", "게임",
        ],
        "country_boost": {},
    },
    "의료기기": {
        "top_n": 25,
        "description": (
            "FOCUS: Medical device industry trends — new technology, regulatory approvals, major corporate moves.\n"
            "HIGH relevance (8-10): FDA/CE/MFDS new device approvals or clearances (510k, PMA, de novo), "
            "breakthrough medical device technologies (surgical robots, AI diagnostics, implants), "
            "major M&A or partnerships among large medtech companies (Medtronic, J&J, Siemens Healthineers, etc.), "
            "significant regulatory changes (MDR, IVDR) affecting device industry.\n"
            "MEDIUM relevance (5-7): IVD/diagnostics updates, medical device recalls, "
            "clinical trial results for devices, industry conferences.\n"
            "LOW relevance (1-4): Industrial robots/manufacturing robots NOT for medical use, "
            "food safety (FDA food division), agriculture equipment, "
            "small local company routine news, general business news."
        ),
        "keywords": [
            "의료기기 승인", "의료기기승인", "FDA 승인", "FDA승인",
            "CE 인증", "CE인증", "EU 승인",
            "로봇", "수술로봇", "수술 로봇", "로봇 의료", "의료로봇",
            "첨단의료기기", "첨단 의료기기",
            "산업동향", "산업 동향",
            "연구동향", "연구 동향",
            "의료기기 규제", "의료기기규제", "MFDS", "MDR",
            "체외진단", "IVD",
        ],
        "keywords_en": [
            "medical device", "FDA approval", "FDA clearance",
            "CE marking", "CE mark", "MDR compliance",
            "surgical robot", "robotic surgery",
            "in vitro diagnostics", "IVD",
            "medical device regulation",
            "510(k)", "PMA approval", "de novo",
        ],
        "negative_keywords": [
            "산업로봇", "industrial robot", "제조로봇", "manufacturing robot",
            "식품", "food safety", "식품안전",
            "농업", "agriculture",
        ],
        "country_boost": {},
    },
    "제약": {
        "top_n": 25,
        "description": (
            "FOCUS: Pharmaceutical industry trends — drug approvals, major pharma moves, clinical breakthroughs.\n"
            "HIGH relevance (8-10): FDA/EMA new drug approvals (NDA, BLA), "
            "landmark clinical trial results (especially Phase 3), "
            "major pharma M&A or licensing deals (Pfizer, Roche, Novartis, Samsung Biologics, etc.), "
            "breakthrough therapy designations, new drug pricing policies with industry impact, "
            "biosimilar/generic market shifts.\n"
            "MEDIUM relevance (5-7): Drug supply chain issues, API (active pharmaceutical ingredient) trends, "
            "early-phase clinical trials, pharma earnings with strategic implications.\n"
            "LOW relevance (1-4): Food industry news, cosmetics, agricultural chemicals, "
            "general stock market commentary, unrelated regulatory news, "
            "small supplement companies, traditional medicine without clinical evidence."
        ),
        "keywords": [
            "의약품 승인", "의약품승인", "FDA 승인", "FDA승인",
            "EMA 승인", "EU 승인",
            "임상시험", "임상 시험", "clinical trial", "임상3상", "임상 3상",
            "공급망", "공급 망", "supply chain", "원료의약품",
            "연구동향", "연구 동향",
            "산업동향", "산업 동향",
            "의약품 규제", "의약품규제", "약가", "신약",
            "바이오시밀러", "바이오 시밀러", "제네릭",
        ],
        "keywords_en": [
            "drug approval", "FDA approved", "EMA approval",
            "clinical trial", "phase 3", "phase III",
            "pharmaceutical", "pharma pipeline",
            "biosimilar", "generic drug",
            "drug pricing", "drug supply chain",
            "new drug application", "NDA", "BLA",
        ],
        "negative_keywords": [
            "식품", "food", "cosmetic", "화장품",
            "농약", "pesticide",
        ],
        "country_boost": {},
    },
    "화장품": {
        "top_n": 20,
        "description": (
            "FOCUS: Cosmetics & beauty industry trends — new ingredients, R&D, beauty tech innovation.\n"
            "HIGH relevance (8-10): New cosmetic ingredient discoveries or safety research, "
            "beauty tech innovations (AI skin analysis, personalized formulation, biotech-derived ingredients), "
            "major cosmetic regulatory changes (EU, FDA, China), "
            "K-beauty global market trends and export data, "
            "large beauty company R&D announcements (L'Oreal, Amorepacific, LG H&H, etc.).\n"
            "MEDIUM relevance (5-7): Clean beauty/vegan/sustainable beauty trends, "
            "beauty market reports, ingredient supply chain, cosmetic packaging innovation.\n"
            "LOW relevance (1-4): Plastic surgery/cosmetic surgery (medical procedures, not products), "
            "fashion/clothing, celebrity beauty routines without industry substance, "
            "general retail/e-commerce news, food industry."
        ),
        "keywords": [
            "뷰티테크", "뷰티 테크", "beauty tech",
            "기술동향", "기술 동향",
            "기업동향", "기업 동향", "대기업",
            "화장품 성분", "화장품성분", "성분 규제",
            "연구동향", "연구 동향",
            "K-뷰티", "K뷰티", "K-beauty",
            "클린뷰티", "클린 뷰티", "비건", "지속가능",
        ],
        "keywords_en": [
            "K-beauty", "Korean beauty", "Korean cosmetics",
            "beauty tech", "beauty technology",
            "cosmetic ingredient", "cosmetic regulation",
            "clean beauty", "vegan beauty", "sustainable beauty",
            "skincare innovation", "beauty trend",
        ],
        "negative_keywords": [
            "성형", "plastic surgery", "cosmetic surgery",
            "패션", "fashion week",
        ],
        "country_boost": {},
    },
}

# 기본 기준 (매칭 안 되는 폴더용)
DEFAULT_CRITERIA = {
    "top_n": 20,
    "description": "General biohealth industry news and trends.",
    "keywords": [],
    "keywords_en": [],
    "negative_keywords": [],
    "country_boost": {},
}


def get_criteria_for_folder(folder_name: str, settings: dict = None) -> dict:
    """폴더명에 해당하는 스코어링 기준 반환. settings.json 우선, 없으면 기본값."""
    # settings.json에서 먼저 찾기
    if settings:
        from settings_manager import get_criteria
        criteria = get_criteria(settings, folder_name)
        if criteria.get("keywords") or criteria.get("keywords_en"):
            return criteria

    # Python 기본값에서 찾기
    for key, criteria in SCORING_CRITERIA.items():
        if key in folder_name or folder_name in key:
            return criteria
    return DEFAULT_CRITERIA


def _is_video_source(article: dict) -> bool:
    """동영상/비뉴스 매체 여부 판별."""
    url = (article.get("url") or "").lower()
    for pattern in EXCLUDED_URL_PATTERNS:
        if pattern in url:
            return True

    source = (article.get("source") or "").lower()
    for kw in EXCLUDED_SOURCE_KEYWORDS:
        if kw in source:
            return True

    return False


def _is_korean_source(article: dict) -> bool:
    """한국 언론매체 여부 판별. 글로벌 기사만 통과."""
    url = (article.get("url") or "").lower()

    # Google redirect URL 안의 실제 URL 추출
    real_url = url
    if "url=" in url:
        real_url = url.split("url=")[-1].split("&")[0].lower()

    # URL 패턴 체크 (원본 + 실제 URL 모두)
    for pattern in KOREAN_URL_PATTERNS:
        if pattern in url or pattern in real_url:
            return True

    # 소스명 체크
    source = (article.get("source") or "").lower()
    for kw in KOREAN_SOURCE_KEYWORDS:
        if kw.lower() in source:
            return True

    # 제목에 한국어가 30% 이상이면 한국 매체 기사로 판단
    title = article.get("title") or ""
    if title:
        korean_chars = sum(1 for c in title if '\uac00' <= c <= '\ud7a3')
        total_chars = len(title.replace(" ", ""))  # 공백 제외
        if total_chars > 3 and korean_chars / total_chars > 0.3:
            return True

    # 요약에 한국어가 50% 이상이면 한국 매체
    summary = (article.get("summary") or "")[:200]
    if summary:
        kr_chars = sum(1 for c in summary if '\uac00' <= c <= '\ud7a3')
        total = len(summary.replace(" ", ""))
        if total > 10 and kr_chars / total > 0.5:
            return True

    return False


def is_paywalled(article: dict) -> bool:
    """유료 기사, 비뉴스 매체, 한국 매체 여부 판별."""
    # 동영상/비뉴스 매체 제외
    if _is_video_source(article):
        return True

    # 한국 언론매체 제외 (글로벌 기사만)
    if _is_korean_source(article):
        return True

    summary = (article.get("summary") or "").strip()
    title = (article.get("title") or "").strip()

    # 본문 요약이 매우 짧은 경우
    if len(summary) < 50:
        return True

    # 페이월 키워드 검사
    text = (title + " " + summary).lower()
    for kw in PAYWALL_KEYWORDS:
        if kw.lower() in text:
            return True

    return False


def _is_ascii(text: str) -> bool:
    """영문자/숫자만으로 구성된 키워드인지 판별."""
    return all(ord(c) < 128 for c in text if not c.isspace())


def _word_match(keyword: str, text: str) -> bool:
    """
    키워드가 텍스트에 포함되는지 확인.
    영어 키워드: 단어 경계(\b) 접두 매칭 (복수형/변형 허용, US가 pushed에 매칭되지 않도록)
    한국어 키워드: 기존 부분 문자열 매칭
    """
    kw_lower = keyword.lower()
    if _is_ascii(kw_lower):
        # 앞쪽은 단어 경계, 뒤쪽은 단어문자 몇 글자 허용 (복수형 s, ing, ed 등)
        return bool(re.search(r'\b' + re.escape(kw_lower) + r'\w{0,3}\b', text))
    return kw_lower in text


def score_article(article: dict, folder_name: str, settings: dict = None) -> tuple[float, list[str], list[str]]:
    """
    기사에 대한 키워드 점수를 계산 (Pass 1).
    반환: (점수, 매칭된 키워드 리스트, 매칭된 국가 리스트)
    """
    if is_paywalled(article):
        return -1, [], []

    criteria = get_criteria_for_folder(folder_name, settings)
    score = 0.0
    matched_keywords = []

    title = (article.get("title") or "").lower()
    summary = (article.get("summary") or "").lower()

    # 한국어 키워드 매칭
    for kw in criteria["keywords"]:
        if _word_match(kw, title):
            score += 3
            matched_keywords.append(kw)
        elif _word_match(kw, summary):
            score += 1
            matched_keywords.append(kw)

    # 영어 키워드 매칭 (단어 경계 매칭)
    for kw in criteria.get("keywords_en", []):
        if _word_match(kw, title):
            score += 3
            matched_keywords.append(kw)
        elif _word_match(kw, summary):
            score += 1
            matched_keywords.append(kw)

    # 부정 키워드 매칭 (감점)
    for kw in criteria.get("negative_keywords", []):
        if _word_match(kw, title):
            score -= 3
        if _word_match(kw, summary):
            score -= 1

    # 국가 부스트 (키워드가 1개 이상 매칭된 경우에만 적용)
    matched_countries = []
    if score > 0:
        for country, boost in criteria.get("country_boost", {}).items():
            if _word_match(country, title) or _word_match(country, summary):
                score += boost
                matched_countries.append(country)

    return score, matched_keywords, matched_countries


def select_top_articles(articles: list[dict], folder_name: str, settings: dict = None) -> list[dict]:
    """
    기사 목록에서 스코어링 후 상위 N개를 선별.
    유료 기사(score == -1)는 제외.
    MIN_KEYWORD_SCORE 미만 기사 제외.
    LLM_SCORING_ENABLED일 때 Pass 2 LLM 스코어링 적용.
    반환되는 각 dict에 'score', 'keyword_score', 'llm_score' 필드가 추가됨.
    """
    criteria = get_criteria_for_folder(folder_name, settings)
    top_n = criteria["top_n"]

    scored = []
    for article in articles:
        s, matched_kws, matched_countries = score_article(article, folder_name, settings)
        if s < 0:
            continue
        if s < MIN_KEYWORD_SCORE:
            continue
        entry = dict(article)
        entry["score"] = s
        entry["keyword_score"] = s
        entry["llm_score"] = None
        entry["matched_keywords"] = matched_kws
        entry["matched_countries"] = matched_countries
        scored.append(entry)

    scored.sort(key=lambda x: x["score"], reverse=True)

    # 키워드 점수 기준 상위 선별 (LLM 입력용, 여유분 포함)
    candidates = scored[:top_n * 2] if LLM_SCORING_ENABLED else scored[:top_n]

    # Pass 2: LLM 스코어링
    if LLM_SCORING_ENABLED and candidates:
        try:
            from llm_scorer import apply_llm_scores
            candidates = apply_llm_scores(candidates, folder_name, criteria)
            candidates.sort(key=lambda x: x["score"], reverse=True)
        except Exception as e:
            logger.warning("LLM 스코어링 실패, 키워드 점수만 사용: %s", e)

    return candidates[:top_n]
