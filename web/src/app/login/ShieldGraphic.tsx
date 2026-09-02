import styles from './login.module.css';

const orbits = [
  { r: 78, dots: 5, dur: '18s' },
  { r: 112, dots: 7, dur: '26s' },
  { r: 148, dots: 9, dur: '34s' },
];

export default function ShieldGraphic({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="lsLoginScanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0" />
          <stop offset="50%" stopColor="#5EEAD4" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" />
        </linearGradient>
        <clipPath id="lsLoginShieldClip">
          <path d="M200 168 L262 198 L262 276 C262 328 230 364 200 388 C170 364 138 328 138 276 L138 198 Z" />
        </clipPath>
      </defs>

      <g className={styles.ringSlow}>
        <circle cx="200" cy="255" r="78" stroke="#0A6258" strokeWidth="0.6" opacity="0.35" />
        <circle
          cx="200"
          cy="255"
          r="78"
          stroke="#26BFB0"
          strokeWidth="1.1"
          strokeDasharray="6 14"
          opacity="0.7"
        />
      </g>
      <g className={styles.ringMid}>
        <circle
          cx="200"
          cy="255"
          r="112"
          stroke="#26BFB0"
          strokeWidth="0.8"
          strokeDasharray="2 10"
          opacity="0.45"
        />
      </g>
      <g className={styles.ringFast}>
        <circle
          cx="200"
          cy="255"
          r="148"
          stroke="#5EEAD4"
          strokeWidth="0.7"
          strokeDasharray="18 22"
          opacity="0.35"
        />
      </g>

      {orbits.map((orbit) =>
        Array.from({ length: orbit.dots }).map((_, index) => (
          <g
            key={`${orbit.r}-${index}`}
            className={styles.orbitDot}
            style={{
              animationDuration: orbit.dur,
              animationDelay: `${(-index * parseFloat(orbit.dur)) / orbit.dots}s`,
            }}
          >
            <circle
              cx={200 + orbit.r}
              cy="255"
              r={index % 3 === 0 ? 2.4 : 1.5}
              fill="#5EEAD4"
              opacity="0.85"
            />
          </g>
        )),
      )}

      <g className={styles.satellite}>
        <g transform="translate(68 92)">
          <circle r="16" stroke="#26BFB0" strokeWidth="1" opacity="0.55" />
          <circle r="7" stroke="#5EEAD4" strokeWidth="1.1" />
          <circle r="2.2" fill="#5EEAD4" />
        </g>
      </g>
      <g className={styles.satelliteRev}>
        <g transform="translate(332 118)">
          <circle r="14" stroke="#26BFB0" strokeWidth="1" opacity="0.5" />
          <circle r="6" stroke="#5EEAD4" strokeWidth="1.1" />
          <circle r="2" fill="#5EEAD4" />
        </g>
      </g>
      <g className={styles.satellite} style={{ animationDuration: '22s' }}>
        <g transform="translate(86 408)">
          <circle r="13" stroke="#26BFB0" strokeWidth="1" opacity="0.5" />
          <circle r="5.5" stroke="#5EEAD4" strokeWidth="1" />
          <circle r="1.8" fill="#5EEAD4" />
        </g>
      </g>

      <g className={styles.emblem}>
        <path
          className={styles.shieldStroke}
          d="M200 168 L262 198 L262 276 C262 328 230 364 200 388 C170 364 138 328 138 276 L138 198 Z"
          stroke="#5EEAD4"
          strokeWidth="2.4"
          pathLength="1"
        />
        <path
          d="M200 182 L248 206 L248 272 C248 314 224 344 200 364 C176 344 152 314 152 272 L152 206 Z"
          stroke="#26BFB0"
          strokeWidth="0.8"
          opacity="0.4"
        />
        <g clipPath="url(#lsLoginShieldClip)">
          <rect className={styles.scan} x="130" y="160" width="140" height="28" fill="url(#lsLoginScanGrad)" />
        </g>
        <g className={styles.padlock}>
          <path
            d="M184 248 C184 232 216 232 216 248"
            stroke="#5EEAD4"
            strokeWidth="4.2"
            strokeLinecap="round"
            pathLength="1"
          />
          <rect x="176" y="246" width="48" height="38" rx="7" stroke="#5EEAD4" strokeWidth="2.6" />
          <circle cx="200" cy="262" r="3.4" fill="#5EEAD4" />
          <path d="M200 265.5 V276" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
