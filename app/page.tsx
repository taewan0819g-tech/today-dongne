'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { getSupabase } from '@/lib/supabase/client'
import { haversineDistance, formatDistance, getAddressFromCoords } from '@/lib/kakao-map'
import KakaoMapView from '@/components/KakaoMapView'

type OfferRow = {
  id: string
  target_date: string
  store_name: string
  description: string
  total_qty: number
  remain_qty: number
  address: string
  detail_address?: string | null
  lat: number | null
  lng: number | null
  image_urls: string[] | null
}

const DAILY_COUPON_STATUS_KEY = 'daily_coupon_status'
type DailyCouponStatus = { claimDate: string; offerId: string; issuedNumber: number }

function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function loadDailyStatus(): DailyCouponStatus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DAILY_COUPON_STATUS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const { claimDate, offerId, issuedNumber } = parsed as Record<string, unknown>
    if (typeof claimDate !== 'string' || typeof offerId !== 'string' || typeof issuedNumber !== 'number') return null
    const today = getToday()
    if (claimDate !== today) {
      window.localStorage.removeItem(DAILY_COUPON_STATUS_KEY)
      return null
    }
    return { claimDate, offerId, issuedNumber }
  } catch {
    return null
  }
}

function saveDailyStatus(data: DailyCouponStatus): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DAILY_COUPON_STATUS_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export default function Home() {
  const router = useRouter()
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [dailyStatus, setDailyStatus] = useState<DailyCouponStatus | null>(null)
  const [ticketModal, setTicketModal] = useState<{
    claimNo: number
    store_name: string
    description: string
  } | null>(null)
  const [liveTime, setLiveTime] = useState(() => new Date())
  const [showOwnerModal, setShowOwnerModal] = useState(false)
  const [ownerStoreName, setOwnerStoreName] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLabel, setLocationLabel] = useState<string | null>(null)
  /** 'denied' = 권한 거부, 'unavailable' = 위치 조회 실패/타임아웃 */
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | null>(null)
  const [locationRefreshLoading, setLocationRefreshLoading] = useState(false)
  const [distances, setDistances] = useState<Record<string, number>>({})
  const [showQrModal, setShowQrModal] = useState(false)
  const [shareOrigin, setShareOrigin] = useState('')
  const selectedOffer = selectedOfferId
    ? offers.find((o) => o.id === selectedOfferId) ?? null
    : null

  const fetchTodayOffers = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const today = getToday()
    const { data, error } = await supabase
      .from('daily_offers')
      .select('id, target_date, store_name, description, total_qty, remain_qty, address, detail_address, lat, lng, image_urls')
      .eq('target_date', today)
      .order('created_at', { ascending: true })
      .limit(5)

    if (error) {
      console.error(error)
      setOffers([])
      return
    }
    const rows = (data as OfferRow[]) ?? []
    // UI 테스트용: lat/lng 없는 행에 춘천 효자동 근처 Mock 좌표 부여
    const MOCK_COORDS = [
      { lat: 37.871, lng: 127.746 },
      { lat: 37.86, lng: 127.73 },
      { lat: 37.868, lng: 127.738 },
      { lat: 37.875, lng: 127.75 },
      { lat: 37.862, lng: 127.735 },
    ]
    const withMock = rows.map((row, i) => {
      const needMock = row.lat == null || row.lng == null
      if (!needMock) return row
      const mock = MOCK_COORDS[i % MOCK_COORDS.length]
      return { ...row, lat: mock.lat, lng: mock.lng }
    })
    setOffers(withMock)
  }, [])

  useEffect(() => {
    fetchTodayOffers().finally(() => setLoading(false))
  }, [fetchTodayOffers])

  useEffect(() => {
    setDailyStatus(loadDailyStatus())
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') setShareOrigin(window.location.origin)
  }, [])

  const fetchLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('unavailable')
      return
    }
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(coords)
        setLocationError(null)
        getAddressFromCoords(coords.lat, coords.lng).then((addr) => {
          setLocationLabel(addr ?? '주소를 가져올 수 없습니다')
        })
      },
      (err: GeolocationPositionError) => {
        setUserLocation(null)
        setLocationLabel(null)
        if (err.code === 1) {
          setLocationError('denied')
        } else {
          setLocationError('unavailable')
        }
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    )
  }, [])

  useEffect(() => {
    fetchLocation()
  }, [fetchLocation])

  useEffect(() => {
    if (!userLocation || offers.length === 0) return
    const next: Record<string, number> = {}
    offers.forEach((offer) => {
      if (offer.lat != null && offer.lng != null) {
        next[offer.id] = haversineDistance(userLocation, { lat: offer.lat, lng: offer.lng })
      }
    })
    setDistances((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [userLocation, offers])

  useEffect(() => {
    if (
      selectedOfferId &&
      !offers.some((o) => o.id === selectedOfferId)
    ) {
      setSelectedOfferId(null)
    }
  }, [offers, selectedOfferId])

  useEffect(() => {
    if (!ticketModal) return
    const timer = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [ticketModal])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel('daily_offers_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_offers' },
        () => {
          fetchTodayOffers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchTodayOffers])

  const handleRefreshLocation = useCallback(() => {
    setLocationRefreshLoading(true)
    setLocationError(null)
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('unavailable')
      setLocationRefreshLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(coords)
        setLocationError(null)
        getAddressFromCoords(coords.lat, coords.lng).then((addr) => {
          setLocationLabel(addr ?? '주소를 가져올 수 없습니다')
          setLocationRefreshLoading(false)
        })
      },
      (err: GeolocationPositionError) => {
        setUserLocation(null)
        setLocationLabel(null)
        if (err.code === 1) setLocationError('denied')
        else setLocationError('unavailable')
        setLocationRefreshLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }, [])

  const handleClaim = async (offerId: string) => {
    const supabase = getSupabase()
    if (!supabase) return
    setClaimingId(offerId)
    const { data, error } = await (supabase as any).rpc('claim_coupon', {
      offer_id: offerId,
    })
    console.log('발급 결과:', data, error)
    setClaimingId(null)

    if (error) {
      console.error(error)
      alert('이미 마감되었거나 발급 중 오류가 발생했습니다.')
      return
    }
    const claimNo = typeof data === 'number' ? data : 0
    if (claimNo <= 0) {
      alert('이미 마감되었거나 발급 중 오류가 발생했습니다.')
      return
    }
    const offer = offers.find((o) => o.id === offerId)
    const today = getToday()
    const next: DailyCouponStatus = { claimDate: today, offerId, issuedNumber: claimNo }
    saveDailyStatus(next)
    setDailyStatus(next)
    setTicketModal({
      claimNo,
      store_name: offer?.store_name ?? '',
      description: offer?.description ?? '',
    })
    setLiveTime(new Date())
    fetchTodayOffers()
  }

  const handleShowMyTicket = (offer: OfferRow) => {
    if (!dailyStatus || dailyStatus.offerId !== offer.id) return
    setTicketModal({
      claimNo: dailyStatus.issuedNumber,
      store_name: offer.store_name,
      description: offer.description,
    })
    setLiveTime(new Date())
  }

  const today = getToday()
  const hasClaimedToday = dailyStatus !== null && dailyStatus.claimDate === today
  const isMyClaimedOffer = (offerId: string) => hasClaimedToday && dailyStatus!.offerId === offerId

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const storeName = ownerStoreName.trim()
    const password = ownerPassword
    if (!storeName) {
      setOwnerError('가게 이름을 입력해 주세요.')
      return
    }
    setOwnerError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setOwnerError('연결을 사용할 수 없습니다.')
      return
    }
    const { data: existing, error: fetchErr } = await (supabase as any)
      .from('store_owners')
      .select('store_name, password')
      .eq('store_name', storeName)
      .maybeSingle()
    if (fetchErr) {
      setOwnerError('확인 중 오류가 발생했습니다.')
      return
    }
    if (!existing) {
      const { error: insertErr } = await (supabase as any)
        .from('store_owners')
        .insert({ store_name: storeName, password })
      if (insertErr) {
        setOwnerError(insertErr.message || '가입에 실패했습니다.')
        return
      }
    } else {
      if (existing.password !== password) {
        setOwnerError('비밀번호가 틀렸습니다.')
        return
      }
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('logged_in_store', storeName)
    }
    setShowOwnerModal(false)
    setOwnerStoreName('')
    setOwnerPassword('')
    setOwnerError(null)
    router.push('/admin')
  }

  return (
    <main className="min-h-screen flex flex-col pb-24">
      <header className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center justify-center sm:justify-start">
              <Image
                src="/logo.png"
                alt="오늘동네"
                width={160}
                height={44}
                className="h-11 w-auto object-contain"
                priority
              />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {format(new Date(), 'M월 d일 (EEE)', { locale: ko })} 오늘의 혜택
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="flex-shrink-0 px-3 py-2 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200 active:bg-sky-300"
          >
            📱 QR로 공유하기
          </button>
        </div>
      </header>

      {/* 현재 위치 + 위치 초기화 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">
          📍 현재 위치:{' '}
          <span className={`font-medium ${locationError ? 'text-amber-600' : 'text-gray-900'}`}>
            {locationError === 'denied'
              ? '위치 권한을 허용해 주세요'
              : locationError === 'unavailable'
                ? '위치를 찾을 수 없습니다'
                : locationLabel ?? (userLocation ? '변환 중...' : '확인 중...')}
          </span>
        </span>
        <button
          type="button"
          onClick={handleRefreshLocation}
          disabled={locationRefreshLoading}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 font-medium hover:bg-sky-200 active:bg-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {locationRefreshLoading ? '위치 확인 중...' : '위치 초기화(새로고침)'}
        </button>
      </div>

      <div className="flex-1 px-4 py-4">
        {selectedOffer ? (
          /* 상세 화면 (Conditional Rendering, 라우팅 없음) */
          <div className="flex flex-col min-h-[calc(100vh-8rem)] pb-20">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3 mb-4">
              <button
                type="button"
                onClick={() => setSelectedOfferId(null)}
                className="flex-shrink-0 p-2 -ml-2 rounded-lg hover:bg-gray-200 text-gray-700"
                aria-label="뒤로가기"
              >
                <span className="text-xl font-bold">&lt;</span>
              </button>
              <span className="text-sm text-gray-500">내용보기</span>
            </div>

            {selectedOffer.image_urls && selectedOffer.image_urls.length > 0 && (
              <div className="w-full overflow-x-auto snap-x snap-mandatory flex gap-0 -mx-4 mb-4">
                {selectedOffer.image_urls.map((url, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-full max-w-full aspect-[4/3] snap-center bg-gray-100"
                  >
                    <img
                      src={url}
                      alt={`${selectedOffer.store_name} ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">{selectedOffer.store_name}</h2>
              <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                {selectedOffer.description}
              </p>
              <p className="text-sm text-gray-600">{selectedOffer.address}</p>
              {typeof distances[selectedOffer.id] === 'number' && (
                <p className="text-sm text-sky-600 font-medium">
                  📍 {formatDistance(distances[selectedOffer.id])}
                </p>
              )}
              {selectedOffer.lat != null && selectedOffer.lng != null ? (
                <>
                  <KakaoMapView
                    lat={selectedOffer.lat}
                    lng={selectedOffer.lng}
                    storeName={selectedOffer.store_name}
                    height="200px"
                    className="mt-2"
                  />
                  {selectedOffer.detail_address && (
                    <p className="text-sm text-gray-500 mt-2">상세 주소: {selectedOffer.detail_address}</p>
                  )}
                </>
              ) : (
                <KakaoMapView
                  address={selectedOffer.address}
                  storeName={selectedOffer.store_name}
                  height="200px"
                  className="mt-2"
                />
              )}
              <p className="text-sm text-gray-500">
                남은 수량: {selectedOffer.remain_qty}개 / 전체 {selectedOffer.total_qty}개
              </p>
            </div>

            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gray-50 border-t border-gray-200">
              {isMyClaimedOffer(selectedOffer.id) ? (
                <button
                  type="button"
                  onClick={() => handleShowMyTicket(selectedOffer)}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600 active:bg-emerald-700"
                >
                  🎫 내 티켓 보기
                </button>
              ) : hasClaimedToday ? (
                <span className="block w-full py-3 rounded-xl bg-gray-200 text-gray-500 text-center font-medium">
                  오늘 혜택 수령 완료
                </span>
              ) : selectedOffer.remain_qty <= 0 ? (
                <span className="block w-full py-3 rounded-xl bg-gray-200 text-gray-500 text-center font-medium">
                  마감
                </span>
              ) : (
                <button
                  type="button"
                  disabled={claimingId === selectedOffer.id}
                  onClick={() => handleClaim(selectedOffer.id)}
                  className="w-full py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                >
                  {claimingId === selectedOffer.id ? '처리 중...' : '선택 (쿠폰 받기)'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="py-12 text-center text-gray-500 text-sm">로딩 중...</div>
            ) : offers.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">
                오늘 등록된 혜택이 없습니다.
              </div>
            ) : (
              <ul className="space-y-3">
                {offers.map((offer) => {
                  const soldOut = offer.remain_qty <= 0
                  return (
                    <li
                      key={offer.id}
                      className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{offer.store_name}</p>
                          <p className="text-sm text-gray-700 mt-0.5">{offer.description}</p>
                          <p className="text-xs text-gray-500 mt-1">{offer.address}{offer.detail_address ? ` ${offer.detail_address}` : ''}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {typeof distances[offer.id] === 'number' && (
                              <span className="text-xs text-sky-600 font-medium">
                                📍 {formatDistance(distances[offer.id])}
                              </span>
                            )}
                            <p className="text-xs text-gray-600">
                              남은 수량: {offer.remain_qty}개 / 전체 {offer.total_qty}개
                            </p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 pt-2 sm:pt-0 sm:pl-2 flex flex-wrap gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setSelectedOfferId(offer.id)}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                          >
                            내용보기
                          </button>
                          {isMyClaimedOffer(offer.id) ? (
                            <button
                              type="button"
                              onClick={() => handleShowMyTicket(offer)}
                              className="min-w-[100px] px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 active:bg-emerald-700"
                            >
                              🎫 내 티켓 보기
                            </button>
                          ) : hasClaimedToday ? (
                            <span className="inline-block min-w-[120px] px-4 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium cursor-not-allowed text-center">
                              오늘 혜택 수령 완료
                            </span>
                          ) : soldOut ? (
                            <span className="inline-block px-4 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium cursor-not-allowed text-center">
                              마감
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={claimingId === offer.id}
                              onClick={() => handleClaim(offer.id)}
                              className="min-w-[72px] px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {claimingId === offer.id ? '처리 중...' : '선택'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* 스크롤 맨 밑: 사장님 혜택 신청 */}
            <div className="mt-12 pb-8 text-center">
              <button
                type="button"
                onClick={() => setShowOwnerModal(true)}
                className="text-gray-400 hover:text-gray-500 text-xs"
              >
                사장님 혜택 신청하기
              </button>
            </div>
          </>
        )}
      </div>

      {/* 사장님 로그인/가입 모달 */}
      {showOwnerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setShowOwnerModal(false)
            setOwnerError(null)
            setOwnerStoreName('')
            setOwnerPassword('')
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-3">사장님 로그인</h2>
            <p className="text-sm text-gray-500 mb-4">가게 이름과 비밀번호를 입력하세요. (처음이면 자동 가입됩니다)</p>
            <form onSubmit={handleOwnerSubmit} className="space-y-3">
              <input
                type="text"
                value={ownerStoreName}
                onChange={(e) => setOwnerStoreName(e.target.value)}
                placeholder="가게 이름"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                autoComplete="organization"
                autoFocus
              />
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                autoComplete="current-password"
              />
              {ownerError && (
                <p className="text-sm text-red-600">{ownerError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowOwnerModal(false)
                    setOwnerStoreName('')
                    setOwnerPassword('')
                    setOwnerError(null)
                  }}
                  className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium"
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR 코드 공유 모달 */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQrModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="QR 코드로 앱 공유"
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">앱 공유하기</h2>
            <p className="text-sm text-gray-500 mb-4">QR 코드를 스캔하면 이 주소로 접속해요</p>
            {shareOrigin ? (
              <div className="bg-white p-3 rounded-xl border border-gray-200 inline-block">
                <QRCodeSVG value={shareOrigin} size={220} level="M" />
              </div>
            ) : (
              <div className="w-[220px] h-[220px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                로딩 중...
              </div>
            )}
            <p className="mt-3 text-xs text-gray-400 break-all max-w-full px-2">{shareOrigin || '-'}</p>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full py-3 rounded-xl bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 active:bg-gray-400"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 쿠폰 발급 완료 모달 (티켓) - 캡처 방지·실시간 타이머·발급 번호 강조 */}
      {ticketModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setTicketModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-2 ring-amber-400/80 ticket-shimmer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="select-none pointer-events-none p-6 pb-4 text-center">
              <p className="text-sm font-medium text-gray-500 tabular-nums">
                {format(liveTime, 'yyyy.MM.dd HH:mm:ss')}
              </p>
              <p className="mt-4 text-lg font-bold text-orange-600">
                이 카드를 사장님에게 보여주세요
              </p>
              {ticketModal.store_name && (
                <p className="mt-3 text-base font-semibold text-gray-900">
                  {ticketModal.store_name}
                </p>
              )}
              {ticketModal.description && (
                <p className="mt-1 text-sm text-gray-600">{ticketModal.description}</p>
              )}
              <p className="mt-6 text-5xl font-extrabold tracking-tight text-sky-600">
                발급 번호: {ticketModal.claimNo}번
              </p>
            </div>
            <div className="pointer-events-auto border-t border-gray-200 bg-gray-50 p-4">
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="w-full py-3.5 rounded-xl bg-sky-600 text-white text-base font-semibold hover:bg-sky-700 active:bg-sky-800"
              >
                확인 완료 / 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
