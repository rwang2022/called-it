import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleSub: text("google_sub").unique(),
    email: text("email").unique(),
    // Lowercase handle for password sign-in; null for Google-only accounts.
    username: text("username"),
    // scrypt hash (see src/lib/auth/password.ts); null when no password is set.
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    image: text("image"),
    isBot: integer("is_bot", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("users_username_idx").on(t.username)],
);

/** Failed password sign-ins, bucketed per key ("u:<username>" or "ip:<addr>") to slow guessing. */
export const authThrottle = sqliteTable("auth_throttle", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: ts("window_start").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 of the session token; the raw token only ever lives in the cookie.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  hue: integer("hue").notNull().default(260),
  inviteCode: text("invite_code").notNull().unique(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at").notNull().default(now),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    joinedAt: ts("joined_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("gm_user_idx").on(t.userId)],
);

export type BetKind = "binary" | "multi" | "challenge";
export type BetStatus = "open" | "proposed" | "disputed" | "settled" | "cancelled";
export type JudgeMode = "creator" | "person" | "claude";
export type StakeMode = "money" | "bragging";
export type ClaudeJob = "none" | "pending" | "running" | "done" | "failed";

/** What a judge (or Claude) says happened. */
export type Outcome =
  | { type: "option"; optionId: string }
  | { type: "challenge"; results: Record<string, "pass" | "fail"> } // keyed by positionId
  | { type: "void" };

export const bets = sqliteTable(
  "bets",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    criteria: text("criteria"),
    category: text("category").notNull(),
    kind: text("kind").$type<BetKind>().notNull(),
    stakeMode: text("stake_mode").$type<StakeMode>().notNull(),
    stakeCents: integer("stake_cents").notNull().default(0),
    customStakes: integer("custom_stakes", { mode: "boolean" }).notNull().default(false),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    subjectId: text("subject_id").references(() => users.id),
    challengeOpponentId: text("challenge_opponent_id").references(() => users.id),
    challengeOpponentTask: text("challenge_opponent_task"),
    closesAt: ts("closes_at").notNull(),
    resolvesAt: ts("resolves_at").notNull(),
    judgeMode: text("judge_mode").$type<JudgeMode>().notNull(),
    judgeId: text("judge_id").references(() => users.id),
    status: text("status").$type<BetStatus>().notNull().default("open"),
    proposal: text("proposal", { mode: "json" }).$type<Outcome | null>(),
    proposalNote: text("proposal_note"),
    proposalVersion: integer("proposal_version").notNull().default(0),
    proposedById: text("proposed_by_id").references(() => users.id),
    proposedAt: ts("proposed_at"),
    reviewDeadline: ts("review_deadline"),
    disputedAt: ts("disputed_at"),
    voteDeadline: ts("vote_deadline"),
    outcome: text("outcome", { mode: "json" }).$type<Outcome | null>(),
    settledAt: ts("settled_at"),
    settledVia: text("settled_via").$type<"confirmed" | "window" | "vote" | "cancelled">(),
    claudePredict: text("claude_predict").$type<ClaudeJob>().notNull().default("none"),
    claudeResolve: text("claude_resolve").$type<ClaudeJob>().notNull().default("none"),
    claudeAttempts: integer("claude_attempts").notNull().default(0),
    claudeLastAttemptAt: ts("claude_last_attempt_at"),
    claudeNote: text("claude_note"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [
    index("bets_group_idx").on(t.groupId, t.status),
    index("bets_status_idx").on(t.status),
  ],
);

export const betOptions = sqliteTable(
  "bet_options",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("options_bet_idx").on(t.betId)],
);

export type Source = { title: string; url: string };

export const positions = sqliteTable(
  "positions",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    optionId: text("option_id").references(() => betOptions.id),
    amountCents: integer("amount_cents").notNull().default(0),
    /** 1–99: the holder's probability that their pick wins (or they complete their task). */
    confidence: integer("confidence").notNull(),
    task: text("task"),
    note: text("note"),
    sources: text("sources", { mode: "json" }).$type<Source[] | null>(),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("positions_bet_user_uq").on(t.betId, t.userId),
    index("positions_user_idx").on(t.userId),
  ],
);

/** Confirmations, disputes and dispute votes, scoped to one proposal version. */
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    proposalVersion: integer("proposal_version").notNull(),
    kind: text("kind", { enum: ["confirm", "dispute"] }).notNull(),
    vote: text("vote", { enum: ["uphold", "void"] }),
    reason: text("reason"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("reviews_uq").on(t.betId, t.userId, t.proposalVersion)],
);

/** Immutable per-user result of a settled bet. Feeds ledgers and leaderboards. */
export const settlements = sqliteTable(
  "settlements",
  {
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    netCents: integer("net_cents").notNull(),
    stakedCents: integer("staked_cents").notNull(),
    result: text("result", { enum: ["win", "loss", "push"] }).notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.betId, t.userId] }), index("settlements_group_idx").on(t.groupId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromId: text("from_id")
      .notNull()
      .references(() => users.id),
    toId: text("to_id")
      .notNull()
      .references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["pending", "confirmed", "rejected"] }).notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    note: text("note"),
    createdAt: ts("created_at").notNull().default(now),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("payments_group_idx").on(t.groupId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("comments_bet_idx").on(t.betId)],
);

export type ActivityType =
  | "bet_created"
  | "position_taken"
  | "challenge_accepted"
  | "proposed"
  | "disputed"
  | "settled"
  | "cancelled"
  | "member_joined"
  | "payment_recorded"
  | "payment_confirmed"
  | "claude_predicted";

export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    betId: text("bet_id").references(() => bets.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id),
    type: text("type").$type<ActivityType>().notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("activity_group_idx").on(t.groupId, t.createdAt)],
);

/** Every Claude API call, for cost visibility and rate limiting. */
export const claudeRuns = sqliteTable(
  "claude_runs",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id").references(() => bets.id, { onDelete: "set null" }),
    groupId: text("group_id"),
    kind: text("kind", { enum: ["predict", "resolve"] }).notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    searches: integer("searches").notNull().default(0),
    error: text("error"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("claude_runs_group_idx").on(t.groupId, t.createdAt)],
);

/**
 * One row per browser/device that opted in to Web Push. The endpoint is the
 * push service's capability URL for that browser, so it doubles as the key.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Hash of the session that subscribed (same as sessions.id), so signing out silences this device. */
    sessionId: text("session_id"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().default(now),
    lastSentAt: ts("last_sent_at"),
  },
  (t) => [index("push_user_idx").on(t.userId), index("push_session_idx").on(t.sessionId)],
);

/**
 * Claim markers for notifications driven by the clock rather than by an action
 * ("your bet is due", "Claude's pick is out"), keyed `kind:betId:userId`, so
 * each reaches each person once even when several sweeps race.
 */
export const notificationMarks = sqliteTable("notification_marks", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().default(now),
});

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type BetOption = typeof betOptions.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Activity = typeof activity.$inferSelect;
