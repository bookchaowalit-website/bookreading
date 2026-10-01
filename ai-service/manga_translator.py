"""
Manga/Manhwa Translation System
Extracts text from manga images using OCR, translates with AI, and renders back.

Features:
- OCR text extraction from manga panels
- Speech bubble detection
- Context-aware translation for manga
- Text rendering with font matching
- Support for Korean (Manhwa), Japanese (Manga), Chinese (Manhua)
"""

import os
import re
import json
import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from io import BytesIO

logger = logging.getLogger(__name__)

# OCR
try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

# Image processing
from PIL import Image, ImageDraw, ImageFont

# OpenAI for translation
from openai import AsyncOpenAI

# Google Gemini (new SDK - import removed as not actively used in this module)
# Note: If Gemini support is needed, use: from google import genai


class SourceLanguage(Enum):
    KOREAN = "ko"      # Manhwa
    JAPANESE = "ja"    # Manga
    CHINESE = "zh"     # Manhua
    CHINESE_TRAD = "zh-TW"
    ENGLISH = "en"     # English manga/manhwa


class TextRegionType(Enum):
    SPEECH_BUBBLE = "speech"       # Dialogue
    NARRATION_BOX = "narration"    # Narration text
    SOUND_EFFECT = "sfx"           # Sound effects (onomatopoeia)
    TITLE = "title"                # Chapter/page titles
    SIGN = "sign"                  # Signs, labels in the scene
    THOUGHT = "thought"            # Thought bubbles
    UNKNOWN = "unknown"


@dataclass
class TextRegion:
    """A region of text detected in a manga image"""
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    text: str                        # Original text
    translated_text: str = ""        # Translated text
    confidence: float = 0.0          # OCR confidence
    region_type: TextRegionType = TextRegionType.UNKNOWN
    font_size: int = 12              # Estimated font size
    is_vertical: bool = False        # Vertical text (Japanese/Chinese)
    color: str = "#000000"           # Text color


@dataclass
class MangaPanel:
    """A single manga panel/page"""
    image_path: str
    image_data: Optional[bytes] = None
    regions: List[TextRegion] = field(default_factory=list)
    width: int = 0
    height: int = 0


@dataclass
class MangaTranslationContext:
    """Context for manga translation"""
    series_title: str = ""
    chapter_number: int = 0
    characters: List[Dict[str, str]] = field(default_factory=list)  # [{name: "", personality: ""}]
    previous_dialogues: List[Dict[str, str]] = field(default_factory=list)  # [{speaker: "", text: ""}]
    tone: str = "casual"  # casual, serious, comedy, action
    setting: str = ""     # modern, fantasy, historical, sci-fi


@dataclass
class MangaTranslationResult:
    """Result of manga translation"""
    original_image: bytes
    translated_image: bytes
    regions: List[TextRegion]
    model_used: str
    provider: str
    tokens_used: int = 0


