export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      runs: {
        Row: {
          approved: boolean;
          created_at: string;
          dossier: Json | null;
          duration_ms: number | null;
          emotion: string | null;
          error: string | null;
          id: string;
          master_prompt: string | null;
          quality: Json | null;
          quality_score: number | null;
          slot: Database["public"]["Enums"]["run_slot"];
          status: Database["public"]["Enums"]["run_status"];
          storyboard: Json;
          topic: string | null;
          topic_angle: string | null;
          triggered_by: string;
          updated_at: string;
          video_job_id: string | null;
          video_status: string;
          video_url: string | null;
          viral_score: number | null;
        };
        Insert: {
          approved?: boolean;
          created_at?: string;
          dossier?: Json | null;
          duration_ms?: number | null;
          emotion?: string | null;
          error?: string | null;
          id?: string;
          master_prompt?: string | null;
          quality?: Json | null;
          quality_score?: number | null;
          slot: Database["public"]["Enums"]["run_slot"];
          status?: Database["public"]["Enums"]["run_status"];
          storyboard?: Json;
          topic?: string | null;
          topic_angle?: string | null;
          triggered_by?: string;
          updated_at?: string;
          video_job_id?: string | null;
          video_status?: string;
          video_url?: string | null;
          viral_score?: number | null;
        };
        Update: {
          approved?: boolean;
          created_at?: string;
          dossier?: Json | null;
          duration_ms?: number | null;
          emotion?: string | null;
          error?: string | null;
          id?: string;
          master_prompt?: string | null;
          quality?: Json | null;
          quality_score?: number | null;
          slot?: Database["public"]["Enums"]["run_slot"];
          status?: Database["public"]["Enums"]["run_status"];
          storyboard?: Json;
          topic?: string | null;
          topic_angle?: string | null;
          triggered_by?: string;
          updated_at?: string;
          video_job_id?: string | null;
          video_status?: string;
          video_url?: string | null;
          viral_score?: number | null;
        };
        Relationships: [];
      };
      trend_candidates: {
        Row: {
          channel: string | null;
          created_at: string;
          id: string;
          run_id: string;
          score: number | null;
          selected: boolean;
          source: string;
          title: string;
          url: string | null;
          velocity: number | null;
          views: number;
        };
        Insert: {
          channel?: string | null;
          created_at?: string;
          id?: string;
          run_id: string;
          score?: number | null;
          selected?: boolean;
          source?: string;
          title: string;
          url?: string | null;
          velocity?: number | null;
          views?: number;
        };
        Update: {
          channel?: string | null;
          created_at?: string;
          id?: string;
          run_id?: string;
          score?: number | null;
          selected?: boolean;
          source?: string;
          title?: string;
          url?: string | null;
          velocity?: number | null;
          views?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trend_candidates_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      run_slot: "viral" | "general";
      run_status: "pending" | "sensing" | "analyzing" | "writing" | "rendering" | "done" | "error";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      run_slot: ["viral", "general"],
      run_status: ["pending", "sensing", "analyzing", "writing", "rendering", "done", "error"],
    },
  },
} as const;
