import { SVGProps } from "react"

export const SvgRoundedEdge = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 4 8"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M4 0H0a3.996 3.996 0 0 1 2.828 1.171A3.994 3.994 0 0 1 4 4a3.997 3.997 0 0 1-2.47 3.695A3.991 3.991 0 0 1 0 8h4V0Z"
      clipRule="evenodd"
    />
  </svg>
)
