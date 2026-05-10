# solana-id
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'solana-id' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'solana-id' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at,
  json -> 'referral' -> 'solana-id' ->> 'referrerTwitterHandle' AS referrer
FROM user
WHERE json -> 'investmentIntent' -> 'solana-id' IS NOT NULL;" &> "export_solana-id_$(date -u +%Y%m%d_%H%M%S).json"

# moemate
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'moemate' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'moemate' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at,
  json -> 'referral' -> 'moemate' ->> 'referrerTwitterHandle' AS referrer
FROM user
WHERE json -> 'investmentIntent' -> 'moemate' IS NOT NULL;" &> "export_moemate_$(date -u +%Y%m%d_%H%M%S).json"

# borgy
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'borgy' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'borgy' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at,
  json -> 'referral' -> 'borgy' ->> 'referrerTwitterHandle' AS referrer
FROM user
WHERE json -> 'investmentIntent' -> 'borgy' IS NOT NULL;" &> "export_borgy_$(date -u +%Y%m%d_%H%M%S).json"

# zkagi
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'zkagi' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'zkagi' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'zkagi' IS NOT NULL;" &> "export_zkagi_$(date -u +%Y%m%d_%H%M%S).json"

# agentlauncher
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'agentlauncher' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'agentlauncher' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'agentlauncher' IS NOT NULL;" &> "export_agentlauncher_$(date -u +%Y%m%d_%H%M%S).json"

# ambient-network
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'ambient-network' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'ambient-network' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'ambient-network' IS NOT NULL;" &> "export_ambient-network_$(date -u +%Y%m%d_%H%M%S).json"

# openware
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'openware' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'openware' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'openware' IS NOT NULL;" &> "export_openware_$(date -u +%Y%m%d_%H%M%S).json"

# xprotocol
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'xprotocol' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'xprotocol' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'xprotocol' IS NOT NULL;" &> "export_xprotocol_$(date -u +%Y%m%d_%H%M%S).json"

# ta-da
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'ta-da' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'ta-da' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'ta-da' IS NOT NULL;" &> "export_ta-da_$(date -u +%Y%m%d_%H%M%S).json"

# fitchin
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'fitchin' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'fitchin' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'fitchin' IS NOT NULL;" &> "export_fitchin_$(date -u +%Y%m%d_%H%M%S).json"

# taurus-ai
npx wrangler d1 execute borgpad-production-database --remote --command "SELECT
  address,
  json -> 'investmentIntent' -> 'taurus-ai' ->> 'amount' AS investment_interest_amount,
  json -> 'investmentIntent' -> 'taurus-ai' ->> 'providedAt' AS investment_interest_provided_at,
  json -> 'termsOfUse' ->> 'countryOfOrigin' AS terms_of_use_country_of_origin,
  json -> 'termsOfUse' ->> 'acceptedAt' AS terms_of_use_accepted_at
FROM user
WHERE json -> 'investmentIntent' -> 'taurus-ai' IS NOT NULL;" &> "export_taurus-ai_$(date -u +%Y%m%d_%H%M%S).json"
