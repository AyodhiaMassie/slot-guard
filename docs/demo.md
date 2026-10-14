# SlotGuard demo walkthrough

Use the local application at **http://localhost:5173**, started with the [README setup](../README.md#local-installation). All accounts and records are fictional. This guide prepares a recording; no demo video is currently published.

## Before recording

- Run `npm run db:replenish` from repository root to add future availability without deleting history.
- Use a normal browser window and an incognito window or separate browser profile for the two Students. Independent sessions matter; two ordinary tabs can inherit the same saved account.
- Use a desktop viewport around 1440 × 1000, readable browser zoom, and a clean application view. Keep terminals, developer tools, notifications, and environment files off screen.
- Select Alex and Sam for the Student sessions and Maya for the Tutor view. Use only the public demo credentials documented in the README. Keep the password input masked; never reveal saved browser credentials or server configuration.
- Rehearse once. Choose two unused future times for Maya: one for the first booking and one for the later conflict. A Tutor-created time within the next seven days keeps the recording easy to follow.

## Suggested 110-second sequence

| Time | Action | What to show or say |
| --- | --- | --- |
| 0–10 s | Open SlotGuard and sign in as Alex, Student. | “Students book 30-minute consultations; tutors manage availability.” |
| 10–25 s | Browse Maya's profile, select an available time, and confirm. | Tutor directory, timezone label, booking dialog, and success message. |
| 25–40 s | Open **My appointments**. | The confirmed appointment saved by the API. |
| 40–60 s | Sign out, sign in as Maya, and open **Your schedule**. Then use **Manage availability** to create an unused future slot. | Alex's reservation and a new time made available to Students. |
| 60–80 s | Return the normal window to Alex. Sign in as Sam in the independent window. Select the newly created time in both sessions and leave both confirmation dialogs open. | Both Students saw the same availability before either booking was committed. |
| 80–100 s | Confirm in Alex's window first, then confirm in Sam's stale dialog. | Alex succeeds; Sam sees “That slot is no longer available” and refreshed availability. “PostgreSQL permits one confirmed reservation.” |
| 100–110 s | Show Alex's confirmed appointment; optionally cancel it. | Cancellation releases the slot and preserves cancelled history. |

The two-window recording demonstrates stale availability and conflict handling. The automated integration test separately proves simultaneous lock contention and asserts one `201`, one `409`, and one confirmed row. Do not describe the sequential video clicks as simultaneous HTTP requests.

Capture the application window only. Export a 60–120-second recording with readable text and no private credentials, tokens, debugging panels, or unrelated personal information. Add a README video link only after the recording is uploaded and its URL is available. Do not imply the local recording is a hosted demo.

## Manual verification checklist

- Student/Tutor login opens the correct workspace; logout and reload behave as expected.
- Student booking appears in **My appointments** and in the owning Tutor's schedule.
- A stale booking attempt receives conflict feedback rather than a second confirmation.
- Cancelling an upcoming booking moves it to **History** and releases availability.
- A Tutor can create a future valid time and close an unbooked time; a booked time has no closure control.
- Readable timezone labels, narrow-screen layout, and keyboard dialog navigation work. Check focus after a successful booking separately: the browser smoke has an unresolved intermittent focus assertion.

## Screenshot files and recapture

The public images in [screenshots/](screenshots/) are real 1440 × 1000 page captures from the revised local React application and Express API, backed by the existing PostgreSQL database and its four fictional demo accounts. The login inputs are empty; the displayed demo passwords are deliberately public and documented in the README. The Student and Tutor appointment views show the same confirmed database record. No screenshot content was altered. Capture scripts, server credentials, and other browser artifacts stay private under ignored `.local/`.

To refresh them manually, use only fictional local data and save PNGs with these exact names:

| File | Screen |
| --- | --- |
| `login.png` | **Sign in to SlotGuard** with empty inputs and fictional demo accounts. |
| `student-dashboard.png` | Alex's **Find a tutor** view with Maya selected and available times loaded. |
| `student-appointment.png` | Alex's **My appointments** view after a real successful booking, with the Confirmed badge visible. |
| `tutor-dashboard.png` | Maya's **Manage your consultations** page with the **Booked** filter showing that same Student reservation. |

Use the browser's page screenshot tool to exclude browser chrome and other windows. Review every image for secrets and personal information before replacing files in `docs/screenshots/`. Screenshots reflect the date/timezone and fictional database state at capture; they do not imply a hosted service or a static production schedule.
