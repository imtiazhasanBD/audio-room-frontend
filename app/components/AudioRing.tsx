import { motion } from "framer-motion";

export function AudioRing({ volume = 0 }) {
  const intensity = Math.min(volume / 20, 1); // Normalize 0–1

  return (
    <motion.svg
      width="110"
      height="110"
      viewBox="0 0 110 110"
      className="absolute inset-0 pointer-events-none"
    >
      {/* Glow Filter */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Reactive Wavy Circle */}
      <motion.circle
        cx="55"
        cy="55"
        r="40"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        filter="url(#glow)"
        stroke={`url(#grad-${volume})`}
        animate={{
          strokeDasharray: [
            "1 150",
            `${10 + intensity * 30} 150`,
            `${20 + intensity * 50} 150`,
          ],
          strokeWidth: 6 + intensity * 4,
        }}
        transition={{
          duration: 0.25,
          ease: "easeInOut",
        }}
      />

      {/* Gradient */}
      <defs>
        <linearGradient id={`grad-${volume}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#33ff33" />
          <stop offset="50%" stopColor="#ffff33" />
          <stop offset="100%" stopColor="#ff6600" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}
