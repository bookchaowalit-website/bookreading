package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
)

// AIProxyPrefix is the browser-facing prefix for ai-service calls. The
// browser never talks to ai-service directly: the backend checks the user
// session, then forwards through the aiservice client, which adds the
// server-side AI_SERVICE_TOKEN. ai-service keeps enforcing its own SSRF
// guard on every URL it fetches.
const AIProxyPrefix = "/api/ai"

const (
	aiProxyDefaultMaxBody int64 = 2 << 20  // text translation / scraping payloads
	aiProxyImageMaxBody   int64 = 32 << 20 // base64 manga images
)

// AIForwarder is the part of aiservice.AIServiceClient the proxy needs.
type AIForwarder interface {
	Forward(ctx context.Context, method, path, rawQuery, contentType string, body io.Reader) (*http.Response, error)
}

type aiRoute struct {
	method  string
	maxBody int64
	public  bool // read-only metadata ai-service also serves without a token
	admin   bool // moderation actions: admin role required
}

// aiProxyRoutes is the exact allow-list of ai-service paths the frontend uses.
var aiProxyRoutes = map[string]aiRoute{
	"/scrape":                    {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/chapter":                   {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/translate":                 {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/translate/agentic":         {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/extract-terminology":       {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/terminology/known":         {method: http.MethodGet},
	"/context/initialize":        {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/context/add-chapter":       {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/manga/translate":           {method: http.MethodPost, maxBody: aiProxyImageMaxBody},
	"/manga/extract-text":        {method: http.MethodPost, maxBody: aiProxyImageMaxBody},
	"/manga/batch-translate":     {method: http.MethodPost, maxBody: aiProxyImageMaxBody},
	"/manga/fetch":               {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/manga/translate-url":       {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody},
	"/manga/supported-languages": {method: http.MethodGet, public: true},
	"/manga/supported-sites":     {method: http.MethodGet, public: true},
	"/manga/health":              {method: http.MethodGet, public: true},
	"/review/pending":            {method: http.MethodGet},
	"/review/stats":              {method: http.MethodGet},
	"/review/approve":            {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody, admin: true},
	"/review/edit":               {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody, admin: true},
	"/review/reject":             {method: http.MethodPost, maxBody: aiProxyDefaultMaxBody, admin: true},
}

// /terminology/{novel_id}: one plain identifier segment.
var aiTerminologyByNovel = regexp.MustCompile(`^/terminology/[A-Za-z0-9_-]{1,128}$`)

// AIProxyHandler serves AIProxyPrefix + an allow-listed ai-service path.
type AIProxyHandler struct {
	ai    AIForwarder
	auth  func(http.HandlerFunc) http.HandlerFunc
	admin func(http.HandlerFunc) http.HandlerFunc
}

// NewAIProxyHandler wires the proxy; auth is the backend's user-session
// middleware (Handler.AuthMiddleware) and admin the admin-role middleware
// (Handler.AdminMiddleware) guarding review approve/edit/reject. A nil admin
// middleware denies those routes.
func NewAIProxyHandler(ai AIForwarder, auth, admin func(http.HandlerFunc) http.HandlerFunc) *AIProxyHandler {
	return &AIProxyHandler{ai: ai, auth: auth, admin: admin}
}

func aiProxyRouteFor(escapedPath string) (string, aiRoute, int) {
	if !strings.HasPrefix(escapedPath, AIProxyPrefix+"/") {
		return "", aiRoute{}, http.StatusNotFound
	}
	upstream := strings.TrimPrefix(escapedPath, AIProxyPrefix)
	// Plain paths only: no escapes, dot segments or empty segments.
	if strings.ContainsAny(upstream, "%\\") || strings.Contains(upstream, "//") {
		return "", aiRoute{}, http.StatusBadRequest
	}
	for _, seg := range strings.Split(upstream, "/")[1:] {
		if seg == "." || seg == ".." {
			return "", aiRoute{}, http.StatusBadRequest
		}
	}
	if route, ok := aiProxyRoutes[upstream]; ok {
		return upstream, route, 0
	}
	if aiTerminologyByNovel.MatchString(upstream) {
		return upstream, aiRoute{method: http.MethodGet}, 0
	}
	return "", aiRoute{}, http.StatusNotFound
}

func (p *AIProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	upstream, route, status := aiProxyRouteFor(r.URL.EscapedPath())
	if status != 0 {
		writeAIProxyError(w, status, http.StatusText(status))
		return
	}
	if r.Method != route.method {
		w.Header().Set("Allow", route.method)
		writeAIProxyError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	forward := func(w http.ResponseWriter, r *http.Request) { p.forward(w, r, upstream, route) }
	switch {
	case route.public:
		forward(w, r)
	case route.admin:
		if p.admin == nil {
			writeAIProxyError(w, http.StatusForbidden, "Admin role required")
			return
		}
		p.admin(forward)(w, r)
	default:
		p.auth(forward)(w, r)
	}
}

func (p *AIProxyHandler) forward(w http.ResponseWriter, r *http.Request, upstream string, route aiRoute) {
	var body io.Reader
	contentType := ""
	rawQuery := ""
	if route.method == http.MethodGet {
		rawQuery = r.URL.RawQuery
	} else {
		if r.ContentLength > route.maxBody {
			writeAIProxyError(w, http.StatusRequestEntityTooLarge, "Request body too large")
			return
		}
		// Buffer so an oversized body is rejected before anything reaches ai-service.
		data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, route.maxBody))
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				writeAIProxyError(w, http.StatusRequestEntityTooLarge, "Request body too large")
				return
			}
			writeAIProxyError(w, http.StatusBadRequest, "Could not read request body")
			return
		}
		body = bytes.NewReader(data)
		contentType = "application/json"
	}

	resp, err := p.ai.Forward(r.Context(), route.method, upstream, rawQuery, contentType, body)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		log.Printf("[WARN] ai-service proxy %s %s: %v", route.method, upstream, err)
		writeAIProxyError(w, http.StatusBadGateway, "AI service unavailable")
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "no-store")
	status := resp.StatusCode
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		// The browser's session was valid; an upstream 401/403 means the
		// backend's service token is wrong. Don't make the client log out.
		log.Printf("[ERROR] ai-service rejected the backend service token (%d) for %s", status, upstream)
		writeAIProxyError(w, http.StatusBadGateway, "AI service rejected the backend")
		return
	}
	w.WriteHeader(status)
	_, _ = io.Copy(w, resp.Body)
}

func writeAIProxyError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{Error: msg})
}
