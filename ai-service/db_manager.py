"""
Database Manager for Multi-Agent Translation Pipeline
Handles PostgreSQL persistence for review queue, quality scores, and pipeline results.
"""

import os
import json
import asyncio
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

import asyncpg
from asyncpg import Pool


# ==================== DATABASE MODELS ====================

@dataclass
class ReviewQueueDB:
    """Review queue database model"""
    id: str
    novel_id: str
    chapter_number: int
    original_text: str
    translated_text: str
    grade: str
    overall_score: float
    issues: List[str]
    strengths: List[str]
    status: str
    priority: int
    notes: str
    edited_text: Optional[str]
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime


@dataclass
class QualityScoreDB:
    """Quality score database model"""
    id: str
    chapter_id: str
    grade: str
    overall_score: float
    terminology_score: float
    flow_score: float
    accuracy_score: float
    dialogue_score: float
    issues: List[str]
    strengths: List[str]


@dataclass
class CharacterProfileDB:
    """Character profile database model"""
    id: str
    novel_id: str
    original_name: str
    thai_name: str
    personality: str
    role: str
    dialogue_style: str


# ==================== DATABASE MANAGER ====================

class DatabaseManager:
    """
    Manages PostgreSQL connections and operations for the translation pipeline.
    Uses asyncpg for async database operations.
    """
    
    def __init__(self, database_url: str = None):
        self.database_url = database_url or os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bookreading")
        self._pool: Optional[Pool] = None
    
    async def get_pool(self) -> Pool:
        """Get or create connection pool"""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=2,
                max_size=10,
            )
        return self._pool
    
    async def close(self):
        """Close connection pool"""
        if self._pool:
            await self._pool.close()
            self._pool = None
    
    # ==================== REVIEW QUEUE OPERATIONS ====================
    
    async def add_to_review_queue(
        self,
        item_id: str,
        novel_id: str,
        chapter_number: int,
        original_text: str,
        translated_text: str,
        grade: str,
        overall_score: float,
        issues: List[str],
        strengths: List[str],
        priority: int = 3,
        novel_title: str = "",
        chapter_title: str = "",
    ) -> str:
        """Add item to review queue"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO review_queue 
                (id, novel_id, novel_title, chapter_number, chapter_title, original_text, translated_text, 
                 grade, overall_score, issues, strengths, status, priority)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    translated_text = EXCLUDED.translated_text,
                    grade = EXCLUDED.grade,
                    overall_score = EXCLUDED.overall_score,
                    issues = EXCLUDED.issues,
                    strengths = EXCLUDED.strengths,
                    status = 'pending',
                    priority = EXCLUDED.priority,
                    novel_title = EXCLUDED.novel_title,
                    chapter_title = EXCLUDED.chapter_title
            """, 
                item_id, novel_id, novel_title, chapter_number, chapter_title, 
                original_text, translated_text,
                grade, overall_score, json.dumps(issues), json.dumps(strengths), 
                'pending', priority
            )
        
        return item_id
    
    async def get_pending_reviews(self, novel_id: str = None, limit: int = 20) -> List[Dict]:
        """Get pending reviews sorted by priority"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            if novel_id:
                rows = await conn.fetch("""
                    SELECT * FROM review_queue 
                    WHERE status = 'pending' AND novel_id = $1
                    ORDER BY priority DESC, created_at ASC
                    LIMIT $2
                """, novel_id, limit)
            else:
                rows = await conn.fetch("""
                    SELECT * FROM review_queue 
                    WHERE status = 'pending'
                    ORDER BY priority DESC, created_at ASC
                    LIMIT $1
                """, limit)
        
        return [self._row_to_dict(row) for row in rows]
    
    async def get_review_item(self, item_id: str) -> Optional[Dict]:
        """Get a specific review item"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM review_queue WHERE id = $1
            """, item_id)
        
        return self._row_to_dict(row) if row else None
    
    async def approve_review(self, item_id: str, reviewer: str = "anonymous") -> bool:
        """Approve a review item"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE review_queue 
                SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
                WHERE id = $1
            """, item_id, reviewer)
        
        return result == "UPDATE 1"
    
    async def edit_review(self, item_id: str, edited_text: str, reviewer: str = "anonymous") -> bool:
        """Edit and approve a review item"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE review_queue 
                SET status = 'edited', edited_text = $2, reviewed_by = $3, reviewed_at = NOW()
                WHERE id = $1
            """, item_id, edited_text, reviewer)
        
        return result == "UPDATE 1"
    
    async def reject_review(self, item_id: str, reviewer: str = "anonymous", notes: str = "") -> bool:
        """Reject a review item"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE review_queue 
                SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), notes = $3
                WHERE id = $1
            """, item_id, reviewer, notes)
        
        return result == "UPDATE 1"
    
    async def get_approved_translation(self, novel_id: str, chapter_number: int) -> Optional[Dict]:
        """Get approved translation for a chapter"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM review_queue 
                WHERE novel_id = $1 AND chapter_number = $2 
                AND status IN ('approved', 'edited')
                ORDER BY reviewed_at DESC
                LIMIT 1
            """, novel_id, chapter_number)
        
        return self._row_to_dict(row) if row else None
    
    async def get_review_stats(self) -> Dict:
        """Get review queue statistics"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            stats = await conn.fetchrow("""
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status IN ('approved', 'edited')) as approved,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                    COUNT(*) as total
                FROM review_queue
            """)
        
        return {
            "pending": stats["pending"] or 0,
            "approved": stats["approved"] or 0,
            "rejected": stats["rejected"] or 0,
            "total_processed": (stats["approved"] or 0) + (stats["rejected"] or 0),
        }
    
    # ==================== QUALITY SCORE OPERATIONS ====================
    
    async def save_quality_score(
        self,
        chapter_id: str,
        grade: str,
        overall_score: float,
        terminology_score: float,
        flow_score: float,
        accuracy_score: float,
        dialogue_score: float,
        issues: List[str],
        strengths: List[str],
    ) -> str:
        """Save quality score for a chapter"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO translation_quality_scores 
                (chapter_id, grade, overall_score, terminology_score, flow_score, 
                 accuracy_score, dialogue_score, issues, strengths)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            """,
                chapter_id, grade, overall_score, terminology_score, flow_score,
                accuracy_score, dialogue_score, json.dumps(issues), json.dumps(strengths)
            )
        
        return str(row["id"])
    
    async def get_quality_score(self, chapter_id: str) -> Optional[Dict]:
        """Get latest quality score for a chapter"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM translation_quality_scores 
                WHERE chapter_id = $1 
                ORDER BY created_at DESC 
                LIMIT 1
            """, chapter_id)
        
        return self._row_to_dict(row) if row else None
    
    # ==================== AGENT PIPELINE RESULTS ====================
    
    async def save_agent_result(
        self,
        chapter_id: str,
        agent_role: str,
        input_text: str,
        output_text: str,
        issues_found: List[str],
        suggestions: List[str],
        tokens_used: int,
        processing_time: float,
    ) -> str:
        """Save agent pipeline result"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO agent_pipeline_results 
                (chapter_id, agent_role, input_text, output_text, issues_found, 
                 suggestions, tokens_used, processing_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            """,
                chapter_id, agent_role, input_text, output_text,
                json.dumps(issues_found), json.dumps(suggestions),
                tokens_used, processing_time
            )
        
        return str(row["id"])
    
    # ==================== TRANSLATION SESSIONS ====================
    
    async def save_translation_session(
        self,
        novel_id: str,
        chapter_number: int,
        final_text: str,
        total_tokens: int,
        total_time: float,
        needs_review: bool,
        review_queue_id: str = None,
        model_used: str = "gpt-4o",
    ) -> str:
        """Save translation session"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO translation_sessions 
                (novel_id, chapter_number, final_text, total_tokens, total_time, 
                 needs_review, review_queue_id, model_used)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            """,
                novel_id, chapter_number, final_text, total_tokens, total_time,
                needs_review, review_queue_id, model_used
            )
        
        return str(row["id"])
    
    # ==================== CHARACTER PROFILES ====================
    
    async def save_character_profile(
        self,
        novel_id: str,
        original_name: str,
        thai_name: str,
        personality: str = "",
        role: str = "",
        dialogue_style: str = "",
    ) -> str:
        """Save or update character profile"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO character_profiles 
                (novel_id, original_name, thai_name, personality, role, dialogue_style)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (novel_id, original_name) DO UPDATE SET
                    thai_name = EXCLUDED.thai_name,
                    personality = EXCLUDED.personality,
                    role = EXCLUDED.role,
                    dialogue_style = EXCLUDED.dialogue_style
                RETURNING id
            """,
                novel_id, original_name, thai_name, personality, role, dialogue_style
            )
        
        return str(row["id"])
    
    async def get_character_profiles(self, novel_id: str) -> List[Dict]:
        """Get all character profiles for a novel"""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM character_profiles WHERE novel_id = $1
            """, novel_id)
        
        return [self._row_to_dict(row) for row in rows]
    
    # ==================== HELPER METHODS ====================
    
    def _row_to_dict(self, row) -> Dict:
        """Convert asyncpg Record to dict, handling JSON fields"""
        if row is None:
            return None
        
        result = dict(row)
        
        # Parse JSON fields
        for key in ['issues', 'strengths', 'issues_found', 'suggestions']:
            if key in result and isinstance(result[key], str):
                try:
                    result[key] = json.loads(result[key])
                except:
                    pass
        
        # Convert datetime to ISO format
        for key in ['created_at', 'updated_at', 'reviewed_at']:
            if key in result and result[key] is not None:
                result[key] = result[key].isoformat()
        
        return result


# ==================== GLOBAL INSTANCE ====================

# Global database manager instance
db_manager: Optional[DatabaseManager] = None


async def get_db_manager() -> DatabaseManager:
    """Get or create database manager instance"""
    global db_manager
    if db_manager is None:
        db_manager = DatabaseManager()
    return db_manager


async def close_db():
    """Close database connections"""
    global db_manager
    if db_manager:
        await db_manager.close()
        db_manager = None
