package usecase

import (
	"context"
	"testing"

	"github.com/bookreading/backend/internal/domain"
)

type pageRecordingNovelRepo struct {
	domain.NovelRepository
	limit, offset int
}

func (r *pageRecordingNovelRepo) List(_ context.Context, limit, offset int, _ string) ([]*domain.Novel, int, error) {
	r.limit, r.offset = limit, offset
	return nil, 0, nil
}

type pageRecordingChapterRepo struct {
	domain.ChapterRepository
	limit, offset int
}

func (r *pageRecordingChapterRepo) ListByNovelID(_ context.Context, _ string, limit, offset int) ([]*domain.Chapter, int, error) {
	r.limit, r.offset = limit, offset
	return nil, 0, nil
}

// Negative LIMIT/OFFSET made Postgres fail the request with a 500, and an
// unbounded limit returned a whole table in one response.
func TestListPaginationIsClampedBeforeSQL(t *testing.T) {
	cases := []struct {
		limit, offset         int
		wantLimit, wantOffset int
	}{
		{-5, -10, 20, 0},
		{0, 40, 20, 40},
		{1_000_000, 0, domain.MaxPageSize, 0},
		{100, 300, 100, 300},
	}
	for _, c := range cases {
		novels := &pageRecordingNovelRepo{}
		uc := NewNovelUseCase(novels, nil, nil, nil)
		if _, _, err := uc.ListNovels(context.Background(), c.limit, c.offset, ""); err != nil {
			t.Fatal(err)
		}
		if novels.limit != c.wantLimit || novels.offset != c.wantOffset {
			t.Errorf("ListNovels(%d, %d) queried limit=%d offset=%d, want %d/%d",
				c.limit, c.offset, novels.limit, novels.offset, c.wantLimit, c.wantOffset)
		}
	}

	chapters := &pageRecordingChapterRepo{}
	cuc := NewChapterUseCase(chapters, nil, nil, nil)
	if _, _, err := cuc.ListChapters(context.Background(), "n1", -1, -1); err != nil {
		t.Fatal(err)
	}
	if chapters.limit != 50 || chapters.offset != 0 {
		t.Errorf("ListChapters(-1, -1) queried limit=%d offset=%d, want 50/0", chapters.limit, chapters.offset)
	}
}
