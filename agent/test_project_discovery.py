from __future__ import annotations

import unittest

from bs4 import BeautifulSoup

try:
    from project_discovery import (
        DiscoverySource,
        ProjectDiscoveryEngine,
        canonicalize_url,
        dedupe_candidates,
        is_allowed_url,
        keyword_score,
        matches_included_path,
        select_balanced_candidates,
        stable_candidate_key,
    )
except ModuleNotFoundError:
    from agent.project_discovery import (
        DiscoverySource,
        ProjectDiscoveryEngine,
        canonicalize_url,
        dedupe_candidates,
        is_allowed_url,
        keyword_score,
        matches_included_path,
        select_balanced_candidates,
        stable_candidate_key,
    )


class ProjectDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = DiscoverySource.from_dict(
            {
                "key": "official",
                "name": "Official Authority",
                "country_hint": "Spain",
                "seed_urls": ["https://example.org/projects"],
                "sitemap_urls": ["https://example.org/sitemap.xml"],
                "allowed_domains": ["example.org"],
                "include_path_patterns": ["/project/"],
                "exclude_path_patterns": ["/privacy"],
                "max_depth": 2,
            }
        )

    def test_canonicalize_url_removes_tracking_and_fragment(self) -> None:
        result = canonicalize_url(
            "../project/rail/?utm_source=test&id=7#details",
            "https://EXAMPLE.org/list/page",
        )
        self.assertEqual(result, "https://example.org/project/rail?id=7")
        self.assertEqual(
            canonicalize_url("https://example.org/project/rail?prefLang=es"),
            "https://example.org/project/rail",
        )

    def test_allowed_url_enforces_domain_paths_and_extensions(self) -> None:
        self.assertTrue(is_allowed_url("https://sub.example.org/project/rail", self.source))
        self.assertFalse(is_allowed_url("https://malicious-example.org/project/rail", self.source))
        self.assertFalse(is_allowed_url("https://example.org/privacy", self.source))
        self.assertFalse(is_allowed_url("https://example.org/project/report.pdf", self.source))

    def test_required_include_path_can_be_checked_separately_from_domain_allowlist(self) -> None:
        required = DiscoverySource.from_dict(
            {
                "key": "official",
                "seed_urls": ["https://example.org/projects"],
                "allowed_domains": ["example.org"],
                "include_path_patterns": ["/project/"],
                "require_include_path_match": True,
            }
        )
        self.assertTrue(is_allowed_url("https://example.org/news/rail", required))
        self.assertFalse(matches_included_path("https://example.org/news/rail", required))
        self.assertTrue(matches_included_path("https://example.org/project/rail", required))

    def test_keyword_score_prefers_infrastructure_projects(self) -> None:
        project = keyword_score("Major railway infrastructure construction project and investment")
        privacy = keyword_score("Privacy policy and cookie settings")
        self.assertGreater(project, privacy)
        self.assertGreaterEqual(project, 5)

    def test_candidate_key_is_stable(self) -> None:
        first = stable_candidate_key("source", "https://example.org/project/a")
        second = stable_candidate_key("source", "https://example.org/project/a")
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("source:"))

    def test_dedupe_keeps_highest_scoring_candidate(self) -> None:
        rows = dedupe_candidates(
            [
                {"canonical_url": "https://example.org/a", "heuristic_score": 4},
                {"canonical_url": "https://example.org/a", "heuristic_score": 9},
                {"canonical_url": "https://example.org/b", "heuristic_score": 7},
            ]
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["heuristic_score"], 9)

    def test_balanced_selection_prevents_one_source_from_using_all_slots(self) -> None:
        candidates = [
            {
                "canonical_url": f"https://a.example/{index}",
                "source_key": "a",
                "heuristic_score": 100 - index,
            }
            for index in range(8)
        ]
        candidates.extend(
            {
                "canonical_url": f"https://b.example/{index}",
                "source_key": "b",
                "heuristic_score": 20 - index,
            }
            for index in range(3)
        )
        selected = select_balanced_candidates(candidates, 6)
        self.assertEqual([row["source_key"] for row in selected], ["a", "b", "a", "b", "a", "b"])

    def test_html_extractors_ignore_navigation_and_scripts(self) -> None:
        soup = BeautifulSoup(
            """
            <html><head><title>Fallback</title><meta name="description" content="Rail project"></head>
            <body><nav>Cookie privacy</nav><main><h1>New railway corridor</h1>
            <p>Construction of a major bridge and station.</p><script>ignore me</script></main></body></html>
            """,
            "html.parser",
        )
        engine = ProjectDiscoveryEngine()
        self.assertEqual(engine._extract_title(soup), "New railway corridor")
        self.assertEqual(engine._extract_description(soup), "Rail project")
        self.assertNotIn("ignore me", engine._extract_main_text(soup))


if __name__ == "__main__":
    unittest.main()
