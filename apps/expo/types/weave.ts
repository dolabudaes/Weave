export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: WeaveUser;
};

export type WeaveUser = {
  id: number;
  email: string;
  username: string;
  role: string;
  status: string;
  is_test_account: boolean;
  profile: UserProfile;
};

export type UserProfile = {
  user_id?: number;
  display_name?: string;
  avatar_url?: string;
  city?: string;
  bio?: string;
  accepts_local?: number | boolean;
  accepts_online?: number | boolean;
  onboarding_completed?: number | boolean;
  show_name?: number | boolean;
  show_city?: number | boolean;
  show_intent?: number | boolean;
  show_signals?: number | boolean;
  share_posts?: number | boolean;
  name_hidden?: number | boolean;
  city_hidden?: number | boolean;
  signals_hidden?: number | boolean;
};

export type ProfileSignal = {
  id: number;
  signal_type: string;
  label: string;
  evidence_summary: string;
  confirmation_status: string;
  source_type?: string;
  source_post_ids?: string | number[];
};

export type SocialPost = {
  id: number;
  text: string;
  image_url?: string;
  original_url?: string;
  image_caption?: string;
  city?: string;
  visibility?: string;
  is_used_for_profile?: number | boolean;
  posted_at?: string;
};

export type ConnectionIntent = {
  id: number;
  raw_text: string;
  structured_summary?: string;
  target_topics?: string[] | string;
  local_or_online?: string;
  max_introductions_per_week?: number;
  status: string;
};

export type GoldInterest = {
  label: string;
  evidence_post_ids?: string[];
  evidence_post_indices?: number[];
  evidence_source_summary?: {
    modalities?: string[];
    text_only_post_ids?: string[];
    visual_only_post_ids?: string[];
    mixed_post_ids?: string[];
  };
};

export type GoldProfileDomainName =
  | "sports_outdoor"
  | "entertainment"
  | "gaming"
  | "food_drink"
  | "travel_city_exploration"
  | "photography_creation"
  | "pets";

export type GoldProfileDomain = {
  domain: GoldProfileDomainName | string;
  status?: string;
  long_term_interests?: GoldInterest[];
  short_term_interests?: GoldInterest[];
  negative_interests?: GoldInterest[];
};

export type GoldProfile = {
  user_id?: string;
  observation_window?: {
    post_count_total?: number;
    observed_start?: string;
    observed_end?: string;
    window_days?: number;
  };
  domains: GoldProfileDomain[];
};

export type Recommendation = {
  id: number;
  candidate: WeaveUser;
  candidate_context?: {
    is_socialpersona_seed: boolean;
    signals: ProfileSignal[];
    posts: SocialPost[];
    gold_profile?: GoldProfile | null;
    active_intent?: ConnectionIntent | null;
  };
  evidence_json?: {
    shared_tags?: string[];
    source_intent?: string;
    candidate_intent?: string;
  };
  reason_for_viewer?: string;
  reason_for_source?: string;
  reason_for_other?: string;
  reason_for_candidate?: string;
  why_now: string;
  mismatch_note: string;
  status?: string;
  relationship?: "connected" | "one_way" | "open";
};

export type Connection = {
  id: number;
  status: string;
  other_user: WeaveUser;
  recommendation_id: number;
  privacy_a_confirmed?: number | boolean;
  privacy_b_confirmed?: number | boolean;
  introduction_message?: string;
  last_message_preview?: string;
  created_at?: string;
};

export type ConnectionMessage = {
  id: number;
  connection_id: number;
  sender_user_id?: number;
  sender_type: "system" | "user" | string;
  content: string;
  created_at?: string;
};

export type AiChatMessage = {
  id: number;
  role: "user" | "assistant" | string;
  content: string;
  about_recommendation_id?: number | null;
  recommendations?: Recommendation[];
  created_at?: string;
};

export type AdminReport = {
  id: number;
  category: string;
  status: string;
  description?: string;
};

export type AdminAiJob = {
  provider: string;
  status: string;
  model?: string;
  failed_reason?: string;
};
