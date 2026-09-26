# Self-hosted font sources

- Inter Tight: Google Fonts, SIL Open Font License 1.1.
- IBM Plex Mono: Google Fonts, SIL Open Font License 1.1.

The `*.woff2` files were vendored from `fonts.gstatic.com` for the Latin subsets.
They are referenced only through local `@font-face` declarations; the app makes no runtime font-CDN request.
