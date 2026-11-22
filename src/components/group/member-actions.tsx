"use client";

import { useState } from "react";
import { leaveGroup, removeMember, renameGroup, resetInvite } from "@/lib/actions/groups";
import { useAction } from "../ui/use-action";
import { ConfirmButton } from "../ui/confirm-button";
import { HuePicker } from "./hue-picker";

export function RenameGroupForm({ groupId, name, hue }: { groupId: string; name: string; hue: number }) {
  const [pending, exec] = useAction();
  const [n, setN] = useState(name);
  const [h, setH] = useState(hue);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => renameGroup(groupId, { name: n, hue: h }), { success: "Saved." });
      }}
    >
      <input className="input" maxLength={40} value={n} onChange={(e) => setN(e.target.value)} aria-label="Group name" />
      <HuePicker value={h} onChange={setH} />
      <button className="btn btn-ghost w-full" disabled={pending || (n.trim() === name && h === hue)}>
        Save
      </button>
    </form>
  );
}

export function ResetInviteButton({ groupId }: { groupId: string }) {
  const [pending, exec] = useAction();
  return (
    <ConfirmButton className="btn btn-ghost btn-sm" disabled={pending} confirmLabel="Old link stops working. Sure?" onConfirm={() => exec(() => resetInvite(groupId), { success: "New invite link created." })}>
      Reset link
    </ConfirmButton>
  );
}

export function RemoveMemberButton({ groupId, userId }: { groupId: string; userId: string }) {
  const [pending, exec] = useAction();
  return (
    <ConfirmButton className="btn btn-danger btn-sm" disabled={pending} confirmLabel="Remove?" onConfirm={() => exec(() => removeMember(groupId, userId), { success: "Removed." })}>
      Remove
    </ConfirmButton>
  );
}

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [pending, exec] = useAction();
  return (
    <ConfirmButton className="btn btn-danger w-full" disabled={pending} confirmLabel="Tap again to leave" onConfirm={() => exec(() => leaveGroup(groupId))}>
      Leave group
    </ConfirmButton>
  );
}
