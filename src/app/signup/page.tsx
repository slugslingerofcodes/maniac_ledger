import Image from "next/image";
import Link from "next/link";

import { signup } from "@/app/auth/actions";
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

export default async function SignupPage(props: {
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Start tracking the anime you watch.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="e.g. slime_king"
                autoComplete="username"
                minLength={2}
                maxLength={32}
                required
              />
            </div>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>

            <Button type="submit" formAction={signup} className="w-full">
              Sign up
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

          <GoogleSignInButton label="Sign up with Google" />
        </CardContent>

        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
