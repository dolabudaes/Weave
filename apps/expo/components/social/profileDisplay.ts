import { API_BASE_URL } from "@/services/api/client";
import type { GoldInterest, GoldProfile, GoldProfileDomain, ProfileSignal, Recommendation, SocialPost, WeaveUser } from "@/types/weave";

export const GOLD_DOMAIN_ORDER = [
  "sports_outdoor",
  "entertainment",
  "gaming",
  "food_drink",
  "travel_city_exploration",
  "photography_creation",
  "pets",
] as const;

export const DOMAIN_LABELS: Record<string, string> = {
  sports_outdoor: "Outdoor",
  entertainment: "Entertainment",
  gaming: "Gaming",
  food_drink: "Food & drink",
  travel_city_exploration: "City & travel",
  photography_creation: "Photography",
  pets: "Pets",
};

const TAG_TRANSLATIONS = new Map<string, string>([
  ["\u4e0a\u6d77", "Shanghai"],
  ["\u57ce\u5e02", "city life"],
  ["\u57ce\u5e02\u591c\u666f", "city nights"],
  ["\u57ce\u5e02\u6444\u5f71", "city photography"],
  ["\u57ce\u5e02\u5f71\u50cf", "city imagery"],
  ["\u65c5\u884c", "travel"],
  ["\u7ebf\u4e0a", "online"],
  ["\u5468\u672b", "weekend"],
  ["\u6444\u5f71", "photography"],
  ["\u62cd\u7167", "photography"],
  ["\u5f71\u50cf", "visual storytelling"],
  ["\u7535\u5f71", "film"],
  ["\u72ec\u7acb\u7535\u5f71", "independent film"],
  ["\u653e\u6620", "screenings"],
  ["\u5c55\u89c8", "exhibitions"],
  ["\u6587\u5316\u7a7a\u95f4", "culture spaces"],
  ["\u97f3\u4e50", "music"],
  ["\u6e38\u620f", "gaming"],
  ["\u98df\u7269", "food"],
  ["\u6237\u5916", "outdoors"],
  ["\u5f92\u6b65", "walking"],
  ["\u8def\u7ebf", "routes"],
  ["\u5ba0\u7269", "pets"],
  ["\u5199\u4f5c", "writing"],
  ["\u526a\u8f91", "editing"],
  ["\u6545\u4e8b", "storytelling"],
  ["\u8bbe\u8ba1", "design"],
  ["\u5efa\u7b51", "architecture"],
  ["\u7a7a\u95f4", "spaces"],
  ["\u5496\u5561", "coffee"],
  ["\u8ba4\u771f\u4ea4\u6d41", "thoughtful conversation"],
  ["\u6162\u6162\u804a\u5929", "slow conversation"],
]);

const LOW_SIGNAL_MATCH_TAGS = new Set([
  "city",
  "city life",
  "shanghai",
  "urban",
  "street",
  "travel",
  "tourism",
  "sightseeing",
  "city exploration",
  "online",
  "weekend",
  "\u57ce\u5e02",
  "\u65c5\u884c",
  "\u7ebf\u4e0a",
  "\u5468\u672b",
]);

const CJK_RE = /[\u3400-\u9fff]/u;
const LEGACY_INTENT_RE = new RegExp(
  "^\\u60f3\\u8ba4\\u8bc6\\u540c\\u6837\\u5173\\u6ce8\\s+(.+?)\\uFF0C\\u5e76\\u613f\\u610f\\u4ece\\u4e00\\u4e2a\\u5177\\u4f53\\u8bdd\\u9898\\u81ea\\u7136\\u5f00\\u59cb\\u4ea4\\u6d41\\u7684\\u4eba\\u3002?$",
  "u",
);
const LEGACY_REASON_RE = new RegExp(
  "^\\u4f60\\u4eec\\u7684\\u8d44\\u6599\\u91cc\\u90fd\\u51fa\\u73b0\\u4e86\\s+(.+?)\\uFF0C\\u9002\\u5408\\u4ece\\u8fd9\\u4e9b\\u5177\\u4f53\\u8bdd\\u9898\\u5f00\\u59cb\\u8ba4\\u8bc6\\u3002?$",
  "u",
);

