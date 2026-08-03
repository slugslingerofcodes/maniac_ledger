import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Supabase email links (signup confirmation, magic links, recovery) land here.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Same treatment as the OAuth callback: this arrives in an emailed link,
  // so `next` is attacker-controllable. `redirect()` will happily send the
  // browser to an absolute URL, which makes an unvalidated value here a
  // straightforward open redirect off the back of a trusted-looking email.
  const next = safeRedirectPath(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Invalid or expired confirmation link.",
    )}`,
  );
}
