'use client'

import { useEffect, useRef, useState } from 'react'
import { loadKakaoMapScript, getCoordsFromAddress } from '@/lib/kakao-map'

type KakaoMapViewProps = {
  /** 좌표가 있으면 geocoding 없이 바로 사용 (권장) */
  lat?: number | null
  lng?: number | null
  /** lat/lng 없을 때만 사용 (주소 → 좌표 변환). 상세 주소(동, 호수 등) 포함 시 실패할 수 있음 */
  address?: string
  storeName?: string
  className?: string
  height?: string
}

export default function KakaoMapView({
  lat,
  lng,
  address = '',
  storeName,
  className = '',
  height = '200px',
}: KakaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'

  useEffect(() => {
    if (hasCoords) {
      setError(null)
      setLoaded(false)
      let cancelled = false
      loadKakaoMapScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.kakao?.maps || lat == null || lng == null) return
          const { kakao } = window
          const center = new kakao.maps.LatLng(lat, lng)
          const map = new kakao.maps.Map(containerRef.current, {
            center,
            level: 3,
          })
          const marker = new kakao.maps.Marker({ position: center, map })
          marker.setMap(map)
          setLoaded(true)
        })
        .catch(() => setError('지도를 불러올 수 없습니다.'))

      return () => {
        cancelled = true
      }
    }

    if (!address.trim()) {
      setError('좌표 또는 주소가 없습니다.')
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
  }, [hasCoords, lat, lng, address])

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
