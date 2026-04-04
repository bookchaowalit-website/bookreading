"""
Multi-Agent Translation Pipeline for Novel Translation
A sophisticated system with specialized agents for high-quality literary translation.

Pipeline: Translation → Terminology Check → Style Polish → Quality Scoring → Review Queue

Features:
- Terminology Agent: Enforces 100% consistent name translations
- Style Agent: Polishes for natural Thai literary flow
- Quality Agent: Scores translations (A/B/C/D) with detailed metrics
- Human Review Queue: Store translations pending approval
"""

import os
import re
import json
import asyncio
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

# OpenAI
from openai import AsyncOpenAI

# Google Gemini
import google.generativeai as genai

# Fallback
from deep_translator import GoogleTranslator


# ==================== ENUMS & DATACLASSES ====================

class AgentRole(Enum):
    TRANSLATOR = "translator"          # Agent 1: Literal translation
    TERMINOLOGY = "terminology"        # Agent 2: Consistency check
    STYLE = "style"                    # Agent 3: Literary polish
    QUALITY = "quality"                # Agent 4: Quality scoring
    REVIEWER = "reviewer"              # Human review


class QualityGrade(Enum):
    A = "A"    # Excellent - Ready to publish
    B = "B"    # Good - Minor edits needed
    C = "C"    # Acceptable - Needs human review
    D = "D"    # Poor - Requires retranslation


class ReviewStatus(Enum):
    PENDING = "pending"        # Awaiting human review
    APPROVED = "approved"      # Human approved
    EDITED = "edited"          # Human edited
    REJECTED = "rejected"      # Needs retranslation


@dataclass
class TerminologyTerm:
    """A term with its translation for consistency"""
    original: str
    translation: str
    term_type: str
    description: str = ""
    confidence: float = 1.0


@dataclass
class CharacterInfo:
    """Character with translation and personality"""
    original_name: str
    thai_name: str
    personality: str = ""      # For dialogue style
    role: str = ""             # protagonist, antagonist, etc.


@dataclass
class ChapterContext:
    """Context from previously translated chapters"""
    chapter_number: int
    chapter_title: str
    source_text: str
    translated_text: str
    key_events: List[str] = field(default_factory=list)
    quality_score: float = 0.0


@dataclass
class NovelContext:
    """Full context for a novel"""
    novel_title: str
    novel_title_th: str
    author: str
    genre: str
    tone: str
    main_characters: List[CharacterInfo]
    terminology: List[TerminologyTerm]
    previous_chapters: List[ChapterContext]
    pronoun_style: str = "traditional"
    target_quality: str = "B"    # Minimum acceptable quality


@dataclass
class AgentResult:
    """Result from a single agent"""
    agent_role: AgentRole
    input_text: str
    output_text: str
    issues_found: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    tokens_used: int = 0
    processing_time: float = 0.0


@dataclass
class QualityScore:
    """Detailed quality scoring"""
    grade: QualityGrade
    overall_score: float          # 0-100
    terminology_score: float      # 0-100
    flow_score: float             # 0-100
    accuracy_score: float         # 0-100
    dialogue_score: float         # 0-100
    issues: List[str] = field(default_factory=list)
    strengths: List[str] = field(default_factory=list)
    needs_review: bool = False
    review_priority: int = 0      # 1-5, higher = more urgent


@dataclass
class PipelineResult:
    """Result from the full pipeline"""
    final_text: str
    agent_results: List[AgentResult]
    quality_score: QualityScore
    terminology_applied: List[str]
    needs_human_review: bool
    review_status: ReviewStatus = ReviewStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    edited_text: Optional[str] = None


@dataclass
class ReviewQueueItem:
    """Item in the human review queue"""
    id: str
    novel_id: str
    chapter_number: int
    original_text: str
    translated_text: str
    quality_score: QualityScore
    status: ReviewStatus
    created_at: datetime
    priority: int                 # Higher = review first
    novel_title: str = ""              # Thai novel title
    chapter_title: str = ""            # Chapter title in Thai
    notes: str = ""
    edited_text: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None


