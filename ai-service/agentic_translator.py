"""
Agentic AI Translation System for Novel Translation
Supports: OpenAI (GPT-4o/GPT-5) and Google Gemini (1.5/3.1 Pro)
Features: Two-step translation, full context, terminology consistency, literary prompts
ENFORCED TERMINOLOGY: Uses placeholder replacement to prevent inconsistent name translations
"""

import os
import re
import json
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import asyncio

# OpenAI
from openai import AsyncOpenAI

# Google Gemini (new SDK)
from google import genai

# Fallback: Google Translate
from deep_translator import GoogleTranslator


class LLMProvider(Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    GOOGLE_TRANSLATE = "google_translate"  # Fallback


@dataclass
class TerminologyTerm:
    """A term with its translation for consistency"""
    original: str
    translation: str
    term_type: str  # character, location, item, technique, power, title
    description: str = ""
    confidence: float = 1.0


@dataclass
class ChapterContext:
    """Context from a previously translated chapter"""
    chapter_number: int
    chapter_title: str
    source_text: str  # Original text (first portion)
    translated_text: str  # Translated text (first portion)
    key_events: List[str] = field(default_factory=list)  # Key events/plot points


@dataclass
class NovelContext:
    """Full context for a novel being translated"""
    novel_title: str
    novel_title_th: str
    author: str
    genre: str  # fantasy, romance, sci-fi, etc.
    tone: str  # dark, light, dramatic, comedic
    main_characters: List[Tuple[str, str]]  # (original_name, thai_name)
    terminology: List[TerminologyTerm]
    previous_chapters: List[ChapterContext]
    pronoun_style: str = "traditional"  # traditional (ข้า/เจ้า), modern (ฉัน/คุณ)


@dataclass
class TranslationResult:
    """Result of translation"""
    translated_text: str
    literal_translation: str  # First pass (literal)
    polished_translation: str  # Second pass (polished)
    model_used: str
    provider: str
    tokens_used: int = 0
    terms_applied: List[str] = field(default_factory=list)
    quality_score: float = 0.0


class AgenticTranslator:
    """
    Agentic AI Translator with context awareness and two-step translation.
    Supports OpenAI GPT and Google Gemini.
    
    KEY FIX: Uses placeholder preprocessing to enforce consistent terminology.
    Names are replaced with [[NAME_THAI]] before sending to LLM, ensuring
    the LLM cannot translate them inconsistently.
    """

    def __init__(
        self,
        provider: LLMProvider = LLMProvider.OPENAI,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self.provider = provider
        self.openai_api_key = openai_api_key
        self.gemini_api_key = gemini_api_key

        # Model names
        self.openai_model = model_name or os.getenv("OPENAI_MODEL", "gpt-4o")
        self.gemini_model = model_name or os.getenv("GEMINI_MODEL", "gemini-1.5-pro")

        # Initialize clients
        self._openai_client = None
        self._gemini_client = None

        # Cache for terminology
        self._terminology_cache: Dict[str, List[TerminologyTerm]] = {}

    def _get_openai_client(self) -> AsyncOpenAI:
        if self._openai_client is None:
            if not self.openai_api_key:
                raise ValueError("OpenAI API key required. Set OPENAI_API_KEY environment variable.")
            self._openai_client = AsyncOpenAI(api_key=self.openai_api_key)
        return self._openai_client

    def _get_gemini_client(self):
        if self._gemini_client is None:
            if not self.gemini_api_key:
                raise ValueError("Gemini API key required. Set GEMINI_API_KEY environment variable.")
            self._gemini_client = genai.Client(api_key=self.gemini_api_key)
        return self._gemini_client

    # ==================== TERMINOLOGY PREPROCESSING (KEY FIX) ====================

    def _preprocess_terminology_for_llm(
        self,
        text: str,
        terminology: List[TerminologyTerm],
        characters: List[Tuple[str, str]],
    ) -> Tuple[str, Dict[str, str]]:
        """
        Replace known terms with placeholders BEFORE sending to LLM.
        This ensures the LLM cannot translate names inconsistently.
        
        Example: 司空度 -> [[สีคงตู้]]
        The LLM will see [[สีคงตู้]] and must keep it as สีคงตู้ in output.
        
        Returns: (processed_text, placeholders_dict)
        """
        placeholders = {}
        result = text

        # Combine terminology and characters into single lookup
        all_terms = {}
        for term in terminology:
            all_terms[term.original] = term.translation
        for original, thai in characters:
            all_terms[original] = thai

        # Sort by length (longest first) to avoid partial replacements
        sorted_terms = sorted(all_terms.items(), key=lambda x: len(x[0]), reverse=True)

        # Replace each term with a placeholder containing the Thai translation
        # Format: [[หยุนเช่อ]] - LLMs typically preserve bracketed content
        for original, translation in sorted_terms:
            if original in result:
                # Use a placeholder that includes the target translation
                placeholder = f"[[{translation}]]"
                placeholders[original] = translation
                result = result.replace(original, placeholder)

        return result, placeholders

    def _postprocess_terminology_from_llm(
        self,
        text: str,
        placeholders: Dict[str, str],
    ) -> str:
        """
        Clean up placeholders after LLM translation.
        Remove the [[ ]] brackets to get clean Thai names.
        
        Also handles cases where LLM might have modified the brackets slightly.
        """
        result = text

        for original, translation in placeholders.items():
            # Remove placeholder brackets: [[หยุนเช่อ]] -> หยุนเช่อ
            placeholder = f"[[{translation}]]"
            result = result.replace(placeholder, translation)

            # Handle if LLM added spaces inside brackets
            # Pattern matches [[หยุนเช่อ]], [[ หยุนเช่อ ]], [[หยุนเช่อ ]], etc.
            pattern = re.compile(r'\[\[\s*' + re.escape(translation) + r'\s*\]\]')
            result = pattern.sub(translation, result)

            # Also handle if LLM used single brackets or other variations
            result = result.replace(f"[{translation}]", translation)
            result = result.replace(f"【{translation}】", translation)

        # Final cleanup: remove any remaining empty brackets
        result = re.sub(r'\[\[\s*\]\]', '', result)
        result = re.sub(r'\[\s*\]', '', result)

        return result

    # ==================== PROMPTS ====================

    def _build_literal_translation_prompt(
        self,
        text: str,
        context: NovelContext,
        terminology: List[TerminologyTerm],
        placeholders: Dict[str, str],
    ) -> str:
        """Build prompt for first pass: literal translation"""

        # Build terminology glossary (for reference)
        glossary = self._build_glossary_section(terminology)

        # Build character list
        characters = self._build_character_section(context)

        # Build context from previous chapters
        prev_context = self._build_previous_chapters_section(context.previous_chapters[-5:])

        # Build list of protected names for the prompt
        protected_names = "\n".join([f"- [[{thai}]] → {thai}" for _, thai in placeholders.items()]) if placeholders else "ไม่มี"

        prompt = f"""คุณเป็นนักแปลนิยายมืออาชีพจากจีนเป็นไทย โปรดแปลข้อความต่อไปนี้เป็นภาษาไทย

## ข้อมูลนิยาย
- ชื่อ: {context.novel_title_th} ({context.novel_title})
- ผู้แต่ง: {context.author}
- ประเภท: {context.genre}
- โทนเรื่อง: {context.tone}

## รูปแบบสรรพนาม
{self._get_pronoun_instruction(context.pronoun_style)}

## คำศัพท์ที่ต้องใช้ (Glossary)
{glossary}

## ตัวละครสำคัญ
{characters}

## ชื่อที่ถูกป้องกัน (ห้ามเปลี่ยนแปลง!)
{protected_names}

## บริบทจากบทก่อนหน้า
{prev_context}

## ข้อความที่ต้องแปล
{text}

---

**คำแนะนำในการแปล - สำคัญมาก!**
1. แปลตรงตัว (literal translation) เพื่อเก็บเนื้อความให้ครบถ้วน
2. **สิ่งที่อยู่ในวงเล็บ [[ ]] เป็นชื่อตัวละคร/สถานที่ที่ถูกกำหนดไว้แล้ว - ห้ามแปลหรือเปลี่ยนแปลง!**
   - เช่น [[หยุนเช่อ]] ให้เขียนเป็น หยุนเช่อ (เอาวงเล็บ [[ ]] ออก)
   - ห้ามเปลี่ยนเป็นภาษาอังกฤษหรือชื่ออื่น
3. **ห้ามใช้ภาษาอังกฤษผสมในข้อความไทย** - ชื่อทุกอย่างต้องเป็นภาษาไทย
4. รักษาโทนและอารมณ์ของเรื่อง
5. แยกบทสนทนาออกจากบรรยายอย่างชัดเจน
6. หากมีคำที่ไม่แน่ใจ ใส่คำแปลที่เหมาะสมที่สุดและใส่ [?] กำกับ

**ผลลัพธ์:** แปลข้อความเป็นภาษาไทย (ไม่ต้องมีคำอธิบายเพิ่มเติม):
"""
        return prompt

    def _build_polishing_prompt(
        self,
        literal_translation: str,
        context: NovelContext,
        original_text: str,
        placeholders: Dict[str, str],
    ) -> str:
        """Build prompt for second pass: literary polishing"""

        # Build list of protected names
        protected_names = "\n".join([f"- {thai} (ห้ามเปลี่ยน)" for _, thai in placeholders.items()]) if placeholders else "ไม่มี"

        prompt = f"""คุณเป็นนักเขียนและบรรณาธิการมืออาชีพ โปรดขัดเกลาการแปลนิยายต่อไปนี้ให้มีสำนวนภาษาที่สวยงาม ลื่นไหล และเป็นธรรมชาติ

## ข้อมูลนิยาย
- ชื่อ: {context.novel_title_th}
- ประเภท: {context.genre}
- โทนเรื่อง: {context.tone}

## รูปแบบสรรพนาม
{self._get_pronoun_instruction(context.pronoun_style)}

## ชื่อที่ห้ามเปลี่ยนแปลง
{protected_names}

## การแปลคร่าว (Literal Translation)
{literal_translation}

---

**คำแนะนำในการขัดเกลา - สำคัญมาก!**
1. ปรับปรุงสำนวนให้เป็นภาษานิยายที่อ่านสนุก ไม่แข็งทื่อ
2. **รักษาชื่อตัวละครและสถานที่ไว้ทุกประการ - ห้ามเปลี่ยนแปลง!**
3. รักษาความหมายเดิมไว้ทุกประการ
4. เพิ่มอารมณ์และความรู้สึกในบทบรรยาย
5. ทำให้บทสนทนามีชีวิตชีวา เหมาะกับบุคลิกตัวละคร
6. ใช้คำเชื่อมที่เหมาะสม เช่น "จึง", "ก็", "แล้ว", "เมื่อ"
7. **ห้ามใช้ภาษาอังกฤษผสมในข้อความไทย**
8. จัดรูปแบบย่อหน้าให้อ่านง่าย

**ผลลัพธ์:** ขัดเกลาการแปลให้เป็นภาษานิยายที่สวยงาม (ไม่ต้องมีคำอธิบาย):
"""
        return prompt

    def _build_glossary_section(self, terminology: List[TerminologyTerm]) -> str:
        """Build glossary section for prompt"""
        if not terminology:
            return "ไม่มีคำศัพท์เฉพาะที่กำหนด"

        lines = []
        for term in terminology:
            lines.append(f"- {term.original} → {term.translation} ({term.term_type})")
            if term.description:
                lines.append(f"  หมายเหตุ: {term.description}")

        return "\n".join(lines)

    def _build_character_section(self, context: NovelContext) -> str:
        """Build character section for prompt"""
        if not context.main_characters:
            return "ไม่มีข้อมูลตัวละคร"

        lines = []
        for original, thai in context.main_characters:
            lines.append(f"- {original} → {thai}")

        return "\n".join(lines)

    def _build_previous_chapters_section(self, chapters: List[ChapterContext]) -> str:
        """Build previous chapters context section"""
        if not chapters:
            return "นี่เป็นบทแรก ไม่มีบริบทก่อนหน้า"

        lines = []
        for ch in chapters[-3:]:  # Last 3 chapters for summary
            lines.append(f"### บท {ch.chapter_number}: {ch.chapter_title}")
            if ch.key_events:
                lines.append(f"เหตุการณ์สำคัญ: {', '.join(ch.key_events)}")
            lines.append(f"ตัวอย่างการแปล: {ch.translated_text[:200]}...")
            lines.append("")

        return "\n".join(lines)

    def _get_pronoun_instruction(self, style: str) -> str:
        """Get pronoun usage instruction"""
        if style == "traditional":
            return """- ตัวละครผู้มีอำนาจ/อาวุโส: ใช้ "ข้า" (แทนตัว), "เจ้า" (แทนผู้อื่น)
- ตัวละครระดับเดียวกัน/เพื่อน: ใช้ "ฉัน" (แทนตัว), "เธอ/คุณ" (แทนผู้อื่น)
- ตัวละครผู้น้อยกว่า: ใช้ "ข้า/ฉัน" (แทนตัว), "ท่าน/อาจารย์" (แทนผู้ใหญ่)"""
        else:
            return """- ใช้สรรพนามสมัยใหม่: "ฉัน" (แทนตัว), "เธอ/คุณ" (แทนผู้อื่น)
- ปรับตามความสัมพันธ์ของตัวละคร"""

    # ==================== TRANSLATION METHODS ====================

    async def translate_with_openai(
        self,
        prompt: str,
        max_tokens: int = 4000,
    ) -> Tuple[str, int]:
        """Translate using OpenAI GPT"""
        client = self._get_openai_client()

        response = await client.chat.completions.create(
            model=self.openai_model,
            messages=[
                {"role": "system", "content": "คุณเป็นนักแปลนิยายมืออาชีพจากจีนเป็นไทย มีประสบการณ์กว่า 20 ปี คุณเข้าใจว่าชื่อตัวละครและสถานที่ต้องแปลให้สอดคล้องและไม่ใช้ภาษาอังกฤษผสม"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=max_tokens,
            temperature=0.3,  # Lower temperature for consistency
        )

        return response.choices[0].message.content, response.usage.total_tokens

    async def translate_with_gemini(
        self,
        prompt: str,
        max_tokens: int = 4000,
    ) -> Tuple[str, int]:
        """Translate using Google Gemini (new SDK)"""
        client = self._get_gemini_client()

        response = await client.aio.models.generate_content(
            model=self.gemini_model,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                temperature=0.3,
            )
        )

        # Gemini doesn't provide token count directly, estimate
        estimated_tokens = len(prompt) // 4 + len(response.text) // 4

        return response.text, estimated_tokens

    async def translate_with_google_translate(
        self,
        text: str,
        source_lang: str = "zh-CN",
        target_lang: str = "th",
    ) -> str:
        """Fallback: Google Translate"""
        translator = GoogleTranslator(source=source_lang, target=target_lang)

        # Split into chunks if too long
        max_chars = 4500
        if len(text) > max_chars:
            chunks = []
            current = ""
            for paragraph in text.split("\n\n"):
                if len(current) + len(paragraph) > max_chars:
                    if current:
                        chunks.append(current)
                    current = paragraph
                else:
                    current += "\n\n" + paragraph if current else paragraph
            if current:
                chunks.append(current)

            translated_chunks = [translator.translate(chunk) for chunk in chunks]
            return "\n\n".join(translated_chunks)
        else:
            return translator.translate(text)

    # ==================== MAIN TRANSLATION API ====================

    async def translate_chapter(
        self,
        text: str,
        context: NovelContext,
        terminology: List[TerminologyTerm] = None,
        two_step: bool = True,
    ) -> TranslationResult:
        """
        Translate a chapter with full context awareness.
        
        KEY IMPROVEMENT: Uses placeholder preprocessing to enforce consistent terminology.
        Names are replaced before sending to LLM, preventing inconsistent translations.

        Args:
            text: The chapter text to translate
            context: Full novel context including previous chapters
            terminology: Glossary of terms to use
            two_step: Whether to use two-step translation (literal → polish)

        Returns:
            TranslationResult with translated text and metadata
        """

        # Default terminology to empty list
        if terminology is None:
            terminology = []

        # Clean text first
        cleaned_text = self._clean_source_text(text)

        # Pre-process: Replace all known terms with placeholders
        # This is the KEY FIX - names become [[หยุนเช่อ]] before LLM sees them
        processed_text, placeholders = self._preprocess_terminology_for_llm(
            cleaned_text, terminology, context.main_characters
        )

        # Split into manageable chunks
        chunks = self._split_into_chunks(processed_text, max_chars=3000)

        all_literal = []
        all_polished = []
        total_tokens = 0
        terms_applied = list(placeholders.keys())  # Track what was preprocessed

        for chunk in chunks:
            # Step 1: Literal translation (with placeholders in text)
            literal_prompt = self._build_literal_translation_prompt(
                chunk, context, terminology, placeholders
            )

            try:
                if self.provider == LLMProvider.OPENAI:
                    literal_result, tokens = await self.translate_with_openai(literal_prompt)
                elif self.provider == LLMProvider.GEMINI:
                    literal_result, tokens = await self.translate_with_gemini(literal_prompt)
                else:
                    # Fallback to Google Translate (synchronous)
                    translator = GoogleTranslator(source="zh-CN", target="th")
                    if len(chunk) > 4500:
                        # Split into smaller chunks
                        sub_chunks = []
                        current = ""
                        for paragraph in chunk.split("\n\n"):
                            if len(current) + len(paragraph) > 4500:
                                if current:
                                    sub_chunks.append(current)
                                current = paragraph
                            else:
                                current += "\n\n" + paragraph if current else paragraph
                        if current:
                            sub_chunks.append(current)
                        literal_result = "\n\n".join([translator.translate(c) for c in sub_chunks])
                    else:
                        literal_result = translator.translate(chunk)
                    tokens = 0

                total_tokens += tokens
                
                # Post-process: Remove placeholders to get clean Thai names
                literal_result = self._postprocess_terminology_from_llm(literal_result, placeholders)
                all_literal.append(literal_result)

                # Step 2: Polishing (if two_step enabled)
                if two_step and self.provider != LLMProvider.GOOGLE_TRANSLATE:
                    polish_prompt = self._build_polishing_prompt(
                        literal_result, context, chunk, placeholders
                    )

                    if self.provider == LLMProvider.OPENAI:
                        polished_result, tokens = await self.translate_with_openai(polish_prompt)
                    else:
                        polished_result, tokens = await self.translate_with_gemini(polish_prompt)

                    total_tokens += tokens
                    
                    # Post-process again (in case polishing changed names)
                    polished_result = self._postprocess_terminology_from_llm(polished_result, placeholders)
                    all_polished.append(polished_result)
                else:
                    all_polished.append(literal_result)

            except Exception as e:
                # Fallback to Google Translate on error
                print(f"LLM translation failed: {e}, falling back to Google Translate")
                try:
                    translator = GoogleTranslator(source="zh-CN", target="th")
                    fallback = translator.translate(chunk[:4500] if len(chunk) > 4500 else chunk)
                    # Post-process placeholders
                    fallback = self._postprocess_terminology_from_llm(fallback, placeholders)
                except:
                    fallback = self._postprocess_terminology_from_llm(chunk, placeholders)
                all_literal.append(fallback)
                all_polished.append(fallback)

        # Combine results
        literal_translation = "\n\n".join(all_literal)
        polished_translation = "\n\n".join(all_polished)

        # Final post-process (safety check)
        polished_translation = self._postprocess_terminology_from_llm(polished_translation, placeholders)

        # Format final text
        final_text = self._format_translated_text(polished_translation)

        return TranslationResult(
            translated_text=final_text,
            literal_translation=literal_translation,
            polished_translation=polished_translation,
            model_used=self.openai_model if self.provider == LLMProvider.OPENAI else self.gemini_model,
            provider=self.provider.value,
            tokens_used=total_tokens,
            terms_applied=terms_applied,
            quality_score=self._estimate_quality(final_text, cleaned_text),
        )

    async def translate_text(
        self,
        text: str,
        source_lang: str = "zh",
        target_lang: str = "th",
        context: Optional[NovelContext] = None,
        terminology: Optional[List[TerminologyTerm]] = None,
    ) -> TranslationResult:
        """
        Simple translation API for backward compatibility.
        """
        if context is None:
            # Create minimal context
            context = NovelContext(
                novel_title="Unknown",
                novel_title_th="ไม่ทราบชื่อ",
                author="",
                genre="fantasy",
                tone="neutral",
                main_characters=[],
                terminology=terminology or [],
                previous_chapters=[],
                pronoun_style="traditional",
            )

        return await self.translate_chapter(
            text=text,
            context=context,
            terminology=terminology or [],
            two_step=True,
        )

    # ==================== HELPER METHODS ====================

    def _clean_source_text(self, text: str) -> str:
        """Clean source text before translation"""
        # Remove UI artifacts
        cleanup_patterns = [
            r'快捷键.*',
            r'[\ufeff\u200b]',
            r'返回顶部',
            r'章节错误',
            r'点此举报',
            r'手机阅读',
            r'加入书架',
            r'上一章',
            r'下一章',
            r'返回目录',
        ]

        result = text
        for pattern in cleanup_patterns:
            result = re.sub(pattern, '', result)

        # Clean whitespace
        result = re.sub(r'\n{3,}', '\n\n', result)
        result = re.sub(r' {2,}', ' ', result)

        return result.strip()

    def _split_into_chunks(self, text: str, max_chars: int = 3000) -> List[str]:
        """Split text into chunks for translation"""
        if len(text) <= max_chars:
            return [text]

        chunks = []
        current = ""

        for paragraph in text.split("\n\n"):
            if len(current) + len(paragraph) > max_chars:
                if current:
                    chunks.append(current)
                current = paragraph
            else:
                current += "\n\n" + paragraph if current else paragraph

        if current:
            chunks.append(current)

        return chunks

    def _apply_terminology_replacements(
        self,
        text: str,
        terminology: List[TerminologyTerm],
        applied: List[str],
    ) -> str:
        """Apply terminology replacements to ensure consistency (legacy method)"""
        result = text

        for term in terminology:
            # Check if original term appears in text
            if term.original in result or term.translation in result:
                applied.append(term.original)

        return result

    def _format_translated_text(self, text: str) -> str:
        """Format translated text for better readability"""
        # Add paragraph breaks for dialogue
        lines = text.split("\n")
        formatted_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Check if this is dialogue
            if line.startswith('"') or line.startswith('"') or line.startswith('「'):
                formatted_lines.append("")  # Add blank line before dialogue
                formatted_lines.append(line)
            else:
                formatted_lines.append(line)

        result = "\n".join(formatted_lines)
        result = re.sub(r'\n{3,}', '\n\n', result)

        return result

    def _estimate_quality(self, translated: str, original: str) -> float:
        """Estimate translation quality score"""
        # Simple heuristic based on length ratio and structure
        if not translated or not original:
            return 0.0

        length_ratio = len(translated) / len(original)

        # Good ratio for Chinese to Thai is around 1.0-1.5
        if 0.8 <= length_ratio <= 1.8:
            ratio_score = 1.0
        elif 0.5 <= length_ratio <= 2.0:
            ratio_score = 0.7
        else:
            ratio_score = 0.5

        # Check for dialogue preservation
        original_dialogues = len(re.findall(r'["「\'"]', original))
        translated_dialogues = len(re.findall(r'["「\'"]', translated))

        if original_dialogues > 0:
            dialogue_ratio = translated_dialogues / original_dialogues
            dialogue_score = min(1.0, dialogue_ratio)
        else:
            dialogue_score = 1.0

        return (ratio_score * 0.6 + dialogue_score * 0.4)


# ==================== TERMINOLOGY MANAGER ====================

class TerminologyManager:
    """Manage terminology for consistent translation"""

    # Pre-defined terminology for popular novels
    KNOWN_TERMINOLOGY: Dict[str, Dict[str, TerminologyTerm]] = {
        "against_the_gods": {
            "云澈": TerminologyTerm("云澈", "หยุนเช่อ", "character", "Main protagonist"),
            "沐玄音": TerminologyTerm("沐玄音", "มู่เสวียนอิ่น", "character", "Ice Phoenix Goddess"),
            "司空度": TerminologyTerm("司空度", "สีคงตู้", "character", "Sikong Du"),
            "夏倾月": TerminologyTerm("夏倾月", "เซี่ยชิงเยว่", "character", "Xia Qingyue"),
            "茉莉": TerminologyTerm("茉莉", "โมลี่", "character", "Jasmine"),
            "神帝": TerminologyTerm("神帝", "เทพจักรพรรดิ", "title", "Divine Emperor"),
            "深渊": TerminologyTerm("深渊", "หวี่ยนลึก", "location", "The Abyss"),
            "冰凤": TerminologyTerm("冰凤", "หงส์น้ำแข็ง", "creature", "Ice Phoenix"),
            "神力": TerminologyTerm("神力", "พลังเทพ", "power", "Divine Power"),
            "玄力": TerminologyTerm("玄力", "พลังวิญญาณ", "power", "Profound Energy"),
            "苍风玄府": TerminologyTerm("苍风玄府", "ฉางเฟิงเสวียนฟู่", "location", "Cangfeng Xuanfu"),
            "天兵殿": TerminologyTerm("天兵殿", "ศาลาเทียนปิง", "location", "Tianbing Hall"),
            "泰玄殿": TerminologyTerm("泰玄殿", "โถงไท่ซวน", "location", "Taixuan Hall"),
            "霸天巨剑": TerminologyTerm("霸天巨剑", "ดาบยักษ์ของโอเวอร์ลอร์ด", "item", "Overlord's Giant Sword"),
            "火拳": TerminologyTerm("火拳", "หมัดไฟ", "technique", "Fire Fist"),
            "火云掌": TerminologyTerm("火云掌", "ฝ่ามือเมฆาไฟ", "technique", "Fire Cloud Palm"),
        },
        # Add more novels here
    }

    def __init__(self):
        self._novel_terms: Dict[str, List[TerminologyTerm]] = {}

    def get_terminology(self, novel_id: str) -> List[TerminologyTerm]:
        """Get terminology for a novel"""
        if novel_id in self.KNOWN_TERMINOLOGY:
            return list(self.KNOWN_TERMINOLOGY[novel_id].values())

        if novel_id in self._novel_terms:
            return self._novel_terms[novel_id]

        return []

    def add_term(self, novel_id: str, term: TerminologyTerm):
        """Add a term to the novel's terminology"""
        if novel_id not in self._novel_terms:
            self._novel_terms[novel_id] = []

        # Check if term already exists
        for existing in self._novel_terms[novel_id]:
            if existing.original == term.original:
                existing.translation = term.translation
                existing.description = term.description
                return

        self._novel_terms[novel_id].append(term)

    def extract_terms_from_text(
        self,
        text: str,
        novel_id: str,
        existing_terms: List[TerminologyTerm],
    ) -> List[TerminologyTerm]:
        """Extract potential terms from text using frequency analysis"""
        # Chinese character pattern (2-4 chars, likely names)
        chinese_pattern = re.compile(r'[\u4e00-\u9fff]{2,4}')
        matches = chinese_pattern.findall(text)

        # Count frequency
        from collections import Counter
        freq = Counter(matches)

        new_terms = []
        existing_originals = {t.original for t in existing_terms}

        # Skip common words
        skip_words = {
            '的话', '虽然', '但是', '这个', '那个', '不是', '没有',
            '已经', '可以', '什么', '因为', '所以', '如果', '只是',
            '还是', '但是', '而且', '或者', '不过', '虽然', '即使',
        }

        for term, count in freq.most_common(30):
            if term in existing_originals or term in skip_words:
                continue

            if count >= 2:
                # Try to determine type
                term_type = "unknown"
                if any(c in term for c in ['帝', '王', '皇', '神', '仙', '魔']):
                    term_type = "title"
                elif any(c in term for c in ['山', '海', '城', '域', '界', '宫']):
                    term_type = "location"
                elif any(c in term for c in ['剑', '刀', '枪', '鼎', '珠']):
                    term_type = "item"

                new_terms.append(TerminologyTerm(
                    original=term,
                    translation="",  # Will be translated later
                    term_type=term_type,
                    description=f"Appears {count} times",
                    confidence=0.5,
                ))

        return new_terms


# ==================== CONTEXT MANAGER ====================

class ContextManager:
    """Manage translation context across chapters"""

    def __init__(self, max_context_chapters: int = 10):
        self.max_context_chapters = max_context_chapters
        self._novel_contexts: Dict[str, NovelContext] = {}

    def get_context(self, novel_id: str) -> Optional[NovelContext]:
        """Get context for a novel"""
        return self._novel_contexts.get(novel_id)

    def initialize_context(
        self,
        novel_id: str,
        title: str,
        title_th: str,
        author: str,
        genre: str = "fantasy",
        tone: str = "dark",
    ) -> NovelContext:
        """Initialize context for a new novel"""
        context = NovelContext(
            novel_title=title,
            novel_title_th=title_th,
            author=author,
            genre=genre,
            tone=tone,
            main_characters=[],
            terminology=[],
            previous_chapters=[],
            pronoun_style="traditional",
        )
        self._novel_contexts[novel_id] = context
        return context

    def add_chapter_context(
        self,
        novel_id: str,
        chapter_number: int,
        chapter_title: str,
        source_text: str,
        translated_text: str,
        key_events: List[str] = None,
    ):
        """Add a chapter to the context"""
        context = self._novel_contexts.get(novel_id)
        if not context:
            return

        chapter_ctx = ChapterContext(
            chapter_number=chapter_number,
            chapter_title=chapter_title,
            source_text=source_text[:1000],  # Store first 1000 chars
            translated_text=translated_text[:1000],
            key_events=key_events or [],
        )

        context.previous_chapters.append(chapter_ctx)

        # Keep only last N chapters
        if len(context.previous_chapters) > self.max_context_chapters:
            context.previous_chapters = context.previous_chapters[-self.max_context_chapters:]

    def update_characters(
        self,
        novel_id: str,
        characters: List[Tuple[str, str]],
    ):
        """Update character list"""
        context = self._novel_contexts.get(novel_id)
        if context:
            context.main_characters = characters

    def update_terminology(
        self,
        novel_id: str,
        terminology: List[TerminologyTerm],
    ):
        """Update terminology"""
        context = self._novel_contexts.get(novel_id)
        if context:
            context.terminology = terminology


# ==================== FACTORY ====================

def create_translator(
    provider: str = "openai",
    model: str = None,
) -> AgenticTranslator:
    """Factory function to create a translator"""

    provider_enum = LLMProvider.OPENAI if provider.lower() == "openai" else LLMProvider.GEMINI

    return AgenticTranslator(
        provider=provider_enum,
        model_name=model,
    )