const PERSONA_USER_RE = /^user\d+$/u;
const PERSONA_POOL_RE = /^sp(\d+)$/u;
const LEGACY_PERSONA_RE = /^persona_(\d+)$/u;

export function isSocialPersona(user?: WeaveUser) {
  if (!user || user.role === "admin") return false;
  const name = user.username || "";
  return Boolean(
    user.is_test_account && (PERSONA_USER_RE.test(name) || PERSONA_POOL_RE.test(name) || name.startsWith("persona_")),
  );
}

export function personAvatarUrl(user?: WeaveUser) {
  const raw = user?.profile?.avatar_url?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${API_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function socialPersonaHandle(username?: string, displayName?: string) {
  const trimmed = displayName?.trim();
  if (trimmed && PERSONA_USER_RE.test(trimmed)) return trimmed;
  if (!username) return "user0";
  const pool = username.match(PERSONA_POOL_RE);
  if (pool) return `user${parseInt(pool[1], 10)}`;
  const legacy = username.match(LEGACY_PERSONA_RE);
  if (legacy) return `user${parseInt(legacy[1], 10)}`;
  if (PERSONA_USER_RE.test(username)) return username;
  return username;
}

export function personName(user?: WeaveUser) {
  if (!user) return "User";
  if (user.profile?.name_hidden) return "Someone";
  if (isSocialPersona(user)) return socialPersonaHandle(user.username, user.profile?.display_name);
  const displayName = user.profile?.display_name?.trim();
  if (displayName && !CJK_RE.test(displayName)) return displayName;
  return user.username || "User";
}

export function personBio(user?: WeaveUser) {
  const bio = user?.profile?.bio?.trim() || "";
  if (!bio) return "";
  if (isSocialPersona(user) && bio.startsWith("\u533f\u540d\u793e\u4ea4\u5a92\u4f53\u7528\u6237")) return "";
  return polishedSentence(bio);
}

export function personCity(user?: WeaveUser) {
  if (user?.profile?.city_hidden) return "";
  if (isSocialPersona(user)) return "Online";
  return translateCity(user?.profile?.city);
}

export function acceptsIntroductions(user?: WeaveUser) {
  const profile = user?.profile;
  return !(profile?.accepts_online === false || profile?.accepts_online === 0) || Boolean(profile?.accepts_local);
}

export function introductionStatus(user?: WeaveUser) {
  return acceptsIntroductions(user) ? "Open to introductions" : "Introductions paused";
}

export function cleanTag(value?: string) {
  if (!value) return "";
  const cleaned = value
    .replace(/_/g, " ")
    .replace(/\bstable\b|\brecent\b|\binterest\b|\btopic\b|\bconfirmed\b|\bprofile\b|\bsignal\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return TAG_TRANSLATIONS.get(cleaned) || TAG_TRANSLATIONS.get(cleaned.toLowerCase()) || cleaned;
}

export function normalizeDomains(profile?: GoldProfile | null): GoldProfileDomain[] {
  const byName = new Map((profile?.domains || []).map((domain) => [domain.domain, domain]));
  return GOLD_DOMAIN_ORDER.map((domain) => byName.get(domain) || { domain, status: "inactive", long_term_interests: [], short_term_interests: [], negative_interests: [] });
}

export function domainInterestLabels(domain?: GoldProfileDomain, bucket: "long" | "short" = "long") {
  const items = bucket === "long" ? domain?.long_term_interests : domain?.short_term_interests;
  return (items || []).map((item) => cleanTag(item.label)).filter(Boolean);
}

export function representativeGoldTags(profile?: GoldProfile | null, limit = 6) {
  const domains = normalizeDomains(profile);
  const labels = domains.flatMap((domain) => [...domainInterestLabels(domain, "short"), ...domainInterestLabels(domain, "long")]);
  return unique(labels).slice(0, limit);
}

export function tagsFromRecommendation(rec?: Recommendation, limit = 8) {
  if (rec?.candidate?.profile?.signals_hidden) return [];
  const goldTags = representativeGoldTags(rec?.candidate_context?.gold_profile, limit);
  if (goldTags.length) return goldTags;
  const shared = rec?.evidence_json?.shared_tags || [];
  const signals = rec?.candidate_context?.signals || [];
  return unique([...shared, ...signals.map((signal) => signal.label)].map(cleanTag).filter(Boolean)).slice(0, limit);
}

export function matchedTagsFromRecommendation(rec?: Recommendation, limit = 6) {
  if (rec?.candidate?.profile?.signals_hidden) return [];
  const shared = rec?.evidence_json?.shared_tags || [];
  return unique(shared.map(cleanTag).filter((tag) => tag && !LOW_SIGNAL_MATCH_TAGS.has(tag.toLowerCase()))).slice(0, limit);
}

export function tagsFromSignals(signals: ProfileSignal[], limit = 10) {
  return unique(signals.map((signal) => cleanTag(signal.label)).filter(Boolean)).slice(0, limit);
}

export function recentFocusFromPosts(posts: SocialPost[], limit = 3) {
  return posts
    .map((post) => postTextSummary(post))
    .filter(Boolean)
    .slice(0, limit);
}

export function recommendationReason(rec?: Recommendation) {
  return humanizeRecommendationText(rec?.reason_for_viewer || rec?.reason_for_source || rec?.why_now, rec) || "A few signals overlap. Start small, without forcing the match.";
}

export function currentThought(rec?: Recommendation) {
  return humanizeRecommendationText(activeIntentText(rec), rec) || postTextSummary(rec?.candidate_context?.posts?.[0]);
}

export function activeIntentText(rec?: Recommendation) {
  return humanizeIntentText(rec?.candidate_context?.active_intent?.raw_text?.trim() || "", rec);
}

export function activeIntentTags(rec?: Recommendation) {
  const raw = rec?.candidate_context?.active_intent?.target_topics;
  if (Array.isArray(raw)) return raw.map((item) => cleanTag(String(item))).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => cleanTag(String(item))).filter(Boolean);
    } catch {
      return raw.split(/[,\uFF0C\u3001]/).map(cleanTag).filter(Boolean);
    }
  }
  return [];
}

