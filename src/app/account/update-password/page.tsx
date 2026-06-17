import { updatePassword } from "@/app/auth/actions";
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

// Reached after clicking the recovery link in the reset email: /auth/confirm
// verifies the recovery token, signs the user in, then forwards here. The
// proxy guard ensures only an authenticated (recovered) session lands on it.
export default async function UpdatePasswordPage(props: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await props.searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Enter and confirm your new password below.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>

            <Button
              type="submit"
              formAction={updatePassword}
              className="w-full"
            >
              Update password
            </Button>
          </form>

          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
