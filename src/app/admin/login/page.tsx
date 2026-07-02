import { ShieldCheck } from "lucide-react";

import { adminLogin } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AdminLoginPage(props: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await props.searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm ring-1 ring-amber-500/30">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-amber-400">
            <ShieldCheck className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Administrator
            </span>
          </div>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>
            Restricted area. Admin accounts only.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" formAction={adminLogin} className="w-full">
              Sign in as admin
            </Button>
          </form>

          {message ? (
            <p className="text-sm text-destructive" role="status">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
