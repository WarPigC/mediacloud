import { motion } from 'framer-motion';

export default function SkeletonCard() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl border border-white/5 bg-white/5 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded-lg bg-white/10" />
          <div className="h-3 w-1/2 animate-pulse rounded-lg bg-white/8" />
        </div>
      </div>
    </motion.div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