class MangaOCRExtractor:
    """
    Extract text from manga images using OCR.
    Supports Korean, Japanese, and Chinese.
    """
    
    def __init__(self, languages: List[str] = None, use_gpu: bool = False):
        """
        Initialize OCR extractor.
        
        Args:
            languages: List of language codes ['ko', 'ja', 'zh', 'en']
            use_gpu: Whether to use GPU for faster processing
        """
        self.languages = languages or ['ko', 'ja', 'zh', 'en']
        self.use_gpu = use_gpu
        self._reader = None
    
    def _get_reader(self):
        """Lazy load EasyOCR reader"""
        if not EASYOCR_AVAILABLE:
            raise ImportError("EasyOCR not installed. Run: pip install easyocr")
        
        if self._reader is None:
            self._reader = easyocr.Reader(
                self.languages,
                gpu=self.use_gpu,
                download_enabled=True
            )
        return self._reader
    
    def extract_text(self, image: Image.Image) -> List[TextRegion]:
        """
        Extract text regions from a manga image.
        
        Args:
            image: PIL Image object
            
        Returns:
            List of TextRegion objects
        """
        reader = self._get_reader()
        
        # Convert PIL image to numpy array
        import numpy as np
        img_array = np.array(image)
        
        # Run OCR
        results = reader.readtext(img_array, detail=1, paragraph=False)
        
        regions = []
        for bbox, text, confidence in results:
            if not text.strip():
                continue
            
            # Convert bbox format [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] -> (x1, y1, x2, y2)
            x_coords = [point[0] for point in bbox]
            y_coords = [point[1] for point in bbox]
            x1, y1 = min(x_coords), min(y_coords)
            x2, y2 = max(x_coords), max(y_coords)
            
            # Estimate font size from bbox height
            height = y2 - y1
            font_size = max(8, int(height * 0.7))
            
            # Detect region type
            region_type = self._detect_region_type(text, (x1, y1, x2, y2), image.size)
            
            # Check if vertical text
            width = x2 - x1
            is_vertical = height > width * 1.5
            
            regions.append(TextRegion(
                bbox=(int(x1), int(y1), int(x2), int(y2)),
                text=text,
                confidence=confidence,
                region_type=region_type,
                font_size=font_size,
                is_vertical=is_vertical
            ))
        
        return regions
    
    def _detect_region_type(
        self, 
        text: str, 
        bbox: Tuple[int, int, int, int], 
        image_size: Tuple[int, int]
    ) -> TextRegionType:
        """
        Detect the type of text region based on content and position.
        """
        # Sound effects are often short, stylized text
        if len(text) <= 4 and re.match(r'^[A-Za-z]{1,4}$|^[あいうえお]+$|^[가-힣]{1,3}$', text):
            return TextRegionType.SOUND_EFFECT
        
        # Check for sound effect patterns
        sfx_patterns = [
            r'^[A-Z]{2,}$',  # BAM, CRASH
            r'^[가-힣]{1,3}$',  # Korean onomatopoeia
            r'^[ア-ン]{1,4}$',  # Katakana (Japanese sound effects)
        ]
        for pattern in sfx_patterns:
            if re.match(pattern, text):
                return TextRegionType.SOUND_EFFECT
        
        # Check position - narration boxes often at top or in boxes
        x1, y1, x2, y2 = bbox
        img_width, img_height = image_size
        
        # Title often at the top center
        if y1 < img_height * 0.15:
            if len(text) > 15:  # Longer text at top = title
                return TextRegionType.TITLE
        
        # Default to speech bubble
        return TextRegionType.SPEECH_BUBBLE


