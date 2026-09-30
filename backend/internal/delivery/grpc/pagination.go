package grpc

import (
	"math"

	"github.com/bookreading/backend/internal/domain"
)

// pageWindow turns a 1-based gRPC (page, page_size) pair into a SQL
// limit/offset, clamped through domain.NormalizePage.
//
// The handlers used to compute int(req.Page-1)*int(req.PageSize) directly:
// Page-1 wraps in int32 for math.MinInt32, a page below 1 produced a
// negative offset, and the offset was derived from the *unclamped* page size
// while the use case later capped the limit at domain.MaxPageSize, so
// page 2 of page_size=1000 skipped rows 200..999. The offset is now derived
// from the clamped limit, computed in int64 and capped at math.MaxInt32.
// The returned page and pageSize are what the response should echo.
//
// This file carries no build tag so it is compiled and tested without the
// generated protobuf code that server.go needs.
func pageWindow(page, pageSize int32, defaultLimit int) (limit, offset int, echoPage, echoPageSize int32) {
	if page < 1 {
		page = 1
	}
	limit, _ = domain.NormalizePage(int(pageSize), 0, defaultLimit)
	off := (int64(page) - 1) * int64(limit)
	if off > math.MaxInt32 {
		off = math.MaxInt32
	}
	return limit, int(off), page, int32(limit)
}
