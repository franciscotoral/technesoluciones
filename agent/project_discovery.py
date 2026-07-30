from __future__ import annotations

import hashlib
import logging
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("ostlanken-agent.discovery")

_SKIPPED_EXTENSIONS = {
    ".7z",
    ".avi",
    ".css",
    ".doc",
    ".docx",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".mov",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rar",
    ".rss",
    ".svg",
    ".tar",
    ".webp",
    ".xls",
    ".xlsx",
    ".xml",
    ".zip",
}

_TRACKING_QUERY_PREFIXES = ("utm_",)
_TRACKING_QUERY_KEYS = {"fbclid", "gclid", "lang", "language", "mc_cid", "mc_eid", "preflang"}

_PROJECT_KEYWORDS = {
    "project": 2,
    "projects": 2,
    "projekt": 2,
    "proyecto": 2,
    "proyectos": 2,
    "construction": 2,
    "construcción": 2,
    "construccion": 2,
    "byggprojekt": 2,
    "infrastructure": 2,
    "infraestructura": 2,
    "rail": 2,
    "railway": 2,
    "järnväg": 2,
    "jarnvag": 2,
    "ferroviario": 2,
    "bridge": 2,
    "puente": 2,
    "brücke": 2,
    "hospital": 2,
    "campus": 1,
    "port": 2,
    "puerto": 2,
    "terminal": 2,
    "airport": 2,
    "aeropuerto": 2,
    "station": 1,
    "estación": 1,
    "estacion": 1,
    "tunnel": 2,
    "metro": 2,
    "corridor": 2,
    "corredor": 2,
    "modernisation": 1,
    "modernization": 1,
    "modernización": 1,
    "upgrade": 1,
    "expansion": 1,
    "ampliación": 1,
    "ampliacion": 1,
    "renovation": 1,
    "rehabilitación": 1,
    "rehabilitacion": 1,
    "works": 1,
    "obras": 1,
    "tender": 1,
    "licitación": 1,
    "licitacion": 1,
    "investment": 1,
    "inversión": 1,
    "inversion": 1,
    "million": 1,
    "millones": 1,
    "billion": 1,
}

_NEGATIVE_KEYWORDS = {
    "cookie": -4,
    "privacy": -3,
    "legal notice": -3,
    "contact": -2,
    "login": -4,
    "careers": -3,
    "job vacancy": -4,
    "press contact": -2,
    "newsletter": -3,
    "accessibility": -3,
}


@dataclass(frozen=True)
class DiscoverySource:
    key: str
    name: str
    country_hint: str
    seed_urls: tuple[str, ...]
    sitemap_urls: tuple[str, ...]
    allowed_domains: tuple[str, ...]
    include_path_patterns: tuple[str, ...]
    exclude_path_patterns: tuple[str, ...]
    require_include_path_match: bool = False
    max_depth: int = 1
    max_pages: int = 40
    min_link_score: int = 2
    min_candidate_score: int = 5

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DiscoverySource":
        key = str(data.get("key") or "").strip()
        seed_urls = tuple(str(url).strip() for url in data.get("seed_urls") or [] if str(url).strip())
        allowed_domains = tuple(
            str(domain).strip().lower() for domain in data.get("allowed_domains") or [] if str(domain).strip()
        )
        if not key or not seed_urls or not allowed_domains:
            raise ValueError("Each discovery source needs key, seed_urls and allowed_domains.")

        return cls(
            key=key,
            name=str(data.get("name") or key).strip(),
            country_hint=str(data.get("country_hint") or "").strip(),
            seed_urls=seed_urls,
            sitemap_urls=tuple(
                str(url).strip() for url in data.get("sitemap_urls") or [] if str(url).strip()
            ),
            allowed_domains=allowed_domains,
            include_path_patterns=tuple(
                str(pattern).strip().lower()
                for pattern in data.get("include_path_patterns") or []
                if str(pattern).strip()
            ),
            exclude_path_patterns=tuple(
                str(pattern).strip().lower()
                for pattern in data.get("exclude_path_patterns") or []
                if str(pattern).strip()
            ),
            require_include_path_match=bool(data.get("require_include_path_match", False)),
            max_depth=max(0, min(3, int(data.get("max_depth", 1)))),
            max_pages=max(1, min(250, int(data.get("max_pages", 40)))),
            min_link_score=max(0, int(data.get("min_link_score", 2))),
            min_candidate_score=max(0, int(data.get("min_candidate_score", 5))),
        )


