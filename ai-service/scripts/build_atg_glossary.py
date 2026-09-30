#!/usr/bin/env python3
"""Build a large Against the Gods Thai glossary from Moegirl names + Aradeer locks."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parents[1]
SRC_HTML = Path("/tmp/moegirl-atg.html")
OUT = ROOT / "glossaries" / "against-the-gods.lc.csv"

# Aradeer / กวีบุ๊ค attested names win over phonetic guesses.
LOCKED = {
    "云澈": ("หยุนเช่อ", "character", "พระเอก"),
    "萧澈": ("เซียวเช่อ", "character", "ชาติภพใหม่ของหยุนเช่อ"),
    "夏倾月": ("เซี่ยชิงเยว่", "character", "ภรรยาแต่งคนแรก"),
    "茉莉": ("จัสมิน", "character", "เทพาดาราล้างสวรรค์"),
    "楚月婵": ("ฉู่เยว่ฉาน", "character", "นางเซียนน้อย"),
    "楚月梨": ("ฉู่เยว่หลี่", "character", "พี่สาวฉู่เยว่ฉาน"),
    "萧灵曦": ("เซียวหลิงซี", "character", "อาหญิงเล็ก"),
    "萧泠汐": ("เซียวหลิงซี", "character", "อักษรจีนอีกแบบของอาหญิงเล็ก"),
    "苍月": ("ชางเยว่", "character", "ประมุขอาณาจักรวายุคราม"),
    "蓝雪若": ("หลานเสวี่ยรั่ว", "character", "นามแฝงของชางเยว่"),
    "苏玲儿": ("ซูหลิงเอ๋อร์", "character", ""),
    "苏苓儿": ("ซูหลิงเอ๋อร์", "character", "อักษรจีนในวิกิ"),
    "凤雪儿": ("เฟิงเสวี่ยเอ๋อร์", "character", "เทพธิดาหงสา"),
    "凤仙儿": ("เฟิงเซียนเอ๋อร์", "character", ""),
    "幻彩依": ("ฮ่วนไฉยี", "character", ""),
    "幻彩衣": ("ฮ่วนไฉยี", "character", "อักษรจีนในวิกิ"),
    "神曦": ("เสินซี", "character", "มังกรเทวี"),
    "神羲": ("เสินซี", "character", "อักษรจีนอีกแบบ"),
    "沐玄音": ("มู่เซวียนยิน", "character", "อาจารย์ / จ้าวพิภพลำนำเหมันต์"),
    "菜织": ("ไฉจือ", "character", "เจ้าหญิงดาวหมาป่า"),
    "彩脂": ("ไฉจือ", "character", "อักษรจีนในวิกิ"),
    "幽儿": ("โยวเอ๋อร์", "character", ""),
    "慕容千雪": ("มู่หรงเชียนเสวี่ย", "character", "เจ้าวังเมฆาเยือกแข็ง"),
    "风寒月": ("เฟิงหานเยว่", "character", "เจ็ดนางเซียน"),
    "风寒雪": ("เฟิงหานเสวี่ย", "character", "เจ็ดนางเซียน"),
    "萧玉龙": ("เซียวยู่หลง", "character", ""),
    "荷林": ("เหอหลิน", "character", "ชื่อตอนกวีบุ๊ค"),
    "禾霖": ("เหอหลิน", "character", "น้องชายเหอหลิง"),
    "冰云仙宫": ("วังเมฆาเยือกแข็ง", "location", "Frozen Cloud Asgard"),
    "沧云大陆": ("ทวีปเมฆคราม", "location", ""),
    "绝云崖": ("ผาบรรจบเมฆ", "location", ""),
    "凤凰神宗": ("พรรคหงส์สา", "organization", ""),
    "星藏草": ("หญ้าซ่อนดารา", "item", ""),
    "火星引力": ("ฮั่วซิงอิ่นลี่", "character", "ผู้แต่ง"),
    "逆天邪神": ("อสูรพลิกฟ้า", "title", "ชื่อเรื่องไทยของ LC"),
    "帝云城": ("นครตี้หยุน", "location", "เมืองในตอนท้ายเรื่อง"),
    "三阎祖": ("สามบรรพจารย์เยี่ยน", "character", ""),
    "阎一": ("เหยียนอี", "character", ""),
    "无之深渊": ("เหวไร้ซึ่ง", "location", "Abyss of Nothingness"),
    "小剑君": ("องค์ดาบน้อย", "title", "ฉายาของจวินซีเหลย"),
    "媚音": ("เหม่ยอิ่น", "character", "ชื่อเรียกชุ่ยเหม่ยอิ่น"),
}

COMMUNITY = {
    "千叶莹儿": ("เชียนเย่หยิงเอ๋อร์", "character", "นางเอกช่วงแดนเทพ"),
    "千叶影儿": ("เชียนเย่หยิงเอ๋อร์", "character", "อักษรจีนในวิกิ"),
    "赤无妖": ("ฉีอู๋เย่า", "character", "จอมมาร / แม่มด"),
    "池妩仸": ("ฉีอู๋เย่า", "character", "นามในฐานะจ้าวพิภพวิญญาณปล้น"),
    "水媚音": ("ชุ่ยเหม่ยอิ่น", "character", ""),
    "红儿": ("หงเอ๋อร์", "character", ""),
    "云无心": ("หยุนอู๋ซิน", "character", "ลูกสาวหยุนเช่อกับฉู่เยว่ฉาน"),
    "华采理": ("ฮั่วฉายลี่", "character", ""),
    "夏元霸": ("เซียวย่วนป้า", "character", "พี่ชายเซี่ยชิงเยว่"),
    "萧烈": ("เซียวเลี่ย", "character", "ปู่บุญธรรม"),
    "天毒珠": ("มุกพิษสุราลัย", "item", "ชื่อจากซับอนิเมะ"),
    "邪神": ("อสูรเทพ", "title", "ชื่อเรื่องไทยคืออสูรพลิกฟ้า"),
}

# Extra people who matter early but may not be in the parsed list.
EXTRAS = {
    "萧颖": "father of Xiao Che",
    "萧云": "cousin / later family",
    "司空度": "early antagonist",
    "秦无殇": "early",
    "秦无忧": "early",
    "南昭冥": "abyss",
    "南昭光": "abyss",
    "印风": "abyss",
    "渊皇": "abyss emperor",
    "凌云": "early",
}

JUNK = {
    "页面不存在", "其他", "参见", "妻子", "哥哥", "姐姐", "妹妹", "父亲", "母亲",
    "女儿", "孙子", "外公", "姑姑", "舅舅", "大舅子", "师父", "帝师", "公主",
    "圣女", "女皇", "储君", "伪娘", "红发", "青梅竹马", "转世", "灭族", "异世界",
    "神界", "凤凰", "萌娘百科", "知识共享", "义女", "双子", "幸存者", "弟弟",
    "祖父", "妈妈", "最强", "倾尽", "冯骏骅", "筱筝", "富贵", "沈达威", "不一",
    "谢添天", "醋醋", "风袖", "萧洛城", "腾讯动漫", "萌娘百科的", "你知道的太多",
}

# Syllable map aligned to Aradeer (หยุนเช่อ, เซี่ยชิงเยว่, เฟิงเสวี่ยเอ๋อร์).
SYL = {
    "ba": "ปา", "bai": "ไป๋", "bing": "ปิง", "cai": "ไฉ", "cang": "ชาง",
    "cao": "ชาง", "chan": "ฉาน", "chang": "ฉาง", "che": "เช่อ", "chen": "เฉิน",
    "cheng": "เฉิง", "chi": "ฉี", "chu": "ฉู่", "chuan": "ชวน", "ci": "ฉือ",
    "da": "ต๋า", "dao": "เต้า", "di": "ตี้", "die": "เตี๋ย", "dong": "ตง",
    "du": "ตู้", "e": "เอ้อ", "er": "เอ๋อร์", "fan": "ฝาน", "fang": "ฟาง",
    "fei": "เฟย", "fen": "เฝิน", "feng": "เฟิง", "geng": "เกิง", "gong": "กง",
    "gou": "โกว", "gu": "กู่", "guang": "กวง", "gui": "กุย", "hai": "ไห่",
    "han": "หาน", "hang": "หาง", "he": "เหอ", "hen": "เหิน", "heng": "เหิง",
    "hong": "หง", "hu": "หู", "hua": "ฮั่ว", "huan": "ฮ่วน", "huang": "หวง",
    "hui": "ฮุย", "hun": "หุน", "huo": "ฮั่ว", "ji": "จี", "jie": "เจี๋ย",
    "jin": "จิ่น", "jing": "จิ้ง", "jiu": "จิ่ว", "jue": "เจวี๋ย", "jun": "จวิน",
    "ke": "เค่อ", "kong": "คง", "kuang": "ควาง", "kui": "ขุย", "lai": "ไหล",
    "lan": "หลาน", "lei": "เหลย", "leng": "เหล่ง", "li": "หลี่", "lian": "เหลียน",
    "lie": "เลี่ย", "lin": "หลิน", "ling": "หลิง", "long": "หลง", "lu": "ลู่",
    "lun": "หลุน", "luo": "ลั่ว", "mei": "เหม่ย", "mi": "หมี่", "mie": "เมี่ย",
    "ming": "หมิง", "mo": "มั่ว", "mu": "มู่", "nan": "หนาน", "ni": "นิ",
    "nie": "เหนีย", "nv": "นวี่", "pan": "พาน", "pian": "เพียน", "po": "พัว",
    "qi": "ฉี", "qian": "เชียน", "qin": "ฉิน", "qing": "ชิง", "qu": "ชวี",
    "rong": "หรง", "rou": "โหรว", "ru": "หรู", "ruo": "รั่ว", "san": "ซาน",
    "sha": "ซา", "shan": "ซาน", "shang": "ซ่าง", "shao": "เจ้า", "she": "เซ่อ",
    "shen": "เสิน", "sheng": "เซิง", "shi": "ซื่อ", "shu": "ชู", "shui": "ชุ่ย",
    "si": "ซือ", "su": "ซู", "suo": "ซัว", "tai": "ไท่", "tian": "เทียน",
    "ting": "ถิง", "tu": "ถู", "wai": "ไว", "wan": "ว่าน", "wei": "เวย",
    "wen": "เหวิน", "wu": "อู๋", "xi": "ซี", "xia": "เซี่ย", "xian": "เซียน",
    "xiang": "เซียง", "xiao": "เซียว", "xie": "เสีย", "xin": "ซิน", "xing": "ซิง",
    "xiong": "ซฺยง", "xu": "สวี", "xuan": "เซวียน", "xue": "เสวี่ย", "ya": "หยา",
    "yan": "เหยียน", "yang": "หยาง", "yao": "เย่า", "ye": "เย่", "yi": "อี",
    "yin": "ยิน", "ying": "หยิง", "you": "โยว", "yu": "อวี๋", "yuan": "หยวน",
    "yue": "เยว่", "yun": "หยุน", "zhan": "จ้าน", "zhao": "เจ้า", "zhe": "เจ๋อ",
    "zhi": "จือ", "zhong": "จง", "zhou": "โจว", "zhu": "จู", "zi": "จื่อ",
    "zong": "จง", "zu": "จู่", "zun": "จุน",
}

PLACE_OR_ORG = {
    "冰云仙宫": "location",
    "沧云大陆": "location",
    "绝云崖": "location",
    "凤凰神宗": "organization",
    "星藏草": "item",
    "天毒珠": "item",
    "邪神": "title",
}


def to_thai(han: str) -> str:
    parts = []
    for syl in lazy_pinyin(han, style=Style.NORMAL):
        if syl not in SYL:
            raise KeyError(f"missing syllable {syl} for {han}")
        parts.append(SYL[syl])
    return "".join(parts)


def parse_moegirl(html: str) -> set[str]:
    names: set[str] = set()
    for item in re.findall(r"<li>([\s\S]*?)</li>", html):
        for raw in re.findall(r'<a[^>]*title="([^"]+)"', item):
            name = raw.replace("（页面不存在）", "").strip()
            name = re.sub(r"（.*", "", name).strip()
            if re.fullmatch(r"[\u4e00-\u9fff]{2,4}", name) and name not in JUNK:
                names.add(name)
    return names


def main() -> None:
    names = parse_moegirl(SRC_HTML.read_text(errors="ignore")) if SRC_HTML.exists() else set()
    names.update(LOCKED)
    names.update(COMMUNITY)
    names.update(EXTRAS)

    rows = []
    for original in sorted(names, key=lambda n: (0 if n in LOCKED else 1 if n in COMMUNITY else 2, n)):
        if original in JUNK:
            continue
        if original in LOCKED:
            thai, typ, notes = LOCKED[original]
            source, confidence = "lc:aradeer-kawebook", "locked"
        elif original in COMMUNITY:
            thai, typ, notes = COMMUNITY[original]
            source, confidence = "community:thai-readers", "community"
        else:
            thai = to_thai(original)
            typ = PLACE_OR_ORG.get(original, "character")
            notes = "ถอดเสียงตามสไตล์ LC อสูรพลิกฟ้า ยังไม่ยืนยันจากบทแปล"
            source, confidence = "phonetic:aradeer-style", "phonetic"
        rows.append(
            {
                "original": original,
                "thai": thai,
                "type": typ,
                "aliases": "",
                "source": source,
                "confidence": confidence,
                "notes": notes,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "# Against the Gods / 逆天邪神 Thai name glossary\n"
        "# locked = Aradeer / กวีบุ๊ค อสูรพลิกฟ้า\n"
        "# community = Thai readers\n"
        "# phonetic = generated in Aradeer style, not LC-confirmed\n"
    )
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        handle.write(header)
        writer = csv.DictWriter(
            handle,
            fieldnames=["original", "thai", "type", "aliases", "source", "confidence", "notes"],
        )
        writer.writeheader()
        writer.writerows(rows)
    counts = {}
    for row in rows:
        counts[row["confidence"]] = counts.get(row["confidence"], 0) + 1
    print(f"wrote {len(rows)} rows to {OUT}")
    print(counts)


if __name__ == "__main__":
    main()
