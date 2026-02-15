"use client";

export default function NovaLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background shape — rounded square with gradient */}
      <defs>
        <linearGradient id="nova-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="nova-star" x1="12" y1="8" x2="28" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0E7FF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#nova-bg)" />
      
      {/* Nova star burst — 4-pointed star */}
      <path
        d="M20 7 L22.5 16.5 L32 14 L24 20 L32 26 L22.5 23.5 L20 33 L17.5 23.5 L8 26 L16 20 L8 14 L17.5 16.5 Z"
        fill="url(#nova-star)"
        opacity="0.95"
      />
      
      {/* Center dot */}
      <circle cx="20" cy="20" r="3" fill="url(#nova-bg)" />
    </svg>
  );
}
