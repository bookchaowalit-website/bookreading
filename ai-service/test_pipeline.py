#!/usr/bin/env python3
"""
Test script for Multi-Agent Translation Pipeline.
Tests all agents and the review queue functionality.
"""

import asyncio
import httpx
import os
import pytest
import sys
from datetime import datetime


pytestmark = pytest.mark.integration

# API URL
API_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")

# Sample Chinese text for testing
SAMPLE_TEXT = """
司空度看着云澈，眉头紧锁。

"你真的要选择这把剑？"司空度冷冷地说道，"这把霸天巨剑虽然品级极高，但根本不适合我们玄者使用！它会比普通剑难控制几百倍！"

云澈咬牙，艰难地抬起霸天巨剑，缓缓说道："我明白你说的所有道理。但我感觉这把剑就是最适合我的武器。"

"为了举起它，你几乎用尽了全部力量，还怎么控制它？"

"那是因为我还不够强。等玄力提升上来，总有一天我可以轻松驾驭它。"云澈回答道。

司空度想吐血。他已经把道理说得清清楚楚，但云澈还是执意选择了这把被遗忘已久的重剑。
"""


async def test_health():
    """Test health endpoint"""
    print("\n🏥 Testing Health Endpoint...")
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.get(f"{API_URL}/health")
            if response.status_code == 200:
                print("✅ Health check passed!")
                return True
            else:
                pytest.fail(f"Health check failed: {response.status_code}: {response.text}")
        except Exception as e:
            pytest.fail(f"Cannot connect to API: {e}")


async def test_pipeline_translation():
    """Test the multi-agent pipeline translation"""
    print("\n🔄 Testing Multi-Agent Pipeline Translation...")
    
    request_data = {
        "text": SAMPLE_TEXT,
        "novel_id": "against_the_gods",
        "novel_title": "逆天邪神",
        "novel_title_th": "พระเจ้าชั่วร้าย",
        "chapter_number": 135,
        "chapter_title": "ทักษะลึกลับของไก่ฟ้า",
        "author": "Mars Gravity",
        "genre": "fantasy",
        "tone": "dark",
        "pronoun_style": "traditional",
        "characters": [
            {
                "original_name": "云澈",
                "thai_name": "หยุนเช่อ",
                "personality": "หนุ่มนักสู้ มุทะษัตถ์ ไม่ยอมแพ้",
                "role": "protagonist"
            },
            {
                "original_name": "司空度",
                "thai_name": "สีคงตู้",
                "personality": "ผู้ใหญ่ ใจเย็น ห่วงใย",
                "role": "supporting"
            }
        ],
        "terminology": [
            {"original": "玄力", "translation": "พลังวิญญาณ", "type": "power"},
            {"original": "霸天巨剑", "translation": "ดาบยักษ์ของโอเวอร์ลอร์ด", "type": "item"},
        ],
        "target_quality": "B",
        "skip_polish": False,
        "add_to_review_queue": True,
    }
    
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            print("  Sending request to pipeline...")
            response = await client.post(
                f"{API_URL}/translate/pipeline",
                json=request_data,
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                print("\n✅ Pipeline translation completed!")
                print("\n📊 Quality Score:")
                print(f"   Grade: {result['grade']}")
                print(f"   Overall: {result['overall_score']}/100")
                print(f"   Terminology: {result['terminology_score']}/100")
                print(f"   Flow: {result['flow_score']}/100")
                print(f"   Accuracy: {result['accuracy_score']}/100")
                print(f"   Dialogue: {result['dialogue_score']}/100")
                
                if result['issues']:
                    print(f"\n⚠️ Issues: {result['issues']}")
                
                if result['strengths']:
                    print(f"\n✅ Strengths: {result['strengths']}")
                
                print("\n📝 Agent Summary:")
                print(f"   Translation tokens: {result['agent_summary']['translation_tokens']}")
                print(f"   Terminology fixes: {result['agent_summary']['terminology_fixes']}")
                print(f"   Style polish: {result['agent_summary']['style_polish']}")
                print(f"   Total time: {result['agent_summary']['total_processing_time']:.2f}s")
                
                print("\n📖 Translated Text (first 500 chars):")
                print("-" * 50)
                print(result['translated_text'][:500])
                print("-" * 50)
                
                if result['review_queue_id']:
                    print(f"\n📋 Added to review queue: {result['review_queue_id']}")
                
                return result
            else:
                pytest.fail(f"Pipeline failed: {response.status_code}: {response.text}")
        except Exception as e:
            pytest.fail(f"Pipeline request error: {e}")


async def test_review_queue():
    """Test review queue operations"""
    print("\n📋 Testing Review Queue...")
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Get pending reviews
        print("  Fetching pending reviews...")
        response = await client.get(f"{API_URL}/review/pending")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Found {data['total']} pending reviews")
            
            if data['items']:
                item = data['items'][0]
                print(f"\n  Sample item: {item['id']}")
                print(f"    Novel: {item['novel_id']}")
                print(f"    Chapter: {item['chapter_number']}")
                print(f"    Grade: {item['grade']}")
                print(f"    Score: {item['overall_score']}/100")
        else:
            pytest.fail(f"Failed to get pending reviews: {response.status_code}: {response.text}")
        
        # Get stats
        print("\n  Getting review stats...")
        response = await client.get(f"{API_URL}/review/stats")
        
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ Stats: Pending={stats['pending']}, Approved={stats['approved']}, Rejected={stats['rejected']}")
        else:
            pytest.fail(f"Failed to get review stats: {response.status_code}: {response.text}")


async def test_terminology():
    """Test terminology endpoint"""
    print("\n📚 Testing Terminology...")
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{API_URL}/terminology/known")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Found {len(data['terminology'])} known terms for '{data['novel']}'")
            
            # Show a few examples
            print("\n  Sample terms:")
            for term in data['terminology'][:5]:
                print(f"    {term['original']} → {term['translation']} ({term['type']})")
        else:
            pytest.fail(f"Failed to get terminology: {response.status_code}: {response.text}")


async def run_all_tests():
    """Run all tests"""
    print("=" * 60)
    print("🧪 MULTI-AGENT TRANSLATION PIPELINE TESTS")
    print("=" * 60)
    print(f"API URL: {API_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    
    # Test health
    if not await test_health():
        print("\n❌ API is not running. Please start the AI service first:")
        print("   cd ai-service && python main.py")
        return
    
    # Test terminology
    await test_terminology()
    
    # Test pipeline translation
    await test_pipeline_translation()
    
    # Test review queue
    await test_review_queue()
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("Usage: python test_pipeline.py")
        print("\nMake sure the AI service is running:")
        print("  cd ai-service && python main.py")
        sys.exit(0)
    
    asyncio.run(run_all_tests())
