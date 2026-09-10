import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime
from pathlib import Path

import pandas as pd


INPUT_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "demo_zl_1.xlsx").resolve()
OUTPUT_PATH = Path(
    sys.argv[2] if len(sys.argv) > 2 else "output/demo_zl_1_normalized.json"
).resolve()
CURRENT_YEAR = datetime.now().year


def text_key(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(character for character in text if unicodedata.category(character) != "Mn")
    text = text.lower().replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def location_key(value):
    text = text_key(value)
    text = re.sub(r"\b(province|city|tinh|thanh pho|municipality)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


CANONICAL_LOCATIONS = [
    "An Giang", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn",
    "Bắc Ninh", "Bến Tre", "Bình Dương", "Bình Định", "Bình Phước",
    "Bình Thuận", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk",
    "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang",
    "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang",
    "Hòa Bình", "Hồ Chí Minh", "Hưng Yên", "Khánh Hòa", "Kiên Giang",
    "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Long An",
    "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên",
    "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị",
    "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên",
    "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "Trà Vinh", "Tuyên Quang",
    "Vĩnh Long", "Vĩnh Phúc", "Yên Bái",
]
LOCATION_LOOKUP = {location_key(location): location for location in CANONICAL_LOCATIONS}

LOCATION_ALIASES = {
    "hcm": "Hồ Chí Minh",
    "tp hcm": "Hồ Chí Minh",
    "tphcm": "Hồ Chí Minh",
    "ho chi minh": "Hồ Chí Minh",
    "sai gon": "Hồ Chí Minh",
    "saigon": "Hồ Chí Minh",
    "hanoi": "Hà Nội",
    "ha noi": "Hà Nội",
    "danang": "Đà Nẵng",
    "da nang": "Đà Nẵng",
    "haiphong": "Hải Phòng",
    "hai phong": "Hải Phòng",
    "cantho": "Cần Thơ",
    "can tho": "Cần Thơ",
    "hue": "Thừa Thiên Huế",
    "bien hoa": "Đồng Nai",
    "da lat": "Lâm Đồng",
    "nha trang": "Khánh Hòa",
    "vung tau": "Bà Rịa - Vũng Tàu",
    "ha long": "Quảng Ninh",
    "buon ma thuot": "Đắk Lắk",
    "buon me thuot": "Đắk Lắk",
    "pleiku": "Gia Lai",
    "quy nhon": "Bình Định",
    "vinh": "Nghệ An",
    "my tho": "Tiền Giang",
    "long xuyen": "An Giang",
    "rach gia": "Kiên Giang",
    "phan thiet": "Bình Thuận",
    "phan rang": "Ninh Thuận",
    "tuy hoa": "Phú Yên",
    "dong hoi": "Quảng Bình",
    "tam ky": "Quảng Nam",
    "hoi an": "Quảng Nam",
    "cao lanh": "Đồng Tháp",
    "sa dec": "Đồng Tháp",
}
LOCATION_LOOKUP.update({location_key(alias): value for alias, value in LOCATION_ALIASES.items()})

GENDER_MAP = {
    "male": "male",
    "nam": "male",
    "female": "female",
    "nu": "female",
}

RELATIONSHIP_MAP = {
    "single": "single",
    "doc than": "single",
    "married": "married",
    "da ket hon": "married",
    "engaged": "engaged",
    "da dinh hon": "engaged",
    "divorced": "divorced",
    "da ly hon": "divorced",
    "separated": "separated",
    "da ly than": "separated",
    "widowed": "widowed",
    "goa": "widowed",
    "in a relationship": "in a relationship",
    "hen ho": "in a relationship",
    "tim hieu": "in a relationship",
    "it s complicated": "it's complicated",
    "co moi quan he phuc tap": "it's complicated",
    "in an open relationship": "in an open relationship",
    "in a domestic partnership": "in a domestic partnership",
    "chung song": "in a domestic partnership",
    "in a civil union": "in a civil union",
    "in a civil partnership": "in a civil union",
    "ket hon dong tinh": "in a civil union",
}


def is_missing(value):
    return value is None or (isinstance(value, float) and math.isnan(value)) or pd.isna(value)


def normalize_user_id(value):
    if is_missing(value):
        return None
    if isinstance(value, (int,)):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip() or None


def normalize_gender(value):
    if is_missing(value):
        return None
    return GENDER_MAP.get(text_key(value))


def normalize_birthday(value):
    if is_missing(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        year = int(value.year)
        return year if 1900 <= year <= CURRENT_YEAR else None
    if isinstance(value, (int, float)) and 1900 <= int(value) <= CURRENT_YEAR:
        return int(value)
    years = re.findall(r"(?<!\d)(?:18|19|20)\d{2}(?!\d)", str(value))
    if not years:
        return None
    year = int(years[-1])
    return year if 1900 <= year <= CURRENT_YEAR else None


def normalize_location(value):
    if is_missing(value):
        return None
    parts = [part.strip() for part in str(value).split(",") if part.strip()]
    if not parts:
        return None

    candidates = parts[:1]
    if text_key(parts[0]) in {"vietnam", "viet nam"}:
        candidates = parts[1:3]

    for candidate in candidates:
        normalized = location_key(candidate)
        if normalized in LOCATION_LOOKUP:
            return LOCATION_LOOKUP[normalized]

        without_parenthetical = location_key(re.sub(r"\([^)]*\)", "", candidate))
        if without_parenthetical in LOCATION_LOOKUP:
            return LOCATION_LOOKUP[without_parenthetical]
    return None


def normalize_relationship(value):
    if is_missing(value):
        return None
    return RELATIONSHIP_MAP.get(text_key(value))


frame = pd.read_excel(INPUT_PATH, sheet_name="demo", dtype=object)
required_columns = ["UserId", "Gender", "Birthday", "Location", "Relationship"]
missing_columns = [column for column in required_columns if column not in frame.columns]
if missing_columns:
    raise ValueError(f"Thiếu cột bắt buộc: {', '.join(missing_columns)}")

records = []
unknown_genders = Counter()
unknown_relationships = Counter()
unmapped_locations = Counter()

for row in frame[required_columns].itertuples(index=False, name=None):
    user_id, gender, birthday, location, relationship = row
    normalized_gender = normalize_gender(gender)
    normalized_location = normalize_location(location)
    normalized_relationship = normalize_relationship(relationship)

    if not is_missing(gender) and normalized_gender is None:
        unknown_genders[str(gender).strip()] += 1
    if not is_missing(relationship) and normalized_relationship is None:
        unknown_relationships[str(relationship).strip()] += 1
    if not is_missing(location) and normalized_location is None:
        unmapped_locations[str(location).strip()] += 1

    records.append({
        "UserId": normalize_user_id(user_id),
        "Gender": normalized_gender,
        "Birthday": normalize_birthday(birthday),
        "Location": normalized_location,
        "Relationship": normalized_relationship,
    })

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT_PATH.open("w", encoding="utf-8") as output_file:
    json.dump(records, output_file, ensure_ascii=False, separators=(",", ":"))

summary = {
    "input": str(INPUT_PATH),
    "output": str(OUTPUT_PATH),
    "rows": len(records),
    "genderCounts": Counter(record["Gender"] for record in records),
    "birthdayYearPresent": sum(record["Birthday"] is not None for record in records),
    "birthdayYearMissing": sum(record["Birthday"] is None for record in records),
    "locationPresent": sum(record["Location"] is not None for record in records),
    "locationMissingOrNonVietnam": sum(record["Location"] is None for record in records),
    "relationshipPresent": sum(record["Relationship"] is not None for record in records),
    "relationshipMissing": sum(record["Relationship"] is None for record in records),
    "unknownGenders": dict(unknown_genders),
    "unknownRelationships": dict(unknown_relationships),
    "topLocations": Counter(
        record["Location"] for record in records if record["Location"] is not None
    ).most_common(20),
    "relationshipCounts": Counter(
        record["Relationship"] for record in records if record["Relationship"] is not None
    ),
    "unmappedLocationDistinct": len(unmapped_locations),
}
print(json.dumps(summary, ensure_ascii=False, indent=2, default=dict))
