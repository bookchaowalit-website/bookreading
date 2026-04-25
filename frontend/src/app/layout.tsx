import type { Metadata } from 'next'
import { Inter, Sarabun, Noto_Sans_Thai } from 'next/font/google'
import '@/styles/globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ToastProvider } from '@/providers/ToastProvider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-sarabun',
})
const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-noto',
})

export const metadata: Metadata = {
  title: 'BookReading - อ่านนิยายแปลอัตโนมัติ',
  description: 'Platform for reading translated novels and manga with AI-powered translation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${inter.variable} ${sarabun.variable} ${notoSansThai.variable} font-sans`}>
        {/* Skip Navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
