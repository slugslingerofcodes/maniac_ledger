"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { createProduct } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Admin form to add a store product: name, price, optional description, and a
 * product image uploaded to the public `product-images` bucket (admin-only
 * writes via RLS). The image is uploaded client-side first; its public URL is
 * then saved with the product via the createProduct server action.
 */
export function ProductForm() {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    (async () => {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        toast.error(error.message);
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      setUploading(false);
    })();
  }

  function submit() {
    const priceNum = Number(price);
    if (!name.trim()) {
      toast.error("Give the product a name.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    startTransition(async () => {
      const res = await createProduct({
        name: name.trim(),
        price: priceNum,
        description: description.trim() || undefined,
        imageUrl: imageUrl || undefined,
      });
      if (res.ok) {
        toast.success("Product added to the store.");
        setName("");
        setPrice("");
        setDescription("");
        setImageUrl(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Image picker / preview */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || pending}
          className="relative grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary/50 sm:w-40"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Product"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="size-5" />
              {uploading ? "Uploading…" : "Add image"}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickImage}
        />

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              placeholder="e.g. Frieren acrylic stand"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-price">Price (₹)</Label>
            <Input
              id="product-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="499"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-desc">Description (optional)</Label>
        <textarea
          id="product-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <Button
        type="button"
        className="self-start"
        disabled={pending || uploading}
        onClick={submit}
      >
        {pending ? "Adding…" : "Add product"}
      </Button>
    </div>
  );
}
