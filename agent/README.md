# Techne intelligence agent

## Modes

The agent has three independent execution modes:

- `run-agent.ps1`: Ostlanken procurement/news plus the configured portfolio.
- `run-agent-portfolio.ps1`: refreshes the fixed projects in `portfolio_sources.json`.
- `run-agent-discovery.ps1`: crawls configured official sources and stages new project candidates.

## Project discovery

Discovery does not write directly to `european_projects`. Its pipeline is:

```text
official seed pages
  -> constrained same-domain crawl
  -> URL/content heuristic scoring
  -> canonical URL deduplication
  -> Anthropic qualification in batches
  -> project_discovery_candidates
  -> human review
  -> explicit publication
```

Before the first run, execute `supabase/project_discovery.sql` in the Supabase SQL editor.

Required secrets in `agent/.env`:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

Discovery configuration:

```env
ENABLE_PROJECT_DISCOVERY=0
DISCOVERY_ONLY=0
DISCOVERY_SOURCES_FILE=discovery_sources.json
DISCOVERY_MAX_CANDIDATES=40
DISCOVERY_BATCH_SIZE=5
DISCOVERY_MAX_TEXT_CHARS=6000
DISCOVERY_MIN_AI_CONFIDENCE=0.65
```

Run discovery from the repository root:

```powershell
.\run-agent-discovery.ps1
```

The source allowlist and crawl limits live in `discovery_sources.json`. Each source must define:

- one or more official seed URLs;
- allowed domains;
- preferred and excluded path patterns;
- whether candidate URLs must match one of the preferred path patterns;
- maximum depth and pages;
- heuristic thresholds.

A source may be temporarily disabled with `"enabled": false` and a
`disabled_reason`. Adif is initially disabled because its public pages and
sitemap currently return HTTP 403 to automated clients; the agent does not
attempt to bypass that restriction.

Candidates remain in `review_status = 'pending'`. Re-running discovery updates observed
metadata and classification but deliberately preserves an existing human review status.

## Safety limits

- Only HTTP(S) pages in configured domains are visited.
- Documents, archives, images, scripts and feeds are skipped.
- Redirects leaving the allowlisted domain are rejected.
- The final candidate pool is balanced across enabled sources, so a large sitemap
  cannot consume every AI-classification slot.
- Tracking parameters and fragments are removed before deduplication.
- Depth is capped at 3 and pages at 250 per source by the parser.
- AI output must retain a known `candidate_key`; unknown records are discarded.
- Qualification never publishes a project automatically.