class MangaTranslator:
    """
    Translate manga text with context awareness.
    Handles dialogue, sound effects, and narration differently.
    """
    
    def __init__(
        self,
        openai_api_key: str = None,
        gemini_api_key: str = None,
        model: str = "gpt-4o",
    ):
        self.openai_api_key = openai_api_key
        self.gemini_api_key = gemini_api_key
        self.model = model
        
        self._openai_client = None
        self._gemini_client = None
    
    def _get_openai_client(self) -> AsyncOpenAI:
        if self._openai_client is None:
            if not self.openai_api_key:
                raise ValueError("OpenAI API key required")
            self._openai_client = AsyncOpenAI(api_key=self.openai_api_key)
        return self._openai_client
    
    async def translate_regions(
        self,
        regions: List[TextRegion],
        context: MangaTranslationContext,
        source_lang: SourceLanguage,
    ) -> List[TextRegion]:
        """
        Translate all text regions in a manga panel with context.
        
        Args:
            regions: List of text regions to translate
            context: Manga context (characters, tone, etc.)
            source_lang: Source language
            
        Returns:
            List of TextRegion with translated_text populated
        """
        if not regions:
            return regions
        
        # Group regions by type for batch translation
        speech_regions = [r for r in regions if r.region_type == TextRegionType.SPEECH_BUBBLE]
        narration_regions = [r for r in regions if r.region_type == TextRegionType.NARRATION_BOX]
        sfx_regions = [r for r in regions if r.region_type == TextRegionType.SOUND_EFFECT]
        other_regions = [r for r in regions if r.region_type not in 
                        [TextRegionType.SPEECH_BUBBLE, TextRegionType.NARRATION_BOX, TextRegionType.SOUND_EFFECT]]
        
        # Translate each group
        if speech_regions:
            await self._translate_dialogue(speech_regions, context, source_lang)
        
        if narration_regions:
            await self._translate_narration(narration_regions, context, source_lang)
        
        if sfx_regions:
            await self._translate_sfx(sfx_regions, source_lang)
        
        if other_regions:
            await self._translate_other(other_regions, context, source_lang)
        
        return regions
    
    async def _translate_dialogue(
        self,
        regions: List[TextRegion],
        context: MangaTranslationContext,
        source_lang: SourceLanguage,
    ):
        """Translate dialogue with character context"""
        client = self._get_openai_client()
        
        # Build dialogue context
        dialogue_context = "\n".join([
            f"Speaker: {d['speaker']}, Text: {d['text']}"
            for d in context.previous_dialogues[-5:]  # Last 5 dialogues
        ])
        
        character_info = "\n".join([
            f"- {c['name']}: {c.get('personality', 'unknown')}"
            for c in context.characters
        ])
        
        lang_name = {
            SourceLanguage.KOREAN: "Korean",
            SourceLanguage.JAPANESE: "Japanese",
            SourceLanguage.CHINESE: "Chinese",
            SourceLanguage.CHINESE_TRAD: "Traditional Chinese",
            SourceLanguage.ENGLISH: "English"
        }.get(source_lang, "Foreign language")
        
        # Build text to translate
        texts_to_translate = [r.text for r in regions]
        
        prompt = f"""You are a professional manga/manhwa translator from {lang_name} to Thai.

## Series Context
- Title: {context.series_title}
- Setting: {context.setting}
- Tone: {context.tone}

## Characters
{character_info if character_info else "No specific character info"}

## Recent Dialogue
{dialogue_context if dialogue_context else "This is the beginning"}

## Texts to Translate (dialogue)
{texts_to_translate}

---

**Translation Guidelines for Manga/Manhwa:**
1. Keep dialogue natural and conversational
2. Match character personality in speech style
3. Use appropriate Thai pronouns based on character relationships
4. Keep sound effects as-is or transliterate (e.g., "쾅!" -> "ควั๊ง!")
5. Maintain the emotional tone of each line
6. Don't add explanations - just translate naturally

**Output Format:** Return a JSON array of translated strings, one for each input text:
```json
["translated1", "translated2", ...]
```
"""
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a professional manga translator. Always return valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        
        # Parse response
        try:
            content = response.choices[0].message.content
            # Extract JSON array from response
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                translations = json.loads(json_match.group())
            else:
                translations = json.loads(content)
            
            # Apply translations
            for i, region in enumerate(regions):
                if i < len(translations):
                    region.translated_text = translations[i]
                else:
                    region.translated_text = region.text  # Fallback
                    
        except Exception as e:
            print(f"Translation parsing error: {e}")
            for region in regions:
                region.translated_text = region.text
    
    async def _translate_narration(
        self,
        regions: List[TextRegion],
        context: MangaTranslationContext,
        source_lang: SourceLanguage,
    ):
        """Translate narration text"""
        client = self._get_openai_client()
        
        lang_name = {
            SourceLanguage.KOREAN: "Korean",
            SourceLanguage.JAPANESE: "Japanese",
            SourceLanguage.CHINESE: "Chinese",
        }.get(source_lang, "Asian language")
        
        texts_to_translate = [r.text for r in regions]
        
        prompt = f"""Translate these manga narration texts from {lang_name} to Thai.

Narration in manga is usually:
- Third-person perspective
- Descriptive and atmospheric
- Sets the scene or mood

Texts to translate:
{texts_to_translate}

Return only a JSON array of translations:
```json
["translation1", "translation2", ...]
```
"""
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a manga translator. Return only JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.3,
        )
        
        try:
            content = response.choices[0].message.content
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                translations = json.loads(json_match.group())
            else:
                translations = json.loads(content)
            
            for i, region in enumerate(regions):
                if i < len(translations):
                    region.translated_text = translations[i]
                else:
                    region.translated_text = region.text
        except Exception as e:
            logger.warning(f"Operation failed: {e}")
            for region in regions:
                region.translated_text = region.text
    
    async def _translate_sfx(
        self,
        regions: List[TextRegion],
        source_lang: SourceLanguage,
    ):
        """Translate sound effects"""
        # Sound effects are often kept as-is or transliterated
        sfx_map = {
            # Korean
            "쾅": "ควั๊ง!",  # Bang
            "탁": "ตึก!",   # Tap/hit
            "슈웅": "ชูว์!", # Whoosh
            "우와": "ว้า!",  # Wow
            "으악": "แอ๊ก!", # Scream
            # Japanese
            "ドン": "ดน!",   # Don/bang
            "バン": "บัง!",  # Bang
            "ガッ": "กัซ!",  # Grab
            # Chinese
            "砰": "เพิ้ง!",  # Bang
            "啪": "ปั๊!",    # Slap
        }
        
        for region in regions:
            # Check if we have a predefined translation
            if region.text in sfx_map:
                region.translated_text = sfx_map[region.text]
            else:
                # Keep original or transliterate
                region.translated_text = self._transliterate_sfx(region.text, source_lang)
    
    def _transliterate_sfx(self, text: str, source_lang: SourceLanguage) -> str:
        """Transliterate sound effect to Thai"""
        # Simple transliteration rules
        # In production, use proper transliteration library
        return text  # Keep original for now
    
    async def _translate_other(
        self,
        regions: List[TextRegion],
        context: MangaTranslationContext,
        source_lang: SourceLanguage,
    ):
        """Translate other text types (signs, titles, etc.)"""
        client = self._get_openai_client()
        
        lang_name = {
            SourceLanguage.KOREAN: "Korean",
            SourceLanguage.JAPANESE: "Japanese",
            SourceLanguage.CHINESE: "Chinese",
        }.get(source_lang, "Asian language")
        
        texts_to_translate = [r.text for r in regions]
        
        prompt = f"""Translate these manga texts from {lang_name} to Thai.
These include titles, signs, and other text.

Texts:
{texts_to_translate}

Return only a JSON array:
```json
["translation1", ...]
```
"""
        
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a manga translator. Return only JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.3,
        )
        
        try:
            content = response.choices[0].message.content
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                translations = json.loads(json_match.group())
            else:
                translations = json.loads(content)
            
            for i, region in enumerate(regions):
                if i < len(translations):
                    region.translated_text = translations[i]
                else:
                    region.translated_text = region.text
        except Exception as e:
            logger.warning(f"Operation failed: {e}")
            for region in regions:
                region.translated_text = region.text


