# CallSheet Manager

Mobile-first Excel call-sheet manager with offline workspace storage, Excel import/export, installable PWA support, Google sign-in, and Firebase Firestore cross-device sync.

## Cloudflare Pages

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`

## Development

```bash
npm install
npm run dev
```

## Important setup

Before using cloud sync in production, verify that the Firebase Authentication authorized domains include the deployed `*.pages.dev` hostname and that the Firestore security rules in `firestore.rules` are deployed to the configured Firebase project. Keep customer records and credentials out of Git.
