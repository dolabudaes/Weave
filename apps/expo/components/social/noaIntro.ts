import { cleanTag, DOMAIN_LABELS, lifeIndexBuckets, lifeIndexKey, type LifeIndexBuckets } from "@/components/social/profileDisplay";
import type { GoldProfile } from "@/types/weave";

export type LifeChip = {
  id: string;
  side: "you" | "them";
  bucket: "steady" | "lately";
  label: string;
  shared: boolean;
};

export type RelatedArea = {
  name: string;
  you: string[];
  them: string[];
};

export type LifeRead = {
  chips: LifeChip[];
  shared: string[];
  related: RelatedArea[];
  link: string;
  take: string;
};

const seenBriefs = new Set<string>();

export function markNoaBriefSeen(recId: string) {
  if (recId) seenBriefs.add(recId);
}

export function noaBriefSeen(recId: string) {
  return seenBriefs.has(recId);
}

function list(items: string[]) {
  const picked = items.filter(Boolean).slice(0, 2);
  if (!picked.length) return "";
  if (picked.length === 1) return picked[0];
  return `${picked[0]} and ${picked[1]}`;
}

function sharedLabels(mine: LifeIndexBuckets, theirs: LifeIndexBuckets) {
  const mineKeys = new Set([...mine.steady, ...mine.lately].map(lifeIndexKey));
  const labels: string[] = [];
  for (const label of [...theirs.steady, ...theirs.lately]) {
    const key = lifeIndexKey(label);
    if (!key || !mineKeys.has(key) || labels.some((item) => lifeIndexKey(item) === key)) continue;
    labels.push(label);
  }
  return labels;
}

function domainFor(profile: GoldProfile | null | undefined, label: string) {
  const key = lifeIndexKey(label);
  if (!key) return "";
  for (const domain of profile?.domains || []) {
    if (String(domain.status || "") === "inactive") continue;
    for (const bucket of [domain.long_term_interests, domain.short_term_interests]) {
      for (const item of bucket || []) {
        if (lifeIndexKey(cleanTag(item.label)) === key) return String(domain.domain || "");
      }
    }
  }
  return "";
}

function domainName(domain: string) {
  return DOMAIN_LABELS[domain] || domain.replace(/_/g, " ");
}

function relatedAreas(mineProfile: GoldProfile | null | undefined, theirProfile: GoldProfile | null | undefined, mine: LifeIndexBuckets, theirs: LifeIndexBuckets, sharedKeys: Set<string>): RelatedArea[] {
  const groups = new Map<string, { you: string[]; them: string[] }>();
  const add = (profile: GoldProfile | null | undefined, labels: string[], side: "you" | "them") => {
    for (const label of labels) {
      if (sharedKeys.has(lifeIndexKey(label))) continue;
      const domain = domainFor(profile, label);
      if (!domain) continue;
      const group = groups.get(domain) || { you: [], them: [] };
      if (!group[side].some((item) => lifeIndexKey(item) === lifeIndexKey(label))) group[side].push(label);
      groups.set(domain, group);
    }
  };
  const mineLabels = [...mine.steady, ...mine.lately];
  const theirLabels = [...theirs.steady, ...theirs.lately];
  add(mineProfile, mineLabels, "you");
  add(theirProfile, theirLabels, "them");
  const areas: RelatedArea[] = [];
  for (const [domain, group] of groups) {
    if (!group.you.length || !group.them.length) continue;
    areas.push({ name: domainName(domain), you: group.you.slice(0, 2), them: group.them.slice(0, 2) });
  }
  return areas.slice(0, 1);
}

function aside(labels: string[], otherKeys: Set<string>) {
  return labels.filter((label) => !otherKeys.has(lifeIndexKey(label))).slice(0, 2);
}

function takeFor(shared: string[], related: RelatedArea[], mine: LifeIndexBuckets, theirs: LifeIndexBuckets, mineReady: boolean) {
  if (!mineReady) return "";
  const you = [...mine.steady, ...mine.lately];
  const them = [...theirs.steady, ...theirs.lately];
  const sharedKeys = new Set(shared.map(lifeIndexKey));
  const youOnly = aside(you, sharedKeys);
  const themOnly = aside(them, sharedKeys);
  if (!you.length && !them.length) return "There isn't enough in either life index for a real read.";
  if (!you.length) {
    const steady = list(theirs.steady);
    const lately = list(theirs.lately);
    if (steady && lately) return `Your life index doesn't have a set to compare yet. Theirs keeps ${steady} steady, with ${lately} more recently.`;
    if (steady || lately) return `Your life index doesn't have a set to compare yet. Theirs is carried by ${steady || lately}.`;
    return "Your life index doesn't have a set to compare yet.";
  }
  if (!them.length) return `Their life index doesn't have enough to set beside yours yet. Yours stays with ${list(you)}.`;
  if (shared.length) {
    const lead = shared.length === 1 ? `${shared[0]} shows up for both of you.` : `${list(shared)} show up for both of you.`;
    if (youOnly.length && themOnly.length) return `${lead} They also have ${list(themOnly)} on their index, while ${list(youOnly)} stays on yours.`;
    if (themOnly.length) return `${lead} They also have ${list(themOnly)} on their index.`;
    if (youOnly.length) return `${lead} ${list(youOnly)} stays on your side.`;
    return lead;
  }
  if (related.length) {
    const area = related[0];
    return `No interest is actually shared. Both indexes do fall under ${area.name} — ${list(area.you)} on your side, ${list(area.them)} on theirs.`;
  }
  return `The two indexes don't line up. Yours stays with ${list(youOnly.length ? youOnly : you)}, and theirs with ${list(themOnly.length ? themOnly : them)}.`;
}

function linkFor(shared: string[], related: RelatedArea[]) {
  if (shared.length) return `In common: ${list(shared)}`;
  if (related.length) return `Same area, not the same interest: ${related[0].name}`;
  return "";
}

function chipsFor(side: LifeChip["side"], bucket: LifeChip["bucket"], labels: string[], sharedKeys: Set<string>) {
  return labels.map((label) => ({
    id: `${side}:${bucket}:${lifeIndexKey(label)}`,
    side,
    bucket,
    label,
    shared: sharedKeys.has(lifeIndexKey(label)),
  }));
}

export function readLifeIndexes(input: {
  mine?: GoldProfile | null;
  theirs?: GoldProfile | null;
  mineReady: boolean;
}): LifeRead {
  const mine = lifeIndexBuckets(input.mine);
  const theirs = lifeIndexBuckets(input.theirs);
  const shared = input.mineReady ? sharedLabels(mine, theirs) : [];
  const sharedKeys = new Set(shared.map(lifeIndexKey));
  const related = input.mineReady ? relatedAreas(input.mine, input.theirs, mine, theirs, sharedKeys) : [];
  const chips = [
    ...chipsFor("you", "steady", mine.steady, sharedKeys),
    ...chipsFor("them", "steady", theirs.steady, sharedKeys),
    ...chipsFor("you", "lately", mine.lately, sharedKeys),
    ...chipsFor("them", "lately", theirs.lately, sharedKeys),
  ];
  return {
    chips,
    shared,
    related,
    link: input.mineReady ? linkFor(shared, related) : "",
    take: takeFor(shared, related, mine, theirs, input.mineReady),
  };
}
