import Link from "next/link";

import { requestPasswordReset } from "@/app/auth/actions";
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

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await props.searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to choose a new
            password.
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
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <Button
              type="submit"
              formAction={requestPasswordReset}
              className="w-full"
            >
              Send reset link
            </Button>
          </form>

          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </CardContent>

        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
