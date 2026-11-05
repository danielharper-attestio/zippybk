# Record-at-submit demo (local only)

Four small forms with the Attestio tracker on them, to try the new record flow on your own machine:

1. **Saved at submit** (`site/simple.html`) — the record ID comes from our server; the form waits (at most 2 s) until
   the record is saved, then goes. Inspect finds it on the first try.
2. **The page says no** (`site/email-check.html`) — the page refuses a 9-digit phone number: not a lead, listed as
   "Not submitted". Fixed and resubmitted: a lead with the same record ID.
3. **Two steps + a Facebook-style wipe** (`site/step1.html`, `site/step2.html`) — the browser loses everything it
   stored between the steps; step 2 still continues step 1's record (one record, both steps' answers).
4. **Sent by the page's own code** (`site/script-send.html`) — no form submit at all; still caught as a lead.

After each submit, `site/done.html` asks the dashboard's Inspect API for the record (as a client's server would) and
shows what the record holds.

**This only works on your computer.** The pages talk to the Attestio dashboard running on `localhost:3016`, so the
copy GitHub Pages serves on zippybk.com does nothing useful.

## Run it

1. Start the dashboard with the demo switches on — in the Claude desktop app, the `record-demo-3016` launch entry
   (it also starts `server.mjs`). Demos 1, 2 and 4 use the local `dev@test.com` account, demo 3 `dev2@test.com`.
2. `server.mjs` needs a local Inspect API key for the `dev@test.com` account in `record-demo/.apikey.json`
   (`{"key": "…", "id": "…"}`) — git-ignored, never committed.
3. Open <http://localhost:8795>. To look at a record in the dashboard, log in at `localhost:3016` as that account.

Demo 3 joins the steps only when this browser has one journey on the account in the last 15 minutes (a safety rule).
To repeat it, wait 15 minutes or use another browser.
