"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { GENRE_OPTIONS } from "@/lib/genres";
import {
  COUNTRY_OPTIONS,
  DURATION_MAX,
  EPISODES_MAX,
  FORMAT_OPTIONS,
  SEASONS,
  SEASON_LABELS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  STREAMING_OPTIONS,
  TAG_OPTIONS,
  YEAR_MAX,
  YEAR_MIN,
  YEAR_OPTIONS,
  type CountryValue,
  type FormatValue,
  type Season,
  type SourceValue,
  type StatusValue,
  type StreamingValue,
  type TagValue,
} from "@/lib/search-filters";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type SearchFilterState = {
  /** MAL genre ids (AND semantics). */
  genreIds: number[];
  year: number | null;
  season: Season | null;
  format: FormatValue | null;
  status: StatusValue | null;
  streaming: StreamingValue | null;
  country: CountryValue | null;
  source: SourceValue | null;
  /** [from, to]; equal to the full bounds when untouched. */
  yearRange: [number, number];
  /** [min, max]; max at EPISODES_MAX means open-ended ("150+"). */
  episodes: [number, number];
  /** [min, max] minutes; max at DURATION_MAX means open-ended. */
  duration: [number, number];
  doujin: boolean;
  tags: TagValue[];
};

export function createDefaultFilters(genreIds: number[] = []): SearchFilterState {
  return {
    genreIds,
    year: null,
    season: null,
    format: null,
    status: null,
    streaming: null,
    country: null,
    source: null,
    yearRange: [YEAR_MIN, YEAR_MAX],
    episodes: [0, EPISODES_MAX],
    duration: [0, DURATION_MAX],
    doujin: false,
    tags: [],
  };
}

/** How many filters (beyond the text query) are active. */
export function countActiveFilters(f: SearchFilterState): number {
  let n = f.genreIds.length + f.tags.length;
  if (f.year != null) n++;
  if (f.season != null) n++;
  if (f.format != null) n++;
  if (f.status != null) n++;
  if (f.streaming != null) n++;
  if (f.country != null) n++;
  if (f.source != null) n++;
  if (f.yearRange[0] > YEAR_MIN || f.yearRange[1] < YEAR_MAX) n++;
  if (f.episodes[0] > 0 || f.episodes[1] < EPISODES_MAX) n++;
  if (f.duration[0] > 0 || f.duration[1] < DURATION_MAX) n++;
  if (f.doujin) n++;
  return n;
}

/**
 * Builds the /api/anime/search query string, or null when neither the query
 * nor any filter is active (idle state). Range sliders are only sent when
 * narrowed from their bounds; an open-ended max ("150+") sends no max.
 */
export function filtersToSearchParams(
  f: SearchFilterState,
  query: string,
  page: number,
): URLSearchParams | null {
  const params = new URLSearchParams();
  if (query.length >= 2) params.set("q", query);
  if (f.genreIds.length > 0) params.set("genres", f.genreIds.join(","));
  if (f.year != null) params.set("year", String(f.year));
  if (f.season) params.set("season", f.season);
  if (f.format) params.set("format", f.format);
  if (f.status) params.set("status", f.status);
  if (f.streaming) params.set("streaming", f.streaming);
  if (f.country) params.set("country", f.country);
  if (f.source) params.set("source", f.source);
  if (f.year == null) {
    if (f.yearRange[0] > YEAR_MIN) params.set("min_year", String(f.yearRange[0]));
    if (f.yearRange[1] < YEAR_MAX) params.set("max_year", String(f.yearRange[1]));
  }
  if (f.episodes[0] > 0) params.set("min_ep", String(f.episodes[0]));
  if (f.episodes[1] < EPISODES_MAX) params.set("max_ep", String(f.episodes[1]));
  if (f.duration[0] > 0) params.set("min_dur", String(f.duration[0]));
  if (f.duration[1] < DURATION_MAX) params.set("max_dur", String(f.duration[1]));
  if (f.doujin) params.set("doujin", "true");
  if (f.tags.length > 0) params.set("tags", f.tags.join(","));

  if ([...params.keys()].length === 0) return null;
  params.set("page", String(page));
  return params;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  value: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
};

