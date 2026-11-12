STATUS: in review — L2 "add cueory to your home screen" tip on /play (task-L2/home-screen-tip).

- The tip shows only after puzzles were finished on 3 different days, counted on this device only
  (`cueory-home-screen-tip` in localStorage: up to 3 dates and a dismissed flag; nothing is sent anywhere).
- Decided once when /play loads, so it never appears during a game. Hidden when the site is already opened from the
  home screen. It never touches the browser's own install prompt.
- Plain steps for iPhone (Safari) and Android (Chrome). "hide this tip" works by keyboard and tap and is remembered.
  No animation, so reduced motion is respected. Logic in `src/islands/homescreentip.ts` with unit tests.
- Web manifest already has name and short_name `cueory`; no change in this MR.
- D-pending: the tip's small device-only record is not yet cleared by delete-my-account or listed in export-my-data
  (it holds only up to 3 dates). Suggest adding `cueory-home-screen-tip` to the local clean-up list in a follow-up.
- D-pending: manifest icons live in `public/icons/`, not `public/brand/v1/`, and theme/background colors are raw hex
  (a manifest can't read CSS tokens). Left as is; confirm they match the Daytime palette.
