-- daily_offers: 날짜별 혜택 신청 (일당 최대 5건 제한은 앱에서 처리)
create table if not exists public.daily_offers (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  store_name text not null,
  description text not null,
  total_qty integer not null check (total_qty > 0),
  remain_qty integer,
  address text not null,
  created_at timestamptz not null default now()
);

-- 인덱스: 월별 조회용
create index if not exists idx_daily_offers_target_date on public.daily_offers (target_date);

-- RLS: 배포 시 정책을 인증 사용자만 허용하도록 변경 권장
alter table public.daily_offers enable row level security;

-- anon 키로 조회/삽입 가능 (사장님 신청 페이지용). 배포 시 정책 수정 권장.
create policy "Allow anon select" on public.daily_offers for select to anon using (true);
create policy "Allow anon insert" on public.daily_offers for insert to anon with check (true);
