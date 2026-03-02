'use client'

import { useEffect, useRef, useState } from 'react'
import { loadKakaoMapScript } from '@/lib/kakao-map'

type KakaoMapViewProps = {
  lat: number
  lng: number
  storeName?: string
  className?: string
  height?: string
  width?: string
}

export default function KakaoMapView({
  lat,
  lng,
  storeName,
  className = '',
  height = '300px',
  width = '100%',
}: KakaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setError('유효한 좌표가 없습니다.')
      return
    }

    let cancelled = false
    setError(null)
    setLoaded(false)

    const initMap = () => {
      if (cancelled || !containerRef.current || !window.kakao?.maps) return
      const kakao = window.kakao
      const center = new kakao.maps.LatLng(latNum, lngNum)
      const map = new kakao.maps.Map(containerRef.current, { center, level: 3 })
      const marker = new kakao.maps.Marker({ position: center, map })
      marker.setMap(map)
      setLoaded(true)
    }

    loadKakaoMapScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        if (!window.kakao || !window.kakao.maps) {
          setError('카카오 지도 SDK를 불러올 수 없습니다.')
          return
        }
        if (window.kakao.maps.Map) {
          initMap()
        } else {
          window.kakao.maps.load(initMap)
        }
      })
      .catch(() => setError('지도를 불러올 수 없습니다.'))

    return () => {
      cancelled = true
    }
  }, [lat, lng])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 text-sm ${className}`}
        style={{ height, width }}
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
        className="rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center text-gray-400 text-sm"
        style={{
          height,
          width,
          minHeight: height,
          minWidth: width,
        }}
        aria-label="지도"
      >
        {!loaded && '지도 로딩 중...'}
      </div>
    </div>
  )
}
