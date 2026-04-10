type Props = Readonly<{
  className?: string;
}>;

export function CgiarLogo({ className = "" }: Props) {
  return (
    <img
      src="/cgiar-logo.svg"
      alt="CGIAR"
      width={219}
      height={256}
      className={`h-16 w-auto shrink-0 object-contain sm:h-20 lg:h-24 ${className}`.trim()}
    />
  );
}
