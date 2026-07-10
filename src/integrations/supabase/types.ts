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
      cash_movements: {
        Row: {
          amount: number
          cash_session_id: string | null
          concept: string
          created_at: string
          created_by: string
          currency: string
          id: string
          payment_method: string | null
          type: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          concept: string
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          payment_method?: string | null
          type: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          concept?: string
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          payment_method?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount_eur: number | null
          closing_amount_mxn: number | null
          closing_amount_usd: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_amount_eur: number
          opening_amount_mxn: number
          opening_amount_usd: number
          source_handoff_id: string | null
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount_eur?: number | null
          closing_amount_mxn?: number | null
          closing_amount_usd?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_amount_eur?: number
          opening_amount_mxn?: number
          opening_amount_usd?: number
          source_handoff_id?: string | null
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount_eur?: number | null
          closing_amount_mxn?: number | null
          closing_amount_usd?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_amount_eur?: number
          opening_amount_mxn?: number
          opening_amount_usd?: number
          source_handoff_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_source_handoff_id_fkey"
            columns: ["source_handoff_id"]
            isOneToOne: false
            referencedRelation: "shift_handoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      commission_payments: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          cutoff_label: string | null
          id: string
          note: string | null
          paid_at: string
          payment_method: string | null
          seller_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          cutoff_label?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string | null
          seller_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          cutoff_label?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string | null
          seller_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          id: string
          order_id: string
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          seller_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          seller_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "commission_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          created_at: string
          doc_type: string
          employee_id: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          note: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string
          employee_id: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          balance: number
          created_at: string
          currency: string
          employee_id: string
          id: string
          installment_amount: number | null
          mode: string
          note: string | null
          principal: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          balance: number
          created_at?: string
          currency?: string
          employee_id: string
          id?: string
          installment_amount?: number | null
          mode?: string
          note?: string | null
          principal: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          employee_id?: string
          id?: string
          installment_amount?: number | null
          mode?: string
          note?: string | null
          principal?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          curp: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          frequency: Database["public"]["Enums"]["payroll_frequency"]
          hire_date: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          nss: string | null
          phone: string | null
          position: string | null
          profile_id: string | null
          rfc: string | null
          salary: number
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          curp?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          frequency?: Database["public"]["Enums"]["payroll_frequency"]
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          nss?: string | null
          phone?: string | null
          position?: string | null
          profile_id?: string | null
          rfc?: string | null
          salary?: number
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          curp?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          frequency?: Database["public"]["Enums"]["payroll_frequency"]
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          nss?: string | null
          phone?: string | null
          position?: string | null
          profile_id?: string | null
          rfc?: string | null
          salary?: number
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_contracts: {
        Row: {
          base_amount: number
          contract_type: string
          created_at: string
          currency: string
          employee_id: string
          end_date: string | null
          id: string
          imss_employer_number: string | null
          imss_enrolled: boolean
          infonavit_enrolled: boolean
          infonavit_type: string | null
          infonavit_value: number | null
          is_active: boolean
          note: string | null
          pay_schedule: Database["public"]["Enums"]["payroll_frequency"]
          start_date: string
          updated_at: string
        }
        Insert: {
          base_amount?: number
          contract_type?: string
          created_at?: string
          currency?: string
          employee_id: string
          end_date?: string | null
          id?: string
          imss_employer_number?: string | null
          imss_enrolled?: boolean
          infonavit_enrolled?: boolean
          infonavit_type?: string | null
          infonavit_value?: number | null
          is_active?: boolean
          note?: string | null
          pay_schedule?: Database["public"]["Enums"]["payroll_frequency"]
          start_date: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          contract_type?: string
          created_at?: string
          currency?: string
          employee_id?: string
          end_date?: string | null
          id?: string
          imss_employer_number?: string | null
          imss_enrolled?: boolean
          infonavit_enrolled?: boolean
          infonavit_type?: string | null
          infonavit_value?: number | null
          is_active?: boolean
          note?: string | null
          pay_schedule?: Database["public"]["Enums"]["payroll_frequency"]
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          rate: number
          target_currency: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rate: number
          target_currency?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rate?: number
          target_currency?: string
        }
        Relationships: []
      }
      expense_templates: {
        Row: {
          category: string | null
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          default_amount: number
          due_day: number
          frequency: string
          id: string
          is_active: boolean
          is_variable: boolean
          note: string | null
          payment_method: string | null
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          concept: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_amount?: number
          due_day?: number
          frequency?: string
          id?: string
          is_active?: boolean
          is_variable?: boolean
          note?: string | null
          payment_method?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_amount?: number
          due_day?: number
          frequency?: string
          id?: string
          is_active?: boolean
          is_variable?: boolean
          note?: string | null
          payment_method?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          expense_date: string
          id: string
          is_recurring: boolean
          note: string | null
          payment_method: string | null
          receipt_url: string | null
          recurring_frequency: string | null
          recurring_template_id: string | null
          type: Database["public"]["Enums"]["expense_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          concept: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          note?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          recurring_template_id?: string | null
          type: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          note?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          recurring_template_id?: string | null
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_recurring_template_id_fkey"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "expense_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          note: string | null
          paid_at: string
          payroll_payment_id: string | null
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
          note?: string | null
          paid_at?: string
          payroll_payment_id?: string | null
          source?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          note?: string | null
          paid_at?: string
          payroll_payment_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_payroll_payment_id_fkey"
            columns: ["payroll_payment_id"]
            isOneToOne: false
            referencedRelation: "payroll_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_closings: {
        Row: {
          closed_at: string
          closed_by: string | null
          created_at: string
          id: string
          month: number
          snapshot: Json
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          created_at?: string
          id?: string
          month: number
          snapshot: Json
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          created_at?: string
          id?: string
          month?: number
          snapshot?: Json
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          total: number
          unit_price: number
          variant_id: string | null
          variant_snapshot: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          total: number
          unit_price: number
          variant_id?: string | null
          variant_snapshot?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          total?: number
          unit_price?: number
          variant_id?: string | null
          variant_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          customer_id_file_name: string | null
          customer_id_file_path: string | null
          discount: number
          exchange_rate_used: number
          id: string
          payment_status: string
          seller_id: string
          subtotal: number
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_id_file_name?: string | null
          customer_id_file_path?: string | null
          discount?: number
          exchange_rate_used?: number
          id?: string
          payment_status?: string
          seller_id: string
          subtotal?: number
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_id_file_name?: string | null
          customer_id_file_path?: string | null
          discount?: number
          exchange_rate_used?: number
          id?: string
          payment_status?: string
          seller_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      other_incomes: {
        Row: {
          amount: number
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          income_date: string
          note: string | null
          payment_method: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          concept: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          income_date?: string
          note?: string | null
          payment_method?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          income_date?: string
          note?: string | null
          payment_method?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bank: string | null
          created_at: string
          currency: string
          exchange_rate_used: number
          id: string
          order_id: string
          payment_method: string
          voucher_file_name: string | null
          voucher_file_path: string | null
        }
        Insert: {
          amount: number
          bank?: string | null
          created_at?: string
          currency: string
          exchange_rate_used?: number
          id?: string
          order_id: string
          payment_method: string
          voucher_file_name?: string | null
          voucher_file_path?: string | null
        }
        Update: {
          amount?: number
          bank?: string | null
          created_at?: string
          currency?: string
          exchange_rate_used?: number
          id?: string
          order_id?: string
          payment_method?: string
          voucher_file_name?: string | null
          voucher_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_payments: {
        Row: {
          amount: number
          bonus_amount: number
          created_at: string
          created_by: string | null
          currency: string
          daily_rate: number | null
          days_worked: number | null
          employee_id: string
          gross_amount: number | null
          id: string
          imss_deduction: number
          infonavit_deduction: number
          loan_deduction: number
          loan_id: string | null
          note: string | null
          paid_at: string
          payment_method: string | null
          period_end: string
          period_start: string
          receipt_number: string | null
          severance_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          daily_rate?: number | null
          days_worked?: number | null
          employee_id: string
          gross_amount?: number | null
          id?: string
          imss_deduction?: number
          infonavit_deduction?: number
          loan_deduction?: number
          loan_id?: string | null
          note?: string | null
          paid_at?: string
          payment_method?: string | null
          period_end: string
          period_start: string
          receipt_number?: string | null
          severance_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          daily_rate?: number | null
          days_worked?: number | null
          employee_id?: string
          gross_amount?: number | null
          id?: string
          imss_deduction?: number
          infonavit_deduction?: number
          loan_deduction?: number
          loan_id?: string | null
          note?: string | null
          paid_at?: string
          payment_method?: string | null
          period_end?: string
          period_start?: string
          receipt_number?: string | null
          severance_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          price_override_eur: number | null
          price_override_mxn: number | null
          price_override_usd: number | null
          product_id: string
          size: string | null
          sku: string | null
          stock: number
          variant_name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          price_override_eur?: number | null
          price_override_mxn?: number | null
          price_override_usd?: number | null
          product_id: string
          size?: string | null
          sku?: string | null
          stock?: number
          variant_name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          price_override_eur?: number | null
          price_override_mxn?: number | null
          price_override_usd?: number | null
          product_id?: string
          size?: string | null
          sku?: string | null
          stock?: number
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price_eur: number | null
          base_price_mxn: number
          base_price_usd: number | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          photo_thumb_url: string | null
          photo_url: string | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          base_price_eur?: number | null
          base_price_mxn?: number
          base_price_usd?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          photo_thumb_url?: string | null
          photo_url?: string | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          base_price_eur?: number | null
          base_price_mxn?: number
          base_price_usd?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          photo_thumb_url?: string | null
          photo_url?: string | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          commission_rate: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      shift_handoffs: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          created_at: string
          from_seller_id: string
          from_session_id: string
          handoff_amount_eur: number
          handoff_amount_mxn: number
          handoff_amount_usd: number
          id: string
          note: string | null
          received_amount_eur: number | null
          received_amount_mxn: number | null
          received_amount_usd: number | null
          sales_amount_eur: number
          sales_amount_mxn: number
          sales_amount_usd: number
          status: string
          to_seller_id: string
          to_session_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          from_seller_id: string
          from_session_id: string
          handoff_amount_eur?: number
          handoff_amount_mxn?: number
          handoff_amount_usd?: number
          id?: string
          note?: string | null
          received_amount_eur?: number | null
          received_amount_mxn?: number | null
          received_amount_usd?: number | null
          sales_amount_eur?: number
          sales_amount_mxn?: number
          sales_amount_usd?: number
          status?: string
          to_seller_id: string
          to_session_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          from_seller_id?: string
          from_session_id?: string
          handoff_amount_eur?: number
          handoff_amount_mxn?: number
          handoff_amount_usd?: number
          id?: string
          note?: string | null
          received_amount_eur?: number | null
          received_amount_mxn?: number | null
          received_amount_usd?: number | null
          sales_amount_eur?: number
          sales_amount_mxn?: number
          sales_amount_usd?: number
          status?: string
          to_seller_id?: string
          to_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_handoffs_from_session_id_fkey"
            columns: ["from_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handoffs_to_session_id_fkey"
            columns: ["to_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_lists: {
        Row: {
          created_at: string
          created_by: string | null
          external_url: string | null
          file_name: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          note: string | null
          size_bytes: number | null
          source_type: string
          supplier_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          source_type?: string
          supplier_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          source_type?: string
          supplier_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          inventory_product_id: string | null
          is_available: boolean
          last_quoted_at: string | null
          lead_time_days: number | null
          min_order_qty: number | null
          name: string
          notes: string | null
          supplier_id: string
          supplier_sku: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          inventory_product_id?: string | null
          is_available?: boolean
          last_quoted_at?: string | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          name: string
          notes?: string | null
          supplier_id: string
          supplier_sku?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          inventory_product_id?: string | null
          is_available?: boolean
          last_quoted_at?: string | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          name?: string
          notes?: string | null
          supplier_id?: string
          supplier_sku?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_inventory_product_id_fkey"
            columns: ["inventory_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          category_id: string | null
          classification_name: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          classification_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          classification_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          id: string
          order_id: string
          public_token: string
          qr_code_url: string | null
          sent_by_email: boolean
          sent_by_whatsapp: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          public_token?: string
          qr_code_url?: string | null
          sent_by_email?: boolean
          sent_by_whatsapp?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          public_token?: string
          qr_code_url?: string | null
          sent_by_email?: boolean
          sent_by_whatsapp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
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
      vacation_records: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          note: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          note?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          note?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cash_session_belongs_to_user: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_seller_or_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      vacation_days_by_seniority: { Args: { hire: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "seller"
      expense_type: "fixed" | "variable" | "unexpected"
      payroll_frequency: "weekly" | "monthly" | "daily" | "biweekly"
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
      app_role: ["admin", "seller"],
      expense_type: ["fixed", "variable", "unexpected"],
      payroll_frequency: ["weekly", "monthly", "daily", "biweekly"],
    },
  },
} as const
