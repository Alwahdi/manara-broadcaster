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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          created_at: string
          id: string
          kind: string
          reason: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          reason?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          reason?: string | null
          value?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          auto_start: boolean | null
          bitrate_kbps: number | null
          category: string | null
          codec: string | null
          created_at: string
          description: string
          fps: number | null
          id: string
          is_active: boolean
          name: string
          poster_url: string | null
          resolution: string | null
          slug: string | null
          sort_order: number
          source_kind: string | null
          stream_url: string
          updated_at: string
        }
        Insert: {
          auto_start?: boolean | null
          bitrate_kbps?: number | null
          category?: string | null
          codec?: string | null
          created_at?: string
          description?: string
          fps?: number | null
          id?: string
          is_active?: boolean
          name: string
          poster_url?: string | null
          resolution?: string | null
          slug?: string | null
          sort_order?: number
          source_kind?: string | null
          stream_url: string
          updated_at?: string
        }
        Update: {
          auto_start?: boolean | null
          bitrate_kbps?: number | null
          category?: string | null
          codec?: string | null
          created_at?: string
          description?: string
          fps?: number | null
          id?: string
          is_active?: boolean
          name?: string
          poster_url?: string | null
          resolution?: string | null
          slug?: string | null
          sort_order?: number
          source_kind?: string | null
          stream_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_device_state: {
        Row: {
          app_version: string | null
          broadcast_channels: Json
          created_at: string
          hardware_id: string
          id: string
          last_pulled_at: string | null
          license_key: string
          local_iptv_channels: Json
          settings: Json
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          broadcast_channels?: Json
          created_at?: string
          hardware_id: string
          id?: string
          last_pulled_at?: string | null
          license_key: string
          local_iptv_channels?: Json
          settings?: Json
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          broadcast_channels?: Json
          created_at?: string
          hardware_id?: string
          id?: string
          last_pulled_at?: string | null
          license_key?: string
          local_iptv_channels?: Json
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cloud_iptv_channels: {
        Row: {
          category: string | null
          created_at: string
          headers: Json | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          notes: string | null
          sort_order: number
          target_licenses: string[] | null
          updated_at: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          headers?: Json | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          sort_order?: number
          target_licenses?: string[] | null
          updated_at?: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          headers?: Json | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          sort_order?: number
          target_licenses?: string[] | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      cloud_iptv_public_channels: {
        Row: {
          category: string
          headers: Json
          id: string
          logo: string
          name: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          category?: string
          headers?: Json
          id: string
          logo?: string
          name: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          category?: string
          headers?: Json
          id?: string
          logo?: string
          name?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          media_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          activated_at: string | null
          billing_cycle: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          expires_at: string | null
          hardware_id: string
          id: string
          last_check_at: string | null
          license_key: string
          max_channels: number
          max_library_items: number
          notes: string
          organization: string
          plan: string
          status: string
          updated_at: string
          white_label: boolean
        }
        Insert: {
          activated_at?: string | null
          billing_cycle?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          expires_at?: string | null
          hardware_id?: string
          id?: string
          last_check_at?: string | null
          license_key: string
          max_channels?: number
          max_library_items?: number
          notes?: string
          organization?: string
          plan?: string
          status?: string
          updated_at?: string
          white_label?: boolean
        }
        Update: {
          activated_at?: string | null
          billing_cycle?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          expires_at?: string | null
          hardware_id?: string
          id?: string
          last_check_at?: string | null
          license_key?: string
          max_channels?: number
          max_library_items?: number
          notes?: string
          organization?: string
          plan?: string
          status?: string
          updated_at?: string
          white_label?: boolean
        }
        Relationships: []
      }
      locked_path_users: {
        Row: {
          locked_path_id: string
          user_id: string
        }
        Insert: {
          locked_path_id: string
          user_id: string
        }
        Update: {
          locked_path_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locked_path_users_locked_path_id_fkey"
            columns: ["locked_path_id"]
            isOneToOne: false
            referencedRelation: "locked_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      locked_paths: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          label: string
          path_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          label?: string
          path_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          label?: string
          path_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locked_paths_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locked_paths_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "paths"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          actor: string | null
          created_at: string
          details: Json | null
          event: string
          id: string
          ip: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          details?: Json | null
          event: string
          id?: string
          ip?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          details?: Json | null
          event?: string
          id?: string
          ip?: string | null
        }
        Relationships: []
      }
      media: {
        Row: {
          added_at: string
          category_id: string | null
          created_at: string
          download_url: string | null
          duration_seconds: number | null
          hls_url: string | null
          id: string
          is_active: boolean
          is_public: boolean
          kind: string
          original_filename: string | null
          overview: string | null
          path_id: string | null
          poster_url: string | null
          relative_path: string | null
          size_bytes: number | null
          thumbnail_url: string | null
          title: string
          tmdb_id: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          added_at?: string
          category_id?: string | null
          created_at?: string
          download_url?: string | null
          duration_seconds?: number | null
          hls_url?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          kind?: string
          original_filename?: string | null
          overview?: string | null
          path_id?: string | null
          poster_url?: string | null
          relative_path?: string | null
          size_bytes?: number | null
          thumbnail_url?: string | null
          title: string
          tmdb_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          added_at?: string
          category_id?: string | null
          created_at?: string
          download_url?: string | null
          duration_seconds?: number | null
          hls_url?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          kind?: string
          original_filename?: string | null
          overview?: string | null
          path_id?: string | null
          poster_url?: string | null
          relative_path?: string | null
          size_bytes?: number | null
          thumbnail_url?: string | null
          title?: string
          tmdb_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "paths"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          email: string | null
          id: string
          ip: string | null
          is_read: boolean
          name: string
          phone: string | null
          subject: string | null
          user_agent: string | null
        }
        Insert: {
          body: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          is_read?: boolean
          name: string
          phone?: string | null
          subject?: string | null
          user_agent?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          is_read?: boolean
          name?: string
          phone?: string | null
          subject?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      paths: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          last_scan_at: string | null
          name: string
          path: string
          sort_order: number
          thumbnail: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_scan_at?: string | null
          name: string
          path: string
          sort_order?: number
          thumbnail?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_scan_at?: string | null
          name?: string
          path?: string
          sort_order?: number
          thumbnail?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paths_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      subscriber_networks: {
        Row: {
          city: string
          country: string
          created_at: string
          id: string
          is_visible: boolean
          latitude: number
          logo_url: string
          longitude: number
          name: string
          plan: string
          sort_order: number
          updated_at: string
          website: string
        }
        Insert: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          latitude: number
          logo_url?: string
          longitude: number
          name: string
          plan?: string
          sort_order?: number
          updated_at?: string
          website?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          latitude?: number
          logo_url?: string
          longitude?: number
          name?: string
          plan?: string
          sort_order?: number
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          accent_color: string
          bg_color: string
          brand_name: string
          brand_tagline: string
          created_at: string
          favicon_url: string | null
          font_family: string
          id: string
          is_active: boolean
          is_preset: boolean
          logo_url: string | null
          name: string
          primary_color: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          bg_color?: string
          brand_name?: string
          brand_tagline?: string
          created_at?: string
          favicon_url?: string | null
          font_family?: string
          id?: string
          is_active?: boolean
          is_preset?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          bg_color?: string
          brand_name?: string
          brand_tagline?: string
          created_at?: string
          favicon_url?: string | null
          font_family?: string
          id?: string
          is_active?: boolean
          is_preset?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          text: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          text: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          text?: string
          url?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      views: {
        Row: {
          completed: boolean
          id: string
          media_id: string
          progress_seconds: number
          user_id: string
          watched_at: string
        }
        Insert: {
          completed?: boolean
          id?: string
          media_id: string
          progress_seconds?: number
          user_id: string
          watched_at?: string
        }
        Update: {
          completed?: boolean
          id?: string
          media_id?: string
          progress_seconds?: number
          user_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "views_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cloud_iptv_channels: {
        Args: { _license_key?: string }
        Returns: {
          category: string
          headers: Json
          id: string
          logo: string
          name: string
          sort_order: number
          url: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
