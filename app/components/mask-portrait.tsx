export function MaskPortrait({
  seat,
  small = false,
}: {
  seat: number;
  small?: boolean;
}) {
  return (
    <span
      className={`mask-portrait mask-portrait--${seat}${small ? " mask-portrait--small" : ""}`}
      aria-hidden="true"
    />
  );
}
