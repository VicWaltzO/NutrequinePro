import type { ImgHTMLAttributes } from "react";
type Props = ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean };
export default function LocalImage({ unoptimized: _unoptimized, priority, alt = "", ...props }: Props) {
  void _unoptimized;
  return <img {...props} alt={alt} loading={priority ? "eager" : props.loading} />;
}
