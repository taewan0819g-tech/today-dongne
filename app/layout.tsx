import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘동네',
  description: '로컬 쿠폰 서비스',
}

const KAKAO_SDK_BASE = 'https://dapi.kakao.com/v2/maps/sdk.js'
const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY ?? ''
const hasKakaoKey = typeof KAKAO_KEY === 'string' && KAKAO_KEY.trim().length > 0
const KAKAO_SCRIPT_SRC = hasKakaoKey
  ? `${KAKAO_SDK_BASE}?appkey=${encodeURIComponent(KAKAO_KEY.trim())}&libraries=services&autoload=false`
  : ''

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {hasKakaoKey && (
          <Script
            src={KAKAO_SCRIPT_SRC}
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="antialiased">
        <div className="max-w-md mx-auto min-h-screen bg-gray-50">
          {children}
        </div>
      </body>
    </html>
  )
}
