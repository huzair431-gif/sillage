export function MemoryArt() {
  return (
    <svg className="memory-art" viewBox="0 0 440 270" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="trail" x1="60" y1="235" x2="370" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7774be" stopOpacity="0" />
          <stop offset=".65" stopColor="#7774be" stopOpacity=".55" />
          <stop offset="1" stopColor="#9691d2" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M${35 + i * 20} 264C${150 + i * 20} ${265 - i * 4} ${78 + i * 17} ${37 + i * 10} ${267 + i * 20} ${54 + i * 10}C${398 + i * 6} ${65 + i * 12} 391 ${190 - i * 8} ${269 + i * 17} ${175 - i * 6}`}
          stroke="url(#trail)"
          strokeWidth="1"
        />
      ))}
      <circle cx="310" cy="66" r="6" fill="#8b86c3" />
      <circle cx="310" cy="66" r="14" stroke="#8b86c3" strokeOpacity=".2" />
      <circle cx="189" cy="156" r="3" fill="#aaa7d3" />
    </svg>
  );
}
