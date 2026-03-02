-- Supabase SQL Editor에서 실행: daily_offers에 위도/경도 컬럼 추가
ALTER TABLE public.daily_offers
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;
