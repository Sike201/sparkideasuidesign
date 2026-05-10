import { SVGProps } from "react"

export const SvgFloorStrategy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={20}
    height={20}
    fill="none"
    {...props}
  >
    <path
      fill="#BEBAFF"
      d="M15.334 5.666c.14 0 .276.017.407.047l.004-.003.005.005a1.833 1.833 0 0 1 1.416 1.784V13.5a.834.834 0 0 1-1.667 0V8.312l-4.604 4.604a4.834 4.834 0 0 1-3.418 1.415h-3.81a.833.833 0 1 1 0-1.666h3.81c.84 0 1.645-.334 2.24-.928l4.405-4.404h-4.79a.834.834 0 0 1 0-1.667h6.002Z"
    />
  </svg>
)