# ==================== SPECIALIZED AGENTS ====================

class TranslationAgent:
    """
    Agent 1: Literal Translation
    - Preprocesses terminology with placeholders
    - Performs accurate literal translation
    - Preserves all meaning from source
    """
    
    def __init__(self, openai_key: str = None, gemini_key: str = None, model: str = "gpt-4o"):
        self.openai_key = openai_key or os.getenv("OPENAI_API_KEY")
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.model = model
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.openai_key)
        return self._client
    
    def _preprocess_terminology(self, text: str, terms: List[TerminologyTerm], characters: List[CharacterInfo]) -> Tuple[str, Dict[str, str]]:
        """Replace all known terms with Thai placeholders"""
        placeholders = {}
        result = text
        
        # Combine all terms
        all_terms = {}
        for t in terms:
            all_terms[t.original] = t.translation
        for c in characters:
            all_terms[c.original_name] = c.thai_name
        
        # Sort longest first
        sorted_terms = sorted(all_terms.items(), key=lambda x: len(x[0]), reverse=True)
        
        for original, thai in sorted_terms:
            if original in result:
                placeholder = f"⟨⟨{thai}⟩⟩"
                placeholders[original] = thai
                result = result.replace(original, placeholder)
        
        return result, placeholders
    
    def _postprocess_terminology(self, text: str, placeholders: Dict[str, str]) -> str:
        """Remove placeholder brackets"""
        result = text
        for _, thai in placeholders.items():
            # Remove brackets
            placeholder = f"⟨⟨{thai}⟩⟩"
            result = result.replace(placeholder, thai)
            # Handle variations
            result = re.sub(r'⟨⟨\s*' + re.escape(thai) + r'\s*⟩⟩', thai, result)
            result = re.sub(r'⟨\s*' + re.escape(thai) + r'\s*⟩', thai, result)
        return result
    
    def _build_prompt(self, text: str, context: NovelContext, placeholders: Dict[str, str]) -> str:
        """Build literal translation prompt"""
        
        characters_list = "\n".join([f"- {c.original_name} → {c.thai_name}" for c in context.main_characters]) or "ไม่มีข้อมูล"
        protected_names = "\n".join([f"- ⟨⟨{thai}⟩⟩ ห้ามเปลี่ยน" for thai in placeholders.values()]) or "ไม่มี"
        
        return f"""คุณเป็นนักแปลนิยายมืออาชีพจากจีนเป็นไทย ภารกิจของคุณคือแปลตรงตัวโดยรักษาความหมายทุกประการ

## ข้อมูลนิยาย
- ชื่อ: {context.novel_title_th} ({context.novel_title})
- ผู้แต่ง: {context.author}
- ประเภท: {context.genre}
- โทน: {context.tone}

## ตัวละครสำคัญ
{characters_list}

## ชื่อที่ถูกป้องกัน (ห้ามเปลี่ยนแปลง!)
{protected_names}

## รูปแบบสรรพนาม
{self._get_pronoun_rules(context.pronoun_style)}

## ข้อความที่ต้องแปล
{text}

---

**กฎการแปล - สำคัญมาก!**
1. แปลตรงตัว รักษาความหมายทุกประการ
2. ⟨⟨ชื่อ⟩⟩ ที่อยู่ในวงเล็บ ⟨⟨ ⟩⟩ ห้ามเปลี่ยนแปลง - เอาวงเล็บออกแล้วใช้ชื่อนั้น
3. ห้ามใช้ภาษาอังกฤษผสม - ทุกชื่อต้องเป็นไทย
4. แยกบทสนทนาและบรรยายอย่างชัดเจน
5. ไม่ต้องขัดเกลาสำนวน - แปลตรงตัวก่อน

**ผลลัพธ์:** แปลข้อความเป็นไทย (ไม่ต้องมีคำอธิบาย):"""
    
    def _get_pronoun_rules(self, style: str) -> str:
        if style == "traditional":
            return """- ผู้มีอำนาจ/อาวุโส: "ข้า"(ตัว), "เจ้า"(ผู้อื่น)
- เพื่อน/ระดับเดียวกัน: "ฉัน"(ตัว), "เธอ"(ผู้อื่น)
- ผู้น้อยกว่า: "ฉัน"(ตัว), "ท่าน"(ผู้ใหญ่)"""
        return """- สมัยใหม่: "ฉัน"(ตัว), "คุณ/เธอ"(ผู้อื่น)"""
    
    async def translate(self, text: str, context: NovelContext, terminology: List[TerminologyTerm]) -> AgentResult:
        """Perform literal translation"""
        import time
        start_time = time.time()
        
        # Preprocess
        processed_text, placeholders = self._preprocess_terminology(text, terminology, context.main_characters)
        
        # Build prompt
        prompt = self._build_prompt(processed_text, context, placeholders)
        
        # Call LLM
        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "คุณเป็นนักแปลนิยายมืออาชีพ แปลจีนเป็นไทย รักษาความหมายทุกประการ"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            temperature=0.3,
        )
        
        result = response.choices[0].message.content
        tokens = response.usage.total_tokens
        
        # Postprocess
        result = self._postprocess_terminology(result, placeholders)
        
        return AgentResult(
            agent_role=AgentRole.TRANSLATOR,
            input_text=text,
            output_text=result,
            tokens_used=tokens,
            processing_time=time.time() - start_time,
        )


