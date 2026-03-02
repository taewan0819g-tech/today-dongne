import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘동네',
  description: '로컬 쿠폰 서비스',
}

// 테스트용: 환경변수 대신 하드코딩 (CORB 확인 후 env로 복구 권장)
const KAKAO_SCRIPT_SRC = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=8a171b4048ca146e25f42500c8a56a01&libraries=services&autoload=false'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <Script
          src={KAKAO_SCRIPT_SRC}
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">
        <div className="max-w-md mx-auto min-h-screen bg-gray-50">
          {children}
        </div>
      </body>
    </html>
  )
}
