-- daily_offers에 image_urls 컬럼 추가 (사진 URL 배열)
alter table public.daily_offers
  add column if not exists image_urls text[] default '{}';

comment on column public.daily_offers.image_urls is 'Supabase Storage offer_images 버킷의 공개 URL 배열 (최대 3장)';

-- Supabase Storage: 'offer_images' 버킷은 대시보드에서 생성 후 Public으로 설정하세요.
-- Storage > New bucket > Name: offer_images, Public bucket: ON
-- Policies 예시 (anon 업로드 허용):
-- insert: (bucket_id = 'offer_images' and true)
-- select: (bucket_id = 'offer_images' and true)
