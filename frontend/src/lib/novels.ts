// Featured novels configuration - pre-configured sources from piaotia.com
export interface FeaturedNovel {
  id: string;
  title: string;
  titleTh: string;
  titleZh: string;
  author: string;
  authorTh: string;
  description: string;
  descriptionTh: string;
  coverUrl: string;
  sourceUrl: string;
  chapterListUrl: string;
  totalChapters: number;
  category: string;
  status: 'ongoing' | 'completed';
  lastUpdate: string;
}

export const FEATURED_NOVELS: FeaturedNovel[] = [
  {
    id: 'against-the-gods',
    title: 'Against the Gods',
    titleTh: '逆天邪神',
    titleZh: '逆天邪神',
    author: 'Mars Gravity',
    authorTh: '火星引力',
    description: 'Carrying the blood of the Evil God, cultivating the power to defy the heavens, one Evil God shall rule the world!',
    descriptionTh: '天毒之珠，承邪神之血，修逆天之力，一代邪神，君临天下！',
    coverUrl: 'https://www.piaotia.com/files/article/image/6/6760/6760s.jpg',
    sourceUrl: 'https://www.piaotia.com/bookinfo/6/6760.html',
    chapterListUrl: 'https://www.piaotia.com/html/6/6760/',
    totalChapters: 2175,
    category: '玄幻魔法',
    status: 'ongoing',
    lastUpdate: '2024-12-27',
  },
  // Add more novels here as needed
];

// Get novel by ID
export function getNovelById(id: string): FeaturedNovel | undefined {
  return FEATURED_NOVELS.find(n => n.id === id);
}

// Get all novels
export function getAllNovels(): FeaturedNovel[] {
  return FEATURED_NOVELS;
}

// Chapter URL builder for piaotia.com
export function buildChapterUrl(novelId: string, chapterId: string): string {
  const novel = getNovelById(novelId);
  if (!novel) return '';
  
  // For piaotia.com, chapter URLs are like: /html/6/6760/10243577.html
  // The chapterListUrl is the base: https://www.piaotia.com/html/6/6760/
  return `${novel.chapterListUrl}${chapterId}.html`;
}