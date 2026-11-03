# Self-hosting Infinite Studio

The GitHub Release ZIP contains a static web build. It is not a native desktop installer and should be served over `http://` or `https://`; opening `index.html` directly through `file://` is not supported by modern browser module security.

## Quick local preview

From the extracted folder, use either option:

```bash
npx serve .
```

or:

```bash
python3 -m http.server 8080
```

Then open the URL printed by the command.

## Production hosting

Upload the extracted files to any static host. HTTPS is required for authentication, Google Drive authorization, clipboard APIs, and other secure browser capabilities.

Forks that enable connected features must configure their own Firebase project, authorized authentication domains, Google OAuth client, and any authorization services required by those features. The PETFASHION credentials included in the public build are not an authorization for another origin.

Local editing, `.studio` files, legacy `.moodboard` files, and standard exports do not require a connected account. Cloud providers remain unavailable when their origin or project configuration is missing.
