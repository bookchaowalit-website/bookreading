package grpc

import (
	"math"
	"testing"

	"github.com/bookreading/backend/internal/domain"
)

func TestPageWindow(t *testing.T) {
	cases := []struct {
		name                   string
		page, size             int32
		def                    int
		wantLimit, wantOffset  int
		wantPage, wantPageSize int32
	}{
		{"defaults", 0, 0, 20, 20, 0, 1, 20},
		{"first page", 1, 10, 20, 10, 0, 1, 10},
		{"third page", 3, 10, 50, 10, 20, 3, 10},
		{"negative page", -5, 10, 20, 10, 0, 1, 10},
		{"min int32 page does not wrap", math.MinInt32, 10, 20, 10, 0, 1, 10},
		{"negative size uses default", 2, -7, 50, 50, 50, 2, 50},
		// Old code: offset (2-1)*1000 = 1000 with limit capped to 200,
		// silently skipping rows 200..999.
		{"oversized page size is capped before offset", 2, 1000, 20, domain.MaxPageSize, domain.MaxPageSize, 2, domain.MaxPageSize},
		{"huge page caps offset", math.MaxInt32, math.MaxInt32, 20, domain.MaxPageSize, math.MaxInt32, math.MaxInt32, domain.MaxPageSize},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			limit, offset, page, size := pageWindow(tc.page, tc.size, tc.def)
			if limit != tc.wantLimit || offset != tc.wantOffset || page != tc.wantPage || size != tc.wantPageSize {
				t.Fatalf("pageWindow(%d, %d, %d) = (%d, %d, %d, %d), want (%d, %d, %d, %d)",
					tc.page, tc.size, tc.def, limit, offset, page, size,
					tc.wantLimit, tc.wantOffset, tc.wantPage, tc.wantPageSize)
			}
			if offset < 0 || limit <= 0 || limit > domain.MaxPageSize {
				t.Fatalf("unclamped window: limit=%d offset=%d", limit, offset)
			}
		})
	}
}

// legacyOffset is the arithmetic server.go used before pageWindow; kept here
// to show the cases the regression test above guards against.
func legacyOffset(page, size int32) int { return int(page-1) * int(size) }

func TestLegacyArithmeticWasUnsafe(t *testing.T) {
	if got := legacyOffset(math.MinInt32, 10); got <= 0 {
		t.Fatalf("expected int32 wrap to produce a huge positive offset, got %d", got)
	}
	if got := legacyOffset(0, 10); got >= 0 {
		t.Fatalf("expected negative offset for page 0, got %d", got)
	}
	if _, off, _, _ := pageWindow(2, 1000, 20); off == legacyOffset(2, 1000) {
		t.Fatalf("offset must follow the clamped limit, not the requested size")
	}
}
