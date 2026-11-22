"use client";

import { useRef, useState } from "react";
import { Camera, Pencil } from "lucide-react";
import { removeAvatar, updateName, uploadAvatar } from "@/lib/actions/profile";
import { Avatar } from "../ui/avatar";
import { useAction } from "../ui/use-action";
import { useToast } from "../ui/toast";

type Props = { user: { id: string; name: string; image: string | null; isBot: boolean } };

const SIZE = 256;

/** Center-crop to a square and shrink to 256px, so uploads are ~10–40 KB whatever the camera made. */
async function squareThumbnail(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await encode("image/webp", 0.85);
  // Older Safari can't encode WebP and quietly returns PNG; JPEG is smaller then.
  const out = webp?.type === "image/webp" ? webp : await encode("image/jpeg", 0.88);
  if (!out) throw new Error("encode failed");
  return out;
}

/** The profile page's "Profile" card: change your photo and display name. */
export function ProfileEditor({ user }: Props) {
  const [pending, exec] = useAction();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.name);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That isn't an image.");
      return;
    }
    let blob: Blob;
    try {
      blob = await squareThumbnail(file);
    } catch {
      toast.error("Couldn't read that photo. Try a JPEG or PNG.");
      return;
    }
    const form = new FormData();
    form.set("photo", new File([blob], "avatar", { type: blob.type }));
    exec(() => uploadAvatar(form), { success: "Photo updated" });
  }

  return (
    <section className="surface mt-6 p-5 sm:p-6">
      <h2 className="mb-1 font-semibold">Profile</h2>
      <p className="mb-5 text-sm text-muted">How friends see you on bets and leaderboards.</p>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="group relative shrink-0 rounded-full"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            aria-label="Change photo"
          >
            <Avatar user={user} size="xl" />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="size-5 text-white" />
            </span>
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              {user.image ? "Change photo" : "Add photo"}
            </button>
            {user.image && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => exec(() => removeAvatar(), { success: "Photo removed" })} disabled={pending}>
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="min-w-0 flex-1 sm:border-l sm:border-white/[0.06] sm:pl-5">
          {editingName ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                exec(() => updateName(name), { success: "Name updated", onDone: () => setEditingName(false) });
              }}
            >
              <input className="input" autoFocus maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
              <button className="btn btn-primary" disabled={pending || !name.trim() || name.trim() === user.name}>
                Save
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setName(user.name);
                  setEditingName(false);
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="label !mb-0.5">Name</p>
                <p className="truncate">{user.name}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm gap-1.5" onClick={() => setEditingName(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
