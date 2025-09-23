export const PostCardSkeleton = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="aspect-video w-full animate-skeleton bg-gradient-to-r from-muted via-muted/60 to-muted" />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="h-6 w-3/4 animate-skeleton rounded bg-gradient-to-r from-muted via-muted/60 to-muted" />
        <div className="h-4 w-full animate-skeleton rounded bg-gradient-to-r from-muted via-muted/60 to-muted" />
        <div className="h-4 w-5/6 animate-skeleton rounded bg-gradient-to-r from-muted via-muted/60 to-muted" />
        <div className="mt-auto h-9 w-32 animate-skeleton rounded-full bg-gradient-to-r from-muted via-muted/60 to-muted" />
      </div>
    </div>
  );
};