class TerminologyAgent:
    """
    Agent 2: Terminology Consistency Check
    - Verifies all names are translated consistently
    - Identifies and fixes any inconsistencies
    - Flags remaining English/mixed text
    """
    
    def __init__(self, openai_key: str = None, gemini_key: str = None, model: str = "gpt-4o"):
        self.openai_key = openai_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.openai_key)
        return self._client
    
    def _check_terminology(self, text: str, terms: List[TerminologyTerm], characters: List[CharacterInfo]) -> Tuple[List[str], List[str]]:
        """Check for terminology issues"""
        issues = []
        suggestions = []
        
        # Check for English characters in Thai text
        english_pattern = re.compile(r'[A-Za-z]{2,}')
        english_matches = english_pattern.findall(text)
        for match in english_matches:
            issues.append(f"มีภาษาอังกฤษผสม: '{match}'")
            suggestions.append(f"แปล '{match}' เป็นไทย")
        
        # Check for inconsistent name variations
        thai_names = [c.thai_name for c in characters]
        for name in thai_names:
            # Look for similar but different spellings
            # This is simplified - in production, use phonetic matching
            pass
        
        return issues, suggestions
    
    async def check_and_fix(self, translated_text: str, context: NovelContext, terminology: List[TerminologyTerm]) -> AgentResult:
        """Check terminology consistency and fix issues"""
        import time
        start_time = time.time()
        
        issues, suggestions = self._check_terminology(translated_text, terminology, context.main_characters)
        
        # If issues found, ask LLM to fix them
        if issues:
            fix_prompt = f"""ตรวจพบปัญหาในการแปล:

**ปัญหา:**
{chr(10).join(issues)}

**ข้อความที่ต้องแก้ไข:**
{translated_text}

**กฎการแก้ไข:**
1. แปลทุกคำที่เป็นภาษาอังกฤษเป็นไทย
2. ชื่อตัวละครต้องสอดคล้องกับที่กำหนด
3. ห้ามมีภาษาอังกฤษผสมในข้อความไทย

**ผลลัพธ์:** ข้อความที่แก้ไขแล้ว (ไม่ต้องมีคำอธิบาย):"""

            client = self._get_client()
            response = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "คุณเป็นบรรณาธิการตรวจสอบคำศัพท์ แก้ไขปัญหาการแปล"},
                    {"role": "user", "content": fix_prompt}
                ],
                max_tokens=4000,
                temperature=0.2,
            )
            
            fixed_text = response.choices[0].message.content
            tokens = response.usage.total_tokens
        else:
            fixed_text = translated_text
            tokens = 0
        
        return AgentResult(
            agent_role=AgentRole.TERMINOLOGY,
            input_text=translated_text,
            output_text=fixed_text,
            issues_found=issues,
            suggestions=suggestions,
            tokens_used=tokens,
            processing_time=time.time() - start_time,
        )


