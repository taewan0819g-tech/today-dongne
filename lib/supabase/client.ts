import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null

/** 브라우저에서만 단일 인스턴스를 반환합니다. 컴포넌트 내부가 아닌 여기서만 생성합니다. */
export function getSupabase(): ReturnType<typeof createSupabaseClient<Database>> | null {
  if (typeof window === 'undefined') return null
  if (client) return client
  client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return client
}
