-- remain_qty 컬럼 추가 (기존 행은 total_qty와 동일하게 설정)
alter table public.daily_offers
  add column if not exists remain_qty integer;

update public.daily_offers
set remain_qty = total_qty
where remain_qty is null;

alter table public.daily_offers
  alter column remain_qty set not null,
  add constraint daily_offers_remain_qty_check check (remain_qty >= 0);

-- 새 행 insert 시 remain_qty 기본값 = total_qty
create or replace function public.set_remain_qty_default()
returns trigger as $$
begin
  if new.remain_qty is null then
    new.remain_qty := new.total_qty;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_remain_qty_trigger on public.daily_offers;
create trigger set_remain_qty_trigger
  before insert on public.daily_offers
  for each row execute function public.set_remain_qty_default();

-- RPC: claim_coupon(offer_id) → 발급 순번(양수) 반환, 실패 시 0
create or replace function public.claim_coupon(p_offer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remain integer;
  v_total integer;
  v_claim_no integer;
begin
  select remain_qty, total_qty
  into v_remain, v_total
  from daily_offers
  where id = p_offer_id
  for update;

  if not found or v_remain is null then
    return 0;
  end if;
  if v_remain <= 0 then
    return 0;
  end if;

  update daily_offers
  set remain_qty = remain_qty - 1
  where id = p_offer_id;

  v_claim_no := v_total - v_remain + 1;  -- 1, 2, 3, ...
  return v_claim_no;
end;
$$;

-- anon이 RPC 실행 가능
grant execute on function public.claim_coupon(uuid) to anon;
grant execute on function public.claim_coupon(uuid) to authenticated;

-- Realtime: 변경 시 전체 행 전달 (remain_qty 업데이트 반영)
alter table public.daily_offers replica identity full;

-- Realtime publication에 테이블 추가 (이미 추가된 경우 에러 무시 가능)
alter publication supabase_realtime add table public.daily_offers;
