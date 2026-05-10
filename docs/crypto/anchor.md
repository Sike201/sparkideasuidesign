
# Anchor

## Introduction

The Anchor framework uses Rust macros to reduce boilerplate code and simplify the implementation of common security checks required for writing Solana programs.

Think of Anchor as a framework for Solana programs much like Next.js is for web development. Just as Next.js allows developers to create websites using React instead of relying solely on HTML and TypeScript, Anchor provides a set of tools and abstractions that make building Solana programs more intuitive and secure.

- [Anchor](https://solana.com/developers/guides/getstarted/intro-to-anchor)
- [IDL File](https://solana.com/developers/guides/getstarted/intro-to-anchor#idl-file)
- [Anchor Client](https://solana.com/developers/guides/getstarted/intro-to-anchor#client)
- [Intro to Anchor Frontend](https://www.soldev.app/course/intro-to-anchor-frontend)

### Problem1

```
Console    >> Error: This function requires the `Provider` interface implementor to have a `wallet` field.
[After adding the wallet interface]
Typescript >> TS2353: Object literal may only specify known properties, and wallet does not exist in type Provider
```

### Problem2

```
Error: Reached maximum depth for account resolution
    at AccountsResolver.resolve (@coral-xyz_anchor.js?v=95939f78:10846:15)
    at async MethodsBuilder.transaction (@coral-xyz_anchor.js?v=95939f78:11370:7)
    at async testAnchor (AnchorJson.ts:394:23)
```

### Problem3

IDL file typings do not work.

## Questions

- What level of commitment to use? ("processed" | "confirmed" | "finalized")
  - Use 'finalized' for now, if performance becomes a problem we can consider switching to 'confirmed'
- How can I list all LBP accounts under the Solana Program
- What’s the best way to debug a transaction — how to serialize it to something human readable?
- Where can I see the arguments (config) I've uploaded to new LBP (all the args in initialize_lbp instruction)
- How does subscribing to signature status work?
- Is there a way to debug (log to console) rpc calls from @solana/web3.js?