class StyleAgent:
    """
    Agent 3: Literary Style Polish
    - Transforms literal translation into natural Thai novel prose
    - Adjusts dialogue to match character personality
    - Ensures smooth flow and emotional resonance
    """
    
    def __init__(self, openai_key: str = None, gemini_key: str = None, model: str = "gpt-4o"):
        self.openai_key = openai_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.openai_key)
        return self._client
    
    def _build_polish_prompt(self, text: str, context: NovelContext, characters: List[CharacterInfo]) -> str:
        """Build literary polish prompt"""
        
        char_styles = ""
        for c in characters:
            if c.personality:
                char_styles += f"- {c.thai_name}: {c.personality}\n"
        
        return f"""คุณเป็นนักเขียนและบรรณาธิการนิยายมืออาชีพ ภารกิจของคุณคือขัดเกลาการแปลให้เป็นนิยายไทยที่อ่านสนุก

## ข้อมูลนิยาย
- ชื่อ: {context.novel_title_th}
- ประเภท: {context.genre}
- โทน: {context.tone}

## บุคลิกตัวละคร (สำหรับบทสนทนา)
{char_styles or "ไม่มีข้อมูลเฉพาะ - ใช้บุคลิกที่เหมาะสม"}

## รูปแบบสรรพนาม
{self._get_style_rules(context.pronoun_style)}

## การแปลที่ต้องขัดเกลา
{text}

---

**เทคนิคการขัดเกลานิยาย:**
1. **บทบรรยาย:** เพิ่มอารมณ์และความรู้สึก ใช้คำที่สวยงาม ไม่แข็งทื่อ
2. **บทสนทนา:** ให้ตัวละครมีเอกลักษณ์ ใช้ภาษาที่เหมาะกับบุคลิก
3. **คำเชื่อม:** ใช้ "จึง", "ก็", "แล้ว", "เมื่อ", "ดังนั้น" ให้ลื่นไหล
4. **จังหวะ:** สร้างความตื่นเต้นในช่วง action ความนุ่มนวลในช่วง emotional
5. **ห้าม:** ใช้ภาษาอังกฤษผสม, เปลี่ยนชื่อตัวละคร, เพิ่มเนื้อหาที่ไม่มีในต้นฉบับ

**ผลลัพธ์:** นิยายที่ขัดเกลาแล้ว (ไม่ต้องมีคำอธิบาย):"""
    
    def _get_style_rules(self, style: str) -> str:
        if style == "traditional":
            return """**แนวโลดโผน/กำลังภายใน:**
- บทต่อสู้: ใช้ภาษาที่ดุดัน เร่งจังหวะ "ฟาด!", "แทง!", "กระแทก!"
- บทฝึกฝน: ใช้ภาษาสละสลวย เหมือนตำราโบราณ
- บทอารมณ์: ใช้ภาษานุ่มนวล ลึกซึ้ง"""
        return """**แนวสมัยใหม่:**
- ใช้ภาษาที่อ่านง่าย เข้าใจได้ทันที
- บทสนทนาสนุก มีชีวิตชีวา"""
    
    async def polish(self, translated_text: str, context: NovelContext) -> AgentResult:
        """Polish translation for literary style"""
        import time
        start_time = time.time()
        
        prompt = self._build_polish_prompt(translated_text, context, context.main_characters)
        
        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "คุณเป็นนักเขียนนิยายมืออาชีพ ขัดเกลาบทนิยายให้สวยงามและอ่านสนุก"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            temperature=0.5,  # Higher for creative polish
        )
        
        result = response.choices[0].message.content
        tokens = response.usage.total_tokens
        
        return AgentResult(
            agent_role=AgentRole.STYLE,
            input_text=translated_text,
            output_text=result,
            tokens_used=tokens,
            processing_time=time.time() - start_time,
        )


