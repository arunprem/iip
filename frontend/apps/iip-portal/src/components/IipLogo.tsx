type IipLogoSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<IipLogoSize, string> = {
  sm: 'h-14 w-14',
  md: 'h-20 w-20',
  lg: 'h-36 w-36',
};

const padClasses: Record<IipLogoSize, string> = {
  sm: 'p-2',
  md: 'p-2.5',
  lg: 'p-4',
};

interface IipLogoProps {
  size?: IipLogoSize;
  className?: string;
  /** White circular backing for the login form logo area. */
  whiteBackground?: boolean;
}

const LOGO_SRC = '/kerala-police-logo.png';
const LOGO_TRANSPARENT_SRC = '/kerala-police-logo-transparent.png';

/** Kerala Police emblem */
export function IipLogo({
  size = 'md',
  className = '',
  whiteBackground = false,
}: IipLogoProps) {
  if (!whiteBackground) {
    return (
      <img
        src={LOGO_SRC}
        alt="Kerala Police emblem"
        className={`${sizeClasses[size]} object-contain shrink-0 dark:brightness-0 dark:invert ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${padClasses[size]} shrink-0 rounded-full bg-white flex items-center justify-center ${className}`}
    >
      <img
        src={LOGO_TRANSPARENT_SRC}
        alt="Kerala Police emblem"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
