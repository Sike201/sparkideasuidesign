import { decodeUTF8 } from "tweetnacl-util"
import { jsonResponse, reportError } from "../api/cfPagesFunctionsUtils"
import nacl from "tweetnacl"
import { PublicKey } from "@solana/web3.js"

type ENV = {
  DB: D1Database,
  ADMIN_ADDRESSES: string
}
type IsAdminArgs = {
    auth: {
        address: string,
        message: string,
        signature: number[]
    },
    ctx: EventContext<ENV, any, Record<string, unknown>>
}

export type isAdminReturnValue = {
  isAdmin: true
} | {
  isAdmin: false,
  error: {
    code: number,
    message: string
  }
}

export const checkAdminAuthorization = ({auth, ctx}: IsAdminArgs):isAdminReturnValue => {
    //// auth
    const { address, message, signature } = auth
    const db = ctx.env.DB

    // auth - confirm signature
    const isVerified = nacl.sign.detached.verify(
      decodeUTF8(message),
      new Uint8Array(signature),
      new PublicKey(address).toBytes(),
    )
    console.log("isVerified: ", isVerified);
    if (!isVerified) {
     return { isAdmin: false, error: {code: 401, message:`Invalid signature (after-sale-update)! publicKey: ${address}, message: ${message}, signature: ${signature}`}} 
    }

    // auth - confirm address is admin address
    const { ADMIN_ADDRESSES } = ctx.env
    if (!ADMIN_ADDRESSES) throw new Error('Misconfigured env! ADMIN_ADDRESSES is missing')

    const adminAddresses = ADMIN_ADDRESSES.split(',')
    console.log("adminAddresses: ", adminAddresses);

    const isAdminConfirmed = adminAddresses.includes(address)
    if (!isAdminConfirmed) {
      return {isAdmin: false, error: {
        code: 401, 
        message: `Non-admin tried accessing admin functionality! address=(${address})`
      }}
    }
    return { isAdmin: true }
}