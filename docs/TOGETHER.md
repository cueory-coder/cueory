# Studying together — plan for Christian

_Task 101 · written 2026-11-01 · document only, no code or SQL_

This is a plain-English plan for the features that let Cueory students compete, cheer each other on, and study side by side. It goes in the order you'd build them, from cheapest to most involved. Each section ends with the decisions you need to make before work can start.

---

## 1. Leaderboard (next, after accounts land)

### What it does
Students who opt in appear on a weekly board and an all-time board ranked by points. Points come from game results already recorded in the database (you have the rounds table from the results work). A server-side RPC reads those results and computes the score — students never submit a score directly, so nobody can type in a number.

### Privacy design
- **Opt-in only.** A student is invisible on any board until they choose to appear.
- **Display name only.** The board shows the name they set when they signed up. No email, no real name, no school (school is optional and hidden by default; see Profiles below).
- **Weekly reset.** The weekly board clears every Monday. All-time keeps going.
- **Leaving.** One button in settings removes them from all boards and deletes the stored display name from the leaderboard table immediately. Their game results stay (they belong to the student), but the board entry is gone.

### How the score works (suggested starting point)
- One point per correct answer or found word, up to the daily cap the director sets (prevents gaming the system by replaying puzzles all day).
- The RPC runs on every board load, not on every game finish, so there's no separate "score" field that can drift.
- Streak bonuses can come later once Task 100's streak logic is merged (it lives in `rewards.ts`).

### Decisions you need to make
- [ ] What is the daily point cap? (10? 20? Unlimited for now?)
- [ ] Do you want a school field on the opt-in form, or keep it display-name only to start?
- [ ] Should the all-time board show "top 10" or "top 100"?
- [ ] Do you want a "friends only" board eventually, or just global?

---

## 2. Profiles and streak badges (same release as leaderboard)

### What other students can see
When a student opts in to the leaderboard, their profile page shows:
- Display name
- Current streak and longest streak (from `rewards.ts`)
- Badges for achievements (first puzzle, 7-day streak, etc.)
- **Not visible:** email, school, game scores, or anything else.

Students who have not opted in have no public profile at all — a direct link to their profile returns a 404.

### Defaults (private)
Everything is private by default. Opting into the leaderboard is the only way to make a profile visible. There is no setting that accidentally exposes a student.

### Decisions you need to make
- [ ] Which badges do you want at launch? (Streak lengths, first solve of each game, all-words-found?)
- [ ] Should badges be visible to anyone who looks at the leaderboard, or only to the student?

---

## 3. Study together, step 1 — silent focus rooms (free)

### What it does
Students open a focus room and study in silence next to each other. There is no camera, no microphone, and no chat. The room shows:
- A synced countdown timer (25-minute Pomodoro or a length you set)
- A live count of how many students are in the room right now ("3 studying now")
- Nothing else

### How it works technically
This uses **Supabase Realtime Presence**, which is already available on your free plan. Presence lets the server track which users are connected to a channel right now and broadcast that count to everyone in it.

**Current free-plan limits (verify at supabase.com/pricing before building — these change):**
- 200 concurrent connections per project
- 2 million messages per month (each join, leave, and heartbeat counts as a message)
- Unlimited channels (but each connection counts against the 200 limit)

At 200 concurrent connections, you can have 200 students studying at the same time before the free plan runs out. A busy Tuesday night during exam season at 200+ students means the 201st person gets an error. The paid plan (currently $25/month) raises the limit to 500 concurrent connections. This is not a day-one problem, but it is a real ceiling.

The timer sync uses one broadcast message when the host starts or stops the timer. Clients calculate the remaining time locally from a shared start timestamp, so the message count stays very low even with many rooms.

### No moderation needed yet
Because there is no text, no audio, and no video, there is nothing to moderate. The only user-visible data is their own display name (already set) and a headcount. This is the safest possible first step.

### Decisions you need to make
- [ ] Should rooms be named (e.g., "anatomy study room") or anonymous?
- [ ] Should students create rooms, or is there just one shared room per game?
- [ ] What timer lengths do you want to offer? (25 min, 50 min, custom?)
- [ ] Is 200 concurrent students enough for your expected launch traffic, or do you want to budget $25/month for 500?

---

## 4. Study together, step 2 — text chat and meeting other students (later)

This step adds a text chat channel inside focus rooms. It is where the engineering and moderation complexity jumps significantly.

