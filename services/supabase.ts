import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

/** Regions served by Samy's Drug Mart and its affiliated clinics. */
export const HOME_REGIONS = ['Hamilton', 'Concord', 'St. Catharines'] as const;
export type HomeRegion = (typeof HOME_REGIONS)[number];

/** Mirrors the `medications.refill_threshold` column default. */
export const DEFAULT_REFILL_THRESHOLD = 7;

/** Postgres DATE values are exchanged as `YYYY-MM-DD` strings. */
export type ISODateString = string;

// ---------------------------------------------------------------------------
// Table types (hand-written to match the SQL schema; regenerate with
// `npx supabase gen types typescript` once the project is linked)
// ---------------------------------------------------------------------------

type UsersRow = {
  user_id: string;
  first_name: string;
  email: string;
  date_of_birth: ISODateString;
  /** Free-text VARCHAR; normalise with `resolveHomeRegion` before use. */
  home_region: string | null;
  created_at: string | null;
};

type UsersInsert = {
  user_id?: string;
  first_name: string;
  email: string;
  date_of_birth: ISODateString;
  home_region?: string | null;
  created_at?: string | null;
};

type MedicationsRow = {
  med_id: string;
  user_id: string | null;
  medication_name: string;
  dosage: string;
  frequency: string;
  current_supply: number;
  refill_threshold: number | null;
  is_active: boolean | null;
};

type MedicationsInsert = {
  med_id?: string;
  user_id?: string | null;
  medication_name: string;
  dosage: string;
  frequency: string;
  current_supply: number;
  refill_threshold?: number | null;
  is_active?: boolean | null;
};

type SymptomLogsRow = {
  log_id: string;
  user_id: string | null;
  log_date: ISODateString;
  /** 1–10, enforced by a CHECK constraint. */
  pain_level: number | null;
  /** 1–5, enforced by a CHECK constraint. */
  mood_score: number | null;
  raw_input: string | null;
  /** JSONB array of lowercase symptom tags extracted by the AI scribe. */
  extracted_tags: string[] | null;
};

type SymptomLogsInsert = {
  log_id?: string;
  user_id?: string | null;
  log_date: ISODateString;
  pain_level?: number | null;
  mood_score?: number | null;
  raw_input?: string | null;
  extracted_tags?: string[] | null;
};

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UsersRow;
        Insert: UsersInsert;
        Update: Partial<UsersInsert>;
        Relationships: [];
      };
      medications: {
        Row: MedicationsRow;
        Insert: MedicationsInsert;
        Update: Partial<MedicationsInsert>;
        Relationships: [
          {
            foreignKeyName: 'medications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      symptom_logs: {
        Row: SymptomLogsRow;
        Insert: SymptomLogsInsert;
        Update: Partial<SymptomLogsInsert>;
        Relationships: [
          {
            foreignKeyName: 'symptom_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Row in `public.users`. Named to avoid clashing with Supabase Auth's `User`. */
export type UserProfile = UsersRow;
export type Medication = MedicationsRow;
export type SymptomLog = SymptomLogsRow;
export type NewMedication = MedicationsInsert;
export type NewSymptomLog = SymptomLogsInsert;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and restart Expo. Database calls will fail until then.',
  );
}

// The placeholder URL uses the reserved `.invalid` TLD so a misconfigured build fails
// fast instead of crashing at import time (screens running on mock data still render).
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || 'https://supabase-not-configured.invalid',
  supabaseAnonKey || 'supabase-not-configured',
  {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// React Native can't tell Supabase when the app is foregrounded, so token refresh
// is tied to AppState to avoid refreshing (and failing) while backgrounded.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  assertConfigured();
  const { data, error } = await supabase.from('users').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRecentSymptomLogs(userId: string, limit = 14): Promise<SymptomLog[]> {
  assertConfigured();
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchActiveMedications(userId: string): Promise<Medication[]> {
  assertConfigured();
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('medication_name');
  if (error) throw error;
  return data;
}

export async function insertSymptomLog(log: NewSymptomLog): Promise<SymptomLog> {
  assertConfigured();
  const { data, error } = await supabase.from('symptom_logs').insert(log).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a Date as a local-calendar `YYYY-MM-DD` (avoids the UTC day shift of `toISOString`). */
export function toLocalISODate(date: Date = new Date()): ISODateString {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` DATE as local midnight (`new Date('YYYY-MM-DD')` would parse it as UTC). */
export function parseLocalISODate(value: ISODateString): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Maps free-text `users.home_region` values ("st catharines", "Saint Catharines", …) to a known region. */
export function resolveHomeRegion(value: string | null | undefined): HomeRegion | null {
  if (!value) return null;
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').replace(/^saint /, 'st ');
  const target = normalize(value);
  return HOME_REGIONS.find((region) => normalize(region) === target) ?? null;
}
