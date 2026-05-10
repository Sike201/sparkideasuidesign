import { PublicKey } from "@solana/web3.js"
import nacl from "tweetnacl"
import { decodeUTF8 } from "tweetnacl-util"

import { AcceptTermsRequestSchema } from "../../shared/models"
import { UserData, UserRow, buildUserData } from "../../shared/models/userModel"
import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { UserService } from "../services/userService"
import { validateTransaction } from "../../shared/solana/validateTransaction"

/**
 * Countries that are not allowed to participate.
 * Countries in this list will be denied access.
 * Countries are listed as ISO 3166 A2 country codes (two-letter country codes)
 * List of codes: https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes
 */
const COUNTRIES_BLACKLIST: string[] = [
  "BY", // Belarus
  "BI", // Burundi
  "CF", // Central African Republic
  "CD", // Democratic Republic of Congo
  "KP", // Democratic People’s Republic of Korea (North Korea)
  "UA", // Temporarily occupied regions of Ukraine
  "CU", // Cuba
  "IR", // Iran
  "LY", // Libya
  "CN", // People's Republic of China
  "RU", // Russian Federation
  "SO", // Somalia
  "SD", // Sudan
  "SS", // South Sudan
  "SY", // Syria
  "US", // United States of America
  "VE", // Venezuela
  "YE", // Yemen
  "ZW"  // Zimbabwe
]
// @TODO - fix Ukraine country blacklist with blacklisted regions below
// const BLACKLISTED_REGIONS: string[] = ['UA-43', 'UA-40', 'UA-14', 'UA-09']

type ENV = {
  DB: D1Database
}
export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB
  try {
    //// validate request
    const requestJson = await ctx.request.json()
    const { error, data } = AcceptTermsRequestSchema.safeParse(requestJson)

    if (error) {
      return jsonResponse(null, 400)
    }

    ///// authorization
    const { publicKey, message, signature, isLedgerTransaction } = data
    const address = publicKey

    let isVerified = false

    if (isLedgerTransaction) {
      try {
        isVerified = await validateTransaction(message, publicKey, new Uint8Array(signature))
      } catch (err) {
        console.error("❌ Error during transaction verification:", err)
        return jsonResponse(null, 500)
      }
    } else {
      isVerified = nacl.sign.detached.verify(
        decodeUTF8(message),
        new Uint8Array(signature),
        new PublicKey(publicKey).toBytes(),
      );
      
      console.log("Signature verification result:", isVerified)
      
      if (!isVerified) {
        await reportError(db, new Error(`Invalid signature (acceptterms)! publicKey: ${publicKey}, message: ${message}, signature: ${signature}`))
        return jsonResponse(null, 401)
      }
    }

    //// business logic
    // check if the user is stored in the db
    const existingUser = await UserService.findUserByAddress({ db, address })

    const countryOfOrigin = ctx.request.cf?.country ?? 'UnknownCountry'
    const regionOfOrigin = ctx.request.cf?.regionCode
    const region = ctx.request.cf?.region

    if (COUNTRIES_BLACKLIST.includes(countryOfOrigin)) {
      const message = `Access currently denied for country ${countryOfOrigin}.`
      const reportMessage = `Access currently denied for country ${countryOfOrigin}-${regionOfOrigin}-${region}.`
      await reportError(db, new Error(reportMessage))
      return jsonResponse({ message }, 403)
    }

    console.log({ existingUser })

    const termsOfUse = {
      acceptedAt: new Date(),
      acceptedTextSigned: message,
      countryOfOrigin,
    }

    if (!existingUser) {
      console.log("User not found in db, inserting...")
      const userData: UserData = { termsOfUse }
      await db
        .prepare("INSERT INTO user (address, data) VALUES (?1, ?2)")
        .bind(address, buildUserData(userData))
        .run()
      console.log("User inserted into db.")
    } else {
      console.log("User found in db, updating...")

      const userData: UserData = existingUser.data ?? {}
      userData.termsOfUse = termsOfUse

      await db
        .prepare("UPDATE user SET data = ?2 WHERE address = ?1")
        .bind(address, buildUserData(userData))
        .run()
      console.log("User updated")
    }

    return jsonResponse(null, 204)
  } catch (e) {
    await reportError(db, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}