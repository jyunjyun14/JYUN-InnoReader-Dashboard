"""기사 스코어링 및 우수 기사 선별 모듈."""

PAYWALL_KEYWORDS = [
    "구독자 전용", "유료", "premium", "subscribe", "paywall",
    "로그인 후", "전문보기", "유료기사", "구독 후", "멤버십",
    "subscribers only", "paid content",
]

SCORING_CRITERIA = {
    "의료서비스": {
        "top_n": 40,
        "keywords": [
            "외국인환자", "외국인 환자", "외국인환자유치",
            "의료인 면허", "의료인면허", "의료인 진출", "의료인진출",
            "비대면", "원격진료", "원격 진료",
            "보건의료협력", "보건의료 협력", "보건 의료 협력",
            "병원 해외진출", "병원해외진출", "병원 설립", "해외 병원",
            "의료관광", "의료 관광", "메디컬 투어",
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
        "keywords": [
            "AI 의료기기", "AI의료기기", "AI 의료 기기", "인공지능 의료기기",
            "AI 의료서비스", "AI의료서비스", "AI 의료 서비스", "인공지능 의료",
            "디지털치료기기", "디지털 치료기기", "디지털치료제", "DTx",
            "디지털헬스", "디지털 헬스", "디지털건강", "digital health",
            "연구동향", "기술동향", "기술 동향",
            "SaMD", "웨어러블", "헬스케어 AI", "헬스케어AI",
            "원격모니터링", "원격 모니터링",
        ],
        "country_boost": {},
    },
    "의료기기": {
        "top_n": 25,
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
        "country_boost": {},
    },
    "제약": {
        "top_n": 25,
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
        "country_boost": {},
    },
    "화장품": {
        "top_n": 20,
        "keywords": [
            "뷰티테크", "뷰티 테크", "beauty tech",
            "기술동향", "기술 동향",
            "기업동향", "기업 동향", "대기업",
            "화장품 성분", "화장품성분", "성분 규제",
            "연구동향", "연구 동향",
            "K-뷰티", "K뷰티", "K-beauty",
            "클린뷰티", "클린 뷰티", "비건", "지속가능",
        ],
        "country_boost": {},
    },
}

# 기본 기준 (매칭 안 되는 폴더용)
DEFAULT_CRITERIA = {
    "top_n": 20,
    "keywords": [],
    "country_boost": {},
}


def get_criteria_for_folder(folder_name: str) -> dict:
    """폴더명에 해당하는 스코어링 기준 반환. 매칭 안 되면 기본값."""
    for key, criteria in SCORING_CRITERIA.items():
        if key in folder_name or folder_name in key:
            return criteria
    return DEFAULT_CRITERIA


def is_paywalled(article: dict) -> bool:
    """유료 기사 여부 판별."""
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


def score_article(article: dict, folder_name: str) -> float:
    """기사에 대한 점수를 계산."""
    if is_paywalled(article):
        return -1

    criteria = get_criteria_for_folder(folder_name)
    score = 0.0

    title = (article.get("title") or "").lower()
    summary = (article.get("summary") or "").lower()

    # 키워드 매칭
    for kw in criteria["keywords"]:
        kw_lower = kw.lower()
        if kw_lower in title:
            score += 3
        if kw_lower in summary:
            score += 1

    # 국가 부스트
    for country, boost in criteria.get("country_boost", {}).items():
        country_lower = country.lower()
        if country_lower in title or country_lower in summary:
            score += boost

    return score


def select_top_articles(articles: list[dict], folder_name: str) -> list[dict]:
    """
    기사 목록에서 스코어링 후 상위 N개를 선별.
    유료 기사(score == -1)는 제외.
    반환되는 각 dict에 'score' 필드가 추가됨.
    """
    criteria = get_criteria_for_folder(folder_name)
    top_n = criteria["top_n"]

    scored = []
    for article in articles:
        s = score_article(article, folder_name)
        if s < 0:
            continue
        entry = dict(article)
        entry["score"] = s
        scored.append(entry)

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_n]
