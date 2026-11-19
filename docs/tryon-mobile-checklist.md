# Try-on Phase 0 - manual mobile test checklist

**Status: ALL TESTS PENDING.** No physical devices have been tested yet. Desktop browser
emulation is not a substitute: it does not reproduce real cameras, EXIF from phone
cameras, mobile GPU/CPU speed, memory limits or iOS Safari behaviour.

## Setup

1. On the computer: start the image service and the storefront in development
   (`npm run dev:image`, `npm run dev:storefront`), or a production build with
   `ENABLE_TRYON_DEMO=true` in both `apps/storefront/.env` and `services/image/.env`.
2. Phone and computer on the same Wi-Fi. Open `http://<computer-LAN-IP>:3000/dev/try-on`.
   - `NEXT_PUBLIC_IMAGE_URL` must point at `http://<computer-LAN-IP>:4100` (not `localhost`), then restart the storefront.
   - iPhone camera capture may require HTTPS on some iOS versions; if the camera option is missing, test with photos from the library and note it.
3. Use only your own photos or photos of people who agreed to it. Nothing is uploaded, but downloaded results stay on the phone.

## Devices

| Device | OS / browser version | Tester | Date | Result |
|---|---|---|---|---|
| Recent Android phone (mid-range, e.g. 2023+) | Chrome ___ | | | Pending |
| Older/low-end Android (optional) | Chrome ___ | | | Pending |
| iPhone (recent) | iOS ___ / Safari | | | Pending |
| iPhone (older, optional) | iOS ___ / Safari | | | Pending |

## Tests (repeat per device)

| # | Test | How | Pass when | Result |
|---|---|---|---|---|
| 1 | Page loads | Open the page | Necklace preview appears; no error message | Pending |
| 2 | Self-hosted model | Upload any photo; note first-result time | Status shows "placed automatically" or a clear refusal; first result time noted (s) | Pending |
| 3 | Front camera capture | Tap "Upload or take a selfie" -> camera | Camera opens (front camera offered); photo is used after capture | Pending |
| 4 | Library upload | Pick an existing selfie | Photo appears upright | Pending |
| 5 | Image orientation | Portrait and landscape photos taken with the phone; one rotated photo | Always displayed upright; necklace on the neck, not rotated wrongly | Pending |
| 6 | Visible shoulders | Front-facing selfie, shoulders visible, neck uncovered | Placed automatically on the neckline; name readable | Pending |
| 7 | Tight face crop | Selfie with no shoulders | Refused with a clear message; nothing drawn on the face | Pending |
| 8 | Group photo | Photo with 2+ people | Refused ("photo of just you") | Pending |
| 9 | Manual placement | "Place by hand", then drag with a finger, Size / Rotation / Chain drop sliders, arrow buttons, Reset | Dragging moves the necklace (page does not scroll while dragging); sliders respond | Pending |
| 10 | Personalisation updates | Change name, font, metal after placement | Necklace updates within ~1 s; placement kept; no old name reappears | Pending |
| 11 | Download accuracy | "Download photo" | Saved image matches the preview exactly (same position, size, name, metal); full photo resolution (max 1600 px side) | Pending |
| 12 | Repeat use / memory | Upload 10 photos in a row, change names in between | No crash, reload or slowdown; note if the tab reloads | Pending |
| 13 | Performance | Note times shown in the status (detection ms) for 3 photos | First result < 3 s, later < 1 s on a recent phone (target, not yet measured) | Pending |
| 14 | Background/foreground | Switch apps during detection, come back | Page recovers; detection completes or can be retried with Re-detect | Pending |
| 15 | Privacy | Optional: remote-debug the phone (Chrome DevTools / Safari Web Inspector), Network tab | No request carries the photo; only page assets, model, WASM and necklace images | Pending |

## Record

- First-result time and per-photo detection time (from the status line).
- Any photo where placement was clearly wrong: describe it (pose, clothing, lighting), do not share the photo without consent.
- Memory: whether the tab reloaded (Safari shows "This webpage was reloaded because a problem occurred").