export function intentSummary(text?: string) {
  return humanizeIntentText(sentence(text));
}

export function composeWeaveUnderstanding(text: string) {
  const trimmed = humanizeIntentText(text.trim());
  if (!trimmed) return "Tell me who you want to meet.";
  return `I heard: ${trimmed}`;
}

function englishList(items: string[], fallback: string) {
  const cleaned = items.map((item) => cleanTag(item)).filter(Boolean).slice(0, 3);
  if (!cleaned.length) return fallback;
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned[0]}, ${cleaned[1]}, and ${cleaned[2]}`;
}

function goldLabels(profile: GoldProfile | null | undefined, bucket: "long_term_interests" | "short_term_interests" | "negative_interests", limit = 3) {
  const labels: string[] = [];
  for (const domain of profile?.domains || []) {
    if (String(domain.status || "") === "inactive") continue;
    for (const item of domain[bucket] || []) {
      const label = cleanTag(item.label);
      if (label && !labels.includes(label)) labels.push(label);
      if (labels.length >= limit) return labels;
    }
  }
  return labels;
}

export type LifeIndexBuckets = {
  steady: string[];
  lately: string[];
  skip: string[];
};

export function lifeIndexBuckets(profile?: GoldProfile | null): LifeIndexBuckets {
  return {
    steady: goldLabels(profile, "long_term_interests"),
    lately: goldLabels(profile, "short_term_interests"),
    skip: goldLabels(profile, "negative_interests", 2),
  };
}

export function lifeIndexKey(label: string) {
  return label.trim().toLowerCase();
}

export type LifeIndexRead = {
  name: string;
  hook: string;
  essence: string;
  steady: string[];
  lately: string[];
  skip: string[];
  intent: string;
  closer: string;
};

export function lifeIndexRead(rec?: Recommendation | null): LifeIndexRead {
  const name = personName(rec?.candidate);
  const buckets = lifeIndexBuckets(rec?.candidate_context?.gold_profile);
  const steady = buckets.steady;
  const lately = buckets.lately;
  const skip = buckets.skip;
  const intent =
    humanizeIntentText(rec?.evidence_json?.candidate_intent, rec) ||
    activeIntentText(rec) ||
    "a slow, real conversation";
  const essence = englishList(steady.length ? steady : lately, "ordinary days with a point of view");
  return {
    name,
    hook: `Quick read on ${name}.`,
    essence: `The kind of person who keeps ${essence} close.`,
    steady,
    lately,
    skip,
    intent,
    closer: "If this feels like your people, tap Interested. If not, pass — and tell me the energy you actually want.",
  };
}

export function composeLifeIndexIntro(rec?: Recommendation | null) {
  const read = lifeIndexRead(rec);
  return [
    read.hook,
    read.essence,
    "",
    "Life index",
    `Steady — ${englishList(read.steady, "still forming")}`,
    `Lately — ${englishList(read.lately, "nothing loud right now")}`,
    `Skip — ${englishList(read.skip, "nothing flagged")}`,
    "",
    `Right now they're open to ${read.intent}.`,
    "",
    read.closer,
  ].join("\n");
}

