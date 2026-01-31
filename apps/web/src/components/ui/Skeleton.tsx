import clsx from 'clsx';

type Props = {
  className?: string;
};

const Skeleton = ({ className }: Props) => {
  return <div className={clsx('animate-pulse rounded-xl bg-white/10', className)} />;
};

export const JobCardSkeleton = () => (
  <div className="grid gap-4 rounded-2xl border border-white/10 p-4 md:grid-cols-[180px_1fr_auto]">
    <Skeleton className="h-48 w-full rounded-xl" />
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    </div>
    <div className="flex flex-col items-end justify-between">
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-3 w-28" />
    </div>
  </div>
);

export default Skeleton;
