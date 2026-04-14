/**
 * EPUB Export Service
 * Generates valid EPUB3 files from novel chapters.
 * No external dependencies - uses JSZip via CDN or bundled.
 */

interface ChapterData {
  chapterNumber: number;
  title: string;
  originalTitle: string;
  content: string;
  translatedContent?: string;
}

interface NovelMetadata {
  title: string;
  author: string;
  description: string;
  language: string;
  coverUrl?: string;
}

class EpubGenerator {
  /**
   * Generate EPUB content as a downloadable blob.
   */
  async generateEpub(
    metadata: NovelMetadata,
    chapters: ChapterData[],
    options: {
      includeOriginal?: boolean;
      includeTranslated?: boolean;
      sideBySide?: boolean;
    } = {}
  ): Promise<Blob> {
    const {
      includeOriginal = true,
      includeTranslated = true,
      sideBySide = false,
    } = options;

    // Load JSZip dynamically
    const JSZip = await this.loadJSZip();
    const zip = new JSZip();

    // EPUB structure
    // mimetype (must be first, uncompressed)
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // META-INF/container.xml
    zip.file('META-INF/container.xml', this.generateContainerXml());

    // OEBPS/content.opf (package file)
    zip.file('OEBPS/content.opf', this.generatePackageFile(metadata, chapters));

    // OEBPS/toc.xhtml (navigation)
    zip.file('OEBPS/toc.xhtml', this.generateToc(metadata, chapters));

    // OEBPS/styles.css
    zip.file('OEBPS/styles.css', this.generateStyles());

    // OEBPS/cover.xhtml
    zip.file('OEBPS/cover.xhtml', this.generateCover(metadata));

    // Chapter files
    for (const chapter of chapters) {
      const filename = `OEBPS/chapter_${chapter.chapterNumber}.xhtml`;
      zip.file(filename, this.generateChapterXhtml(chapter, metadata, {
        includeOriginal,
        includeTranslated,
        sideBySide,
      }));
    }

    // Generate blob
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }

  /**
   * Download EPUB directly to user's device.
   */
  async downloadEpub(
    metadata: NovelMetadata,
    chapters: ChapterData[],
    filename?: string,
    options?: any
  ): Promise<void> {
    const blob = await this.generateEpub(metadata, chapters, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${metadata.title.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}.epub`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async loadJSZip(): Promise<any> {
    if ((window as any).JSZip) return (window as any).JSZip;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve((window as any).JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  }

  private generateContainerXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  }

  private generatePackageFile(metadata: NovelMetadata, chapters: ChapterData[]): string {
    const manifestItems = [
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="styles" href="styles.css" media-type="text/css"/>',
      ...chapters.map(ch =>
        `<item id="chapter_${ch.chapterNumber}" href="chapter_${ch.chapterNumber}.xhtml" media-type="application/xhtml+xml"/>`
      ),
    ].join('\n    ');

    const spineItems = chapters
      .map(ch => `<itemref idref="chapter_${ch.chapterNumber}"/>`)
      .join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${this.escapeXml(metadata.title)}</dc:title>
    <dc:creator>${this.escapeXml(metadata.author)}</dc:creator>
    <dc:description>${this.escapeXml(metadata.description)}</dc:description>
    <dc:language>${metadata.language}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="toc">
    <itemref idref="cover" linear="no"/>
    ${spineItems}
  </spine>
</package>`;
  }

  private generateToc(metadata: NovelMetadata, chapters: ChapterData[]): string {
    const navPoints = chapters
      .map(ch => `
        <li><a href="chapter_${ch.chapterNumber}.xhtml">บทที่ ${ch.chapterNumber}: ${this.escapeHtml(ch.title)}</a></li>`)
      .join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${metadata.language}">
<head>
  <meta charset="UTF-8"/>
  <title>สารบัญ</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>สารบัญ</h1>
    <ol>
      ${navPoints}
    </ol>
  </nav>
</body>
</html>`;
  }

  private generateChapterXhtml(
    chapter: ChapterData,
    metadata: NovelMetadata,
    options: { includeOriginal: boolean; includeTranslated: boolean; sideBySide: boolean }
  ): string {
    const formatParagraphs = (text: string) => {
      if (!text) return '';
      return text
        .split(/\n\n+/)
        .map(p => `<p>${this.escapeHtml(p.trim())}</p>`)
        .join('\n    ');
    };

    let content = '';

    if (options.sideBySide && chapter.translatedContent) {
      content = `
      <div class="side-by-side">
        <div class="original">
          <h3>ต้นฉบับ</h3>
          ${formatParagraphs(chapter.content)}
        </div>
        <div class="translated">
          <h3>คำแปล</h3>
          ${formatParagraphs(chapter.translatedContent)}
        </div>
      </div>`;
    } else {
      if (options.includeTranslated && chapter.translatedContent) {
        content = formatParagraphs(chapter.translatedContent);
      } else if (options.includeOriginal) {
        content = formatParagraphs(chapter.content);
      }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${metadata.language}">
<head>
  <meta charset="UTF-8"/>
  <title>บทที่ ${chapter.chapterNumber}: ${this.escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>บทที่ ${chapter.chapterNumber}: ${this.escapeHtml(chapter.title)}</h1>
  ${content}
</body>
</html>`;
  }

  private generateCover(metadata: NovelMetadata): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${metadata.language}">
<head>
  <meta charset="UTF-8"/>
  <title>${this.escapeHtml(metadata.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body class="cover">
  <div class="cover-content">
    <h1>${this.escapeHtml(metadata.title)}</h1>
    <p class="author">${this.escapeHtml(metadata.author)}</p>
    <p class="description">${this.escapeHtml(metadata.description)}</p>
  </div>
</body>
</html>`;
  }

  private generateStyles(): string {
    return `
body {
  font-family: "Sarabun", "Noto Sans Thai", sans-serif;
  line-height: 1.8;
  margin: 1em;
  text-align: justify;
}

h1 { font-size: 1.8em; margin-bottom: 1em; text-align: center; }
h2 { font-size: 1.5em; margin: 1em 0; }
h3 { font-size: 1.2em; margin: 0.8em 0; }

p {
  margin: 0.8em 0;
  text-indent: 1.5em;
}

p:first-of-type { text-indent: 0; }

.side-by-side {
  display: flex;
  gap: 2em;
}

.side-by-side .original,
.side-by-side .translated {
  flex: 1;
}

.side-by-side .translated {
  border-left: 2px solid #ccc;
  padding-left: 1em;
}

.cover {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  text-align: center;
}

.cover-content h1 {
  font-size: 2.5em;
  margin-bottom: 0.5em;
}

.author {
  font-size: 1.2em;
  color: #666;
}

.description {
  margin-top: 2em;
  font-style: italic;
}
`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const epubGenerator = new EpubGenerator();
