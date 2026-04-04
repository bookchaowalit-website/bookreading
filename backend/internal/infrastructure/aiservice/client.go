package aiservice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type AIServiceClient interface {
	ScrapeNovel(ctx context.Context, url, sourceLang string) (*ScrapeNovelResponse, error)
	TranslateContent(ctx context.Context, req *TranslateRequest) (*TranslateResponse, error)
	ExtractTerminology(ctx context.Context, req *ExtractTerminologyRequest) (*ExtractTerminologyResponse, error)
}

type aiServiceClient struct {
	baseURL string
	client  *http.Client
}

type ScrapeNovelResponse struct {
	Title         string            `json:"title"`
	OriginalTitle string            `json:"original_title"`
	Author        string            `json:"author"`
	Description   string            `json:"description"`
	CoverImageURL string            `json:"cover_image_url"`
	Chapters      []ScrapedChapter  `json:"chapters"`
}

type ScrapedChapter struct {
	ChapterNumber int    `json:"chapter_number"`
	Title         string `json:"title"`
	OriginalTitle string `json:"original_title"`
	URL           string `json:"url"`
	Content       string `json:"content"`
}

type TranslateRequest struct {
	Text          string     `json:"text"`
	SourceLang    string     `json:"source_lang"`
	TargetLang    string     `json:"target_lang"`
	Terminology   []Term     `json:"terminology,omitempty"`
	TranslationContext []TranslationContext `json:"translation_context,omitempty"`
}

type Term struct {
	Original   string `json:"original"`
	Translation string `json:"translation"`
}

type TranslationContext struct {
	ChapterID    string `json:"chapter_id"`
	SourceText   string `json:"source_text"`
	TranslatedText string `json:"translated_text"`
}

type TranslateResponse struct {
	TranslatedText string `json:"translated_text"`
	ModelUsed      string `json:"model_used"`
	TokensUsed     int    `json:"tokens_used"`
}

type ExtractTerminologyRequest struct {
	Text       string `json:"text"`
	SourceLang string `json:"source_lang"`
	TargetLang string `json:"target_lang"`
}

type ExtractTerminologyResponse struct {
	Terms []ExtractedTerm `json:"terms"`
}

type ExtractedTerm struct {
	Original   string `json:"original"`
	Term       string `json:"term"`
	Translation string `json:"translation"`
	Type       string `json:"type"`
	Description string `json:"description"`
	Confidence float64 `json:"confidence"`
}

func NewAIServiceClient(baseURL string) AIServiceClient {
	return &aiServiceClient{
		baseURL: baseURL,
		client: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (c *aiServiceClient) ScrapeNovel(ctx context.Context, url, sourceLang string) (*ScrapeNovelResponse, error) {
	reqBody := map[string]string{
		"url":          url,
		"source_lang":  sourceLang,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/scrape", c.baseURL), bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scrape request failed with status: %d", resp.StatusCode)
	}

	var result ScrapeNovelResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	return &result, err
}

func (c *aiServiceClient) TranslateContent(ctx context.Context, req *TranslateRequest) (*TranslateResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/translate", c.baseURL), bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("translation request failed with status: %d", resp.StatusCode)
	}

	var result TranslateResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	return &result, err
}

func (c *aiServiceClient) ExtractTerminology(ctx context.Context, req *ExtractTerminologyRequest) (*ExtractTerminologyResponse, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/extract-terminology", c.baseURL), bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("terminology extraction request failed with status: %d", resp.StatusCode)
	}

	var result ExtractTerminologyResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	return &result, err
}