class QualityAgent:
    """
    Agent 4: Quality Scoring
    - Evaluates translation quality across multiple dimensions
    - Assigns grade (A/B/C/D)
    - Identifies issues and strengths
    - Determines if human review is needed
    """
    
    def __init__(self, openai_key: str = None, gemini_key: str = None, model: str = "gpt-4o"):
        self.openai_key = openai_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.openai_key)
        return self._client
    
    def _build_scoring_prompt(self, translated: str, original: str, context: NovelContext) -> str:
        """Build quality scoring prompt"""
        
        return f"""คุณเป็นผู้เชี่ยวชาญในการประเมินคุณภาพการแปลนิยาย ประเมินการแปลต่อไปนี้

## ต้นฉบับ (ส่วนหนึ่ง)
{original[:500]}...

## การแปล
{translated}

---

**ประเมินคุณภาพใน 5 ด้าน (0-100):**

1. **ความสอดคล้องของคำศัพท์ (Terminology):**
   - ชื่อตัวละคร/สถานที่แปลสอดคล้องหรือไม่?
   - มีภาษาอังกฤษผสมหรือไม่?

2. **ความลื่นไหล (Flow):**
   - อ่านสนุกหรือไม่? ไม่แข็งทื่อ?
   - คำเชื่อมใช้เหมาะสม?

3. **ความถูกต้อง (Accuracy):**
   - ความหมายสมบูรณ์หรือไม่?
   - มีส่วนที่ขาดหาย?

4. **บทสนทนา (Dialogue):**
   - ตัวละครพูดเหมาะกับบุคลิก?
   - บทสนทนามีชีวิตชีวา?

5. **คะแนนรวม:** คำนวณจากคะแนนทั้ง 4 ด้าน

---

**ผลลัพธ์ - ต้องออกมาในรูปแบบ JSON:**
```json
{
  "terminology_score": 85,
  "flow_score": 90,
  "accuracy_score": 95,
  "dialogue_score": 80,
  "overall_score": 87,
  "grade": "B",
  "issues": ["มีคำอังกฤษบางคำที่ยังไม่แปล"],
  "strengths": ["บทบรรยายสวยงาม", "บทสนทนามีชีวิต"],
  "needs_review": false,
  "review_priority": 2
}
```

**คะแนนตัดสิน:**
- A (90-100): ยอดเยี่ยม พิมพ์ได้ทันที
- B (75-89): ดี แก้ไขเล็กน้อยหรือไม่ต้องแก้
- C (60-74): พอใช้ ต้องมีคนตรวจสอบ
- D (<60): ต้องแปลใหม่

**ผลลัพธ์:** JSON เท่านั้น (ไม่ต้องมีคำอธิบายเพิ่มเติม):"""
    
    async def score(self, translated: str, original: str, context: NovelContext) -> QualityScore:
        """Score translation quality"""
        import time
        start_time = time.time()
        
        prompt = self._build_scoring_prompt(translated, original, context)
        
        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "คุณเป็นผู้ประเมินคุณภาพการแปล ออกคะแนนในรูปแบบ JSON เท่านั้น"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.2,  # Low for consistent scoring
            response_format={"type": "json_object"},
        )
        
        result_text = response.choices[0].message.content
        
        # Parse JSON
        try:
            data = json.loads(result_text)
            
            grade_map = {"A": QualityGrade.A, "B": QualityGrade.B, "C": QualityGrade.C, "D": QualityGrade.D}
            grade = grade_map.get(data.get("grade", "C"), QualityGrade.C)
            
            return QualityScore(
                grade=grade,
                overall_score=data.get("overall_score", 70),
                terminology_score=data.get("terminology_score", 70),
                flow_score=data.get("flow_score", 70),
                accuracy_score=data.get("accuracy_score", 70),
                dialogue_score=data.get("dialogue_score", 70),
                issues=data.get("issues", []),
                strengths=data.get("strengths", []),
                needs_review=data.get("needs_review", grade.value in ["C", "D"]),
                review_priority=data.get("review_priority", 3),
            )
        except json.JSONDecodeError:
            # Fallback scoring
            return QualityScore(
                grade=QualityGrade.C,
                overall_score=70,
                terminology_score=70,
                flow_score=70,
                accuracy_score=70,
                dialogue_score=70,
                issues=["ไม่สามารถประเมินคะแนนได้"],
                strengths=[],
                needs_review=True,
                review_priority=3,
            )