export function simpleRecommendationPitch(rec?: Recommendation) {
  const name = personName(rec?.candidate);
  const tags = matchedTagsFromRecommendation(rec, 3).length
    ? matchedTagsFromRecommendation(rec, 3)
    : tagsFromRecommendation(rec, 3);
  if (tags.length >= 2) {
    return `You both linger on ${tags.slice(0, 2).join(" and ")}. Start there.`;
  }
  if (tags.length === 1) {
    return `You both keep circling ${tags[0]}. Easy opener.`;
  }
  const line = humanizeRecommendationText(rec?.reason_for_viewer, rec);
  if (line) return line;
  return `${name} is in range of what you asked for. Open the index if you want more.`;
}

export function displayIntentLine(text?: string) {
  return humanizeIntentText(text) || "Looking for someone who can hold a real conversation.";
}

export function recommendationTeaser(rec?: Recommendation) {
  const bio = personBio(rec?.candidate);
  if (bio) return bio;
  const tags = matchedTagsFromRecommendation(rec, 4).length ? matchedTagsFromRecommendation(rec, 4) : tagsFromRecommendation(rec, 4);
  if (tags.length) return `You both keep circling ${joinTags(tags)}.`;
  return humanizeRecommendationText(activeIntentText(rec), rec) || postTextSummary(rec?.candidate_context?.posts?.[0]) || "There's a quiet overlap worth opening.";
}

export function sharedSignalLine(rec?: Recommendation) {
  const tags = matchedTagsFromRecommendation(rec, 4).length ? matchedTagsFromRecommendation(rec, 4) : tagsFromRecommendation(rec, 4);
  if (tags.length) return `Start with ${joinTags(tags)}. They are not conclusions, just enough for a natural opening.`;
  return recommendationReason(rec);
}

export function openingLine(rec?: Recommendation) {
  const tags = matchedTagsFromRecommendation(rec, 3).length ? matchedTagsFromRecommendation(rec, 3) : tagsFromRecommendation(rec, 3);
  if (tags.length >= 2) return `Try one small question between "${tags[0]}" and "${tags[1]}".`;
  if (tags.length === 1) return `Ask about one recent moment around "${tags[0]}".`;
  return "Start with one real, small question instead of trading resumes.";
}

export function polishedSentence(value?: string) {
  const compact = normalizeCopy(value);
  if (!compact) return "";
  return translateLegacyText(compact);
}

export function postKey(post: SocialPost, index: number) {
  return String(post.id ?? post.original_url ?? `${post.posted_at}-${index}`);
}

