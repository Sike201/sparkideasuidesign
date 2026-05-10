
# Twitter

1. Create a free developer account on twitter
2. Create a Project and open on dashboard https://developer.twitter.com/en/portal/projects/{projectId}/apps/{appId}/settings
3. Enable Auth FINISH THIS MAYBE

## Endpoints

- Get Me - https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me

## Resources

- [OAuth2](https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code)
- [Sign In With Twitter](https://developer.x.com/en/docs/authentication/guides/log-in-with-twitter)
- [Medium Article](https://medium.com/@abhiruchichaudhari/oauth-2-0-tokens-and-twitter-api-everything-you-need-to-know-bddaf9a7f120)

## CORS Issues

The api call which exchanges the CODE for the access token (below) has CORS protection so we can't initiate the call from the browser

This issue was first mentioned in 2016 and there are still no plans for resolving.

```bash
curl --location 'https://api.twitter.com/2/oauth2/token' \
    --data-urlencode 'code=XXX' \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode 'client_id=XXX' \
    --data-urlencode 'redirect_uri=XXX' \
    --data-urlencode 'code_verifier=challenge'
```

Links mentioning this issue:
- https://stackoverflow.com/questions/35879943/twitter-api-authorization-fails-cors-preflight-in-browser
- https://github.com/xdevplatform/twitter-api-typescript-sdk/issues/36
- https://devcommunity.x.com/t/will-twitter-api-support-cors-headers-soon/28276\
- https://devcommunity.x.com/t/twitter-api-v2-public-client-no-access-control-allow-origin-header-present-cors/170402

Current solution for avoiding CORS is to create a CF Worker on the backend and add access control headers.

## Pricing

It seems currently only a subset of endpoints are available for free account:
- POST /2/tweets
- DELETE /2/tweets/:id
- GET /2/users/me

To fetch following/followers one needs to upgrade to Basic tier (100$/month)


## Questions

- how does Rey work in terms of tokens, I see there's no tokens returned from the backend, only cookies?
- how does refresh token work if it is not stored on the frontend, stored on backend?

## TODO @twitter

- setup a staging + production account (currently it's on my personal acc)
- if we ultimately go with all-backend impl, remove tokens and TwitterContext from the frontend app
