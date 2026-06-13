import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';

/**
 * Phase 1 placeholder — confirms the React + Tailwind + Framer Motion
 * pipeline is wired up correctly. Will be replaced in Phase 3.
 */
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Cloud className="mx-auto h-16 w-16 text-brand-400" />
        </motion.div>

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white">
          Media<span className="text-brand-400">Cloud</span>
        </h1>

        <p className="mt-3 text-surface-200">
          Phase 1 scaffold running — auth backend is live.
        </p>
      </motion.div>
    </div>
  );
}
