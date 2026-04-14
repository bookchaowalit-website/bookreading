import type { Metadata } from 'next'
import { Inter, Sarabun } from 'next/font/google'
import '@/styles/globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ToastProvider } from '@/providers/ToastProvider'

const inter = Inter({ subsets: ['latin'] })
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-sarabun',
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
      <body className={`${inter.className} ${sarabun.variable} font-sans`}>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