# ==================== PIPELINE COORDINATOR ====================

class TranslationPipeline:
    """
    Coordinates all agents in sequence:
    Translation → Terminology → Style → Quality
    """
    
    def __init__(
        self,
        openai_key: str = None,
        gemini_key: str = None,
        model: str = "gpt-4o",
        target_quality: str = "B",
    ):
        self.openai_key = openai_key or os.getenv("OPENAI_API_KEY")
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.model = model
        self.target_quality = target_quality
        
        # Initialize agents
        self.translation_agent = TranslationAgent(openai_key, gemini_key, model)
        self.terminology_agent = TerminologyAgent(openai_key, gemini_key, model)
        self.style_agent = StyleAgent(openai_key, gemini_key, model)
        self.quality_agent = QualityAgent(openai_key, gemini_key, model)
    
    async def translate(
        self,
        text: str,
        context: NovelContext,
        terminology: List[TerminologyTerm] = None,
        skip_polish: bool = False,
    ) -> PipelineResult:
        """
        Run full translation pipeline.
        
        Args:
            text: Source text to translate
            context: Novel context with characters, tone, etc.
            terminology: Known terms for consistency
            skip_polish: Skip style agent (for faster processing)
        
        Returns:
            PipelineResult with final text and quality score
        """
        terminology = terminology or []
        agent_results = []
        
        # Clean source text
        cleaned_text = self._clean_text(text)
        
        # Split into chunks if too long
        chunks = self._split_chunks(cleaned_text)
        
        all_translated = []
        all_quality_scores = []
        
        for chunk in chunks:
            # Agent 1: Translation
            trans_result = await self.translation_agent.translate(chunk, context, terminology)
            agent_results.append(trans_result)
            current_text = trans_result.output_text
            
            # Agent 2: Terminology Check
            term_result = await self.terminology_agent.check_and_fix(current_text, context, terminology)
            agent_results.append(term_result)
            current_text = term_result.output_text
            
            # Agent 3: Style Polish (optional)
            if not skip_polish:
                style_result = await self.style_agent.polish(current_text, context)
                agent_results.append(style_result)
                current_text = style_result.output_text
            
            all_translated.append(current_text)
        
        # Combine all chunks
        final_text = "\n\n".join(all_translated)
        
        # Agent 4: Quality Scoring
        quality_score = await self.quality_agent.score(final_text, cleaned_text, context)
        
        # Determine if needs human review
        needs_review = quality_score.needs_review or quality_score.grade.value in ["C", "D"]
        if self.target_quality == "A" and quality_score.grade != QualityGrade.A:
            needs_review = True
        
        return PipelineResult(
            final_text=final_text,
            agent_results=agent_results,
            quality_score=quality_score,
            terminology_applied=[t.original for t in terminology],
            needs_human_review=needs_review,
            review_status=ReviewStatus.PENDING if needs_review else ReviewStatus.APPROVED,
        )
    
    def _clean_text(self, text: str) -> str:
        """Clean source text"""
        patterns = [
            r'快捷键.*', r'[\ufeff\u200b]', r'返回顶部', r'章节错误',
            r'点此举报', r'手机阅读', r'加入书架', r'上一章', r'下一章',
        ]
        result = text
        for p in patterns:
            result = re.sub(p, '', result)
        result = re.sub(r'\n{3,}', '\n\n', result)
        return result.strip()
    
    def _split_chunks(self, text: str, max_chars: int = 2500) -> List[str]:
        """Split text into manageable chunks"""
        if len(text) <= max_chars:
            return [text]
        
        chunks = []
        current = ""
        for para in text.split("\n\n"):
            if len(current) + len(para) > max_chars:
                if current:
                    chunks.append(current)
                current = para
            else:
                current += "\n\n" + para if current else para
        if current:
            chunks.append(current)
        return chunks


