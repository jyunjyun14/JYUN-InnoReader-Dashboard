"""
폴더별 Google Alerts RSS 피드 URL 설정.

CSV 원본 파일 위치: C:\\JYUN\\RSS _FEED\\
URL 추가/수정 시 아래 딕셔너리만 편집하면 됩니다.
"""

RSS_FEEDS: dict[str, list[dict[str, str]]] = {
    "의료서비스": [
        {"name": "Attracting foreign patients", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/13561308332292748472"},
        {"name": "Corporate Hospital", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/16693441824814805775"},
        {"name": "Health cooperation", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/1287887581071480978"},
        {"name": "telemedicine", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/9055610516680741382"},
        {"name": "Telemedicine regulations", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/2928527134966813170"},
        {"name": "foreign patients", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/10457698523200751004"},
        {"name": "medical tourism", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7826728468277936331"},
        {"name": "foreign doctors", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7826728468277936981"},
        {"name": "Foreign medical license", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7826728468277937655"},
        {"name": "Establishing hospitals overseas", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/3594479743701557419"},
        {"name": "Medical MOU", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/2313437686882011229"},
    ],
    "디지털헬스": [
        {"name": "AI Medical", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/13014376445345209407"},
        {"name": "AI Medical Research", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/8744798816557255021"},
        {"name": "Digital health", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/11820206743454096975"},
        {"name": "digital therapeutics", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/17406051997125751123"},
        {"name": "AI medical devices", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/10373506605108435851"},
        {"name": "virtual therapy", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/2072337529383132064"},
        {"name": "Wearable Health", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/4698420078235331068"},
    ],
    "의료기기": [
        {"name": "robotic medical devices", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/13227641381889425281"},
        {"name": "medical devices", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/6206917423973395550"},
        {"name": "robotic medical surgery", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7141639275305383942"},
        {"name": "Medical device approval", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7141639275305384670"},
        {"name": "Medical device FDA approval", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7141639275305382961"},
        # "EU approval of medical devices" — CSV에 URL 누락
        {"name": "Medical Device Regulation", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/17869874465675685153"},
    ],
    "제약": [
        {"name": "FDA approval of medicines", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/6671054869581734818"},
        {"name": "European approval of medicines", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/13227641381889422015"},
        {"name": "pharma approval", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/10296632812682810747"},
        {"name": "New drug development", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/13810736302959211643"},
        {"name": "Big Pharma", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/17738920745123822763"},
        {"name": "New Pharma research", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/8670413138782703068"},
        {"name": "Pharmaceutical regulations", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/17869874465675685712"},
    ],
    "화장품": [
        {"name": "cosmetic trends", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/7394127831386510300"},
        {"name": "cosmetic industry", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/4617254871446954389"},
        {"name": "Cosmetic ingredients", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/15903492943861068235"},
        {"name": "Cosmetics trends", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/15903492943861070072"},
        # "Cosmetic ingredient research" — CSV에 URL 누락
        {"name": "Cosmetics Regulations", "url": "https://www.google.co.kr/alerts/feeds/18326457998461538766/15903492943861071128"},
    ],
}
