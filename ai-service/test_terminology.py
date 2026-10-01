"""
Tests for terminology module.
"""

from terminology import (
    get_known_terminology,
    get_term_translation,
    apply_terminology_to_text,
    extract_terms_from_text,
    preprocess_terminology,
    postprocess_terminology,
    clean_source_text,
    format_translated_text,
)


class TestKnownTerminology:
    """Test known terminology database."""

    def test_get_all_terminology(self):
        terms = get_known_terminology()
        assert isinstance(terms, dict)
        assert len(terms) > 0

    def test_get_term_translation_exists(self):
        result = get_term_translation("云澈")
        assert result is not None
        assert result["translation"] == "หยุนเช่อ"

    def test_get_term_translation_not_exists(self):
        result = get_term_translation("非存在词")
        assert result is None


class TestApplyTerminology:
    """Test terminology application."""

    def test_apply_terminology_to_text(self):
        from terminology import Term
        
        text = "云澈走进了深渊"
        terms = [
            Term(original="云澈", translation="หยุนเช่อ"),
            Term(original="深渊", translation="เหวี่ยนลึก"),
        ]

        result = apply_terminology_to_text(text, terms)
        assert result == "หยุนเช่อ走进了เหวี่ยนลึก"

    def test_apply_no_matching_terms(self):
        from terminology import Term
        
        text = "这是一段测试文本"
        terms = [Term(original="云澈", translation="หยุนเช่อ")]

        result = apply_terminology_to_text(text, terms)
        assert result == text


class TestPreprocessPostprocess:
    """Test terminology pre and post processing."""

    def test_preprocess_replaces_known_terms(self):
        text = "云澈 is the main character"
        processed, placeholders = preprocess_terminology(text)

        assert "云澈" not in processed
        assert "__TERM_0__" in processed
        assert "__TERM_0__" in placeholders

    def test_postprocess_restores_placeholders(self):
        text = "__TERM_0__ is the main character"
        placeholders = {"__TERM_0__": "หยุนเช่อ"}

        result = postprocess_terminology(text, placeholders)
        assert "หยุนเช่อ" in result
        assert "__TERM_0__" not in result

    def test_preprocess_postprocess_roundtrip(self):
        original = "云澈走进了深渊"
        processed, placeholders = preprocess_terminology(original)
        result = postprocess_terminology(processed, placeholders)

        assert result == "หยุนเช่อ走进了เหวี่ยนลึก"


class TestExtractTerms:
    """Test terminology extraction."""

    def test_extract_terms_from_chinese_text(self):
        text = "云澈云澈云澈是一个重要角色"
        terms = extract_terms_from_text(text)

        # Should extract repeated terms
        assert len(terms) > 0

    def test_extract_no_terms_from_short_text(self):
        text = "云澈"
        terms = extract_terms_from_text(text)

        # Single occurrence should not be extracted
        assert len(terms) == 0


class TestTextCleaning:
    """Test text cleaning utilities."""

    def test_clean_source_text_removes_html(self):
        text = "<p>这是一段文本</p>"
        result = clean_source_text(text)
        assert "<p>" not in result
        assert "这是一段文本" in result

    def test_clean_source_text_removes_extra_whitespace(self):
        text = "这   是   文   本"
        result = clean_source_text(text)
        assert result == "这 是 文 本"

    def test_format_translated_text(self):
        text = "这是翻译  文本  。"
        result = format_translated_text(text)
        assert "  " not in result