class MangaImageRenderer:
    """
    Render translated text onto manga images.
    Handles text placement, font matching, and background cleanup.
    """
    
    def __init__(self, font_dir: str = None):
        """
        Initialize image renderer.
        
        Args:
            font_dir: Directory containing Thai fonts
        """
        self.font_dir = font_dir or os.path.join(os.path.dirname(__file__), "fonts")
        self._fonts: Dict[str, ImageFont.FreeTypeFont] = {}
        
        # Default fonts to try
        self.default_fonts = [
            "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "arial.ttf",
        ]
    
    def _get_font(self, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
        """Get a font for text rendering"""
        key = f"{'bold' if bold else 'regular'}_{size}"
        
        if key not in self._fonts:
            font = None
            
            # Try to load a font
            for font_path in self.default_fonts:
                try:
                    font = ImageFont.truetype(font_path, size)
                    break
                except Exception as e:
                    logger.warning(f"Failed to load font {font_path}: {e}")
                    continue
            
            if font is None:
                # Fallback to default
                font = ImageFont.load_default()
            
            self._fonts[key] = font
        
        return self._fonts[key]
    
    def render_translation(
        self,
        image: Image.Image,
        regions: List[TextRegion],
        style: str = "overlay",  # overlay, inpaint, side_by_side
    ) -> Image.Image:
        """
        Render translated text onto image.
        
        Args:
            image: Original manga image
            regions: List of text regions with translations
            style: Rendering style
            
        Returns:
            Image with translated text
        """
        # Create a copy of the image
        result = image.copy()
        
        if style == "side_by_side":
            return self._render_side_by_side(image, regions)
        
        draw = ImageDraw.Draw(result)
        
        for region in regions:
            if not region.translated_text:
                continue
            
            x1, y1, x2, y2 = region.bbox
            
            # Calculate text box dimensions
            box_width = x2 - x1
            box_height = y2 - y1
            
            # Determine font size
            font_size = self._calculate_font_size(
                region.translated_text,
                box_width,
                box_height,
                region.font_size
            )
            
            font = self._get_font(font_size)
            
            if style == "inpaint":
                # First, remove original text (white fill)
                draw.rectangle([x1-2, y1-2, x2+2, y2+2], fill="white")
            
            # Word wrap the text
            wrapped_text = self._wrap_text(
                region.translated_text,
                font,
                box_width - 4
            )
            
            # Calculate text position (center in bbox)
            text_bbox = draw.textbbox((0, 0), wrapped_text, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            
            text_x = x1 + (box_width - text_width) // 2
            text_y = y1 + (box_height - text_height) // 2
            
            # Draw background for readability (optional)
            if style == "overlay":
                # Semi-transparent background
                overlay = Image.new('RGBA', result.size, (255, 255, 255, 0))
                overlay_draw = ImageDraw.Draw(overlay)
                overlay_draw.rectangle(
                    [x1-4, y1-4, x2+4, y2+4],
                    fill=(255, 255, 255, 200)
                )
                result = result.convert('RGBA')
                result = Image.alpha_composite(result, overlay)
                draw = ImageDraw.Draw(result)
            
            # Draw text
            result = result.convert('RGB')
            draw = ImageDraw.Draw(result)
            
            # Text color (black or white based on background)
            text_color = region.color if region.color else "#000000"
            
            draw.multiline_text(
                (text_x, text_y),
                wrapped_text,
                font=font,
                fill=text_color,
                align="center"
            )
        
        return result
    
    def _render_side_by_side(
        self,
        image: Image.Image,
        regions: List[TextRegion],
    ) -> Image.Image:
        """Create side-by-side comparison image"""
        width, height = image.size
        
        # Create new image with double width
        result = Image.new('RGB', (width * 2 + 20, height), 'white')
        result.paste(image, (0, 0))
        
        # Render translated version
        translated = self.render_translation(image, regions, style="overlay")
        result.paste(translated, (width + 20, 0))
        
        # Add labels
        draw = ImageDraw.Draw(result)
        font = self._get_font(16)
        draw.text((10, 10), "Original", fill="black", font=font)
        draw.text((width + 30, 10), "Translated", fill="black", font=font)
        
        return result
    
    def _calculate_font_size(
        self,
        text: str,
        box_width: int,
        box_height: int,
        original_size: int
    ) -> int:
        """Calculate appropriate font size to fit text in box"""
        # Start with original size and reduce if needed
        font_size = original_size
        
        # Estimate text dimensions
        char_width = font_size * 0.6  # Approximate
        chars_per_line = box_width // char_width
        lines = len(text) // chars_per_line + 1
        estimated_height = lines * font_size * 1.2
        
        # Reduce if too big
        while estimated_height > box_height and font_size > 8:
            font_size -= 1
            char_width = font_size * 0.6
            chars_per_line = box_width // char_width
            lines = len(text) // chars_per_line + 1
            estimated_height = lines * font_size * 1.2
        
        return font_size
    
    def _wrap_text(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
        """Wrap text to fit within max_width"""
        words = text.split()
        lines = []
        current_line = ""
        
        for word in words:
            test_line = current_line + " " + word if current_line else word
            bbox = font.getbbox(test_line)
            if bbox[2] - bbox[0] <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        
        if current_line:
            lines.append(current_line)
        
        return "\n".join(lines)


class MangaTranslationPipeline:
    """
    Complete pipeline for manga translation.
    OCR -> Translate -> Render
    """
    
    def __init__(
        self,
        openai_api_key: str = None,
        gemini_api_key: str = None,
        model: str = "gpt-4o",
        languages: List[str] = None,
    ):
        self.ocr = MangaOCRExtractor(languages=languages)
        self.translator = MangaTranslator(
            openai_api_key=openai_api_key,
            gemini_api_key=gemini_api_key,
            model=model,
        )
        self.renderer = MangaImageRenderer()
    
    async def translate_image(
        self,
        image: Image.Image,
        source_lang: SourceLanguage = SourceLanguage.KOREAN,
        context: MangaTranslationContext = None,
        render_style: str = "overlay",
    ) -> MangaTranslationResult:
        """
        Complete manga translation pipeline.
        
        Args:
            image: PIL Image of manga page
            source_lang: Source language
            context: Translation context
            render_style: How to render translated text
            
        Returns:
            MangaTranslationResult with translated image
        """
        if context is None:
            context = MangaTranslationContext()
        
        # Step 1: Extract text regions
        regions = self.ocr.extract_text(image)
        
        # Step 2: Translate
        regions = await self.translator.translate_regions(
            regions, context, source_lang
        )
        
        # Step 3: Render
        translated_image = self.renderer.render_translation(
            image, regions, style=render_style
        )
        
        # Convert to bytes
        original_bytes = BytesIO()
        image.save(original_bytes, format='PNG')
        
        translated_bytes = BytesIO()
        translated_image.save(translated_bytes, format='PNG')
        
        return MangaTranslationResult(
            original_image=original_bytes.getvalue(),
            translated_image=translated_bytes.getvalue(),
            regions=regions,
            model_used=self.translator.model,
            provider="openai",
        )
    
    async def translate_image_file(
        self,
        image_path: str,
        output_path: str,
        source_lang: SourceLanguage = SourceLanguage.KOREAN,
        context: MangaTranslationContext = None,
    ) -> MangaTranslationResult:
        """Translate a manga image file"""
        image = Image.open(image_path)
        result = await self.translate_image(image, source_lang, context)
        
        # Save translated image
        translated = Image.open(BytesIO(result.translated_image))
        translated.save(output_path)
        
        return result


# ==================== API Functions ====================

def create_manga_translator(
    openai_api_key: str = None,
    gemini_api_key: str = None,
    model: str = "gpt-4o",
    source_lang: str = "ko"
) -> MangaTranslationPipeline:
    """Factory function to create manga translator"""
    
    
    return MangaTranslationPipeline(
        openai_api_key=openai_api_key,
        gemini_api_key=gemini_api_key,
        model=model,
        languages=[source_lang, "en"] if source_lang != "en" else ["en"],
    )
