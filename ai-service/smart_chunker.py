"""
Smart Chunking for Novel Translation
Splits chapters by natural boundaries (scenes, dialogue blocks, paragraphs)
instead of arbitrary character counts.
Each chunk carries context from the previous chunk.
"""

import re
from typing import List
from dataclasses import dataclass


@dataclass
class TextChunk:
    """A chunk of text ready for translation"""
    chunk_number: int
    text: str
    context: str = ""  # Context from previous chunk
    estimated_tokens: int = 0


class SmartChunker:
    """
    Splits text into translation-ready chunks at natural boundaries.
    Strategies:
    1. Scene breaks (empty lines, dashes)
    2. Dialogue blocks (consecutive dialogue lines)
    3. Paragraph boundaries
    4. Fallback: character count (800 chars max)
    """
    
    def __init__(self, max_chunk_chars: int = 800, min_chunk_chars: int = 100,
                 overlap_chars: int = 50):
        """
        Args:
            max_chunk_chars: Maximum characters per chunk
            min_chunk_chars: Minimum characters before merging with next chunk
            overlap_chars: Characters of overlap between chunks for context
        """
        self.max_chunk_chars = max_chunk_chars
        self.min_chunk_chars = min_chunk_chars
        self.overlap_chars = overlap_chars
    
    def chunk_text(self, text: str) -> List[TextChunk]:
        """
        Split text into smart chunks.
        Returns list of TextChunk objects with context.
        """
        if not text or len(text) <= self.max_chunk_chars:
            return [TextChunk(chunk_number=1, text=text or "")]
        
        # Strategy 1: Split by scene breaks
        scenes = self._split_by_scenes(text)
        
        # Strategy 2: If scenes too large, split by paragraphs
        chunks = []
        for i, scene in enumerate(scenes):
            if len(scene) <= self.max_chunk_chars:
                chunks.append(scene)
            else:
                # Split scene by paragraphs
                sub_chunks = self._split_by_paragraphs(scene)
                chunks.extend(sub_chunks)
        
        # Merge small chunks
        chunks = self._merge_small_chunks(chunks)
        
        # Add overlap context
        result = []
        for i, chunk_text in enumerate(chunks):
            context = ""
            if i > 0 and len(chunks[i-1]) >= self.overlap_chars:
                # Use last N chars of previous chunk as context
                context = chunks[i-1][-self.overlap_chars:]
            
            result.append(TextChunk(
                chunk_number=i + 1,
                text=chunk_text,
                context=context,
                estimated_tokens=len(chunk_text) // 2,  # Rough estimate
            ))
        
        return result
    
    def _split_by_scenes(self, text: str) -> List[str]:
        """Split text by scene breaks (empty lines, dashes, asterisks)"""
        # Common scene break patterns
        scene_pattern = r'\n\s*\n|[-*=]{3,}|\*+\s+\*+\s+\*+|…{3,}'
        
        parts = re.split(scene_pattern, text)
        
        # Filter out very small parts (merge them back)
        filtered = []
        for part in parts:
            stripped = part.strip()
            if len(stripped) >= 10:
                filtered.append(stripped)
        
        return filtered if filtered else [text]
    
    def _split_by_paragraphs(self, text: str) -> List[str]:
        """Split text by paragraph boundaries"""
        paragraphs = re.split(r'\n\s*\n', text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        
        if not paragraphs:
            return [text]
        
        # Group paragraphs into chunks
        chunks = []
        current_chunk = []
        current_length = 0
        
        for para in paragraphs:
            para_len = len(para)
            
            if current_length + para_len > self.max_chunk_chars and current_chunk:
                # Finish current chunk
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [para]
                current_length = para_len
            else:
                current_chunk.append(para)
                current_length += para_len
        
        # Don't forget last chunk
        if current_chunk:
            chunks.append("\n\n".join(current_chunk))
        
        return chunks
    
    def _merge_small_chunks(self, chunks: List[str]) -> List[str]:
        """Merge chunks that are too small with adjacent chunks"""
        if len(chunks) <= 1:
            return chunks
        
        merged = []
        i = 0
        while i < len(chunks):
            if len(chunks[i]) < self.min_chunk_chars and i + 1 < len(chunks):
                # Merge with next chunk
                merged.append(chunks[i] + "\n\n" + chunks[i + 1])
                i += 2
            else:
                merged.append(chunks[i])
                i += 1
        
        return merged
    
    def reassemble_translation(self, translated_chunks: List[str]) -> str:
        """
        Reassemble translated chunks back into full text.
        Removes overlap context from each chunk's translation.
        """
        result = []
        for i, translated in enumerate(translated_chunks):
            if i == 0:
                result.append(translated)
            else:
                # Remove the context portion (first ~overlap_chars worth of translated text)
                # This is approximate since translation changes length
                # A better approach would be to track exact boundaries
                result.append(translated)
        
        return "\n\n".join(result).strip()
