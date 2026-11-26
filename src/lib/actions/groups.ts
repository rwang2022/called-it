"use server";

import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { bets, groupMembers, groups, positions } from "../db/schema";
import { newId, newInviteCode } from "../ids";
import { logActivity } from "../data/activity";
import { groupLedger } from "../data/ledger";
import { actionMember, actionUser, fail, run } from "./result";

const Name = z.string().trim().min(2, "Give the group a name (2+ characters).").max(40, "Keep the name under 40 characters.");

export async function createGroup(input: { name: string; hue: number }) {
  const res = await run(async () => {
    const user = await actionUser();
    const name = Name.parse(input.name);
    const hue = z.number().int().min(0).max(360).parse(input.hue);
    const id = newId();
    await db.batch([
      db.insert(groups).values({ id, name, hue, inviteCode: newInviteCode(), createdById: user.id }),
      db.insert(groupMembers).values({ groupId: id, userId: user.id, role: "owner" }),
    ]);
    await logActivity({ groupId: id, actorId: user.id, type: "member_joined" });
    return id;
  });
  if (res.ok) redirect(`/g/${res.data}?welcome=1`);
  return res;
}

export async function joinGroup(code: string) {
  const res = await run(async () => {
    const user = await actionUser();
    const group = await db.select().from(groups).where(eq(groups.inviteCode, code.trim().toUpperCase())).get();
    if (!group) fail("That invite link is invalid or has been reset.");
    const inserted = await db
      .insert(groupMembers)
      .values({ groupId: group.id, userId: user.id, role: "member" })
      .onConflictDoNothing()
      .returning({ userId: groupMembers.userId });
    if (inserted.length > 0) await logActivity({ groupId: group.id, actorId: user.id, type: "member_joined" });
    return group.id;
  });
  if (res.ok) redirect(`/g/${res.data}`);
  return res;
}

export async function renameGroup(groupId: string, input: { name: string; hue: number }) {
  return run(async () => {
    const { role } = await actionMember(groupId);
    if (role !== "owner") fail("Only the group owner can do that.");
    await db
      .update(groups)
      .set({ name: Name.parse(input.name), hue: z.number().int().min(0).max(360).parse(input.hue) })
      .where(eq(groups.id, groupId));
    refresh();
  });
}

export async function resetInvite(groupId: string) {
  return run(async () => {
    const { role } = await actionMember(groupId);
    if (role !== "owner") fail("Only the group owner can reset the invite link.");
    await db.update(groups).set({ inviteCode: newInviteCode() }).where(eq(groups.id, groupId));
    refresh();
  });
}

/** Members can't walk away mid-bet or while they owe (or are owed) money. */
async function assertCanLeave(groupId: string, userId: string) {
  const live = await db
    .select({ id: positions.id })
    .from(positions)
    .innerJoin(bets, eq(bets.id, positions.betId))
    .where(and(eq(bets.groupId, groupId), eq(positions.userId, userId), notInArray(bets.status, ["settled", "cancelled"])))
    .limit(1);
  if (live.length > 0) fail("They still have positions in live bets. Settle or withdraw those first.");
  const judging = await db
    .select({ id: bets.id })
    .from(bets)
    .where(
      and(
        eq(bets.groupId, groupId),
        notInArray(bets.status, ["settled", "cancelled"]),
        inArray(bets.judgeMode, ["person"]),
        eq(bets.judgeId, userId),
      ),
    )
    .limit(1);
  if (judging.length > 0) fail("They're the judge on a live bet.");
  const ledger = await groupLedger(groupId);
  const bal = ledger.balances.find((b) => b.user.id === userId)?.cents ?? 0;
  if (bal !== 0) fail("Their balance isn't square yet. Settle up first.");
}

export async function leaveGroup(groupId: string) {
  const res = await run(async () => {
    const { user, role } = await actionMember(groupId);
    await assertCanLeave(groupId, user.id);
    if (role === "owner") {
      const next = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, user.id)))
        .orderBy(groupMembers.joinedAt)
        .get();
      if (next) {
        await db
          .update(groupMembers)
          .set({ role: "owner" })
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, next.userId)));
      }
    }
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)));
  });
  if (res.ok) redirect("/home");
  return res;
}

export async function removeMember(groupId: string, userId: string) {
  return run(async () => {
    const { user, role } = await actionMember(groupId);
    if (role !== "owner") fail("Only the group owner can remove members.");
    if (userId === user.id) fail("Use “Leave group” instead.");
    await assertCanLeave(groupId, userId);
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    refresh();
  });
}

/** Turn "new bet posted" pushes on or off for one group (only for yourself). */
export async function setNewBetPush(groupId: string, on: boolean) {
  return run(async () => {
    const { user } = await actionMember(groupId);
    await db
      .update(groupMembers)
      .set({ muteNewBets: !z.boolean().parse(on) })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)));
    refresh();
  });
}
