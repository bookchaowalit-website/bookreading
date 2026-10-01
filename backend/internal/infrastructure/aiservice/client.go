package aiservice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type AIServiceClient interface {
	ScrapeNovel(ctx context.Context, url, sourceLang string) (*ScrapeNovelResponse, error)
	TranslateContent(ctx context.Context, req *TranslateRequest) (*TranslateResponse, error)
	ExtractTerminology(ctx context.Context, req *ExtractTerminologyRequest) (*ExtractTerminologyResponse, error)
	// Forward relays a raw request to an ai-service path with the service
	// token. The caller allow-lists path and closes the response body.
	Forward(ctx context.Context, method, path, rawQuery, contentType string, body io.Reader) (*http.Response, error)
}

type aiServiceClient struct {
	baseURL string
	token   string
	client  *http.Client
}

type ScrapeNovelResponse struct {
	Title         string           `json:"title"`
	OriginalTitle string           `json:"original_title"`
	Author        string           `json:"author"`
	Description   string           `json:"description"`
	CoverImageURL string           `json:"cover_image_url"`
	Chapters      []ScrapedChapter `json:"chapters"`
}

type ScrapedChapter struct {
	ChapterNumber int    `json:"chapter_number"`
	Title         string `json:"title"`
	OriginalTitle string `json:"original_title"`
	URL           string `json:"url"`
	Content       string `json:"content"`
}

type TranslateRequest struct {
	Text               string               `json:"text"`
	SourceLang         string               `json:"source_lang"`
	TargetLang         string               `json:"target_lang"`
	Terminology        []Term               `json:"terminology,omitempty"`
	TranslationContext []TranslationContext `json:"translation_context,omitempty"`
}

type Term struct {
	Original    string `json:"original"`
	Translation string `json:"translation"`
}

type TranslationContext struct {
	ChapterID      string `json:"chapter_id"`
	SourceText     string `json:"source_text"`
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
	Original    string  `json:"original"`
	Term        string  `json:"term"`
	Translation string  `json:"translation"`
	Type        string  `json:"type"`
	Description string  `json:"description"`
	Confidence  float64 `json:"confidence"`
}

// NewAIServiceClient returns a client for the Python ai-service. When token is
// non-empty every request carries "Authorization: Bearer <token>", matching the
// service's optional AI_SERVICE_TOKEN check.
func NewAIServiceClient(baseURL, token string) AIServiceClient {
	return &aiServiceClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   strings.TrimSpace(token),
		client:  &http.Client{Timeout: 5 * time.Minute},
	}
}

// postJSON sends body to path and decodes a 200 response into out.
func (c *aiServiceClient) postJSON(ctx context.Context, path, op string, body, out any) error {
	jsonData, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(jsonData))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s request failed with status: %d", op, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *aiServiceClient) ScrapeNovel(ctx context.Context, url, sourceLang string) (*ScrapeNovelResponse, error) {
	reqBody := map[string]string{
		"url":         url,
		"source_lang": sourceLang,
	}
	var result ScrapeNovelResponse
	err := c.postJSON(ctx, "/scrape", "scrape", reqBody, &result)
	return &result, err
}

func (c *aiServiceClient) TranslateContent(ctx context.Context, req *TranslateRequest) (*TranslateResponse, error) {
	var result TranslateResponse
	err := c.postJSON(ctx, "/translate", "translation", req, &result)
	return &result, err
}

func (c *aiServiceClient) ExtractTerminology(ctx context.Context, req *ExtractTerminologyRequest) (*ExtractTerminologyResponse, error) {
	var result ExtractTerminologyResponse
	err := c.postJSON(ctx, "/extract-terminology", "terminology extraction", req, &result)
	return &result, err
}

// Forward relays method/path to ai-service with the service token. It does
// not validate path: the HTTP proxy handler allow-lists it first. Callers
// must close the returned response body.
func (c *aiServiceClient) Forward(ctx context.Context, method, path, rawQuery, contentType string, body io.Reader) (*http.Response, error) {
	if !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("ai-service forward: path must start with /")
	}
	target := c.baseURL + path
	if rawQuery != "" {
		target += "?" + rawQuery
	}
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Accept", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	return c.client.Do(req)
}
