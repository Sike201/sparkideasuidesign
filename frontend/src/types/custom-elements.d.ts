import { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
    namespace JSX {
      interface IntrinsicElements {
        'sf-airdrop-claim': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
          'data-theme'?: string
          'name'?: string
          'cluster'?: string
          'distributor-id'?: string
          'endpoint'?: string
          'token-decimals'?: string
          'token-symbol'?: string
          'enable-wallet-passthrough'?: string
        }
      }
    }
  }