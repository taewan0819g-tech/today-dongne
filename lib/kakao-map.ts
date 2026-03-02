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

// 테스트용: 환경변수 대신 하드코딩 (CORB 확인 후 env로 복구 권장)
const KAKAO_SCRIPT_FULL_URL = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=8a171b4048ca146e25f42500c8a56a01&libraries=services&autoload=false'

let scriptLoadPromise: Promise<void> | null = null

export function loadKakaoMapScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window undefined'))
  // layout에서 이미 스크립트가 로드된 경우: services 준비될 때까지 maps.load() 대기
  if (window.kakao?.maps) {
    if (window.kakao.maps.services) return Promise.resolve()
    return new Promise((resolve) => {
      window.kakao!.maps.load(() => {
        if (window.kakao?.maps?.services) {
          resolve()
          return
        }
        const check = (retries = 15): void => {
          if (window.kakao?.maps?.services) {
            resolve()
            return
          }
          if (retries <= 0) resolve()
          else setTimeout(() => check(retries - 1), 100)
        }
        check()
      })
    })
  }
  if (scriptLoadPromise) return scriptLoadPromise
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = KAKAO_SCRIPT_FULL_URL
    console.log('로드 시도하는 카카오 URL:', script.src)
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
        if (typeof window === 'undefined') {
          console.error('[getAddressFromCoords] window is undefined')
          resolve(null)
          return
        }
        if (!window.kakao) {
          console.error('[getAddressFromCoords] 카카오 스크립트가 로드되지 않았습니다. (window.kakao 없음)')
          resolve(null)
          return
        }
        if (!window.kakao.maps) {
          console.error('[getAddressFromCoords] 카카오 maps 객체가 없습니다. SDK 로드 후 kakao.maps.load() 완료 여부를 확인하세요.')
          resolve(null)
          return
        }
        if (!window.kakao.maps.services) {
          console.error('[getAddressFromCoords] 카카오 maps.services가 없습니다. 스크립트 URL에 &libraries=services 가 포함되어 있는지 확인하세요.')
          resolve(null)
          return
        }
        const geocoder = new window.kakao.maps.services.Geocoder()
        geocoder.coord2Address(lng, lat, (result, status) => {
          if (status !== 'OK') {
            console.error('[getAddressFromCoords] 역지오코딩 실패:', { status, lat, lng })
            resolve(null)
            return
          }
          if (!result?.length) {
            console.error('[getAddressFromCoords] 역지오코딩 결과 없음:', { lat, lng })
            resolve(null)
            return
          }
          const name = result[0].address?.address_name
          if (typeof name !== 'string') {
            console.error('[getAddressFromCoords] address_name 없음:', result[0])
            resolve(null)
            return
          }
          resolve(name)
        })
      })
    })
    .catch((err) => {
      console.error('[getAddressFromCoords] 예외:', err)
      return null
    })
}
