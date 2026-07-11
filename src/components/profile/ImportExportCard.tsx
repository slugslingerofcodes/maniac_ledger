"use client";

import { useRef, useState, useTransition } from "react";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { importFromAnilist, importFromMalXml } from "@/app/actions/import";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Bring your history with you: import from an AniList username or a MAL XML
 * export, and download everything as JSON. Imports only add missing entries —
 * existing library rows are never overwritten.
 */
export function ImportExportCard() {
  const [anilistName, setAnilistName] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function runAnilistImport() {
    const username = anilistName.trim();
    if (!username) return;
    startTransition(async () => {
      const res = await importFromAnilist(username);
      if (res.ok) {
        toast.success(
          `Imported ${res.imported} entries from AniList${res.skipped > 0 ? ` (${res.skipped} already tracked or unmatched)` : ""}.`,
        );
        setAnilistName("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function runMalImport(file: File) {
    startTransition(async () => {
      let xml: string;
      try {
        xml = await file.text();
      } catch {
        toast.error("Couldn't read that file.");
        return;
      }
      const res = await importFromMalXml(xml);
      if (res.ok) {
        toast.success(
          `Imported ${res.imported} entries from MAL${res.skipped > 0 ? ` (${res.skipped} already tracked or unmatched)` : ""}.`,
        );
      } else {
        toast.error(res.error);
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Import &amp; export
      </p>

      {/* AniList import */}
      <div className="mt-3 flex gap-2">
        <Input
          value={anilistName}
          onChange={(e) => setAnilistName(e.target.value)}
          placeholder="AniList username"
          aria-label="AniList username"
          disabled={pending}
          className="h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") runAnilistImport();
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0"
          disabled={pending || anilistName.trim().length === 0}
          onClick={runAnilistImport}
        >
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Pulls your public AniList anime list (status, progress, scores).
      </p>

      {/* MAL XML import + JSON export */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xml,text/xml,application/xml,application/gzip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) runMalImport(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          <UploadIcon className="mr-1.5 size-3.5" /> Import MAL XML
        </Button>
        <a
          href="/api/export"
          download
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <DownloadIcon className="mr-1.5 size-3.5" /> Export my data (JSON)
        </a>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        MAL: Profile → Export lists (uncompressed XML). Imports never overwrite
        entries you already track.
      </p>
    </div>
  );
}
