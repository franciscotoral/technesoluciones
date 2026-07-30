from __future__ import annotations

import unittest

from agent import AgentStats, OstlankenAgent


class _FakeTable:
    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.conflict: str | None = None

    def upsert(self, payload: dict, on_conflict: str) -> "_FakeTable":
        self.rows.append(payload)
        self.conflict = on_conflict
        return self

    def execute(self) -> object:
        return object()


class _FakeSupabase:
    def __init__(self) -> None:
        self.discovery = _FakeTable()

    def table(self, name: str) -> _FakeTable:
        if name != "project_discovery_candidates":
            raise AssertionError(f"Unexpected table: {name}")
        return self.discovery


class AgentDiscoveryIntegrationTests(unittest.TestCase):
    def test_staging_uses_canonical_url_and_preserves_review_state(self) -> None:
        agent = OstlankenAgent.__new__(OstlankenAgent)
        agent.supabase = _FakeSupabase()
        agent.stats = AgentStats()
        agent.run_id = "run-1"
        agent.discovery_min_ai_confidence = 0.65

        candidate = {
            "candidate_key": "source:123",
            "canonical_url": "https://example.org/project/rail",
            "source_key": "source",
            "source_owner": "Authority",
            "country_hint": "Spain",
            "discovered_from_url": "https://example.org/projects",
            "title": "Rail project",
            "description": "New railway corridor",
            "heuristic_score": 12,
            "crawl_depth": 1,
        }
        classification = {
            "candidate_key": "source:123",
            "is_project": True,
            "confidence": 0.91,
            "evidence_quality": "strong",
            "name": "Conexión Ferroviaria Málaga–Norte",
        }

        agent.stage_discovery_candidates([candidate], [classification])

        row = agent.supabase.discovery.rows[0]
        self.assertEqual(agent.supabase.discovery.conflict, "canonical_url")
        self.assertEqual(row["qualification_status"], "qualified")
        self.assertEqual(row["proposed_slug"], "conexion-ferroviaria-malaga-norte")
        self.assertNotIn("review_status", row)
        self.assertEqual(agent.stats.project_candidates_staged, 1)


if __name__ == "__main__":
    unittest.main()
