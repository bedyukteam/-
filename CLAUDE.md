# Podcast Studio ("אולפן התוכן")

Standalone repo for the podcast publishing hub (was `studio/` inside the
five-agents repo until 2026-08-08). Remote `origin` = github.com/bedyukteam/-
— **every push to `main` auto-deploys to Render** (service podcast-studio,
https://podcast-studio-wxbw.onrender.com). No more subtree splits.

## Project memory (mandatory)
Long-term memory lives in the five-agents vault:
`~/Projects/the-five-agents/vault/Meeting Notes/podcast-studio.md`
(until the five-agents folder moves from Desktop, it's at
`/Users/danielatemzin/Desktop/the - five - agents/vault/Meeting Notes/podcast-studio.md`).
Read it at session start; append a dated session-log entry when done.
The roadmap plan: `~/.claude/plans/floofy-chasing-wreath.md`.

## Ops
- Migrations: manual in Supabase SQL editor (project podcast-studio / yvgxfvezqhcjftnvydko).
- Env secrets in `.env.local` (not committed) + Render dashboard.
- Deploy checklist: migration → Render env → `git push` → verify.

@AGENTS.md