export function SearchFilters({ query, onQueryChange, value, onChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeCount = countActiveFilters(value);

  const patch = (p: Partial<SearchFilterState>) => onChange({ ...value, ...p });

  return (
    <section aria-label="Search filters" className="mb-8">
      {/* ---- Primary row: Search / Genres / Year / Season / Format + toggle */}
      <div className="grid grid-cols-2 items-end gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <Field label="Search" className="col-span-2 sm:col-span-1">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search anime"
              className="h-9 rounded-lg pl-8"
            />
          </div>
        </Field>

        <Field label="Genres">
          <GenresDropdown
            selected={value.genreIds}
            onToggle={(id) =>
              patch({
                genreIds: value.genreIds.includes(id)
                  ? value.genreIds.filter((g) => g !== id)
                  : [...value.genreIds, id],
              })
            }
            onClear={() => patch({ genreIds: [] })}
          />
        </Field>

        <Field label="Year">
          <AnySelect
            ariaLabel="Year"
            value={value.year != null ? String(value.year) : null}
            onChange={(v) => patch({ year: v == null ? null : Number(v) })}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </Field>

        <Field label="Season">
          <AnySelect
            ariaLabel="Season"
            value={value.season}
            onChange={(v) => patch({ season: v as Season | null })}
            options={SEASONS.map((s) => ({ value: s, label: SEASON_LABELS[s] }))}
          />
        </Field>

        <Field label="Format">
          <AnySelect
            ariaLabel="Format"
            value={value.format}
            onChange={(v) => patch({ format: v as FormatValue | null })}
            options={FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Field>

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant={advancedOpen || activeCount > 0 ? "secondary" : "outline"}
            size="icon"
            aria-label="Toggle advanced filters"
            aria-expanded={advancedOpen}
            className="relative h-9 w-9 rounded-lg"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <SlidersHorizontalIcon className="size-4" />
            {activeCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
          {activeCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => onChange(createDefaultFilters())}
            >
              <XIcon className="size-3.5" /> Reset
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---- Advanced panel ------------------------------------------------ */}
      {advancedOpen ? (
        <div className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <Field label="Airing Status">
              <AnySelect
                ariaLabel="Airing status"
                value={value.status}
                onChange={(v) => patch({ status: v as StatusValue | null })}
                options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
            <Field label="Streaming On">
              <AnySelect
                ariaLabel="Streaming service"
                value={value.streaming}
                onChange={(v) => patch({ streaming: v as StreamingValue | null })}
                options={STREAMING_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
            </Field>
            <Field label="Country Of Origin">
              <AnySelect
                ariaLabel="Country of origin"
                value={value.country}
                onChange={(v) => patch({ country: v as CountryValue | null })}
                options={COUNTRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
            <Field label="Source Material">
              <AnySelect
                ariaLabel="Source material"
                value={value.source}
                onChange={(v) => patch({ source: v as SourceValue | null })}
                options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <RangeField
              label="Year Range"
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={value.yearRange}
              onCommit={(v) => patch({ yearRange: v, year: null })}
              format={(lo, hi) => `${lo} – ${hi}`}
            />
            <RangeField
              label="Episodes"
              min={0}
              max={EPISODES_MAX}
              value={value.episodes}
              onCommit={(v) => patch({ episodes: v })}
              format={(lo, hi) => `${lo} – ${hi === EPISODES_MAX ? `${EPISODES_MAX}+` : hi}`}
            />
            <RangeField
              label="Duration"
              min={0}
              max={DURATION_MAX}
              value={value.duration}
              onCommit={(v) => patch({ duration: v })}
              format={(lo, hi) =>
                `${lo} – ${hi === DURATION_MAX ? `${DURATION_MAX}+` : hi} min`
              }
            />
          </div>

          <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={value.doujin}
              onChange={(e) => patch({ doujin: e.target.checked })}
              className="size-4 rounded border-input accent-primary"
            />
            Doujin
          </label>

          <div className="mt-5 border-t border-border/60 pt-4">
            <Collapsible>
              <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-semibold">
                <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
                Advanced Genres &amp; Tag Filters
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {TAG_OPTIONS.map((tag) => {
                    const active = value.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          patch({
                            tags: active
                              ? value.tags.filter((t) => t !== tag)
                              : [...value.tags, tag].slice(0, 5),
                          })
                        }
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <p className="pt-2 text-[11px] text-muted-foreground">
                  Up to 5 tags. Tag, streaming, country, source, episode and
                  duration filters are matched via AniList.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </div>
  );
}

/** Single-value select with a leading "Any" option that maps to null. */
const ANY = "__any__";

function AnySelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  // base-ui's Select.Value renders the raw value; map it back to the label.
  const labelOf = (v: unknown) =>
    v == null || v === ANY
      ? "Any"
      : (options.find((o) => o.value === v)?.label ?? String(v));
  return (
    <Select
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? null : (v as string))}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full rounded-lg",
          value == null && "text-muted-foreground",
        )}
      >
        <SelectValue>{labelOf}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ANY}>Any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Multi-select dropdown over the curated MAL genre list. */
function GenresDropdown({
  selected,
  onToggle,
  onClear,
}: {
  selected: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const names = GENRE_OPTIONS.filter((g) => selected.includes(g.id)).map(
    (g) => g.name,
  );
  const summary =
    names.length === 0
      ? "Any"
      : names.length <= 2
        ? names.join(", ")
        : `${names[0]} +${names.length - 1}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Genres"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pl-2.5 pr-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
          names.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate text-left">{summary}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4 shrink-0 text-muted-foreground"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {selected.length > 0 ? (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={onClear}
            className="text-xs text-muted-foreground"
          >
            Clear selection
          </DropdownMenuItem>
        ) : null}
        {GENRE_OPTIONS.map((g) => {
          const active = selected.includes(g.id);
          return (
            <DropdownMenuItem
              key={g.id}
              closeOnClick={false}
              onClick={() => onToggle(g.id)}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {active ? <CheckIcon className="size-3" /> : null}
              </span>
              {g.name}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Dual-thumb range slider. Drags update local state only; the parent (and
 * thus the network request) is updated on release via `onValueCommitted`.
 */
function RangeField({
  label,
  min,
  max,
  value,
  onCommit,
  format,
}: {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onCommit: (v: [number, number]) => void;
  format: (lo: number, hi: number) => string;
}) {
  const [local, setLocal] = useState<[number, number]>(value);

  // Sync when the parent resets the filters. Intentional set-state-in-effect:
  // the slider is uncontrolled-while-dragging by design.
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => setLocal(value), [value]);

  const narrowed = local[0] > min || local[1] < max;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            narrowed ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {format(local[0], local[1])}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        value={local}
        onValueChange={(v) => {
          if (Array.isArray(v)) setLocal([v[0]!, v[1]!]);
        }}
        onValueCommitted={(v) => {
          if (Array.isArray(v)) onCommit([v[0]!, v[1]!]);
        }}
      />
    </div>
  );
}
