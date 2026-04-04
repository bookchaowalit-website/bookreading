package grpc

import (
	"context"
	"github.com/bookreading/backend/internal/delivery/grpc/pb"
	"github.com/bookreading/backend/internal/domain"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type bookReadingServer struct {
	pb.UnimplementedBookReadingServiceServer
	novelUseCase       domain.NovelUseCase
	chapterUseCase     domain.ChapterUseCase
	terminologyUseCase domain.TerminologyUseCase
}

func NewBookReadingServer(
	novelUseCase domain.NovelUseCase,
	chapterUseCase domain.ChapterUseCase,
	terminologyUseCase domain.TerminologyUseCase,
) pb.BookReadingServiceServer {
	return &bookReadingServer{
		novelUseCase:       novelUseCase,
		chapterUseCase:     chapterUseCase,
		terminologyUseCase: terminologyUseCase,
	}
}

func (s *bookReadingServer) CreateNovel(ctx context.Context, req *pb.CreateNovelRequest) (*pb.NovelResponse, error) {
	novel := &domain.Novel{
		Title:         req.Title,
		OriginalTitle: req.OriginalTitle,
		SourceURL:     req.SourceUrl,
		SourceLang:    req.SourceLanguage,
		TargetLang:    req.TargetLanguage,
		Author:        req.Author,
		Description:   req.Description,
		CoverImageURL: req.CoverImageUrl,
		Status:        "ongoing",
	}

	err := s.novelUseCase.CreateNovel(ctx, novel)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.NovelResponse{
		Novel: convertToProtoNovel(novel),
	}, nil
}

func (s *bookReadingServer) GetNovel(ctx context.Context, req *pb.GetNovelRequest) (*pb.NovelResponse, error) {
	novel, err := s.novelUseCase.GetNovel(ctx, req.NovelId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if novel == nil {
		return nil, status.Error(codes.NotFound, "novel not found")
	}

	return &pb.NovelResponse{
		Novel: convertToProtoNovel(novel),
	}, nil
}

func (s *bookReadingServer) ListNovels(ctx context.Context, req *pb.ListNovelsRequest) (*pb.NovelListResponse, error) {
	novels, total, err := s.novelUseCase.ListNovels(ctx, int(req.PageSize), int(req.Page-1)*int(req.PageSize), req.Status)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	protoNovels := make([]*pb.Novel, 0, len(novels))
	for _, novel := range novels {
		protoNovels = append(protoNovels, convertToProtoNovel(novel))
	}

	return &pb.NovelListResponse{
		Novels:     protoNovels,
		TotalCount: int32(total),
		Page:       req.Page,
		PageSize:   req.PageSize,
	}, nil
}

func (s *bookReadingServer) ScrapeNovel(ctx context.Context, req *pb.ScrapeNovelRequest) (*pb.ScrapeNovelResponse, error) {
	novelID, chaptersScraped, err := s.novelUseCase.ScrapeNovel(ctx, req.Url, req.SourceLanguage, req.TargetLanguage, "")
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.ScrapeNovelResponse{
		NovelId:         novelID,
		ChaptersScraped: int32(chaptersScraped),
		Status:          "success",
	}, nil
}

func (s *bookReadingServer) GetChapter(ctx context.Context, req *pb.GetChapterRequest) (*pb.ChapterResponse, error) {
	chapter, err := s.chapterUseCase.GetChapter(ctx, req.ChapterId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if chapter == nil {
		return nil, status.Error(codes.NotFound, "chapter not found")
	}

	return &pb.ChapterResponse{
		Chapter: convertToProtoChapter(chapter),
	}, nil
}

func (s *bookReadingServer) ListChapters(ctx context.Context, req *pb.ListChaptersRequest) (*pb.ChapterListResponse, error) {
	chapters, total, err := s.chapterUseCase.ListChapters(ctx, req.NovelId, int(req.PageSize), int(req.Page-1)*int(req.PageSize))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	protoChapters := make([]*pb.Chapter, 0, len(chapters))
	for _, chapter := range chapters {
		protoChapters = append(protoChapters, convertToProtoChapter(chapter))
	}

	return &pb.ChapterListResponse{
		Chapters:   protoChapters,
		TotalCount: int32(total),
		Page:       req.Page,
		PageSize:   req.PageSize,
	}, nil
}

func (s *bookReadingServer) TranslateChapter(ctx context.Context, req *pb.TranslateChapterRequest) (*pb.ChapterResponse, error) {
	chapter, err := s.chapterUseCase.TranslateChapter(ctx, req.ChapterId, req.TargetLanguage, req.UseContext)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.ChapterResponse{
		Chapter: convertToProtoChapter(chapter),
	}, nil
}

func (s *bookReadingServer) GetTerminology(ctx context.Context, req *pb.GetTerminologyRequest) (*pb.TerminologyListResponse, error) {
	terms, err := s.terminologyUseCase.GetTerminology(ctx, req.NovelId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	protoTerms := make([]*pb.Terminology, 0, len(terms))
	for _, term := range terms {
		protoTerms = append(protoTerms, convertToProtoTerminology(term))
	}

	return &pb.TerminologyListResponse{
		Terminologies: protoTerms,
	}, nil
}

func (s *bookReadingServer) AddTerminology(ctx context.Context, req *pb.AddTerminologyRequest) (*pb.TerminologyResponse, error) {
	term := &domain.Terminology{
		NovelID:      req.NovelId,
		Term:         req.Term,
		OriginalTerm: req.OriginalTerm,
		Translation:  req.Translation,
		TermType:     req.TermType,
		Description:  req.Description,
	}

	err := s.terminologyUseCase.AddTerminology(ctx, term)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.TerminologyResponse{
		Terminology: convertToProtoTerminology(term),
	}, nil
}

func (s *bookReadingServer) UpdateTerminology(ctx context.Context, req *pb.UpdateTerminologyRequest) (*pb.TerminologyResponse, error) {
	term := &domain.Terminology{
		ID:          req.TerminologyId,
		Term:        req.Term,
		Translation: req.Translation,
		Description: req.Description,
	}

	err := s.terminologyUseCase.UpdateTerminology(ctx, term)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.TerminologyResponse{
		Terminology: convertToProtoTerminology(term),
	}, nil
}

// Converters
func convertToProtoNovel(novel *domain.Novel) *pb.Novel {
	return &pb.Novel{
		Id:             novel.ID,
		Title:          novel.Title,
		OriginalTitle:  novel.OriginalTitle,
		SourceUrl:      novel.SourceURL,
		SourceLanguage: novel.SourceLang,
		TargetLanguage: novel.TargetLang,
		Author:         novel.Author,
		Description:    novel.Description,
		CoverImageUrl:  novel.CoverImageURL,
		Status:         novel.Status,
		CreatedAt:      novel.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:      novel.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func convertToProtoChapter(chapter *domain.Chapter) *pb.Chapter {
	return &pb.Chapter{
		Id:              chapter.ID,
		NovelId:         chapter.NovelID,
		ChapterNumber:   int32(chapter.ChapterNumber),
		Title:           chapter.Title,
		OriginalTitle:   chapter.OriginalTitle,
		SourceUrl:       chapter.SourceURL,
		Content:         chapter.Content,
		OriginalContent: chapter.OriginalContent,
		WordCount:       int32(chapter.WordCount),
		IsTranslated:    chapter.IsTranslated,
		IsScraped:       chapter.IsScraped,
		CreatedAt:       chapter.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       chapter.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func convertToProtoTerminology(term *domain.Terminology) *pb.Terminology {
	return &pb.Terminology{
		Id:              term.ID,
		NovelId:         term.NovelID,
		Term:            term.Term,
		OriginalTerm:    term.OriginalTerm,
		Translation:     term.Translation,
		TermType:        term.TermType,
		Description:     term.Description,
		IsAutoGenerated: term.IsAutoGenerated,
		ConfidenceScore: float32(term.ConfidenceScore),
		CreatedAt:       term.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       term.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
