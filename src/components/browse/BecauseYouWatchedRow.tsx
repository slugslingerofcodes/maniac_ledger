import { getBecauseYouWatched } from "@/lib/because-you-watched";
import { getLibrarySnapshot, indexByMalId } from "@/lib/library-snapshot";
import { DiscoverRow } from "./DiscoverRow";

/**
 * The one personalized discovery row: titles that share the most genres with
 * the show the viewer most recently watched (see `because-you-watched.ts` for
 * how the seed and the picks are chosen). Renders nothing for a new account or
 * when the pool is too thin to be worth a row.
 */
export async function BecauseYouWatchedRow() {
  const library = await getLibrarySnapshot();
  const result = await getBecauseYouWatched(library);
  if (!result) return null;

  const seedTitle = result.seed.titleEnglish ?? result.seed.title;
  return (
    <DiscoverRow
      eyebrow="Picked from your library"
      title={
        <>
          Because you watched{" "}
          <span className="text-gradient">{seedTitle}</span>
        </>
      }
      items={result.items}
      library={indexByMalId(library)}
    />
  );
}
