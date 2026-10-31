/** The LF mark: a rounded tile with a magnifier-blue gradient. */
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-800 font-bold text-white shadow-sm ring-1 ring-white/15"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      LF
    </span>
  );
}
