'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { KakaoPostcodeEmbed } from 'react-daum-postcode'
import type { Address } from 'react-daum-postcode'
import { getSupabase } from '@/lib/supabase/client'
import type { DailyOfferInsert } from '@/lib/supabase/database.types'
import { getCoordsFromAddress } from '@/lib/kakao-map'
import KakaoMapView from '@/components/KakaoMapView'

const MAX_OFFERS_PER_DAY = 5
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const LOGGED_IN_STORE_KEY = 'logged_in_store'

const ADMIN_SHOP_INFO_KEY = 'admin_shop_info'
type AdminShopInfo = { store_name: string; address: string }

function loadAdminShopInfo(): AdminShopInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ADMIN_SHOP_INFO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { store_name, address } = parsed as Record<string, unknown>
    if (typeof store_name !== 'string' || typeof address !== 'string') return null
    return { store_name, address }
  } catch {
    return null
  }
}

function saveAdminShopInfo(data: AdminShopInfo): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ADMIN_SHOP_INFO_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

type AdminOfferRow = {
  id: string
  store_name: string
  description: string
  address: string
  total_qty: number
  remain_qty: number
  lat: number | null
  lng: number | null
  image_urls: string[] | null
}

export default function AdminPage() {
  const router = useRouter()
  const [loggedInStoreName, setLoggedInStoreName] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [countsByDate, setCountsByDate] = useState<Record<string, number>>({})
  const [myRegisteredDatesInMonth, setMyRegisteredDatesInMonth] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [offersForSelectedDate, setOffersForSelectedDate] = useState<AdminOfferRow[]>([])
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    description: '',
    total_qty: '',
    address: '',
  })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPostcodeModal, setShowPostcodeModal] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const store = window.localStorage.getItem(LOGGED_IN_STORE_KEY)
    if (!store || !store.trim()) {
      router.replace('/')
      return
    }
    setLoggedInStoreName(store.trim())
  }, [router])

  const MAX_IMAGES = 3
  const BUCKET_NAME = 'offer_images'

  const handlePostcodeComplete = useCallback((data: Address) => {
    let fullAddress = data.address
    if (data.addressType === 'R') {
      let extra = ''
      if (data.bname) extra += data.bname
      if (data.buildingName) extra += extra ? `, ${data.buildingName}` : data.buildingName
      if (extra) fullAddress += ` (${extra})`
    }
    setForm((f) => ({ ...f, address: fullAddress }))
    setShowPostcodeModal(false)
  }, [])

  const fetchCountsForMonth = useCallback(async (month: Date) => {
    const supabase = getSupabase()
    if (!supabase) return
    const start = startOfMonth(month)
    const end = endOfMonth(month)
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')

    const { data, error: fetchError } = await supabase
      .from('daily_offers')
      .select('target_date')
      .gte('target_date', startStr)
      .lte('target_date', endStr)

    if (fetchError) {
      console.error(fetchError)
      setCountsByDate({})
      return
    }

    const rows = (data ?? []) as { target_date: string }[]
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const d = row.target_date
      counts[d] = (counts[d] ?? 0) + 1
    })
    setCountsByDate(counts)
  }, [])

  useEffect(() => {
    if (!loggedInStoreName) return
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false
    setLoading(true)
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')

    supabase
      .from('daily_offers')
      .select('target_date')
      .gte('target_date', startStr)
      .lte('target_date', endStr)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        setLoading(false)
        if (fetchError) {
          console.error(fetchError)
          setCountsByDate({})
          return
        }
        const rows = (data ?? []) as { target_date: string }[]
        const counts: Record<string, number> = {}
        rows.forEach((row: { target_date: string }) => {
          const d = row.target_date
          counts[d] = (counts[d] ?? 0) + 1
        })
        setCountsByDate(counts)
      })

    return () => {
      cancelled = true
    }
  }, [currentMonth, loggedInStoreName])

  const fetchMyRegisteredDatesInMonth = useCallback(async () => {
    if (!loggedInStoreName) return
    const supabase = getSupabase()
    if (!supabase) return
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')
    const { data } = await supabase
      .from('daily_offers')
      .select('target_date')
      .eq('store_name', loggedInStoreName)
      .gte('target_date', startStr)
      .lte('target_date', endStr)
    const rows = (data ?? []) as { target_date: string }[]
    setMyRegisteredDatesInMonth(Array.from(new Set(rows.map((r) => r.target_date))))
  }, [currentMonth, loggedInStoreName])

  useEffect(() => {
    fetchMyRegisteredDatesInMonth()
  }, [fetchMyRegisteredDatesInMonth])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1))

  const fetchOffersForDate = useCallback(
    async (date: Date) => {
      if (!loggedInStoreName) return
      const supabase = getSupabase()
      if (!supabase) return
      const dateStr = format(date, 'yyyy-MM-dd')
      const { data, error: fetchErr } = await supabase
        .from('daily_offers')
        .select('id, store_name, description, address, total_qty, remain_qty, lat, lng, image_urls')
        .eq('target_date', dateStr)
        .eq('store_name', loggedInStoreName)
        .order('created_at', { ascending: true })
      if (fetchErr) {
        setOffersForSelectedDate([])
        return
      }
      setOffersForSelectedDate((data as AdminOfferRow[]) ?? [])
    },
    [loggedInStoreName]
  )

  useEffect(() => {
    if (modalOpen && selectedDate) {
      fetchOffersForDate(selectedDate)
    } else {
      setOffersForSelectedDate([])
      setEditingOfferId(null)
    }
  }, [modalOpen, selectedDate, fetchOffersForDate])

  const handleCellClick = (day: Date) => {
    if (!isSameMonth(day, currentMonth)) return
    setSelectedDate(day)
    const saved = loadAdminShopInfo()
    setForm({
      description: '',
      total_qty: '',
      address: saved?.address ?? '',
    })
    setSelectedFiles([])
    setEditingOfferId(null)
    setError(null)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setSelectedDate(null)
    setSelectedFiles([])
    setEditingOfferId(null)
    setError(null)
  }

  const handleEditClick = (offer: AdminOfferRow) => {
    setEditingOfferId(offer.id)
    setForm({
      description: offer.description,
      total_qty: String(offer.total_qty),
      address: offer.address,
    })
    setSelectedFiles([])
    setError(null)
  }

  const handleDeleteClick = async (offer: AdminOfferRow) => {
    if (!loggedInStoreName || !confirm('정말 삭제하시겠습니까?')) return
    const supabase = getSupabase()
    if (!supabase) return
    const { error: deleteError } = await supabase
      .from('daily_offers')
      .delete()
      .eq('id', offer.id)
      .eq('store_name', loggedInStoreName)
    if (deleteError) {
      setError(deleteError.message || '삭제에 실패했습니다.')
      return
    }
    await fetchOffersForDate(selectedDate!)
    await fetchCountsForMonth(currentMonth)
    await fetchMyRegisteredDatesInMonth()
    setError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const combined = [...selectedFiles, ...list].slice(0, MAX_IMAGES)
    setSelectedFiles(combined)
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDate || !loggedInStoreName) return

    const description = form.description.trim()
    const total_qty = form.total_qty.trim()
    const address = form.address.trim()

    if (!description) {
      setError('혜택 내용을 입력해 주세요.')
      return
    }
    const qty = parseInt(total_qty, 10)
    if (!total_qty || isNaN(qty) || qty < 1) {
      setError('수량은 1 이상의 숫자를 입력해 주세요.')
      return
    }
    if (!address) {
      setError('주소를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setError(null)

    const supabase = getSupabase()
    if (!supabase) {
      setSubmitting(false)
      setError('연결을 사용할 수 없습니다.')
      return
    }

    const isEdit = editingOfferId !== null

    if (isEdit) {
      const existing = offersForSelectedDate.find((o) => o.id === editingOfferId)
      const newRemainQty = existing
        ? Math.min(existing.remain_qty, qty)
        : qty
      const coords = await getCoordsFromAddress(address)
      const { error: updateError } = await (supabase as any)
        .from('daily_offers')
        .update({
          description,
          address,
          total_qty: qty,
          remain_qty: newRemainQty,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
        .eq('id', editingOfferId)
        .eq('store_name', loggedInStoreName)
      setSubmitting(false)
      if (updateError) {
        setError(updateError.message || '수정에 실패했습니다.')
        return
      }
      await fetchOffersForDate(selectedDate)
      await fetchCountsForMonth(currentMonth)
      await fetchMyRegisteredDatesInMonth()
      setEditingOfferId(null)
      setForm({ description: '', total_qty: '', address: '' })
      setSelectedFiles([])
      return
    }

    let imageUrls: string[] = []
    if (selectedFiles.length > 0) {
      try {
        const uploadPromises = selectedFiles.map(async (file) => {
          const ext = file.name.split('.').pop() || 'jpg'
          const path = `${crypto.randomUUID()}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(path, file, { cacheControl: '3600', upsert: false })
          if (uploadError) throw uploadError
          const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
          return data.publicUrl
        })
        imageUrls = await Promise.all(uploadPromises)
      } catch (err: unknown) {
        setSubmitting(false)
        setError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.')
        return
      }
    }

    const coords = await getCoordsFromAddress(address)
    const payload: DailyOfferInsert = {
      target_date: format(selectedDate, 'yyyy-MM-dd'),
      store_name: loggedInStoreName,
      description,
      total_qty: qty,
      remain_qty: qty,
      address,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
    }

    const { error: insertError } = await supabase.from('daily_offers').insert(payload as any)

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message || '등록에 실패했습니다.')
      return
    }

    saveAdminShopInfo({ store_name: loggedInStoreName, address })

    await fetchOffersForDate(selectedDate)
    await fetchCountsForMonth(currentMonth)
    await fetchMyRegisteredDatesInMonth()
    const saved = loadAdminShopInfo()
    setForm({
      description: '',
      total_qty: '',
      address: saved?.address ?? '',
    })
    setSelectedFiles([])
  }

  if (loggedInStoreName === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-500 text-sm">로그인 확인 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src="/logo.png"
            alt="오늘동네"
            width={140}
            height={40}
            className="h-10 w-auto flex-shrink-0 object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-800 truncate">
              {loggedInStoreName} 사장님, 환영합니다!
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              날짜를 선택하면 해당 날짜에 혜택을 등록할 수 있습니다. (일당 최대 5건)
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 메인
        </Link>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="이전 달"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-gray-800">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="다음 달"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-xs sm:text-sm">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`py-2 font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}
              >
                {label}
              </div>
            ))}
            {loading ? (
              <div className="col-span-7 py-12 text-gray-400">로딩 중...</div>
            ) : (
              days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const count = countsByDate[key] ?? 0
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isFull = count >= MAX_OFFERS_PER_DAY
                const isNearFull = count === MAX_OFFERS_PER_DAY - 1
                const isClickable = isCurrentMonth

                const dateStr = format(day, 'yyyy-MM-dd')
                const isMyRegistered = isCurrentMonth && myRegisteredDatesInMonth.includes(dateStr)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!isClickable}
                    onClick={() => handleCellClick(day)}
                    className={`
                      min-h-[64px] sm:min-h-[80px] rounded-lg flex flex-col items-center justify-center gap-0.5
                      text-sm transition-colors
                      ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-800'}
                      ${isFull ? 'bg-gray-100' : ''}
                      ${isMyRegistered ? 'ring-1 ring-emerald-300 bg-emerald-50/70' : ''}
                      ${isClickable ? 'hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 active:bg-sky-100' : ''}
                      ${isClickable && !isFull && !isMyRegistered ? 'bg-white' : ''}
                    `}
                  >
                    <span className="font-medium">{format(day, 'd')}</span>
                    {isMyRegistered ? (
                      <span className="text-xs font-medium text-emerald-700">✅ 혜택 등록됨</span>
                    ) : isFull ? (
                      <span className="text-xs font-medium text-gray-500">마감</span>
                    ) : (
                      <span
                        className={`
                          inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium
                          ${isNearFull ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}
                        `}
                      >
                        {count}/{MAX_OFFERS_PER_DAY}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {modalOpen && selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="bg-white w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3">
              <h2 id="modal-title" className="text-lg font-semibold text-gray-800">
                {format(selectedDate, 'yyyy년 M월 d일', { locale: ko })} 혜택
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="absolute top-3 right-4 p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {offersForSelectedDate.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    등록된 혜택 ({offersForSelectedDate.length}건)
                  </h3>
                  <ul className="space-y-2">
                    {offersForSelectedDate.map((offer) => (
                      <li
                        key={offer.id}
                        className={`rounded-lg border p-3 ${
                          editingOfferId === offer.id
                            ? 'border-sky-400 bg-sky-50/50'
                            : 'border-gray-200 bg-gray-50/50'
                        }`}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">{offer.store_name}</p>
                            <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">{offer.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              남은 수량: {offer.remain_qty} / {offer.total_qty}
                            </p>
                          </div>
                          <div className="flex gap-2 mt-2 sm:mt-0 sm:flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditClick(offer)}
                              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(offer)}
                              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                            >
                              삭제(취소)
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {editingOfferId ? '혜택 수정' : '새 혜택 등록'}
              </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
                  {error}
                </div>
              )}
              <p className="text-sm text-gray-600 py-1">등록 가게: <strong>{loggedInStoreName}</strong></p>
              <div>
                <label htmlFor="admin_description" className="block text-sm font-medium text-gray-700 mb-1">
                  혜택 내용
                </label>
                <textarea
                  id="admin_description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                  placeholder="예: 커피 1잔 무료"
                />
              </div>
              <div>
                <label htmlFor="admin_total_qty" className="block text-sm font-medium text-gray-700 mb-1">
                  수량
                </label>
                <input
                  id="admin_total_qty"
                  type="number"
                  min={1}
                  value={form.total_qty}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '')
                    setForm((f) => ({ ...f, total_qty: v }))
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="숫자만 입력"
                />
              </div>
              <div>
                <label htmlFor="admin_address" className="block text-sm font-medium text-gray-700 mb-1">
                  주소
                </label>
                <div className="flex gap-2">
                  <input
                    id="admin_address"
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="가게 주소를 입력하세요"
                    autoComplete="street-address"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPostcodeModal(true)}
                    className="flex-shrink-0 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 active:bg-sky-800"
                  >
                    주소 검색
                  </button>
                </div>
                {form.address.trim() && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-600 mb-1.5">
                      📍 위치 확인 — 지도에 표시된 위치가 맞는지 확인해 주세요
                    </p>
                    <KakaoMapView
                      address={form.address.trim()}
                      storeName={loggedInStoreName || '가게 위치'}
                      height="160px"
                      className="rounded-xl overflow-hidden border border-gray-200"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사진 첨부 (최대 {MAX_IMAGES}장)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sky-700 file:font-medium"
                />
                {selectedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700"
                      >
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-50"
                          aria-label="제거"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                {editingOfferId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOfferId(null)
                        setForm({ description: '', total_qty: '', address: '' })
                        setSelectedFiles([])
                      }}
                      className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                    >
                      수정 취소
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '저장 중...' : '저장'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || offersForSelectedDate.length >= MAX_OFFERS_PER_DAY}
                      className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '처리 중...' : '신청하기'}
                    </button>
                  </>
                )}
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* 다음(카카오) 우편번호 검색 모달 */}
      {showPostcodeModal && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/50 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="주소 검색"
          onClick={() => setShowPostcodeModal(false)}
        >
          <div
            className="bg-white w-full max-w-lg mx-auto rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-medium text-gray-700">주소 검색</span>
              <button
                type="button"
                onClick={() => setShowPostcodeModal(false)}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-600"
                aria-label="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto min-h-[400px]">
              <KakaoPostcodeEmbed
                onComplete={handlePostcodeComplete}
                onClose={() => setShowPostcodeModal(false)}
                style={{ width: '100%', height: 450 }}
                autoClose
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
