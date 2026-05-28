import type { SuspectPhotoPoseType } from '../../pages/suspects/suspectTypes';

export type PoseSamplePose = Extract<
  SuspectPhotoPoseType,
  'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE'
>;

interface SuspectPoseSampleIllustrationProps {
  pose: PoseSamplePose;
  className?: string;
  title?: string;
}

const GUIDE_LABELS: Record<PoseSamplePose, { title: string; caption: string }> = {
  FRONT: {
    title: 'Front face example',
    caption: 'Face the camera · both eyes visible',
  },
  LEFT_PROFILE: {
    title: 'Left profile example',
    caption: 'Turn head left · left cheek to camera',
  },
  RIGHT_PROFILE: {
    title: 'Right profile example',
    caption: 'Turn head right · right cheek to camera',
  },
};

/** Clear pose guide for empty photo slots (illustration, not a real photo). */
export function SuspectPoseSampleIllustration({
  pose,
  className = '',
  title,
}: SuspectPoseSampleIllustrationProps) {
  const copy = GUIDE_LABELS[pose];
  const ariaLabel = title ?? `${copy.title}. ${copy.caption}`;

  return (
    <svg
      viewBox="0 0 100 136"
      className={className}
      role="img"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{ariaLabel}</title>
      <defs>
        <marker
          id="pose-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" className="pose-guide-arrow-head" />
        </marker>
      </defs>
      <rect width="100" height="136" className="pose-guide-bg" rx="6" />
      {pose === 'FRONT' && <FrontPoseGuide caption={copy.caption} />}
      {pose === 'LEFT_PROFILE' && <ProfilePoseGuide side="left" />}
      {pose === 'RIGHT_PROFILE' && <ProfilePoseGuide side="right" />}
      {(pose === 'LEFT_PROFILE' || pose === 'RIGHT_PROFILE') && (
        <GuideCaption text={copy.caption} />
      )}
    </svg>
  );
}

function GuideCaption({ text }: { text: string }) {
  const lines = text.split(' · ');
  return (
    <>
      <text x="50" y="118" textAnchor="middle" className="pose-guide-caption-line">
        {lines[0]}
      </text>
      {lines[1] && (
        <text x="50" y="130" textAnchor="middle" className="pose-guide-caption-sub">
          {lines[1]}
        </text>
      )}
    </>
  );
}

function FrontPoseGuide({ caption }: { caption: string }) {
  return (
    <>
      <ellipse cx="50" cy="52" rx="28" ry="34" className="pose-guide-head" />
      <circle cx="40" cy="48" r="3.5" className="pose-guide-feature" />
      <circle cx="60" cy="48" r="3.5" className="pose-guide-feature" />
      <ellipse cx="50" cy="58" rx="4" ry="3" className="pose-guide-feature" />
      <path d="M44 66 Q50 70 56 66" className="pose-guide-feature-stroke" fill="none" />
      {/* Both ears hint */}
      <ellipse cx="20" cy="52" rx="5" ry="8" className="pose-guide-ear" />
      <ellipse cx="80" cy="52" rx="5" ry="8" className="pose-guide-ear" />
      <rect x="38" y="88" width="24" height="14" rx="3" className="pose-guide-camera" />
      <circle cx="50" cy="95" r="4" className="pose-guide-camera-lens" />
      <text x="50" y="108" textAnchor="middle" className="pose-guide-camera-label">
        CAMERA
      </text>
      <GuideCaption text={caption} />
    </>
  );
}

function ProfilePoseGuide({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left';
  /* Profile faces right when left cheek is to camera; faces left when right cheek is to camera */
  const facingRight = isLeft;

  return (
    <>
      <text x="50" y="14" textAnchor="middle" className="pose-guide-banner">
        {isLeft ? 'LEFT PROFILE' : 'RIGHT PROFILE'}
      </text>
      <g transform={facingRight ? undefined : 'translate(100 0) scale(-1 1)'}>
      {/* Head in profile — faces toward image right when left-cheek-to-camera */}
      <path
        d="M18 38
           C18 26 32 20 48 24
           L72 34
           C84 42 88 58 84 74
           C78 92 58 100 40 94
           C26 88 16 72 16 54
           C16 44 18 38 18 38 Z"
        className="pose-guide-head"
      />
      {/* Cheek toward camera (left side of drawing = subject's left cheek when facing right) */}
      <path
        d="M18 38
           C18 26 32 20 42 23
           L42 94
           C26 88 16 72 16 54
           C16 44 18 38 18 38 Z"
        className="pose-guide-cheek-highlight"
      />
      {/* Nose */}
      <path
        d="M72 34 L84 50 L74 62"
        className="pose-guide-feature-stroke"
        fill="none"
        strokeWidth="2.5"
      />
      {/* Eye */}
      <circle cx="56" cy="42" r="2.5" className="pose-guide-feature" />
      {/* Camera on the cheek side */}
      <g transform="translate(4, 58)">
        <rect x="0" y="4" width="16" height="11" rx="2" className="pose-guide-camera" />
        <circle cx="8" cy="9.5" r="3" className="pose-guide-camera-lens" />
      </g>
      <path
        d="M20 64 L34 58"
        className="pose-guide-arrow"
        markerEnd="url(#pose-arrow)"
      />
      <text x="12" y="56" className="pose-guide-side-label">
        {isLeft ? 'L' : 'R'}
      </text>
      </g>
    </>
  );
}

export function poseHasSampleGuide(
  poseType: SuspectPhotoPoseType
): poseType is PoseSamplePose {
  return poseType === 'FRONT' || poseType === 'LEFT_PROFILE' || poseType === 'RIGHT_PROFILE';
}
