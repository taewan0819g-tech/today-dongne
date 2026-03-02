import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘동네',
  description: '로컬 쿠폰 서비스',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="max-w-md mx-auto min-h-screen bg-gray-50">
          {children}
        </div>
      </body>
    </html>
  )
}
