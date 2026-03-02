declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void
        LatLng: new (lat: number, lng: number) => { getLat: () => number; getLng: () => number }
        Map: new (el: HTMLElement, options: { center: unknown; level?: number }) => unknown
        Marker: new (opts: { position: unknown; map?: unknown }) => { setMap: (map: unknown) => void }
        services: {
          Geocoder: new () => {
            addressSearch: (
              address: string,
              callback: (result: Array<{ x: string; y: string }>, status: string) => void
            ) => void
            coord2Address: (
              lng: number,
              lat: number,
              callback: (
                result: Array<{ address: { address_name: string } }>,
                status: string
              ) => void
            ) => void
          }
        }
      }
    }
  }
}

const SCRIPT_URL = 'https://dapi.kakao.com/v2/maps/sdk.js'

let scriptLoadPromise: Promise<void> | null = null

export function loadKakaoMapScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window undefined'))
  if (window.kakao?.maps) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_KAKAO_MAP_API_KEY is not set'))
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // 역지오코딩(coord2Address) 사용 시 libraries=services 필수
    script.src = `${SCRIPT_URL}?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`
    script.async = true
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('Kakao maps not available after script load'))
        return
      }
      window.kakao.maps.load(() => {
        // services(Geocoder 등) 사용을 위해 libraries=services 로드 확인
        if (window.kakao?.maps?.services) {
          resolve()
          return
        }
        // 일부 환경에서 services가 비동기로 준비될 수 있음
        const check = (retries = 10): void => {
          if (window.kakao?.maps?.services) {
            resolve()
            return
          }
          if (retries <= 0) resolve()
          else setTimeout(() => check(retries - 1), 100)
        }
        check()
      })
    }
    script.onerror = () => reject(new Error('Failed to load Kakao Map script'))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

export type Coords = { lat: number; lng: number }

export function getCoordsFromAddress(address: string): Promise<Coords | null> {
  return loadKakaoMapScript()
    .then(() => {
      return new Promise<Coords | null>((resolve) => {
        if (!window.kakao?.maps?.services) {
          resolve(null)
          return
        }
        const geocoder = new window.kakao.maps.services.Geocoder()
        geocoder.addressSearch(address.trim(), (result, status) => {
          if (status !== 'OK' || !result?.length) {
            resolve(null)
            return
          }
          const item = result[0]
          if (!item?.y || !item?.x) {
            resolve(null)
            return
          }
          resolve({ lat: parseFloat(item.y), lng: parseFloat(item.x) })
        })
      })
    })
    .catch(() => null)
}

export function haversineDistance(from: Coords, to: Coords): number {
  const R = 6371
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

/** 좌표 → 동네 주소(역지오코딩). 반환 예: "서울 강남구 역삼동" */
export function getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
  return loadKakaoMapScript()
    .then(() => {
      return new Promise<string | null>((resolve) => {
        if (!window.kakao?.maps?.services) {
          resolve(null)
          return
        }
        const geocoder = new window.kakao.maps.services.Geocoder()
        geocoder.coord2Address(lng, lat, (result, status) => {
          if (status !== 'OK' || !result?.length) {
            resolve(null)
            return
          }
          const name = result[0].address?.address_name
          resolve(typeof name === 'string' ? name : null)
        })
      })
    })
    .catch(() => null)
}
