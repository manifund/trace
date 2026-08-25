export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cause_areas: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          slug: string
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          slug: string
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "cause_areas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cause_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      dedup_candidates: {
        Row: {
          grant_id_a: string
          grant_id_b: string
          id: string
          reason: string | null
          resolved_at: string | null
          score: number | null
          status: string
        }
        Insert: {
          grant_id_a: string
          grant_id_b: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          score?: number | null
          status?: string
        }
        Update: {
          grant_id_a?: string
          grant_id_b?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          score?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dedup_candidates_grant_id_a_fkey"
            columns: ["grant_id_a"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_candidates_grant_id_b_fkey"
            columns: ["grant_id_b"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_cause_areas: {
        Row: {
          cause_area_id: string
          grant_id: string
        }
        Insert: {
          cause_area_id: string
          grant_id: string
        }
        Update: {
          cause_area_id?: string
          grant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_cause_areas_cause_area_id_fkey"
            columns: ["cause_area_id"]
            isOneToOne: false
            referencedRelation: "cause_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_cause_areas_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_sources: {
        Row: {
          grant_id: string
          is_primary: boolean
          source_record_id: string
        }
        Insert: {
          grant_id: string
          is_primary?: boolean
          source_record_id: string
        }
        Update: {
          grant_id?: string
          is_primary?: boolean
          source_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_sources_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_sources_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_vias: {
        Row: {
          grant_id: string
          via_org_id: string
        }
        Insert: {
          grant_id: string
          via_org_id: string
        }
        Update: {
          grant_id?: string
          via_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_vias_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_vias_via_org_id_fkey"
            columns: ["via_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      grants: {
        Row: {
          amount: number | null
          amount_estimated: boolean
          amount_usd: number | null
          created_at: string
          currency: string
          date_precision: string | null
          description: string | null
          estimate_note: string | null
          fiscal_sponsor_org_id: string | null
          funder_org_id: string
          grant_date: string | null
          id: string
          recipient_org_id: string
          round: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          amount?: number | null
          amount_estimated?: boolean
          amount_usd?: number | null
          created_at?: string
          currency?: string
          date_precision?: string | null
          description?: string | null
          estimate_note?: string | null
          fiscal_sponsor_org_id?: string | null
          funder_org_id: string
          grant_date?: string | null
          id?: string
          recipient_org_id: string
          round?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          amount?: number | null
          amount_estimated?: boolean
          amount_usd?: number | null
          created_at?: string
          currency?: string
          date_precision?: string | null
          description?: string | null
          estimate_note?: string | null
          fiscal_sponsor_org_id?: string | null
          funder_org_id?: string
          grant_date?: string | null
          id?: string
          recipient_org_id?: string
          round?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grants_fiscal_sponsor_org_id_fkey"
            columns: ["fiscal_sponsor_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_funder_org_id_fkey"
            columns: ["funder_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_recipient_org_id_fkey"
            columns: ["recipient_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      org_names: {
        Row: {
          id: string
          kind: string
          name: string
          normalized: string
          note: string | null
          org_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          id?: string
          kind?: string
          name: string
          normalized: string
          note?: string | null
          org_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          id?: string
          kind?: string
          name?: string
          normalized?: string
          note?: string | null
          org_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_names_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          needs_review: boolean
          org_type: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          needs_review?: boolean
          org_type?: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          needs_review?: boolean
          org_type?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      source_records: {
        Row: {
          content_hash: string
          first_seen_at: string
          id: string
          last_seen_at: string
          raw: Json
          removed_at: string | null
          source_id: string
          source_record_key: string
        }
        Insert: {
          content_hash: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          raw: Json
          removed_at?: string | null
          source_id: string
          source_record_key: string
        }
        Update: {
          content_hash?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          raw?: Json
          removed_at?: string | null
          source_id?: string
          source_record_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          id: string
          last_ingested_at: string | null
          license: string | null
          name: string
          notes: string | null
          tier: number
          url: string | null
        }
        Insert: {
          id: string
          last_ingested_at?: string | null
          license?: string | null
          name: string
          notes?: string | null
          tier?: number
          url?: string | null
        }
        Update: {
          id?: string
          last_ingested_at?: string | null
          license?: string | null
          name?: string
          notes?: string | null
          tier?: number
          url?: string | null
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          applied_at: string | null
          comment: string | null
          created_at: string
          grant_id: string | null
          id: string
          kind: string
          payload: Json
          review_note: string | null
          reviewed_at: string | null
          reviewer: string | null
          source_url: string | null
          status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          comment?: string | null
          created_at?: string
          grant_id?: string | null
          id?: string
          kind: string
          payload: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          source_url?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          comment?: string | null
          created_at?: string
          grant_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          source_url?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
