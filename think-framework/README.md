# AI Fitness Coach

An agentic fitness coaching application that turns conversations into a persistent training workspace. The coach remembers goals and physical limitations, records workouts, maintains a weekly plan, loads exercise guidance on demand, and can create reusable runtime tools such as a one-rep max calculator.

## Project overview

This project demonstrates how an AI agent can move beyond chat by combining durable state, file-based records, long-term memory, on-demand knowledge, and tool use in one user experience.

### Key capabilities

- Records each reported workout in a dated Markdown file
- Maintains a weekly training plan in the agent workspace
- Remembers body weight, injuries, limitations, and fitness goals across sessions
- Loads exercise guides from Cloudflare R2 only when they are relevant
- Creates and reuses runtime extension tools, including a one-rep max calculator
- Streams responses and tool activity to the browser in real time
- Isolates each visitor in a separate Agent instance using an anonymous browser ID
- Limits new chat requests to 10 per minute per Agent instance
- Caps agent steps, response tokens, and message length to reduce accidental overuse

## Architecture

```text
React + TypeScript UI
        │
        ▼
Cloudflare Agents SDK
        │
        ▼
CoachAgent (Think)
        ├── Durable Object state and conversation history
        ├── Persistent memory context
        ├── Virtual workspace
        │   ├── /workspace/logs/YYYY-MM-DD.md
        │   └── /workspace/plan.md
        ├── R2 on-demand skills
        ├── Runtime extension tools
        └── Cloudflare Workers AI
```

## Product and engineering decisions

### Persistent, isolated coaching sessions

The browser creates an anonymous UUID and passes it as the Agent instance name. Refreshes and tabs in the same browser reuse the same fitness history, while a different browser profile receives an isolated workspace and memory.

This is appropriate for a public portfolio demo, but it is not authentication. A production version should derive the Agent name from a verified server-side user identity.

### Cost and abuse controls

- 10 new chat requests per minute per Agent instance
- Maximum 6 agent steps per turn
- Maximum 1,000 output tokens per turn
- Maximum 500 characters per user message

Cloudflare Rate Limiting is used as an abuse-control mechanism rather than an exact billing counter.

### On-demand skills

Exercise guides are stored in R2 and loaded only when the user's question requires them. This keeps the base prompt smaller while allowing the coach to consult focused guidance for strength training, running, and stretching.

### Transparent tool activity

The UI displays tool states so a user can see when the coach is loading a guide, saving a workout record, or running an extension. Approval requests remain visible and require an explicit user decision.

## Safety and privacy

This application is an educational portfolio demonstration and does not provide medical diagnosis. Users are advised not to enter sensitive personal or health information and to consult a qualified health professional about injuries, severe pain, or concerning symptoms.

Current privacy boundaries:

- Visitors are separated with anonymous browser-generated IDs
- No login or verified identity is implemented
- Clearing chat history does not necessarily delete workspace files or persistent memory
- Public users should use fictional or non-sensitive information during evaluation

Before production use, the application should add verified authentication, complete data export/deletion, bot protection, and a documented retention policy.

## Skills stored in R2

The demo expects at least these guides under the `skills/` prefix:

```text
skills/squat-form.md
skills/running-program.md
skills/stretching.md
```

## Run locally

### Prerequisites

- Node.js and npm
- A Cloudflare account
- Wrangler authentication
- An enabled R2 bucket matching the binding in `wrangler.jsonc`

### Install and start

```bash
npm install
npm run cf-typegen
npm run dev
```

Cloudflare AI and the configured remote R2 binding may access remote resources during local development.

## Quality checks

```bash
npm run build
npm run lint
```

## Deploy

```bash
npm run deploy
```

After deployment, verify the public URL in a private browsing window.

## Evaluation scenarios

### Workout persistence

1. Send: `I did 5 sets of 5 squats at 80 kg today.`
2. Confirm that `/workspace/logs/YYYY-MM-DD.md` is created.
3. Ask: `What workouts have I completed this week?`
4. Confirm that the coach reads the stored files before answering.

### Persistent memory

1. Provide a body weight, an injury, and a 5 km goal.
2. Refresh the page or open another tab in the same browser.
3. Ask for tomorrow's training plan.
4. Confirm that all three facts influence the response.

### On-demand skill loading

1. Ask for squat-form guidance.
2. Confirm that the relevant R2 skill is loaded.
3. Confirm that it is unloaded after the answer is prepared.

### Runtime extension

1. Ask the coach to create a one-rep max calculator.
2. Ask: `What is my estimated 1RM if I lift 80 kg for 5 reps?`
3. Confirm that the extension is called and the answer is approximately 93 kg.

### User isolation and rate limiting

1. Create a workout record in a regular browser window.
2. Open the application in a private browsing window and confirm that the record is not visible.
3. Submit more than 10 new chat requests within one minute and confirm that the limit is displayed clearly.

## Technology

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Cloudflare Workers
- Cloudflare Agents SDK
- Cloudflare Think framework
- Durable Objects
- Workers AI
- R2

## Current limitations and next steps

- Replace anonymous browser IDs with authenticated user identities
- Add complete user-controlled data export and deletion
- Add bot protection for the public deployment
- Store and respect each user's local time zone
- Restrict runtime extension creation to authorized users
- Add automated end-to-end coverage for persistence, tool calls, and error states

## Résumé-ready highlights

- Built and deployed an agentic fitness coaching application on Cloudflare using React, TypeScript, the Agents SDK, Think, Durable Objects, Workers AI, and R2.
- Designed persistent user memory and file-based workout tracking with isolated Agent instances, enabling coaching context to survive refreshes and repeat visits.
- Implemented on-demand exercise skills, runtime-generated tools, streaming UI feedback, and per-session rate limiting to improve transparency, safety, and operational resilience.
