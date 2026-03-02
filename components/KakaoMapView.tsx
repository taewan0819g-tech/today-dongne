'use client'

import { useEffect, useRef, useState } from 'react'
import { loadKakaoMapScript, getCoordsFromAddress, type Coords } from '@/lib/kakao-map'

type KakaoMapViewProps = {
  address: string
  storeName?: string
  className?: string
  height?: string
}

export default function KakaoMapView({ address, storeName, className = '', height = '200px' }: KakaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!address.trim()) {
      setError('주소가 없습니다.')
      return
    }
    let cancelled = false
    setError(null)
    setLoaded(false)

    getCoordsFromAddress(address)
      .then((coords) => {
        if (cancelled || !coords || !containerRef.current) return
        loadKakaoMapScript()
          .then(() => {
            if (cancelled || !containerRef.current || !window.kakao?.maps) return
            const { kakao } = window
            const center = new kakao.maps.LatLng(coords.lat, coords.lng)
            const map = new kakao.maps.Map(containerRef.current, {
              center,
              level: 3,
            })
            const marker = new kakao.maps.Marker({ position: center, map })
            marker.setMap(map)
            setLoaded(true)
          })
          .catch(() => setError('지도를 불러올 수 없습니다.'))
      })
      .catch(() => setError('위치를 찾을 수 없습니다.'))

    return () => {
      cancelled = true
    }
  }, [address])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 text-sm ${className}`}
        style={{ height }}
      >
        {error}
      </div>
    )
  }

  return (
    <div className={className}>
      {storeName && (
        <p className="mb-2 text-sm font-medium text-gray-700">📍 {storeName} 위치</p>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center text-gray-400 text-sm"
        style={{ height, minHeight: height }}
        aria-label="지도"
      >
        {!loaded && '지도 로딩 중...'}
      </div>
    </div>
  )
}
