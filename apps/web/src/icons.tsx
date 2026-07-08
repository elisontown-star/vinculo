import type { ReactNode, SVGProps } from 'react';

// Conjunto de ícones de linha, estilo Fluent (admin center Microsoft):
// grade 24px, traço uniforme, pontas arredondadas, cor herdada (currentColor).
// Uso: <IconLock /> ou <IconTrash size={16} className="..." />.

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

function Svg({ size = 18, strokeWidth = 1.75, className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`icon${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 5.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 5.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2h.01" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconCheckCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.4 12.2l2.5 2.5 4.7-5.2" />
  </Svg>
);

export const IconBlock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6.2 6.2 17.8 17.8" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" />
    <path d="M6.2 7l.9 12.4A2 2 0 0 0 9.1 21.3h5.8a2 2 0 0 0 2-1.9L17.8 7" />
    <path d="M10 10.5v7M14 10.5v7" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2l1.7 5.6a2 2 0 0 0 1.3 1.3L20.8 12l-5.6 1.7a2 2 0 0 0-1.3 1.3L12 20.8l-1.7-5.6a2 2 0 0 0-1.3-1.3L3.2 12l5.6-1.7a2 2 0 0 0 1.3-1.3L12 3.2Z" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

export const IconChild = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7.5" r="3.2" />
    <path d="M7 20.5v-1a5 5 0 0 1 10 0v1" />
  </Svg>
);