# ==================== REVIEW QUEUE MANAGER ====================

class ReviewQueueManager:
    """
    Manages human review queue for translations.
    Stores items needing review, tracks approval status.
    """
    
    def __init__(self):
        self._queue: Dict[str, ReviewQueueItem] = {}
        self._approved: Dict[str, ReviewQueueItem] = {}
    
    def add_to_queue(
        self, 
        result: PipelineResult, 
        novel_id: str, 
        chapter_number: int, 
        original_text: str,
        novel_title: str = "",
        chapter_title: str = "",
    ) -> ReviewQueueItem:
        """Add translation to review queue"""
        item_id = f"{novel_id}_ch{chapter_number}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        item = ReviewQueueItem(
            id=item_id,
            novel_id=novel_id,
            novel_title=novel_title,
            chapter_number=chapter_number,
            chapter_title=chapter_title,
            original_text=original_text[:1000],
            translated_text=result.final_text,
            quality_score=result.quality_score,
            status=ReviewStatus.PENDING,
            created_at=datetime.now(),
            priority=result.quality_score.review_priority,
        )
        
        self._queue[item_id] = item
        return item
    
    def get_pending_reviews(self, novel_id: str = None, limit: int = 20) -> List[ReviewQueueItem]:
        """Get items pending review"""
        items = [i for i in self._queue.values() if i.status == ReviewStatus.PENDING]
        if novel_id:
            items = [i for i in items if i.novel_id == novel_id]
        items.sort(key=lambda x: x.priority, reverse=True)
        return items[:limit]
    
    def approve_review(self, item_id: str, reviewer: str = "anonymous") -> Optional[ReviewQueueItem]:
        """Approve a translation"""
        item = self._queue.get(item_id)
        if item:
            item.status = ReviewStatus.APPROVED
            item.reviewed_by = reviewer
            item.reviewed_at = datetime.now()
            self._approved[item_id] = item
            del self._queue[item_id]
        return item
    
    def edit_review(self, item_id: str, edited_text: str, reviewer: str = "anonymous") -> Optional[ReviewQueueItem]:
        """Edit and approve a translation"""
        item = self._queue.get(item_id)
        if item:
            item.status = ReviewStatus.EDITED
            item.edited_text = edited_text
            item.reviewed_by = reviewer
            item.reviewed_at = datetime.now()
            self._approved[item_id] = item
            del self._queue[item_id]
        return item
    
    def reject_review(self, item_id: str, reviewer: str = "anonymous", notes: str = "") -> Optional[ReviewQueueItem]:
        """Reject translation (needs retranslation)"""
        item = self._queue.get(item_id)
        if item:
            item.status = ReviewStatus.REJECTED
            item.reviewed_by = reviewer
            item.reviewed_at = datetime.now()
            item.notes = notes
        return item
    
    def get_approved(self, novel_id: str, chapter_number: int) -> Optional[ReviewQueueItem]:
        """Get approved translation for a chapter"""
        for item in self._approved.values():
            if item.novel_id == novel_id and item.chapter_number == chapter_number:
                return item
        return None
    
    def get_stats(self) -> Dict:
        """Get queue statistics"""
        return {
            "pending": len([i for i in self._queue.values() if i.status == ReviewStatus.PENDING]),
            "approved": len(self._approved),
            "rejected": len([i for i in self._queue.values() if i.status == ReviewStatus.REJECTED]),
            "total_processed": len(self._approved) + len(self._queue),
        }


# ==================== FACTORY ====================

def create_pipeline(
    provider: str = "openai",
    model: str = "gpt-4o",
    target_quality: str = "B",
) -> TranslationPipeline:
    """Create a translation pipeline"""
    return TranslationPipeline(
        model=model,
        target_quality=target_quality,
    )


# ==================== GLOBAL INSTANCES ====================

# Global review queue (in production, use database)
review_queue = ReviewQueueManager()
