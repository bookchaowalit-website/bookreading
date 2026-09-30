"""
Tests for improved AI pipeline components:
- Translation caching
- Enhanced context manager
- Smart chunking
"""

import pytest
from translation_cache import TranslationCache
from context_manager import EnhancedContextManager
from smart_chunker import SmartChunker


class TestTranslationCache:
    """Test translation caching layer"""

    def test_basic_cache(self):
        cache = TranslationCache()
        
        # Cache a translation
        cache.set(
            source_text="云澈走进了深渊",
            translated_text="หยุนเช่อ走进了เหวี่ยนลึก",
            source_lang="zh",
            target_lang="th",
            provider="openai",
        )
        
        # Retrieve it
        result = cache.get("云澈走进了深渊", "zh", "th")
        assert result == "หยุนเช่อ走进了เหวี่ยนลึก"
        
    def test_cache_miss(self):
        cache = TranslationCache()
        result = cache.get("不存在的文本", "zh", "th")
        assert result is None
    
    def test_terminology_aware_cache(self):
        cache = TranslationCache()
        terminology = [{"original": "云澈", "translation": "หยุนเช่อ"}]
        
        # Cache with terminology
        cache.set(
            source_text="云澈走进房间",
            translated_text="หยุนเช่อ走进房间",
            source_lang="zh",
            target_lang="th",
            provider="openai",
            terminology=terminology,
        )
        
        # Same text, different terminology = cache miss
        diff_terminology = [{"original": "云澈", "translation": "หยุนเช่อใหม่"}]
        result = cache.get("云澈走进房间", "zh", "th", terminology=diff_terminology)
        assert result is None  # Different terminology shouldn't match
    
    def test_cache_ttl(self):
        cache = TranslationCache(ttl=1)  # 1 second TTL
        cache.set("test", "translated", "zh", "th", "openai")
        
        # Should be cached
        assert cache.get("test", "zh", "th") == "translated"
        
    def test_cache_eviction(self):
        cache = TranslationCache(max_size=3)
        
        # Add 4 items
        for i in range(4):
            cache.set(f"text{i}", f"translation{i}", "zh", "th", "openai")
        
        # Should have evicted at least one
        assert cache.size <= 3
    
    def test_hit_rate(self):
        cache = TranslationCache()
        cache.set("test", "translated", "zh", "th", "openai")
        
        cache.get("test", "zh", "th")  # Hit
        cache.get("missing", "zh", "th")  # Miss
        
        stats = cache.get_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert "50.0%" in stats["hit_rate"]


class TestEnhancedContextManager:
    """Test enhanced context management"""

    def test_add_character(self):
        ctx = EnhancedContextManager()
        ctx.add_character("云澈", "หยุนเช่อ", role="main")
        ctx.add_character("沐玄音", "มู่เสวียนอิ่น", role="supporting")
        
        char_map = ctx.get_character_map()
        assert char_map["云澈"] == "หยุนเช่อ"
        assert char_map["沐玄音"] == "มู่เสวียนอิ่น"
    
    def test_chapter_summaries_limited(self):
        ctx = EnhancedContextManager(context_chapters=3)
        
        # Add 5 chapters
        for i in range(1, 6):
            ctx.add_chapter_summary(
                chapter_num=i,
                title=f"Chapter {i}",
                source_text=f"Source text {i}" * 100,
                translated_text=f"Translation {i}" * 100,
            )
        
        # Should only keep last 3
        assert len(ctx.chapter_summaries) == 3
        assert ctx.chapter_summaries[0].chapter_number == 3
    
    def test_context_prompt_building(self):
        ctx = EnhancedContextManager()
        ctx.set_novel_info("Against the Gods")
        ctx.add_character("云澈", "หยุนเช่อ", role="main")
        ctx.add_chapter_summary(
            chapter_num=1,
            title="Chapter 1",
            source_text="云澈走进了深渊",
            translated_text="หยุนเช่อ走进了เหวี่ยนลึก",
        )
        
        prompt = ctx.build_context_prompt(current_chapter=2)
        
        assert "Against the Gods" in prompt
        assert "云澈" in prompt
        assert "หยุนเช่อ" in prompt
        assert "Chapter 1" in prompt
    
    def test_clear(self):
        ctx = EnhancedContextManager()
        ctx.add_character("云澈", "หยุนเช่อ")
        ctx.add_chapter_summary(1, "Ch1", "text", "translation")
        
        ctx.clear()
        
        assert len(ctx.characters) == 0
        assert len(ctx.chapter_summaries) == 0


class TestSmartChunker:
    """Test smart chunking"""

    def test_small_text_no_chunking(self):
        chunker = SmartChunker(max_chunk_chars=800)
        text = "This is a short text"
        
        chunks = chunker.chunk_text(text)
        assert len(chunks) == 1
        assert chunks[0].text == text
    
    def test_scene_break_splitting(self):
        chunker = SmartChunker(max_chunk_chars=200)
        
        # Text with scene breaks
        text = (
            "Scene one with some text that is long enough to need chunking. " * 3
            + "\n\n***\n\n"  # Scene break
            + "Scene two with different content that continues. " * 3
        )
        
        chunks = chunker.chunk_text(text)
        assert len(chunks) >= 2  # Should split at scene break
    
    def test_paragraph_splitting(self):
        chunker = SmartChunker(max_chunk_chars=150)
        
        # Multiple paragraphs
        text = "\n\n".join([
            "First paragraph with enough content to be meaningful. " * 2,
            "Second paragraph that continues the narrative. " * 2,
            "Third paragraph with dialogue and action. " * 2,
        ])
        
        chunks = chunker.chunk_text(text)
        assert len(chunks) >= 1
    
    def test_chunk_context_overlap(self):
        chunker = SmartChunker(max_chunk_chars=100, overlap_chars=20)
        text = "A" * 250  # Long text
        
        chunks = chunker.chunk_text(text)
        
        # Second chunk should have context from first
        if len(chunks) > 1:
            assert chunks[1].context != ""
            assert chunks[0].text[-20:] in chunks[1].context
    
    def test_reassemble_translation(self):
        chunker = SmartChunker()
        translated_chunks = ["Translation 1", "Translation 2", "Translation 3"]
        
        result = chunker.reassemble_translation(translated_chunks)
        assert "Translation 1" in result
        assert "Translation 2" in result
        assert "Translation 3" in result


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
