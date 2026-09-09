"""Protect proper nouns before machine translation.

Google/translatepy turn unknown Chinese places into pinyin like "Diyun".
Replace those spans with placeholders first, then restore Thai after translate.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Tuple

from pypinyin import Style, lazy_pinyin

from glossary_loader import terms_longest_first

SYL = {
    "ba": "ปา", "bai": "ไป๋", "bing": "ปิง", "cai": "ไฉ", "cang": "ชาง",
    "chan": "ฉาน", "chang": "ฉาง", "che": "เช่อ", "chen": "เฉิน",
    "cheng": "เฉิง", "chi": "ฉี", "chu": "ฉู่", "chuan": "ชวน", "ci": "ฉือ",
    "da": "ต๋า", "dao": "เต้า", "di": "ตี้", "die": "เตี๋ย", "dong": "ตง",
    "du": "ตู้", "e": "เอ้อ", "er": "เอ๋อร์", "fan": "ฝาน", "fang": "ฟาง",
    "fei": "เฟย", "fen": "เฝิน", "feng": "เฟิง", "geng": "เกิง", "gong": "กง",
    "gou": "โกว", "gu": "กู่", "guang": "กวง", "gui": "กุย", "hai": "ไห่",
    "han": "หาน", "he": "เหอ", "hen": "เหิน", "heng": "เหิง", "hong": "หง",
    "hu": "หู", "hua": "ฮั่ว", "huan": "ฮ่วน", "huang": "หวง", "hui": "ฮุย",
    "hun": "หุน", "huo": "ฮั่ว", "ji": "จี", "jie": "เจี๋ย", "jin": "จิ่น",
    "jing": "จิ้ง", "jiu": "จิ่ว", "jue": "เจวี๋ย", "jun": "จวิน", "ke": "เค่อ",
    "kong": "คง", "kuang": "ควาง", "kui": "ขุย", "lai": "ไหล", "lan": "หลาน",
    "lei": "เหลย", "li": "หลี่", "lian": "เหลียน", "lie": "เลี่ย", "lin": "หลิน",
    "ling": "หลิง", "long": "หลง", "lu": "ลู่", "lun": "หลุน", "luo": "ลั่ว",
    "mei": "เหม่ย", "mi": "หมี่", "mie": "เมี่ย", "ming": "หมิง", "mo": "มั่ว",
    "mu": "มู่", "nan": "หนาน", "ni": "นิ", "nie": "เหนีย", "pan": "พาน",
    "pian": "เพียน", "po": "พัว", "qi": "ฉี", "qian": "เชียน", "qin": "ฉิน",
    "qing": "ชิง", "qu": "ชวี", "rong": "หรง", "rou": "โหรว", "ru": "หรู",
    "ruo": "รั่ว", "san": "ซาน", "sha": "ซา", "shan": "ซาน", "shang": "ซ่าง",
    "shao": "เจ้า", "she": "เซ่อ", "shen": "เสิน", "sheng": "เซิง", "shi": "ซื่อ",
    "shu": "ชู", "shui": "ชุ่ย", "si": "ซือ", "su": "ซู", "suo": "ซัว",
    "tai": "ไท่", "tian": "เทียน", "ting": "ถิง", "tu": "ถู", "wai": "ไว",
    "wan": "ว่าน", "wei": "เวย", "wen": "เหวิน", "wu": "อู๋", "xi": "ซี",
    "xia": "เซี่ย", "xian": "เซียน", "xiang": "เซียง", "xiao": "เซียว",
    "xie": "เสีย", "xin": "ซิน", "xing": "ซิง", "xu": "สวี", "xuan": "เซวียน",
    "xue": "เสวี่ย", "ya": "หยา", "yan": "เหยียน", "yang": "หยาง", "yao": "เย่า",
    "ye": "เย่", "yi": "อี", "yin": "ยิน", "ying": "หยิง", "you": "โยว",
    "yu": "อวี๋", "yuan": "หยวน", "yue": "เยว่", "yun": "หยุน", "zhan": "จ้าน",
    "zhao": "เจ้า", "zhi": "จือ", "zhong": "จง", "zhou": "โจว", "zhu": "จู",
    "zi": "จื่อ", "zong": "จง", "zu": "จู่", "zun": "จุน",
}

SUFFIX_THAI = {
    "城": "นคร",
    "门": "สำนัก",
    "宗": "สำนัก",
    "殿": "โถง",
    "宫": "วัง",
    "域": "เขต",
    "渊": "เหว",
    "崖": "ผา",
    "祖": "บรรพจารย์",
    "国": "อาณาจักร",
    "山": "ภูเขา",
    "岛": "เกาะ",
}

# Common words that look like suffix-names but must stay translatable.
SKIP_SPANS = {
    "世界", "境界", "存在", "记忆", "力量", "说话", "他们", "天地", "发生",
    "师尊", "弟子", "敌人", "怪物", "快逃", "只有", "这个", "那个", "什么",
    "来自", "异常", "憎恨", "无法", "也就是", "缓说", "先驱", "命运",
}

SUFFIX_RE = re.compile(
    r"([\u4e00-\u9fff]{2,6})(城|门|宗|殿|宫|域|渊|崖|国|山|岛)|"
    r"(三[\u4e00-\u9fff]{1,3}祖)|"
    r"(小[\u4e00-\u9fff]{1,3}君)"
)


def to_thai(han: str) -> str:
    parts = []
    for syl in lazy_pinyin(han, style=Style.NORMAL):
        parts.append(SYL.get(syl, syl))
    return "".join(parts)


def _suffix_thai(span: str) -> str:
    if span.startswith("三") and span.endswith("祖"):
        return "สามบรรพจารย์" + to_thai(span[1:-1])
    if span.startswith("小") and span.endswith("君"):
        return to_thai(span[1:-1]) + "น้อย"
    for suffix, thai_suffix in SUFFIX_THAI.items():
        if span.endswith(suffix) and len(span) > len(suffix):
            return thai_suffix + to_thai(span[: -len(suffix)])
    return to_thai(span)


def _iter_auto_spans(text: str) -> Iterable[str]:
    seen = set()
    for match in SUFFIX_RE.finditer(text):
        span = next(group for group in match.groups() if group)
        if span in SKIP_SPANS or span in seen:
            continue
        seen.add(span)
        yield span


def protect_text(text: str, glossary: Dict[str, Dict]) -> Tuple[str, Dict[str, str]]:
    """Replace glossary hits and remaining place/title spans with #N# tokens."""
    placeholders: Dict[str, str] = {}
    result = text
    idx = 0

    def _put(span: str, thai: str) -> None:
        nonlocal result, idx
        if not span or span not in result:
            return
        token = f"#{idx}#"
        placeholders[token] = thai
        result = result.replace(span, token)
        idx += 1

    for original, info in terms_longest_first(glossary):
        _put(original, info["translation"])

    for span in sorted(_iter_auto_spans(result), key=len, reverse=True):
        _put(span, _suffix_thai(span))

    return result, placeholders


def restore_text(text: str, placeholders: Dict[str, str]) -> str:
    result = text
    for token, thai in placeholders.items():
        result = result.replace(token, thai)
    for num in re.findall(r"#\s*(\d+)\s*#", result):
        thai = placeholders.get(f"#{num}#")
        if not thai:
            continue
        for variant in (f"#{num}#", f"# {num} #", f"# {num}#", f"#{num} #"):
            result = result.replace(variant, thai)
    return result
