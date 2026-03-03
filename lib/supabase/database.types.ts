export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      store_owners: {
        Row: { store_name: string; password: string }
        Insert: { store_name: string; password: string }
        Update: { store_name?: string; password?: string }
      }
      daily_offers: {
        Row: {
          id: string
          target_date: string
          store_name: string
          description: string
          total_qty: number
          remain_qty: number
          address: string
          detail_address: string | null
          available_time: string | null
          lat: number | null
          lng: number | null
          image_urls: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          target_date: string
          store_name: string
          description: string
          total_qty: number
          remain_qty?: number
          address: string
          detail_address?: string | null
          available_time?: string | null
          lat?: number | null
          lng?: number | null
          image_urls?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          target_date?: string
          store_name?: string
          description?: string
          total_qty?: number
          remain_qty?: number
          address?: string
          detail_address?: string | null
          available_time?: string | null
          lat?: number | null
          lng?: number | null
          image_urls?: string[] | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      claim_coupon: {
        Args: { p_offer_id: string }
        Returns: number
      }
    }
    Enums: Record<string, never>
  }
}

export type DailyOffer = Database['public']['Tables']['daily_offers']['Row']
export type DailyOfferInsert = Database['public']['Tables']['daily_offers']['Insert']
