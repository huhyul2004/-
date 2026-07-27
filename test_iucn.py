#!/usr/bin/env python3
"""IUCN Red List API 연동 테스트 스크립트.

자바코뿔소(Rhinoceros sondaicus) 정보를 IUCN Red List API v4 에서 가져온다.
API 키는 프로젝트 루트 .env 의 IUCN_API_TOKEN 환경변수에서 읽는다.

준비:
    pip3 install requests python-dotenv
    .env 파일에 IUCN_API_TOKEN=<발급받은키> 입력
실행:
    python3 test_iucn.py
"""
import os
import sys

import requests
from dotenv import load_dotenv

# 프로젝트 루트 .env 로드
load_dotenv()

API_TOKEN = os.getenv("IUCN_API_TOKEN")
BASE_URL = "https://api.iucnredlist.org/api/v4"

# 조회 대상 종
GENUS = "Rhinoceros"
SPECIES = "sondaicus"


def main() -> int:
    if not API_TOKEN:
        print("✗ IUCN_API_TOKEN 이 설정되어 있지 않습니다.")
        print("  .env 파일에 IUCN_API_TOKEN=<발급받은키> 를 입력하세요.")
        print("  키 발급: https://api.iucnredlist.org/users/sign_up")
        return 1

    url = f"{BASE_URL}/taxa/scientific_name"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {API_TOKEN}",
    }
    params = {"genus_name": GENUS, "species_name": SPECIES}

    print(f"조회 중: {GENUS} {SPECIES} …")
    try:
        res = requests.get(url, headers=headers, params=params, timeout=30)
    except requests.RequestException as e:
        print(f"✗ 요청 실패: {e}")
        return 1

    if res.status_code == 401:
        print("✗ 401 인증 실패 — API 토큰이 유효하지 않습니다.")
        return 1
    if res.status_code == 404:
        print(f"✗ 404 — '{GENUS} {SPECIES}' 종을 찾지 못했습니다.")
        return 1
    if not res.ok:
        print(f"✗ HTTP {res.status_code}: {res.text[:300]}")
        return 1

    data = res.json()

    # 분류군 기본 정보
    taxon = data.get("taxon", {})
    print("\n=== 분류군 ===")
    print(f"  학명 : {taxon.get('scientific_name')}")
    print(f"  SIS ID : {taxon.get('sis_id')}")
    common_names = taxon.get("common_names", [])
    main_common = next(
        (c.get("name") for c in common_names if c.get("main")),
        common_names[0].get("name") if common_names else None,
    )
    print(f"  일반명 : {main_common}")

    # 평가 이력 (assessments) — 최신 등급 출력
    assessments = data.get("assessments", [])
    latest = next((a for a in assessments if a.get("latest")), None)
    print("\n=== 최신 평가 ===")
    if latest:
        print(f"  Red List 등급 : {latest.get('red_list_category_code')}")
        print(f"  평가 연도 : {latest.get('year_published')}")
        print(f"  assessment_id : {latest.get('assessment_id')}")
    else:
        print(f"  평가 이력 {len(assessments)}건 (latest 플래그 없음)")

    print("\n✓ 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
