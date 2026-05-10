
# Eligibility

## Terminology

- isCompliant - user becomes compliant with BorgPad by completing compliance quests. Compliance quests are mandatory for all users that wish to participate. 
- hasTiered - user has made it onto one of the tiers by completing quests
- isWhitelisted - user becomes eligible to participate by being manually whitelisted by admin, but they still need to also be Compliant.
- isEligible - user is eligible to participate

```
isEligible = isCompliant AND (hasTiered OR isWhitelisted)
```

- quests - the quest/task/action that the user completes in order to become eligible. Quests are in the same format for compliances and tiers. Compliance quests are the same globally for all users, while tiers are dynamic/customizable to each project.