def canonicalize_url(url: str, base_url: str | None = None) -> str | None:
    absolute = urljoin(base_url or "", url.strip())
    parts = urlsplit(absolute)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        return None

    hostname = parts.hostname.lower().rstrip(".")
    port = parts.port
    netloc = hostname
    if port and not ((parts.scheme.lower() == "http" and port == 80) or (parts.scheme.lower() == "https" and port == 443)):
        netloc = f"{hostname}:{port}"

    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")

    filtered_query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in _TRACKING_QUERY_KEYS or lowered.startswith(_TRACKING_QUERY_PREFIXES):
            continue
        filtered_query.append((key, value))
    query = urlencode(sorted(filtered_query))

    return urlunsplit((parts.scheme.lower(), netloc, path, query, ""))


def is_allowed_url(url: str, source: DiscoverySource) -> bool:
    parts = urlsplit(url)
    hostname = (parts.hostname or "").lower()
    if not any(hostname == domain or hostname.endswith(f".{domain}") for domain in source.allowed_domains):
        return False

    lowered_path = parts.path.lower()
    if any(lowered_path.endswith(extension) for extension in _SKIPPED_EXTENSIONS):
        return False
    if any(pattern in lowered_path for pattern in source.exclude_path_patterns):
        return False
    return True


def matches_included_path(url: str, source: DiscoverySource) -> bool:
    if not source.include_path_patterns:
        return True
    path = urlsplit(url).path.lower()
    return any(pattern in path for pattern in source.include_path_patterns)


def keyword_score(text: str) -> int:
    normalized = re.sub(r"\s+", " ", (text or "").lower())
    score = 0
    for keyword, weight in _PROJECT_KEYWORDS.items():
        if keyword in normalized:
            score += weight
    for keyword, weight in _NEGATIVE_KEYWORDS.items():
        if keyword in normalized:
            score += weight
    return score


def stable_candidate_key(source_key: str, canonical_url: str) -> str:
    digest = hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()[:24]
    return f"{source_key}:{digest}"


