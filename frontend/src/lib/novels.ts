// Featured novels configuration - Chinese and Korean sources
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
  sourceType?: 'chinese' | 'korean'; // NEW: distinguish source type
}

export const FEATURED_NOVELS: FeaturedNovel[] = [
  // Chinese Novels
  {
    id: 'against-the-gods',
    title: 'Against the Gods',
    titleTh: 'อสูรพลิกฟ้า',
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
    sourceType: 'chinese',
  },
  // Korean Novels (Manhwa/Webtoon Sources)
  {
    id: 'solo-leveling',
    title: 'Solo Leveling',
    titleTh: '나 혼자만 레벨업',
    titleZh: '나 혼자만 레벨업',
    author: 'Chugong (추공)',
    authorTh: '추공',
    description: 'In a world where hunters must battle deadly monsters to protect the human race, Sung Jinwoo, the weakest hunter, finds a hidden dungeon with the hardest rules that will change his life forever.',
    descriptionTh: 'ในโลกที่นักล่าต้องต่อสู้อสูรร้ายเพื่อปกป้องมนุษยชาติ ซองจินอู นักล่าที่อ่อนแอที่สุด พบดันเจี้ยนลับที่มีกฎโหดร้ายที่จะเปลี่ยนชีวิตเขาตลอดกาล',
    coverUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect fill="%231a1a2e" width="200" height="280"/><text x="100" y="120" text-anchor="middle" fill="%23e94560" font-size="24" font-weight="bold">SOLO</text><text x="100" y="155" text-anchor="middle" fill="%23e94560" font-size="24" font-weight="bold">LEVELING</text><text x="100" y="200" text-anchor="middle" fill="%23ffffff" font-size="14">나 혼자만 레벨업</text></svg>',
    sourceUrl: 'https://www.munpia.com/',
    chapterListUrl: 'https://www.munpia.com/',
    totalChapters: 270,
    category: '액션 판타지',
    status: 'completed',
    lastUpdate: '2024-01-01',
    sourceType: 'korean',
  },
  {
    id: 'omniscient-reader',
    title: 'Omniscient Reader\'s Viewpoint',
    titleTh: '전지적 독자 시점',
    titleZh: '전지적 독자 시점',
    author: 'Sing Shong (싱숑)',
    authorTh: '싱숑',
    description: 'Dokja was the sole reader of a web novel for 10 years. When the novel becomes reality, he\'s the only one who knows how the story ends.',
    descriptionTh: 'ด็อกจาเป็นผู้อ่านคนเดียวของเว็บนิยายเป็นเวลา 10 ปี เมื่อนิยายกลายเป็นจริง เขาคือคนเดียวที่รู้ว่าเรื่องจบอย่างไร',
    coverUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect fill="%2316213e" width="200" height="280"/><text x="100" y="100" text-anchor="middle" fill="%230f3460" font-size="18" font-weight="bold">OMNISCIENT</text><text x="100" y="135" text-anchor="middle" fill="%23e94560" font-size="18" font-weight="bold">READER</text><text x="100" y="200" text-anchor="middle" fill="%23ffffff" font-size="12">전지적 독자 시점</text></svg>',
    sourceUrl: 'https://www.munpia.com/',
    chapterListUrl: 'https://www.munpia.com/',
    totalChapters: 551,
    category: '액션 판타지',
    status: 'completed',
    lastUpdate: '2024-02-15',
    sourceType: 'korean',
  },
  // Add more novels here as needed
];

// Korean novel sources reference
export const KOREAN_SOURCES = [
  {
    id: 'munpia',
    name: '문피아 (Munpia)',
    nameTh: 'มุนเปีย - แพลตฟอร์มเว็บนิยายเกาหลีที่ใหญ่ที่สุด',
    urlPattern: 'https://www.munpia.com/...',
    description: 'Largest Korean web novel platform - Action, Fantasy, Romance',
  },
  {
    id: 'ridibooks',
    name: '리디북스 (Ridibooks)',
    nameTh: 'รีดิบุ๊คส์ - แพลตฟอร์มอีบุ๊ค/นิยายเกาหลียอดนิยม',
    urlPattern: 'https://ridibooks.com/...',
    description: 'Popular Korean ebook/novel platform',
  },
  {
    id: 'naver',
    name: '네이버 시리즈 (Naver Series)',
    nameTh: 'เนเวอร์ซีรีส์ - แพลตฟอร์มเว็บตูน/นิยายจาก Naver',
    urlPattern: 'https://series.naver.com/...',
    description: 'Naver\'s web novel/manga platform',
  },
  {
    id: 'kakao',
    name: '카카오페이지 (KakaoPage)',
    nameTh: 'คาเคาเพจ - แพลตฟอร์มเว็บตูน/นิยายจาก Kakao',
    urlPattern: 'https://page.kakao.com/...',
    description: 'Kakao\'s webtoon/novel platform',
  },
  {
    id: 'novelpia',
    name: 'NovelPia',
    nameTh: 'โนเวลเปีย - แพลตฟอร์มเว็บนิยายเกาหลี',
    urlPattern: 'https://novelpia.com/...',
    description: 'Korean web novel platform',
  },
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
