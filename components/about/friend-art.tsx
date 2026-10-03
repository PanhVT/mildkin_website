export function FriendArt({ kind }: { kind: "bear" | "rabbit" | "cat" }) {
  const bear = kind === "bear";
  const rabbit = kind === "rabbit";
  const coat = bear ? "#A36C4E" : "#FFFEF6";
  return (
    <svg viewBox="0 0 260 240" fill="none" aria-hidden="true">
      <path
        d="M29 55c-18-20-30 9 0 24 29-15 17-44 0-24Z"
        stroke="#FAB6B6"
        strokeWidth="5"
      />
      <path
        d="m224 160 5 10 11 2-8 8 1 11-10-5-10 5 2-11-8-8 11-2Z"
        fill="#89B876"
      />
      {rabbit ? (
        <>
          <ellipse
            cx="96"
            cy="67"
            rx="23"
            ry="55"
            fill={coat}
            transform="rotate(-12 96 67)"
          />
          <ellipse
            cx="165"
            cy="67"
            rx="23"
            ry="55"
            fill={coat}
            transform="rotate(12 165 67)"
          />
          <ellipse
            cx="96"
            cy="65"
            rx="11"
            ry="38"
            fill="#FAB6B6"
            transform="rotate(-12 96 65)"
          />
          <ellipse
            cx="165"
            cy="65"
            rx="11"
            ry="38"
            fill="#FAB6B6"
            transform="rotate(12 165 65)"
          />
        </>
      ) : bear ? (
        <>
          <circle cx="75" cy="77" r="30" fill={coat} />
          <circle cx="185" cy="77" r="30" fill={coat} />
          <circle cx="75" cy="77" r="17" fill="#FAB6B6" />
          <circle cx="185" cy="77" r="17" fill="#FAB6B6" />
        </>
      ) : (
        <>
          <path
            d="M55 111 52 43Q53 29 67 35l60 43M139 78l55-43q14-7 15 9l-4 72"
            fill="#634535"
          />
          <path d="m66 52 4 40 32-14M192 52l-29 27 31 13" fill="#FAB6B6" />
        </>
      )}
      <path
        d="M46 141c0-50 35-73 84-73s84 23 84 73c0 51-33 70-84 70s-84-19-84-70Z"
        fill={coat}
      />
      {kind === "cat" && (
        <path
          d="M146 70c46 5 68 29 68 71 0 10-1 19-4 26-47-8-63-38-64-97Z"
          fill="#634535"
        />
      )}
      {bear && <ellipse cx="130" cy="168" rx="37" ry="28" fill="#FFFADB" />}
      <ellipse cx="102" cy="140" rx="7" ry="9" fill="#432C20" />
      <ellipse cx="158" cy="140" rx="7" ry="9" fill="#432C20" />
      <ellipse
        cx="130"
        cy="159"
        rx="10"
        ry="7"
        fill={rabbit ? "#D2757A" : "#432C20"}
      />
      <path
        d="M130 163v9m0 0c-9 13-19 7-20 1m20-1c9 13 19 7 20 1"
        stroke="#432C20"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {!bear && (
        <>
          <ellipse cx="79" cy="160" rx="12" ry="7" fill="#FAB6B6" />
          <ellipse cx="181" cy="160" rx="12" ry="7" fill="#FAB6B6" />
        </>
      )}
    </svg>
  );
}
