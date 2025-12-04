export function FriendSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 p-4 bg-muted/10 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="w-1/3 h-4 bg-muted animate-pulse rounded" />
            <div className="w-1/4 h-3 bg-muted/50 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
