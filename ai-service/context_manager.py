"""
Enhanced Context Manager for Novel Translation
Passes last 3-5 chapters, character relationships, and key events.
Significantly improves translation consistency and quality.
"""

from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class CharacterInfo:
    """Information about a character in the novel"""
    original_name: str
    thai_name: str
    role: str = "supporting"  # main, supporting, minor
    relationships: List[str] = field(default_factory=list)  # Related characters
    first_appearance_chapter: int = 0
    last_seen_chapter: int = 0
    notes: str = ""


@dataclass
class ChapterSummary:
    """Summary of a translated chapter"""
    chapter_number: int
    title: str
    first_200_chars: str  # First 200 chars of source
    translated_first_200: str  # First 200 chars of translation
    key_events: List[str] = field(default_factory=list)
    characters_present: List[str] = field(default_factory=list)


class EnhancedContextManager:
    """
    Manages context for translation with:
    - Last N chapters of context (configurable, default 3)
    - Character relationship map
    - Key events tracking
    - Terminology consistency
    """
    
    def __init__(self, context_chapters: int = 3, max_context_chars: int = 2000):
        """
        Args:
            context_chapters: Number of previous chapters to include as context
            max_context_chars: Maximum characters of context to pass to LLM
        """
        self.context_chapters = context_chapters
        self.max_context_chars = max_context_chars
        
        self.novel_title: str = ""
        self.characters: Dict[str, CharacterInfo] = {}
        self.chapter_summaries: List[ChapterSummary] = []
        self.current_terminology: List[Dict] = []
    
    def set_novel_info(self, title: str, genre: str = "", tone: str = "dramatic"):
        """Set novel metadata"""
        self.novel_title = title
        self.genre = genre
        self.tone = tone
    
    def add_character(self, original_name: str, thai_name: str, role: str = "supporting",
                     relationships: Optional[List[str]] = None, notes: str = ""):
        """Add or update a character"""
        self.characters[original_name] = CharacterInfo(
            original_name=original_name,
            thai_name=thai_name,
            role=role,
            relationships=relationships or [],
            notes=notes,
        )
    
    def add_chapter_summary(self, chapter_num: int, title: str, source_text: str,
                           translated_text: str, events: Optional[List[str]] = None,
                           characters_present: Optional[List[str]] = None):
        """Add a chapter summary to context"""
        summary = ChapterSummary(
            chapter_number=chapter_num,
            title=title,
            first_200_chars=source_text[:200],
            translated_first_200=translated_text[:200],
            key_events=events or [],
            characters_present=characters_present or [],
        )
        
        self.chapter_summaries.append(summary)
        
        # Keep only last N chapters
        if len(self.chapter_summaries) > self.context_chapters:
            self.chapter_summaries = self.chapter_summaries[-self.context_chapters:]
    
    def set_terminology(self, terms: List[Dict]):
        """Set current terminology"""
        self.current_terminology = terms
    
    def build_context_prompt(self, current_chapter: int) -> str:
        """Build context prompt for the LLM"""
        parts = []
        
        # Novel info
        if self.novel_title:
            parts.append(f"Novel: {self.novel_title}")
        
        # Character relationship map
        if self.characters:
            char_lines = ["\n## Character Relationships"]
            for char in self.characters.values():
                rels = ", ".join(char.relationships) if char.relationships else "N/A"
                char_lines.append(
                    f"- {char.original_name} ({char.thai_name}) [{char.role}] "
                    f"→ Related to: {rels}"
                )
            parts.append("\n".join(char_lines))
        
        # Recent chapter context
        if self.chapter_summaries:
            context_lines = ["\n## Recent Context"]
            total_chars = 0
            
            for summary in reversed(self.chapter_summaries):
                if total_chars >= self.max_context_chars:
                    break
                
                ctx = (
                    f"\n[Chapter {summary.chapter_number}: {summary.title}]\n"
                    f"Opening: {summary.first_200_chars}...\n"
                    f"Translation: {summary.translated_first_200}...\n"
                )
                
                if summary.key_events:
                    ctx += f"Events: {', '.join(summary.key_events[:3])}\n"
                
                context_lines.append(ctx)
                total_chars += len(ctx)
            
            parts.append("".join(context_lines))
        
        # Terminology reminder
        if self.current_terminology:
            term_lines = ["\n## Terminology (MUST use these translations)"]
            for term in self.current_terminology[:20]:  # Top 20 terms
                term_lines.append(
                    f"- {term.get('original', '')} → {term.get('translation', '')}"
                )
            parts.append("\n".join(term_lines))
        
        return "\n\n".join(parts)
    
    def get_character_map(self) -> Dict[str, str]:
        """Get character name mapping as dict"""
        return {
            char.original_name: char.thai_name
            for char in self.characters.values()
        }
    
    def get_active_characters(self) -> List[Tuple[str, str]]:
        """Get list of (original, thai) for characters seen recently"""
        recent_chars = set()
        for summary in self.chapter_summaries:
            recent_chars.update(summary.characters_present)
        
        return [
            (char.original_name, char.thai_name)
            for char in self.characters.values()
            if char.original_name in recent_chars or char.role == "main"
        ]
    
    def clear(self):
        """Reset all context"""
        self.characters.clear()
        self.chapter_summaries.clear()
        self.current_terminology.clear()
        self.novel_title = ""
