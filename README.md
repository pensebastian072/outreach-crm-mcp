# outreach-crm-mcp

An outreach CRM that is both a **local web application** and a **Model Context
Protocol (MCP) server**, so the same contact database can be worked by hand in a
browser or driven by an AI assistant through tools.

It ingests contact and company exports (Apollo, Crunchbase, plain CSV/XLSX),
fuzzy-matches contacts against company records, ranks them by seniority and fit,
drafts personalised emails against a structured event/offer context, scores each
draft, and tracks sends and replies through SQLite.

**No contact data ships with this repository.** See [Data and privacy](#data-and-privacy).

## Why it is shaped this way

**One database, two front ends.** The interesting constraint was that outreach is
partly judgement and partly bulk work. A web CRM is good for the judgement —
reading a company, deciding who to approach. An MCP server is good for the bulk —
letting an assistant import a fresh export, re-rank, and draft twenty variants.
Both talk to the same SQLite schema, so neither is a second source of truth.

**Drafting is separated from scoring, and scoring from sending.** `templates.ts`
produces candidate drafts, `email-scoring.ts` and `critic-validator.ts` grade
them independently, and only then does a mail provider get involved. That split
exists because a generator asked to grade its own output will approve it.

**Field coverage is tracked explicitly.** `field-tracker.ts` records which
context fields were *available* for a draft and which were actually *used*, and
scores coverage. Personalisation that silently falls back to generic copy is the
normal failure of this kind of tool, and it is invisible unless you measure it.

**Mail providers are pluggable.** `mail-provider.ts` defines the interface;
Outlook/Graph and Gmail implement it behind `provider-registry.ts`. Credentials
are encrypted at rest via `token-crypto.ts`.

## Architecture

```
Apollo / Crunchbase / CSV export
          │
          ▼
  import.ts · import_crunchbase.ts      normalise, dedupe
          │
          ▼
  join.ts                               fuzzy company↔contact matching
          │
          ▼
  rank.ts · title-utils.ts              seniority + fit ranking
          │
          ▼
  templates.ts ──► email-scoring.ts ──► critic-validator.ts
   (3 drafts)       (1–10 score)          (independent check)
          │
          ▼
  provider-registry.ts ──► outlook-provider.ts / gmail-provider.ts
          │
          ▼
  tracker.ts · replies.ts · report.ts   sends, replies, reporting
          │
          ▼
  SQLite (schema.sql)  ◄── web-server.ts (browser CRM)
                       ◄── index.ts      (MCP server)
```

## Quick start

```bash
npm install
cp .env.example .env        # then fill it in
npm run build

# load the synthetic sample so there is something to look at
npm run import -- samples/contacts.sample.csv

npm run web                 # browser CRM
npm start                   # MCP server (stdio)
```

`SETUP.md` covers configuration in detail; `HOW_TO_USE.md` covers day-to-day use.

## Data and privacy

This repository contains **no real contact data**. It was extracted from a
working system whose database held real people, and none of that — not the
exports, not the SQLite file, not the git history containing them — is included
here. This is a fresh repository with no prior history.

`samples/contacts.sample.csv` is entirely invented: ten fabricated people at six
fabricated companies, all on `example.com`, all with `+1-555-01xx` numbers. It
exists so the importer and the UI have something to render.

`.gitignore` blocks `*.csv`, `*.xlsx`, `*.docx` and `*.db` precisely so a real
export cannot be committed by accident, with a single narrow exception for
`samples/`. **If you point this at a real contact list, that list is personal
data.** Handle it accordingly — keep it out of version control, and respect the
applicable rules on contacting people who did not ask to hear from you.

## Event context

The drafting layer personalises against a structured "event context" — dates,
venue, themes, attendee types, a default call to action, compliance rules. In
this codebase that context is named for the event it was originally built
around (`earthx_context` in the schema, `earthx_*` fields in the draft types).
The shape is general; only the naming is specific. Populate it for your own
event or offer via `import_earthx.ts` / the `import_earthx_context` MCP tool,
or the `EVENT_*` variables in `.env.template`.

## Layout

- `src/` — 42 TypeScript modules: MCP server, web server, import, ranking,
  drafting, scoring, providers, tracking
- `public/` — browser CRM front end
- `schema.sql` — SQLite schema
- `azure/` — Bicep template and deployment scripts
- `scripts/` — helper scripts
- `samples/` — synthetic sample data

## Status

Working, and shaped by real use, but published as a reference implementation
rather than a maintained product. Deployment files are included as written; the
account-specific values have been replaced with placeholders, so they will need
your own.

MIT licensed.
