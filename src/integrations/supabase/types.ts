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
      clients: {
        Row: {
          cidade: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_nascimento: string | null
          documento: string | null
          estado: string | null
          id: string
          nome: string
          profissao: string | null
          telefone: string | null
          tipo: string
          visitas: number
        }
        Insert: {
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          documento?: string | null
          estado?: string | null
          id?: string
          nome: string
          profissao?: string | null
          telefone?: string | null
          tipo?: string
          visitas?: number
        }
        Update: {
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          documento?: string | null
          estado?: string | null
          id?: string
          nome?: string
          profissao?: string | null
          telefone?: string | null
          tipo?: string
          visitas?: number
        }
        Relationships: []
      }
      complaints: {
        Row: {
          categoria: string
          created_at: string
          created_by: string | null
          descricao: string | null
          dispositivo: string | null
          feedback_id: string | null
          gravidade: string
          hospede_nome: string | null
          id: string
          origem: string
          quarto: number | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dispositivo?: string | null
          feedback_id?: string | null
          gravidade?: string
          hospede_nome?: string | null
          id?: string
          origem?: string
          quarto?: number | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dispositivo?: string | null
          feedback_id?: string | null
          gravidade?: string
          hospede_nome?: string | null
          id?: string
          origem?: string
          quarto?: number | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_quarto_fkey"
            columns: ["quarto"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["numero"]
          },
        ]
      }
      feedbacks: {
        Row: {
          comentario: string | null
          created_at: string
          hospede_nome: string | null
          id: string
          nota_atendimento: number | null
          nota_chuveiro: number | null
          nota_conforto: number | null
          nota_geral: number | null
          nota_limpeza: number | null
          nota_wifi: number | null
          quarto: number | null
          recomendaria: boolean | null
          sugestao: string | null
          wifi_dispositivo: string | null
          wifi_problema: boolean
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          hospede_nome?: string | null
          id?: string
          nota_atendimento?: number | null
          nota_chuveiro?: number | null
          nota_conforto?: number | null
          nota_geral?: number | null
          nota_limpeza?: number | null
          nota_wifi?: number | null
          quarto?: number | null
          recomendaria?: boolean | null
          sugestao?: string | null
          wifi_dispositivo?: string | null
          wifi_problema?: boolean
        }
        Update: {
          comentario?: string | null
          created_at?: string
          hospede_nome?: string | null
          id?: string
          nota_atendimento?: number | null
          nota_chuveiro?: number | null
          nota_conforto?: number | null
          nota_geral?: number | null
          nota_limpeza?: number | null
          nota_wifi?: number | null
          quarto?: number | null
          recomendaria?: boolean | null
          sugestao?: string | null
          wifi_dispositivo?: string | null
          wifi_problema?: boolean
        }
        Relationships: []
      }
      integration_events: {
        Row: {
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          payload: Json
          reservation_id: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          reservation_id?: string | null
          source: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          reservation_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          created_by: string | null
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          preco: number
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          created_by?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          preco?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          created_by?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          preco?: number
        }
        Relationships: []
      }
      reservations: {
        Row: {
          canal: string | null
          checkin: string
          checkin_at: string | null
          checkout: string
          cliente_id: string | null
          cliente_nome: string
          created_at: string
          created_by: string | null
          desconto: number
          diarias: number
          horario_checkin: string | null
          horario_checkout: string | null
          horario_reserva: string | null
          id: string
          pagamento: string
          pago: boolean
          pessoas: number
          quarto: number
          status: string
          updated_at: string
          valor_diaria: number
          valor_pago: number
          valor_total: number
        }
        Insert: {
          canal?: string | null
          checkin: string
          checkin_at?: string | null
          checkout: string
          cliente_id?: string | null
          cliente_nome: string
          created_at?: string
          created_by?: string | null
          desconto?: number
          diarias?: number
          horario_checkin?: string | null
          horario_checkout?: string | null
          horario_reserva?: string | null
          id?: string
          pagamento?: string
          pago?: boolean
          pessoas?: number
          quarto: number
          status?: string
          updated_at?: string
          valor_diaria?: number
          valor_pago?: number
          valor_total?: number
        }
        Update: {
          canal?: string | null
          checkin?: string
          checkin_at?: string | null
          checkout?: string
          cliente_id?: string | null
          cliente_nome?: string
          created_at?: string
          created_by?: string | null
          desconto?: number
          diarias?: number
          horario_checkin?: string | null
          horario_checkout?: string | null
          horario_reserva?: string | null
          id?: string
          pagamento?: string
          pago?: boolean
          pessoas?: number
          quarto?: number
          status?: string
          updated_at?: string
          valor_diaria?: number
          valor_pago?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_quarto_fkey"
            columns: ["quarto"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["numero"]
          },
        ]
      }
      rooms: {
        Row: {
          andar: number
          banheiro: boolean
          configuracao: string
          numero: number
          preco: number
          situacao: string | null
        }
        Insert: {
          andar: number
          banheiro?: boolean
          configuracao: string
          numero: number
          preco?: number
          situacao?: string | null
        }
        Update: {
          andar?: number
          banheiro?: boolean
          configuracao?: string
          numero?: number
          preco?: number
          situacao?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          categoria: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          item: string
          pagamento: string
          produto_id: string | null
          qtd: number
          quarto: number
          reserva_id: string | null
          total: number
          valor_unit: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          item: string
          pagamento?: string
          produto_id?: string | null
          qtd?: number
          quarto: number
          reserva_id?: string | null
          total?: number
          valor_unit?: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          item?: string
          pagamento?: string
          produto_id?: string | null
          qtd?: number
          quarto?: number
          reserva_id?: string | null
          total?: number
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quarto_fkey"
            columns: ["quarto"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["numero"]
          },
          {
            foreignKeyName: "sales_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      whatsapp_reservation_sessions: {
        Row: {
          chat_id: string | null
          created_at: string
          draft: Json
          id: string
          last_message: string | null
          last_response: string | null
          phone: string
          stage: string
          updated_at: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          draft?: Json
          id?: string
          last_message?: string | null
          last_response?: string | null
          phone: string
          stage?: string
          updated_at?: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          draft?: Json
          id?: string
          last_message?: string | null
          last_response?: string | null
          phone?: string
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      reservation_has_overlap: {
        Args: {
          _checkin: string
          _checkout: string
          _exclude_id?: string
          _quarto: number
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "dono" | "recepcao" | "limpeza" | "cafe"
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
      app_role: ["dono", "recepcao", "limpeza", "cafe"],
    },
  },
} as const