### What it adds
- A text box in the focus room for encouraging messages
- The ability to see other students' display names in the room
- Reporting a message or a user (sends a report to your moderation queue)
- Blocking a user (hides their messages locally, does not remove them from the room)

### What you need before this can launch
- **Moderation.** Every text channel needs someone reading reports and acting on them. That person is you, at least at first. If Cueory grows to 100 students sending 20 messages a day, that is 2,000 messages you are responsible for.
- **Age.** COPPA, the US children's privacy law, applies to sites aimed at children **under 13**, or that knowingly collect personal information from children under 13 ([FTC: COPPA](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)). Students aged 13 to 17 don't bring Cueory under COPPA, and nursing students are almost always adults. A text channel where adults and minors could talk is still a separate policy question, with its own rules outside the US. Decide on an age policy before chat launches: for example, a "you must be 18 or older to use chat" confirmation, or school email domains. Have a lawyer check that policy before launch.
- **Reporting.** You need a way to receive reports and a policy for what happens when someone is reported. Start simple: a report sends you an email, and you decide.
- **Your time.** Budget at least an hour a week for moderation when this goes live, more during exam season.

### Decisions you need to make
- [ ] Are your students 18+, or do you need an age gate?
- [ ] Are you ready to read moderation reports regularly?
- [ ] Do you want "encouraging messages only" with a profanity filter, or open text?
- [ ] Does chat happen inside the focus room timer, or is it a separate channel?

---

## 5. Study together, step 3 — camera rooms (maybe, later)

Camera rooms let students see each other while they study, like a virtual library table. This is the most engaging feature and the most expensive.

### What it costs
Video is not free at scale. Prices change often, so **check each official pricing page on the day you decide.** What those pages showed on 2026-11-02:

| Provider | What the official page shows (checked 2026-11-02) | Pricing page |
|---|---|---|
| Daily | 10,000 free minutes every month, then usage-based pricing | [daily.co/pricing/video-sdk](https://www.daily.co/pricing/video-sdk/) |
| Whereby Embedded | Free "Explore" plan up to 2,000 participant minutes a month; paid plans above that | [whereby.com/information/embedded/pricing](https://whereby.com/information/embedded/pricing) |
| LiveKit | Open-source server, free to self-host (you pay for your own server); LiveKit Cloud has a free "Build" plan and paid plans | [livekit.io/pricing](https://livekit.io/pricing) |
| Twilio Video | Usage-based; its pricing model changed more than once in 2026, so read the page carefully | [twilio.com/en-us/video/pricing](https://www.twilio.com/en-us/video/pricing) |

**How to estimate:** participant-minutes = students in a room × minutes in the room. For example, 10 students for 25 minutes is 250 participant-minutes. Compare a month's total with the free allowance, then multiply anything above it by that provider's current rate. Finals week, with hundreds of students in rooms for hours, will go far past every free allowance.

**The $0 budget rule** (your rule from CLAUDE.md) means no video feature can launch without your explicit written OK, a budget allocation, and a chosen provider. This is the one step in this entire plan that definitely costs money at any meaningful scale.

### Privacy and safety
Camera rooms add a new category of risk: students can see each other's faces and backgrounds. Before building:
- You need a community guidelines page.
- You need a way to report a camera (not just text).
- You need to decide whether recordings are possible (even screenshots by other users).
- You need to decide on a minimum age. Most video platforms require 13+ or 18+ in their own terms; nursing students are generally adults, which helps.

### Decisions you need to make
- [ ] Do you want camera rooms at all, or is silent + text enough?
- [ ] If yes, which provider do you want to evaluate first?
- [ ] What budget per month are you willing to set?
- [ ] Will you write the community guidelines, or assign that to the lead?

---

## Summary — decisions Christian must make

Before any of this work starts, the following decisions gate each step:

**For the leaderboard (step 1):**
- Daily point cap
- School field yes/no
- Leaderboard size (top 10 or top 100)
- Friends board eventually?

**For profiles (step 1):**
- Which badges at launch?
- Who can see badges?

**For silent focus rooms (step 2):**
- Named rooms or one shared room?
- Timer lengths
- OK with 200-student limit, or budget $25/month for 500?

**For text chat (step 3, later):**
- Age gate policy (18+, or school email, or honor system?)
- Are you ready to moderate?
- Chat style (encouraging only, or open?)

**For camera rooms (step 4, maybe):**
- Do you want them at all?
- Budget per month (written OK required — $0 rule)
- Minimum age

None of the code can start until you answer the questions for that step. The lead will open individual tasks once you decide.
