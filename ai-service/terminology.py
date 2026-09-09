"""
Terminology management module for novel translation.
Handles known terminology, extraction, and application.
"""

from typing import List, Dict, Optional, Tuple
from pydantic import BaseModel

from glossary_loader import load_all_glossaries, terms_longest_first


class Term(BaseModel):
    original: str
    translation: str
    type: str = "general"
    description: str = ""


class ExtractedTerm(BaseModel):
    original: str
    translation: str
    confidence: float = 0.0
    type: str = "general"
    description: str = ""


# Pre-defined terminology for popular novels (Against the Gods)
KNOWN_TERMINOLOGY: Dict[str, Dict] = {
    # Against the Gods (逆天邪神) characters
    "云澈": {"translation": "หยุนเช่อ", "type": "character", "description": "Main protagonist"},
    "沐玄音": {"translation": "มู่เสวียนอิ่น", "type": "character", "description": "Ice Phoenix Goddess"},
    "司空度": {"translation": "สีคงตู้", "type": "character", "description": "Sikong Du"},
    "秦无殇": {"translation": "ฉินอู๋ซาง", "type": "character", "description": "Qin Wushang"},
    "秦无忧": {"translation": "ฉินอู๋ยู่", "type": "character", "description": "Qin Wuyou"},
    "夏倾月": {"translation": "เซี่ยชิงเยว่", "type": "character", "description": "Moon God Emperor"},
    "茉莉": {"translation": "โมลี่", "type": "character", "description": "Jasmine"},
    "劫天魔帝": {"translation": "เจี๋ยเทียนหมอฮ่องเต้", "type": "character", "description": "Heavenly Demon Emperor"},
    "南昭冥": {"translation": "หนานเจ้าหมิง", "type": "character", "description": "Abyss Knight"},
    "南昭光": {"translation": "หนานเจ้ากวาง", "type": "character", "description": "Abyss Knight"},
    "印风": {"translation": "อิ่นเฟิง", "type": "character", "description": "Abyss Knight subordinate"},
    "渊皇": {"translation": "จักรพรรดิเหวี่ยน", "type": "character", "description": "Abyss Emperor"},
    "神官": {"translation": "เทพเจ้าผู้พิทักษ์", "type": "title", "description": "Divine Official"},
    # Locations
    "深渊": {"translation": "เหวี่ยนลึก", "type": "location", "description": "The Abyss"},
    "绯红裂痕": {"translation": "รอยแตกสีชาด", "type": "location", "description": "Crimson Crack"},
    "东神域": {"translation": "ทวีปเทพตะวันออก", "type": "location", "description": "Eastern Divine Region"},
    "苍风玄府": {"translation": "ฉางเฟิงเสวียนฟู่", "type": "location", "description": "Cangfeng Xuanfu"},
    "天兵殿": {"translation": "ศาลาเทียนปิง", "type": "location", "description": "Tianbing Hall"},
    "泰玄殿": {"translation": "โถงไท่ซวน", "type": "location", "description": "Taixuan Hall"},
    "天玄殿": {"translation": "โถงเทียนซวน", "type": "location", "description": "Tianxuan Hall"},
    "聚玄塔": {"translation": "หอคอยจู่ซวน", "type": "location", "description": "Juxuan Tower"},
    "蓝风玄府": {"translation": "ฉางเฟิงเสวียนฟู่สีน้ำเงิน", "type": "location", "description": "Blue Wind Xuanfu"},
    "外府": {"translation": "วังชั้นนอก", "type": "location", "description": "Outer Palace"},
    "中府": {"translation": "วังกลาง", "type": "location", "description": "Middle Palace"},
    "内府": {"translation": "วังชั้นใน", "type": "location", "description": "Inner Palace"},
    # Items
    "冰凰": {"translation": "หงส์น้ำแข็ง", "type": "creature", "description": "Ice Phoenix"},
    "雪姬剑": {"translation": "ดาบหิมะ", "type": "item", "description": "Snow Princess Sword"},
    "霸天巨剑": {"translation": "ดาบยักษ์ของโอเวอร์ลอร์ด", "type": "item", "description": "Overlord's Giant Sword"},
    "天罡珍珠": {"translation": "ไข่มุกพิษสวรรค์", "type": "item", "description": "Heavenly Poison Pearl"},
    # Cultivation/Powers
    "神主境": {"translation": "ขั้นเทพประมุข", "type": "cultivation", "description": "Divine Master Realm"},
    "玄力": {"translation": "พลังวิญญาณ", "type": "power", "description": "Profound Energy"},
    "神力": {"translation": "พลังเทพ", "type": "power", "description": "Divine Power"},
    "灵力": {"translation": "พลังวิญญาณ", "type": "power", "description": "Spiritual Power"},
    "玄气": {"translation": "พลังวิญญาณ", "type": "power", "description": "Profound Qi"},
    # Techniques
    "断月拂影": {"translation": "ดวงจันทร์ขาดเงาพัดผ่าน", "type": "technique", "description": "Movement technique"},
    "冰夷星辰": {"translation": "ดาราน้ำแข็ง", "type": "technique", "description": "Ice Star Defense"},
    "火拳": {"translation": "หมัดไฟ", "type": "technique", "description": "Fire Fist"},
    "火云掌": {"translation": "ฝ่ามือเมฆาไฟ", "type": "technique", "description": "Fire Cloud Palm"},
    "泰玄心经": {"translation": "หัวใจไท่ซวน", "type": "technique", "description": "Tai Xuan Heart Art"},
    # Titles
    "神帝": {"translation": "เทพจักรพรรดิ", "type": "title", "description": "Divine Emperor"},
    "邪神": {"translation": "อสูรเทพ", "type": "title", "description": "Evil God"},
}

