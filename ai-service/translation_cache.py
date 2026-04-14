"""
Translation Caching Layer
Caches translations to avoid redundant LLM API calls.
Features: Exact match, fuzzy match, terminology-aware caching.
"""

import hashlib
import json
import time
from typing import Optional, Dict, List
from dataclasses import dataclass, asdict


@dataclass
class CachedTranslation:
    """A cached translation entry"""
    source_text_hash: str
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    provider: str  # openai, gemini
    terminology_hash: str  # Hash of active terminology
    created_at: float
    usage_count: int = 1
    quality_score: float = 0.0


class TranslationCache:
    """
    In-memory translation cache with fuzzy matching support.
    Can be extended to use Redis or database for persistence.
    """
    
    def __init__(self, max_size: int = 10000, ttl: int = 86400 * 30):
        """
        Args:
            max_size: Maximum number of cached translations
            ttl: Time-to-live in seconds (default: 30 days)
        """
        self.cache: Dict[str, CachedTranslation] = {}
        self.max_size = max_size
        self.ttl = ttl
        self.hits = 0
        self.misses = 0
    
    def _compute_hash(self, text: str, terminology: Optional[List[Dict]] = None) -> str:
        """Compute hash for source text + terminology context"""
        content = text.strip().lower()
        if terminology:
            # Include terminology in hash to ensure context-aware caching
            term_str = json.dumps(sorted(
                [t.get('original', '') for t in terminology],
                key=lambda x: x
            ))
            content += f"::terms::{term_str}"
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def _compute_terminology_hash(self, terminology: Optional[List[Dict]] = None) -> str:
        """Compute hash for terminology set"""
        if not terminology:
            return "no_terms"
        term_str = json.dumps(sorted(
            [(t.get('original', ''), t.get('translation', '')) for t in terminology],
            key=lambda x: x[0]
        ))
        return hashlib.md5(term_str.encode('utf-8')).hexdigest()
    
    def get(self, source_text: str, source_lang: str, target_lang: str,
            terminology: Optional[List[Dict]] = None) -> Optional[str]:
        """
        Get cached translation if available.
        Returns translated text or None if not found.
        """
        text_hash = self._compute_hash(source_text, terminology)
        
        if text_hash in self.cache:
            cached = self.cache[text_hash]
            
            # Check TTL
            if time.time() - cached.created_at > self.ttl:
                del self.cache[text_hash]
                self.misses += 1
                return None
            
            cached.usage_count += 1
            self.hits += 1
            return cached.translated_text
        
        # Try fuzzy match for similar texts
        fuzzy_result = self._fuzzy_match(source_text, terminology)
        if fuzzy_result:
            self.hits += 1
            return fuzzy_result
        
        self.misses += 1
        return None
    
    def set(self, source_text: str, translated_text: str, source_lang: str,
            target_lang: str, provider: str, terminology: Optional[List[Dict]] = None,
            quality_score: float = 0.0):
        """Cache a new translation"""
        text_hash = self._compute_hash(source_text, terminology)
        term_hash = self._compute_terminology_hash(terminology)
        
        # Evict oldest if at capacity
        if len(self.cache) >= self.max_size:
            self._evict()
        
        self.cache[text_hash] = CachedTranslation(
            source_text_hash=text_hash,
            source_text=source_text[:500],  # Store first 500 chars for debugging
            translated_text=translated_text,
            source_lang=source_lang,
            target_lang=target_lang,
            provider=provider,
            terminology_hash=term_hash,
            created_at=time.time(),
            usage_count=1,
            quality_score=quality_score,
        )
    
    def _fuzzy_match(self, source_text: str, terminology: Optional[List[Dict]] = None,
                     threshold: float = 0.95) -> Optional[str]:
        """Find similar text in cache (exact match on 95%+ similarity)"""
        # Simple approach: check if source text is substring of cached text or vice versa
        short_text = source_text.strip()
        if len(short_text) < 50:  # Don't fuzzy match very short texts
            return None
        
        for cached in self.cache.values():
            # Check if texts share significant overlap
            if self._similarity_ratio(short_text, cached.source_text) >= threshold:
                return cached.translated_text
        
        return None
    
    def _similarity_ratio(self, text1: str, text2: str) -> float:
        """Simple similarity ratio based on shared words"""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1 & words2
        union = words1 | words2
        
        return len(intersection) / len(union)
    
    def _evict(self):
        """Remove least-used entries"""
        # Sort by usage count, remove bottom 10%
        items = sorted(self.cache.items(), key=lambda x: x[1].usage_count)
        to_remove = max(1, len(items) // 10)
        for key, _ in items[:to_remove]:
            del self.cache[key]
    
    def clear(self):
        """Clear all cached translations"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    @property
    def hit_rate(self) -> float:
        """Cache hit rate percentage"""
        total = self.hits + self.misses
        if total == 0:
            return 0.0
        return (self.hits / total) * 100
    
    @property
    def size(self) -> int:
        """Number of cached translations"""
        return len(self.cache)
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            "size": self.size,
            "max_size": self.max_size,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{self.hit_rate:.1f}%",
            "ttl_hours": self.ttl // 3600,
        }


# Global cache instance
translation_cache = TranslationCache(max_size=10000, ttl=86400 * 30)
