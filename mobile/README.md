# CloakPay for iOS and Android

An Expo / React Native client for the same account, backend and payment protocol
the web app uses. It is not a wrapper around the website: the wallet is generated
on the device, signing happens on the device, and the screens are native.

## Run it

```bash
cd mobile
npm install
npx expo start          # then press i, a, or scan the QR with Expo Go
```

Point it at a backend with `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_APP_URL` for
the origin used in payment links). Both default to `http://localhost:3200`, which
is what `npm run dev` serves from the repository root.

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:3200   # a phone cannot reach "localhost"
EXPO_PUBLIC_APP_URL=http://192.168.1.20:3200
EXPO_PUBLIC_ELYSIUM_CHAIN_ID=99801
EXPO_PUBLIC_ELYSIUM_RPC_URL=https://testnet-rpc.elysium.kinetiq.xyz
EXPO_PUBLIC_EXPLORER_URL=https://elysium.kinetiq.xyz/testnet-explorer
```

A physical device needs the LAN address of your machine, not `localhost`.

## What is built

| Screen | Path | State |
| --- | --- | --- |
| Entry / redirect | `app/index.tsx` | Done |
| Sign in (Google, X) | `app/signin.tsx` | Done |
| Onboarding (username, passphrase, recovery phrase) | `app/onboarding.tsx` | Done |
| Home | `app/(tabs)/index.tsx` | Done |
| Send | `app/(tabs)/send.tsx` | Done |
| Activity | `app/(tabs)/activity.tsx` | Done |
| Payment links | `app/(tabs)/links.tsx` | Done |
| You (settings, wallet, notifications, legal) | `app/(tabs)/settings.tsx` | Done |
| Receive (QR, identity, link builder) | `app/receive.tsx` | Done |
| Payment link checkout | `app/pay/[code].tsx` | Done |
| QR scanner | `app/scan.tsx` | Done |

Send sits in the middle of the tab bar and is the only lifted tab, because it is
the action the app exists for.

## Authentication

Sign-in opens the provider in an auth session (`expo-web-browser`), the server
mints a one-time code and hands it back on `cloakpay://auth`, and the app
exchanges that code for a bearer token at `/api/auth/mobile/exchange`. The token
lives in `expo-secure-store`; the auth session never sees a session cookie, and
the code is single-use and short-lived.

`EXPO_PUBLIC_API_URL` must be reachable from the device for the OAuth round trip
to complete.

## Wallet and key handling

- The mnemonic is 12 words from the standard BIP-39 English list, derived to the
  standard `m/44'/60'/0'/0/0` account, so the same phrase restores the same
  wallet in any other tool.
- The secret is `{ version, mnemonic, viewing }`, sealed with PBKDF2-SHA256 at
  600 000 iterations into AES-256-GCM. That is byte-for-byte the envelope the
  browser writes, so a wallet created here opens in the web app.
- The sealed envelope is in the platform keychain (`expo-secure-store`, backed by
  the iOS keychain and the Android keystore). The plaintext phrase is **not**
  written to storage at all: it is held in memory for the session, so an attacker
  with an unlocked phone still cannot sign without the passphrase.
- The viewing key is ECDH P-256, generated with `@noble/curves` because Hermes has
  no WebCrypto. It is the same artefact WebCrypto produces: uncompressed SEC1
  point, `x`/`y` in the JWK, key id from the first 16 bytes of SHA-256 over the
  point.
- The server stores a ciphertext and a public key. It cannot open the envelope and
  cannot derive the viewing private key.

## Deep links and payment links

- Scheme: `cloakpay://`. Universal links: `https://cloakpay.xyz/pay/*` (the host
  in `app.json` must match the domain you actually deploy to).
- `cloakpay://pay/<code>` is translated to the `/pay/[code]` route by the hook in
  `app/_layout.tsx`; universal links are mapped by the router directly.
- `cloakpay://auth` is consumed by the auth session and never becomes a route.
- Opening a link on a phone without the app installed falls back to the web
  checkout, which is the same flow against the same endpoints.

## Privacy behaviour on mobile

The mobile client reads pool state from `/api/pool`, and gates every privacy
label on `pool.privateReady` rather than `pool.deployed`: a contract address on
chain is not yet a private payment, because the deposit and withdrawal flow that
spends a note is still being built. While `privateReady` is false the app offers
a public transfer under a Public label and says in plain words why the private
option is unavailable. It never presents a visible transfer as a private one.

## Build

```bash
npx expo prebuild        # generate ios/ and android/ when you need native projects
eas build -p ios         # or -p android, with an Expo account
```

`app.json` already carries the icon, adaptive icon, splash, bundle ids
(`xyz.cloakpay.app`) and the `cloakpay` scheme. The images in `assets/` are
generated from the master logo by `python3 scripts/brand.py` in the repository
root, so the phone icon cannot drift from the web icon.

## Typecheck

```bash
npm run typecheck
```

The mobile project is excluded from the root `tsconfig.json`, so a native-only
type error can never break the web build.
