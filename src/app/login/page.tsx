import Image from "next/image";
import Link from "next/link";

import { login } from "@/app/auth/actions";
import { ImageBackdrop } from "@/components/ImageBackdrop";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage(props: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await props.searchParams;

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <ImageBackdrop src="/auth-bg.png" />
      <Card className="glass w-full max-w-sm">
        <CardHeader>
          <div className="relative mb-2 aspect-[11/6] w-full overflow-hidden rounded-lg ring-1 ring-foreground/10">
            <Image
              src="/auth-crest.png"
              alt="anime_maniacs"
              fill
              priority
              sizes="384px"
              className="object-contain"
            />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your anime tracker.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/reset-password"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={6}
                required
              />
            </div>

            <Button type="submit" formAction={login} className="w-full">
              Sign in
            </Button>
          </form>

          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleSignInButton />
        </CardContent>

        <CardFooter>
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground hover:underline"
            >
              Create an account
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
