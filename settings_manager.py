"""JSON 기반 설정 관리 모듈.

settings.json에 분야별 스코어링 기준과 RSS 피드 URL을 저장.
파일이 없으면 scorer.py와 feeds.py의 기본값으로 초기화.
"""

import json
import os
import copy

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")


def _get_defaults() -> dict:
    """scorer.py와 feeds.py에서 기본값을 가져옴."""
    from scorer import SCORING_CRITERIA, DEFAULT_CRITERIA
    from feeds import RSS_FEEDS

    folders = {}
    all_folder_names = set(list(SCORING_CRITERIA.keys()) + list(RSS_FEEDS.keys()))

    for name in all_folder_names:
        criteria = SCORING_CRITERIA.get(name, copy.deepcopy(DEFAULT_CRITERIA))
        feeds = RSS_FEEDS.get(name, [])
        folders[name] = {
            "criteria": {
                "top_n": criteria.get("top_n", 20),
                "description": criteria.get("description", ""),
                "keywords": criteria.get("keywords", []),
                "keywords_en": criteria.get("keywords_en", []),
                "negative_keywords": criteria.get("negative_keywords", []),
                "exclude_keywords": criteria.get("exclude_keywords", []),
                "country_boost": criteria.get("country_boost", {}),
            },
            "feeds": feeds,
        }

    return {"folders": folders}


def load_settings() -> dict:
    """설정 파일 로드. 없으면 기본값으로 생성."""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    # 기본값으로 초기화
    settings = _get_defaults()
    save_settings(settings)
    return settings


def save_settings(settings: dict):
    """설정을 JSON 파일에 저장."""
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)


def get_folder_names(settings: dict) -> list[str]:
    """폴더 이름 목록 반환."""
    return list(settings.get("folders", {}).keys())


def get_criteria(settings: dict, folder_name: str) -> dict:
    """특정 폴더의 스코어링 기준 반환."""
    folder = settings.get("folders", {}).get(folder_name, {})
    return folder.get("criteria", {
        "top_n": 20,
        "description": "",
        "keywords": [],
        "keywords_en": [],
        "negative_keywords": [],
        "country_boost": {},
    })


def get_feeds(settings: dict, folder_name: str) -> list[dict]:
    """특정 폴더의 RSS 피드 목록 반환."""
    folder = settings.get("folders", {}).get(folder_name, {})
    return folder.get("feeds", [])


def add_folder(settings: dict, folder_name: str) -> dict:
    """새 폴더 추가."""
    if "folders" not in settings:
        settings["folders"] = {}
    if folder_name not in settings["folders"]:
        settings["folders"][folder_name] = {
            "criteria": {
                "top_n": 20,
                "description": "",
                "keywords": [],
                "keywords_en": [],
                "negative_keywords": [],
                "exclude_keywords": [],
                "country_boost": {},
            },
            "feeds": [],
        }
    return settings


def delete_folder(settings: dict, folder_name: str) -> dict:
    """폴더 삭제."""
    settings.get("folders", {}).pop(folder_name, None)
    return settings


def update_criteria(settings: dict, folder_name: str, criteria: dict) -> dict:
    """폴더의 스코어링 기준 업데이트."""
    if folder_name in settings.get("folders", {}):
        settings["folders"][folder_name]["criteria"] = criteria
    return settings


def add_feed(settings: dict, folder_name: str, name: str, url: str) -> dict:
    """폴더에 RSS 피드 추가."""
    if folder_name in settings.get("folders", {}):
        feeds = settings["folders"][folder_name].get("feeds", [])
        feeds.append({"name": name, "url": url})
        settings["folders"][folder_name]["feeds"] = feeds
    return settings


def delete_feed(settings: dict, folder_name: str, feed_idx: int) -> dict:
    """폴더에서 RSS 피드 삭제."""
    if folder_name in settings.get("folders", {}):
        feeds = settings["folders"][folder_name].get("feeds", [])
        if 0 <= feed_idx < len(feeds):
            feeds.pop(feed_idx)
        settings["folders"][folder_name]["feeds"] = feeds
    return settings
