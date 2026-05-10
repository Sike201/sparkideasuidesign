import { SVGProps } from "react"

export const SvgChevronDown = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 21"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M9.337 13.975a.938.938 0 0 0 1.326 0l5.625-5.625a.938.938 0 0 0-1.326-1.325L10 11.987 5.038 7.025A.937.937 0 1 0 3.712 8.35l5.625 5.625Z"
      clipRule="evenodd"
    />
  </svg>
)
