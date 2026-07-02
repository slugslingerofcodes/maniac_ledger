import Link from "next/link";
import { Trash2 } from "lucide-react";

import { createAnnouncement, deleteAnnouncement } from "@/app/admin/actions";
import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminPage(props: {
  searchParams: Promise<{ message?: string }>;
}) {
  const admin = await requireAdmin();
  const { message } = await props.searchParams;

  // Every user + their sign-in times (service role → bypasses RLS).
  const svc = createAdminClient();
  const { data: userList } = await svc.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const users = [...(userList?.users ?? [])].sort(
    (a, b) =>
      new Date(b.last_sign_in_at ?? 0).getTime() -
      new Date(a.last_sign_in_at ?? 0).getTime(),
  );

  // Announcements (RLS lets an admin read all).
  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {admin.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to app
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {message ? (
        <p className="mb-6 rounded-lg bg-card p-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
          {message}
        </p>
      ) : null}

      {/* Announcements */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Announcements</h2>

        <form
          action={createAnnouncement}
          className="mb-5 flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" maxLength={120} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              name="body"
              rows={3}
              maxLength={1000}
              required
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="submit" className="self-start">
            Post announcement
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          {(announcements ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            announcements!.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-4 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    {!a.active ? (
                      <Badge variant="outline">inactive</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmt(a.created_at)}
                  </p>
                </div>
                <form action={deleteAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    aria-label={`Delete ${a.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Users / logins */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Users{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({users.length})
          </span>
        </h2>
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const provider = u.app_metadata?.provider ?? "email";
                const adminFlag = u.app_metadata?.is_admin === true;
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{u.email}</span>
                        {adminFlag ? (
                          <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">
                            admin
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{provider}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmt(u.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmt(u.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
