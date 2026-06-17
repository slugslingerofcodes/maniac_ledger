import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AnimeCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-10 rounded-md" />
        </div>
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}