# Official/community LC names win over the hardcoded seed.
KNOWN_TERMINOLOGY.update(load_all_glossaries())


def get_known_terminology() -> Dict[str, Dict]:
    """Return all known terminology."""
    return KNOWN_TERMINOLOGY


def get_term_translation(term: str) -> Optional[Dict]:
    """Get translation for a specific term."""
    return KNOWN_TERMINOLOGY.get(term)


def apply_terminology_to_text(text: str, terms: List[Term]) -> str:
    """Apply terminology replacements to text."""
    result = text
    for term in terms:
        if term.original in result:
            result = result.replace(term.original, term.translation)
    return result


def extract_terms_from_text(text: str, source_lang: str = "zh", target_lang: str = "th") -> List[ExtractedTerm]:
    """
    Extract potential terminology from text.
    Uses simple pattern matching for Chinese characters.
    In production, this should use NLP/LLM for better extraction.
    """
    import re
    from collections import Counter
    
    # Find repeated Chinese phrases (potential terms). Use overlapping
    # windows so adjacent repetitions such as 云澈云澈云澈 are observable.
    matches = []
    for width in range(2, 5):
        chinese_pattern = re.compile(rf'(?=([\u4e00-\u9fff]{{{width}}}))')
        matches.extend(chinese_pattern.findall(text))
    
    # Count occurrences
    counter = Counter(matches)
    
    # Get most common terms (appearing 3+ times)
    terms = []
    for term, count in counter.most_common(50):
        if count >= 3:
            # Check if already in known terminology
            known = KNOWN_TERMINOLOGY.get(term, {})
            
            extracted = ExtractedTerm(
                original=term,
                translation=known.get("translation", ""),
                confidence=0.8 if known else 0.5,
                type=known.get("type", "general"),
                description=known.get("description", ""),
            )
            terms.append(extracted)
    
    return terms


def preprocess_terminology(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Replace known terminology with placeholders before translation.
    Returns: (processed_text, placeholders_mapping)
    """
    placeholders = {}
    processed = text
    counter = 0
    
    for term, data in terms_longest_first(KNOWN_TERMINOLOGY):
        if term in text:
            placeholder = f"__TERM_{counter}__"
            placeholders[placeholder] = data["translation"]
            processed = processed.replace(term, placeholder)
            counter += 1
    
    return processed, placeholders


def postprocess_terminology(text: str, placeholders: Dict[str, str]) -> str:
    """
    Replace placeholders back with terminology translations after translation.
    """
    result = text
    for placeholder, translation in placeholders.items():
        result = result.replace(placeholder, translation)
    return result


def format_translated_text(text: str) -> str:
    """Format translated text for better readability."""
    # Clean up extra whitespace
    import re
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Add proper paragraph breaks
    text = text.replace('\n\n\n', '\n\n')
    
    return text


def clean_source_text(text: str) -> str:
    """Clean source text before translation."""
    import re
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove common web artifacts
    text = text.replace('...', '…')
    text = text.replace('""', '"')
    text = text.replace("''", "'")
    
    return text.strip()