export function postDate(post?: SocialPost) {
  const raw = post?.posted_at;
  if (!raw) return "Unknown date";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function monthLabel(post?: SocialPost) {
  const raw = post?.posted_at;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 7);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export function findEvidencePosts(interest: GoldInterest, posts: SocialPost[]) {
  const ids = new Set(interest.evidence_post_ids || []);
  if (!ids.size) return [];
  return posts.filter((post) => ids.has(String(post.original_url))).slice(0, 6);
}

const URL_TOKEN_REPLACE = /\s*\[\s*URL\s*\]\s*/gi;
const URL_TOKEN_TEST = /\[\s*URL\s*\]/i;
const RAW_URL_REPLACE = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi;
const RAW_URL_TEST = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/i;
const URL_ONLY_TEST = /^(?:\[?\s*URL\s*\]?|link|links|url|urls|\u94fe\u63a5|\u7f51\u5740)$/i;

export function cleanSocialText(value?: string) {
  if (!value) return "";
  return value
    .replace(URL_TOKEN_REPLACE, " ")
    .replace(RAW_URL_REPLACE, " ")
    .replace(/\s+([,.;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function postHasLink(post?: SocialPost) {
  const text = `${post?.text || ""} ${post?.image_caption || ""}`;
  return URL_TOKEN_TEST.test(text) || RAW_URL_TEST.test(text);
}

export function displayPostText(post?: SocialPost) {
  return translateLegacyText(cleanSocialText(post?.text));
}

export function displayImageCaption(post?: SocialPost) {
  const raw = post?.image_caption?.trim() || "";
  if (!raw || URL_ONLY_TEST.test(raw) || /^https?:\/\//i.test(raw) || /^www\./i.test(raw)) return "";
  const cleaned = cleanSocialText(raw);
  if (!cleaned || URL_ONLY_TEST.test(cleaned) || /Low-information image/i.test(cleaned)) return "";
  return translateLegacyText(cleaned);
}

export function postTextSummary(post?: SocialPost) {
  return sentence(displayPostText(post) || displayImageCaption(post));
}

export function sentence(value?: string) {
  if (!value) return "";
  const compact = cleanSocialText(value).replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 92 ? `${compact.slice(0, 92)}...` : compact;
}

function humanizeIntentText(value?: string, rec?: Recommendation) {
  const compact = normalizeCopy(value);
  if (!compact) return "";
  const generatedIntent = compact.match(LEGACY_INTENT_RE);
  if (generatedIntent) {
    const tags = tagsFromDelimitedText(generatedIntent[1]);
    if (tags.length) return `Looking for someone who also notices ${joinTags(tags)}. A concrete topic is enough to begin.`;
  }
  if (compact.includes("\u6700\u8fd1\u521a\u5230\u4e0a\u6d77")) {
    return "New in Shanghai, looking for thoughtful people into independent film, exhibitions, and city photography.";
  }
  if (/^Looking for/i.test(compact)) return compact;
  if (CJK_RE.test(compact)) {
    const tags = extractTagsFromText(compact);
    if (tags.length) return `Looking for someone who can start from ${joinTags(tags)}.`;
    const recTags = rec ? tagsFromRecommendation(rec, 4) : [];
    if (recTags.length) return `Looking for someone who can start from ${joinTags(recTags)}.`;
  }
  return translateLegacyText(compact);
}

function humanizeRecommendationText(value?: string, rec?: Recommendation) {
  const compact = normalizeCopy(value);
  if (!compact) return "";
  const generatedReason = compact.match(LEGACY_REASON_RE);
  if (generatedReason) {
    const tags = tagsFromDelimitedText(generatedReason[1]);
    if (tags.length) return `You both left traces around ${joinTags(tags)}. Start there instead of forcing a broad match.`;
  }
  if (compact.includes("\u4f60\u4eec\u7684\u8d44\u6599\u91cc\u90fd\u51fa\u73b0\u4e86") || compact.includes("\u4f60\u4eec\u90fd\u7559\u4e0b\u8fc7")) {
    const tags = extractTagsFromText(compact);
    if (tags.length) return `You both left traces around ${joinTags(tags)}. Start there instead of forcing a broad match.`;
  }
  if (compact.includes("\u4ece\u4e00\u4e2a\u5177\u4f53\u8bdd\u9898\u81ea\u7136\u5f00\u59cb\u4ea4\u6d41\u7684\u4eba")) {
    const tags = rec ? (matchedTagsFromRecommendation(rec, 4).length ? matchedTagsFromRecommendation(rec, 4) : tagsFromRecommendation(rec, 4)) : extractTagsFromText(compact);
    if (tags.length) return `Shared signals are lighting up around ${joinTags(tags)}.`;
  }
  if (compact.includes("\u8fd9\u6761\u7ebf\u4eae\u8d77\u6765\u7684\u539f\u56e0")) {
    const tags = extractTagsFromText(compact);
    if (tags.length) return `${joinTags(tags)} is why this signal lit up.`;
  }
  return translateLegacyText(compact);
}

function translateLegacyText(value?: string) {
  const compact = normalizeCopy(value);
  if (!compact) return "";
  if (!CJK_RE.test(compact)) return compact;
  if (compact.includes("\u72ec\u7acb\u89c6\u9891\u526a\u8f91\u5e08")) return "Independent video editor into city imagery.";
  if (compact.includes("\u5efa\u7b51\u8bbe\u8ba1\u5e08")) return "Architectural designer and city photography regular.";
  if (compact.includes("\u7f16\u5267\u5b66\u751f")) return "Screenwriting student drawn to close observation and character details.";
  if (compact.includes("\u521a\u5230\u4e0a\u6d77")) return "New in Shanghai, looking for thoughtful conversations around independent film, exhibitions, and city photography.";
  if (compact.includes("\u804a\u5929\u8282\u594f") || compact.includes("\u7ebf\u4e0b")) return "Clarify online/offline and chat rhythm first. It will feel better than rushing the pace.";
  if (compact.includes("\u53ef\u88ab\u4ecb\u7ecd")) return "You are both currently open to introductions, so this signal is still fresh.";
  if (compact.includes("\u6d4b\u8bd5\u8d26\u53f7")) {
    const tags = extractTagsFromText(compact);
    return tags.length ? `A test profile interested in ${joinTags(tags)}.` : "A test profile with a few social signals.";
  }
  if (compact.includes("\u95e8\u5df2\u7ecf\u6253\u5f00")) return "The door is open. Start with one easy question.";
  if (compact.includes("\u7ebf\u5df2\u7ecf\u4eae")) return "This signal is mutual. Start with one small, comfortable question.";
  if (compact.includes("\u53ef\u89c1\u4fe1\u606f")) return "Your visible details are set.";
  const tags = extractTagsFromText(compact);
  if (tags.length) return `A recent note around ${joinTags(tags)}.`;
  return "A small everyday signal is ready to unfold.";
}

function extractTagsFromText(text: string) {
  const tags: string[] = [];
  TAG_TRANSLATIONS.forEach((label, token) => {
    if (text.includes(token)) tags.push(label);
  });
  return unique(tags).slice(0, 4);
}

function tagsFromDelimitedText(text: string) {
  return unique(text.split(/[,\uFF0C\u3001]/).map(cleanTag).filter(Boolean)).slice(0, 4);
}

function translateCity(value?: string) {
  const city = cleanSocialText(value);
  if (!city) return "Online";
  return TAG_TRANSLATIONS.get(city) || city;
}

function normalizeCopy(value?: string) {
  return cleanSocialText(value)
    .replace(/([\u3002\uFF01\uFF1F!?])\1+/g, "$1")
    .replace(/([\u3002\uFF01\uFF1F!?])([\u3002\uFF01\uFF1F!?])+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function joinTags(tags: string[]) {
  return tags.map(cleanTag).filter(Boolean).slice(0, 4).join(", ");
}
