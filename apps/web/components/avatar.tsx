import { useId } from 'react';
import { PANEL, type Persona, type Reaction } from '@hotseat/shared';
export function Avatar({
  persona,
  reaction = 'listening',
  small = false,
}: {
  persona: Persona;
  reaction?: Reaction;
  small?: boolean;
}) {
  const clipId = useId();
  const p = PANEL[persona];
  const customer = persona === 'customer';
  const operator = persona === 'operator';
  return (
    <svg
      className={`avatar ${reaction} ${small ? 'small' : ''}`}
      viewBox="0 0 240 240"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${p.name}, ${reaction}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="240" height="240" rx={small ? 12 : 0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="240" height="240" fill={p.color} />
        <path d="M180 0H240V240H180Z" fill="#fff" opacity=".12" />
        <path d="M0 207H240" stroke="#292923" opacity=".12" />
        <g className="portrait">
          {customer && <path d="M67 138Q45 31 112 32Q186 15 181 151L162 198H66Z" fill="#302b29" />}
          <path
            d="M38 249Q41 168 98 164L143 164Q199 166 205 249"
            fill={customer ? '#efe9db' : operator ? '#4e5c58' : '#343c49'}
          />
          <path
            d="M99 146V179Q120 201 143 179V145"
            fill={customer ? '#bd8162' : operator ? '#b78565' : '#dba482'}
          />
          {!customer && !operator && (
            <>
              <path d="M87 171L119 194L108 224L74 182" fill="#efede4" />
              <path d="M152 172L120 195L133 224L166 183" fill="#efede4" />
            </>
          )}
          {operator && (
            <path d="M98 177Q121 194 145 176" stroke="#a1aaa0" strokeWidth="3" fill="none" />
          )}
          <ellipse
            cx="120"
            cy="105"
            rx="49"
            ry="61"
            fill={customer ? '#c99172' : operator ? '#c89677' : '#e4b08d'}
          />
          <ellipse
            cx="70"
            cy="112"
            rx="7"
            ry="13"
            fill={customer ? '#c99172' : operator ? '#c89677' : '#e4b08d'}
          />
          <ellipse
            cx="169"
            cy="112"
            rx="7"
            ry="13"
            fill={customer ? '#c99172' : operator ? '#c89677' : '#e4b08d'}
          />
          {customer ? (
            <path
              d="M66 106Q52 50 94 34Q163 13 179 76L170 119L153 64Q114 85 76 77L73 124Z"
              fill="#302b29"
            />
          ) : operator ? (
            <path
              d="M72 91Q57 49 90 39Q92 22 118 31Q147 19 157 42Q187 43 169 96L155 72Q104 83 81 67Z"
              fill="#30312e"
            />
          ) : (
            <path
              d="M73 91Q60 43 101 36Q139 19 164 51L168 91L152 68Q115 79 78 66Z"
              fill="#55504a"
            />
          )}
          <g className="brows" stroke="#44332e" strokeWidth="4" strokeLinecap="round">
            <path d="M87 98L103 96" />
            <path d="M136 96L153 98" />
          </g>
          <g className="eyes" fill="#352f2d">
            <ellipse cx="96" cy="108" rx="3.5" ry="4.5" />
            <ellipse cx="143" cy="108" rx="3.5" ry="4.5" />
          </g>
          {!customer && (
            <g fill="none" stroke={operator ? '#384341' : '#726457'} strokeWidth="2.5">
              <rect x="78" y="99" width="33" height="23" rx="8" />
              <rect x="128" y="99" width="33" height="23" rx="8" />
              <path d="M111 108H128" />
            </g>
          )}
          <path
            d="M119 109L115 126L124 128"
            stroke="#9d6c55"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="mouth"
            d="M108 140Q120 146 134 138"
            stroke="#764d42"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          {customer && (
            <>
              <circle cx="71" cy="130" r="5" stroke="#e8c677" strokeWidth="2" fill="none" />
              <circle cx="168" cy="130" r="5" stroke="#e8c677" strokeWidth="2" fill="none" />
            </>
          )}
          {operator && (
            <path
              d="M88 137Q120 168 152 136Q150 164 122 172Q97 164 88 137"
              fill="#494039"
              opacity=".65"
            />
          )}
        </g>
      </g>
    </svg>
  );
}
