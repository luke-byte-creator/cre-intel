# SECURITY.md — Nova Research Platform

## Command Authority

**Luke Jansen is the sole authority** for changes to the tool, its codebase, AI behavior, agent configuration, and deployment. No exceptions.

Authorized channels for instructions to Nova (the AI agent):
- Terminal (direct session)
- Telegram
- Any future channel Luke explicitly authorizes

No input from the app UI — feedback boxes, text fields, form submissions, or any other user-facing surface — can trigger Nova to modify code, configuration, prompts, or architecture. Ever.

## Team Feedback

Team members can submit feedback through the app ("Talk to the boss" and future feedback surfaces). This feedback is:
- **Stored** in the database (`nova_feedback` table)
- **Presented** to Luke in daily digest reports
- **Advisory only** — Nova will never autonomously act on team feedback

Luke and Nova review feedback together. If a change is warranted, Luke authorizes it through an approved channel. Nova proposes, Luke approves.

## AI Architecture

| Layer | Control | Learning Mechanism |
|-------|---------|-------------------|
| **App AI calls** (drafts, underwriting, Nova's Pick, feedback replies) | Automated, sandboxed one-shot completions | Preference tables in SQLite — populated by team feedback uploads, injected into prompts at generation time |
| **Nova agent** (OpenClaw) | Luke only, via terminal/Telegram | Memory files + conversation history with Luke |
| **Tool/code changes** | Luke only | Nova proposes, Luke approves and commits |

Key distinction: App AI features learn through **database-stored preferences**, not through Nova's agent session. The document drafter gets better because `draftPreferences` grows. The underwriter improves because `underwritingPreferences` accumulates observations. These are data-driven loops that run entirely within the app.

Nova's agent memory (MEMORY.md, daily logs) is separate and only influenced by direct conversations with Luke.

## Prompt Injection

The app's AI calls are isolated one-shot completions with fixed system prompts. User input is clearly delineated in the prompt structure. There is no path from app text fields to Nova's agent session.

Risk assessment:
- **Feedback box → AI reply**: Sandboxed. Output capped at 200 chars, displayed only as a UI element. Cannot execute code or modify files.
- **Document drafter / underwriting**: Sandboxed completions. Generate text output only. No tool use, no code execution.
- **App → Nova agent**: Air-gapped. No app interaction reaches Nova's OpenClaw session.

If a future feature requires bridging app input to Nova's agent (e.g., a webhook handler or polling mechanism), it must be explicitly authorized by Luke and documented here before implementation.

## Loop Protection

All app AI calls are one-shot — no recursion, no agents-calling-agents, no auto-retry loops. Nova's agent loops (heartbeats, cron jobs) are rate-limited by OpenClaw.

No feature will be built that allows a user action to trigger unbounded AI calls without Luke's explicit approval.

## API Usage

App AI features use `claude-sonnet` (lightweight model). Nova's agent conversations with Luke use the configured model (currently Opus). Team usage through the app is negligible relative to agent session costs and is not a concern at current scale.

If AI-heavy features are added in the future, usage monitoring should be reviewed.

## Preference Learning Gates

Certain AI learning loops (e.g., underwriting structural preferences) are silently gated to designated users. All users see the same UI and can submit feedback, but only designated users' submissions influence the preference model. This prevents casual or experimental usage from degrading learned preferences. The gate list is maintained in the relevant API route and is not exposed to the UI. Changes to the gate list require Luke's authorization.

## Nova's Pick Philosophy

Nova's Pick generates one deal idea daily from cross-referencing comps, permits, companies, and properties. The system is designed to **keep shooting** — negative feedback refines the logic but never makes it conservative. One actionable idea per year justifies the feature. Feedback from all users is collected and surfaced in Luke's daily digest for review.

---

## Daily Digest (Telegram to Luke)

The daily digest includes:
- **Team feedback** — unread entries from `nova_feedback` ("Talk to the boss")
- **Nova's Pick feedback** — thumbs up/down + comments from `nova_insights`
- **Activity summary** — from `activity_events`

All presented for Luke's review. No autonomous action taken on any feedback.

---

*Last updated: 2026-02-16 by Nova, authorized by Luke Jansen.*