def dedupe_candidates(candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    best_by_url: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        url = str(candidate.get("canonical_url") or "")
        if not url:
            continue
        previous = best_by_url.get(url)
        if not previous or int(candidate.get("heuristic_score") or 0) > int(previous.get("heuristic_score") or 0):
            best_by_url[url] = candidate
    return sorted(best_by_url.values(), key=lambda item: (-int(item.get("heuristic_score") or 0), item["canonical_url"]))


def select_balanced_candidates(
    candidates: Iterable[dict[str, Any]],
    max_candidates: int,
) -> list[dict[str, Any]]:
    """Keep the strongest pages while preventing one large source from taking every slot."""
    candidate_list = list(candidates)
    deduped = dedupe_candidates(candidate_list)
    limit = max(1, max_candidates)
    if len(deduped) <= limit:
        return deduped

    source_order: list[str] = []
    for candidate in candidate_list:
        source_key = str(candidate.get("source_key") or "")
        if source_key and source_key not in source_order:
            source_order.append(source_key)

    by_source: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
    for candidate in deduped:
        by_source[str(candidate.get("source_key") or "")].append(candidate)

    selected: list[dict[str, Any]] = []
    while len(selected) < limit:
        added = False
        for source_key in source_order:
            if by_source[source_key]:
                selected.append(by_source[source_key].popleft())
                added = True
                if len(selected) >= limit:
                    break
        if not added:
            break
    return selected


class ProjectDiscoveryEngine:
    def __init__(
        self,
        *,
        user_agent: str = "TechneProjectDiscovery/1.0 (+https://technesoluciones.es)",
        timeout_seconds: float = 25.0,
        max_text_chars: int = 12_000,
    ) -> None:
        self.user_agent = user_agent
        self.timeout_seconds = timeout_seconds
        self.max_text_chars = max(2_000, min(50_000, max_text_chars))

    def discover(self, sources: list[DiscoverySource], max_candidates: int) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        with httpx.Client(
            timeout=self.timeout_seconds,
            follow_redirects=True,
            headers={"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"},
        ) as client:
            for source in sources:
                candidates.extend(self._crawl_source(client, source))

        deduped = dedupe_candidates(candidates)
        limited = select_balanced_candidates(candidates, max_candidates)
        retained_by_source: dict[str, int] = defaultdict(int)
        for candidate in limited:
            retained_by_source[str(candidate.get("source_key") or "unknown")] += 1
        logger.info(
            "Discovery retained %s candidates from %s unique pages with source distribution %s.",
            len(limited),
            len(deduped),
            dict(retained_by_source),
        )
        return limited

    def _crawl_source(self, client: httpx.Client, source: DiscoverySource) -> list[dict[str, Any]]:
        queue: deque[tuple[str, int, str | None, str]] = deque()
        for seed_url in source.seed_urls:
            canonical = canonicalize_url(seed_url)
            if canonical and is_allowed_url(canonical, source):
                queue.append((canonical, 0, None, source.name))
        for sitemap_url, sitemap_hint in self._load_sitemap_pages(client, source):
            queue.append((sitemap_url, 1, "sitemap", sitemap_hint))

        visited: set[str] = set()
        candidates: list[dict[str, Any]] = []

        while queue and len(visited) < source.max_pages:
            url, depth, discovered_from, anchor_hint = queue.popleft()
            if url in visited:
                continue
            visited.add(url)

            try:
                response = client.get(url)
                response.raise_for_status()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Discovery could not fetch %s: %s", url, exc)
                continue

            content_type = response.headers.get("content-type", "").lower()
            if "html" not in content_type:
                continue

            final_url = canonicalize_url(str(response.url)) or url
            if not is_allowed_url(final_url, source):
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            title = self._extract_title(soup)
            description = self._extract_description(soup)
            text = self._extract_main_text(soup)
            page_score = self._page_score(
                title=title,
                description=description,
                text=text,
                url=final_url,
                anchor_hint=anchor_hint,
                source=source,
            )

            include_match = matches_included_path(final_url, source)
            candidate_path_allowed = not source.require_include_path_match or include_match
            if depth > 0 and candidate_path_allowed and page_score >= source.min_candidate_score:
                candidates.append(
                    {
                        "candidate_key": stable_candidate_key(source.key, final_url),
                        "source_key": source.key,
                        "source_owner": source.name,
                        "country_hint": source.country_hint,
                        "canonical_url": final_url,
                        "discovered_from_url": discovered_from,
                        "title": title or anchor_hint or final_url,
                        "description": description,
                        "source_text": text[: self.max_text_chars],
                        "heuristic_score": page_score,
                        "crawl_depth": depth,
                    }
                )

            if depth >= source.max_depth:
                continue

            for link_url, link_text in self._extract_links(soup, final_url):
                if link_url in visited or not is_allowed_url(link_url, source):
                    continue
                link_score = self._link_score(link_url, link_text, source)
                if link_score >= source.min_link_score:
                    queue.append((link_url, depth + 1, final_url, link_text))

        logger.info(
            "Discovery source %s visited %s pages and found %s candidates.",
            source.key,
            len(visited),
            len(candidates),
        )
        return candidates

    def _load_sitemap_pages(
        self,
        client: httpx.Client,
        source: DiscoverySource,
    ) -> list[tuple[str, str]]:
        sitemap_queue: deque[str] = deque(source.sitemap_urls)
        visited_sitemaps: set[str] = set()
        ranked_pages: dict[str, tuple[int, str]] = {}

        while sitemap_queue and len(visited_sitemaps) < 12:
            raw_url = sitemap_queue.popleft()
            sitemap_url = canonicalize_url(raw_url)
            if not sitemap_url or sitemap_url in visited_sitemaps:
                continue
            visited_sitemaps.add(sitemap_url)

            try:
                response = client.get(sitemap_url)
                response.raise_for_status()
                root = ElementTree.fromstring(response.content)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Discovery could not read sitemap %s: %s", sitemap_url, exc)
                continue

            root_name = root.tag.rsplit("}", 1)[-1].lower()
            locations = [
                (element.text or "").strip()
                for element in root.iter()
                if element.tag.rsplit("}", 1)[-1].lower() == "loc" and (element.text or "").strip()
            ]
            if root_name == "sitemapindex":
                for location in locations[:50]:
                    canonical_child = canonicalize_url(location)
                    if canonical_child and self._domain_allowed(canonical_child, source):
                        sitemap_queue.append(canonical_child)
                continue

            for location in locations:
                canonical = canonicalize_url(location)
                if not canonical or not is_allowed_url(canonical, source):
                    continue
                path = urlsplit(canonical).path.lower()
                included = matches_included_path(canonical, source)
                if source.require_include_path_match and not included:
                    continue
                score = keyword_score(path)
                if included:
                    score += 4
                if score < source.min_link_score:
                    continue
                previous = ranked_pages.get(canonical)
                if not previous or score > previous[0]:
                    ranked_pages[canonical] = (score, path.rsplit("/", 1)[-1].replace("-", " "))

        ranked = sorted(ranked_pages.items(), key=lambda item: (-item[1][0], item[0]))
        pages = [(url, metadata[1]) for url, metadata in ranked[: source.max_pages]]
        logger.info(
            "Discovery source %s selected %s project-like URLs from %s sitemaps.",
            source.key,
            len(pages),
            len(visited_sitemaps),
        )
        return pages

    def _domain_allowed(self, url: str, source: DiscoverySource) -> bool:
        hostname = (urlsplit(url).hostname or "").lower()
        return any(hostname == domain or hostname.endswith(f".{domain}") for domain in source.allowed_domains)

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> list[tuple[str, str]]:
        links: list[tuple[str, str]] = []
        seen: set[str] = set()
        for element in soup.select("a[href]"):
            href = str(element.get("href") or "").strip()
            canonical = canonicalize_url(href, base_url)
            if not canonical or canonical in seen:
                continue
            seen.add(canonical)
            text = re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip()
            links.append((canonical, text[:300]))
        return links

    def _extract_title(self, soup: BeautifulSoup) -> str:
        heading = soup.select_one("main h1, article h1, h1")
        if heading:
            return re.sub(r"\s+", " ", heading.get_text(" ", strip=True)).strip()[:500]
        if soup.title:
            return re.sub(r"\s+", " ", soup.title.get_text(" ", strip=True)).strip()[:500]
        return ""

    def _extract_description(self, soup: BeautifulSoup) -> str:
        meta = soup.select_one("meta[name='description'], meta[property='og:description']")
        if meta and meta.get("content"):
            return re.sub(r"\s+", " ", str(meta.get("content"))).strip()[:1_000]
        paragraph = soup.select_one("main p, article p")
        if paragraph:
            return re.sub(r"\s+", " ", paragraph.get_text(" ", strip=True)).strip()[:1_000]
        return ""

    def _extract_main_text(self, soup: BeautifulSoup) -> str:
        for element in soup.select("script, style, noscript, nav, footer, form"):
            element.decompose()
        container = soup.select_one("main, article, [role='main']") or soup.body or soup
        return re.sub(r"\s+", " ", container.get_text(" ", strip=True)).strip()

    def _link_score(self, url: str, link_text: str, source: DiscoverySource) -> int:
        path = urlsplit(url).path.lower()
        if source.require_include_path_match and not matches_included_path(url, source):
            return -1
        score = keyword_score(f"{link_text} {path}")
        if source.include_path_patterns and any(pattern in path for pattern in source.include_path_patterns):
            score += 4
        return score

    def _page_score(
        self,
        *,
        title: str,
        description: str,
        text: str,
        url: str,
        anchor_hint: str,
        source: DiscoverySource,
    ) -> int:
        path = urlsplit(url).path.lower()
        score = keyword_score(f"{title} {title} {description} {anchor_hint} {path}")
        score += min(8, keyword_score(text[:5_000]) // 2)
        if source.include_path_patterns and any(pattern in path for pattern in source.include_path_patterns):
            score += 3
        if len(text) < 300:
            score -= 3
        return score
