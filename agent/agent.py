from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from anthropic import Anthropic
from apscheduler.schedulers.blocking import BlockingScheduler
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ostlanken-agent")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AgentStats:
    licitaciones_upserted: int = 0
    noticias_inserted: int = 0
    oportunidades_inserted: int = 0
    european_projects_upserted: int = 0
    cambios_logged: int = 0


class OstlankenAgent:
    def __init__(self) -> None:
        self.supabase = self._build_supabase()
        self.anthropic = Anthropic(api_key=self._required_env("ANTHROPIC_API_KEY"))
        self.anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-7-sonnet-latest").strip()
        self.classify_model = os.getenv("ANTHROPIC_MODEL_CLASSIFY", self.anthropic_model).strip()
        self.score_model = os.getenv("ANTHROPIC_MODEL_SCORE", self.anthropic_model).strip()
        self.opportunities_model = os.getenv("ANTHROPIC_MODEL_OPPORTUNITIES", self.anthropic_model).strip()
        self.repair_model = os.getenv("ANTHROPIC_MODEL_REPAIR", self.score_model).strip()
        self.use_claude_cache = os.getenv("USE_CLAUDE_CACHE", "0").strip() == "1"
        self.debug_dir = os.path.join(os.path.dirname(__file__), "debug_outputs")
        portfolio_sources_value = os.getenv("PORTFOLIO_SOURCES_FILE", "portfolio_sources.json").strip()
        configured_sources_path = Path(portfolio_sources_value)
        if configured_sources_path.is_absolute():
            self.portfolio_sources_path = configured_sources_path
        else:
            self.portfolio_sources_path = Path(__file__).resolve().parent / configured_sources_path
        self.enable_portfolio_sync = os.getenv("ENABLE_PORTFOLIO_SYNC", "1").strip() == "1"
        self.portfolio_only = os.getenv("PORTFOLIO_ONLY", "0").strip() == "1"
        self.max_portfolio_source_chars = int(os.getenv("MAX_PORTFOLIO_SOURCE_CHARS", "9000"))
        self.max_procurement_items = int(os.getenv("MAX_PROCUREMENT_ITEMS", "24"))
        self.max_news_items = int(os.getenv("MAX_NEWS_ITEMS", "30"))
        self.max_opportunity_licitaciones = int(os.getenv("MAX_OPPORTUNITY_LICITACIONES", "12"))
        self.max_opportunity_news = int(os.getenv("MAX_OPPORTUNITY_NEWS", "12"))
        self.stats = AgentStats()
        self.run_id: str | None = None

    def _required_env(self, key: str) -> str:
        value = os.getenv(key, "").strip()
        if not value:
            raise RuntimeError(f"Missing environment variable: {key}")
        return value

    def _build_supabase(self) -> Client:
        url = self._required_env("SUPABASE_URL")
        key = self._required_env("SUPABASE_SERVICE_KEY")
        return create_client(url, key)

    def run(self) -> None:
        logger.info("Starting Ostlanken intelligence run.")
        self.stats = AgentStats()
        self.run_id = self._create_run()
        status = "ok"
        error_message: str | None = None

        try:
            licitaciones_structured: list[dict[str, Any]] = []
            scored_articles: list[dict[str, Any]] = []

            if not self.portfolio_only:
                licitaciones_raw = self.scrape_trafikverket_procurement()
                licitaciones_structured = self.classify_licitaciones_with_claude(licitaciones_raw)
                self.upsert_licitaciones(licitaciones_structured)

                articles_raw = self.scrape_swedish_press()
                scored_articles = self.score_news_with_claude(articles_raw)
                self.insert_relevant_news(scored_articles)

                opportunities = self.generate_opportunities_with_claude(licitaciones_structured, scored_articles)
                self.insert_opportunities(opportunities)

            if self.enable_portfolio_sync:
                official_sources = self.scrape_official_portfolio_sources()
                structured_projects = self.classify_portfolio_projects_with_claude(official_sources)
                self.upsert_european_projects(structured_projects)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Agent run failed.")
            status = "error"
            error_message = str(exc)
        finally:
            self._finish_run(status=status, error_message=error_message)

    def _create_run(self) -> str:
        payload = {
            "status": "running",
            "started_at": now_iso(),
            "stats": {
                "licitaciones_upserted": 0,
                "noticias_inserted": 0,
                "oportunidades_inserted": 0,
                "european_projects_upserted": 0,
                "cambios_logged": 0,
            },
        }
        result = self.supabase.table("agent_runs").insert(payload).execute()
        run_id = result.data[0]["id"]
        logger.info("Created agent run: %s", run_id)
        return run_id

    def _finish_run(self, status: str, error_message: str | None = None) -> None:
        if not self.run_id:
            return

        if status != "error":
            if (
                self.stats.licitaciones_upserted == 0
                and self.stats.noticias_inserted == 0
                and self.stats.european_projects_upserted == 0
            ):
                status = "parcial"

        payload = {
            "status": status,
            "finished_at": now_iso(),
            "error_message": error_message,
            "stats": {
                "licitaciones_upserted": self.stats.licitaciones_upserted,
                "noticias_inserted": self.stats.noticias_inserted,
                "oportunidades_inserted": self.stats.oportunidades_inserted,
                "european_projects_upserted": self.stats.european_projects_upserted,
                "cambios_logged": self.stats.cambios_logged,
            },
        }
        self.supabase.table("agent_runs").update(payload).eq("id", self.run_id).execute()
        logger.info("Finished run %s with status=%s", self.run_id, status)

    def scrape_official_portfolio_sources(self) -> list[dict[str, Any]]:
        sources = self._load_portfolio_sources()
        if not sources:
            logger.warning("No portfolio sources configured for european_projects sync.")
            return []

        documents: list[dict[str, Any]] = []
        with httpx.Client(timeout=25.0, follow_redirects=True) as client:
            for source in sources:
                url = source.get("official_source_url")
                if not url:
                    continue

                try:
                    response = client.get(url)
                    response.raise_for_status()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Could not scrape official source %s: %s", url, exc)
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                text = soup.get_text(" ", strip=True)
                text = re.sub(r"\s+", " ", text).strip()[: self.max_portfolio_source_chars]
                documents.append(
                    {
                        **source,
                        "source_text": text,
                        "fetched_at": now_iso(),
                    }
                )

        logger.info("Scraped %s official portfolio source pages.", len(documents))
        return documents

    def classify_portfolio_projects_with_claude(self, raw_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not raw_sources:
            return []

        prompt = (
            "You are extracting structured project intelligence from official European infrastructure sources.\n"
            "Return JSON only. No markdown, no explanations.\n"
            "Return a strict JSON list with these fields for each item:\n"
            "slug, name, country, city, infrastructure_type, status, budget_eur_m, timeframe, summary, "
            "client, key_focus (array), required_services (array).\n"
            "Allowed infrastructure_type: Ferroviario, Puentes, Hospitalario, Energetico, Portuario.\n"
            "Allowed status: Pipeline, Tendering, Execution, Monitoring.\n"
            "Allowed required_services values: CE-Marking, BIM requerido, Due Diligence.\n"
            "Prefer source facts over hints. If a value is not explicit, use the provided hint."
        )
        payload = [
            {
                "slug": item.get("slug"),
                "route": item.get("route"),
                "hints": {
                    "name": item.get("fallback_name"),
                    "country": item.get("country"),
                    "city": item.get("city"),
                    "infrastructure_type": item.get("infrastructure_type"),
                    "status": item.get("status"),
                    "client": item.get("client"),
                },
                "official_source_url": item.get("official_source_url"),
                "source_owner": item.get("source_owner"),
                "source_text": item.get("source_text"),
            }
            for item in raw_sources
        ]
        parsed = self._parse_json_array(
            self._get_claude_text(
                "european_projects",
                prompt,
                json.dumps(payload, ensure_ascii=False),
                0,
                self.classify_model,
                2600,
            )
        )
        logger.info("Claude classified %s european projects.", len(parsed))
        return parsed

    def scrape_trafikverket_procurement(self) -> list[dict[str, Any]]:
        urls = [
            "https://www.trafikverket.se/om-oss/nyheter/upphandling/",
            "https://www.trafikverket.se/for-dig-i-branschen/upphandling/",
        ]
        blocks: list[dict[str, Any]] = []
        with httpx.Client(timeout=25.0, follow_redirects=True) as client:
            for url in urls:
                try:
                    response = client.get(url)
                    response.raise_for_status()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Could not scrape %s: %s", url, exc)
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                for article in soup.select("article, .listing-item, .news-list-item, li"):
                    title_el = article.select_one("h2, h3, a")
                    if not title_el:
                        continue

                    title = title_el.get_text(" ", strip=True)
                    text = article.get_text(" ", strip=True)
                    href = title_el.get("href") if title_el.name == "a" else None
                    if href and href.startswith("/"):
                        href = f"https://www.trafikverket.se{href}"

                    if len(title) < 8:
                        continue

                    blocks.append(
                        {
                            "source": "trafikverket",
                            "title": title,
                            "text": text[:1800],
                            "url": href or url,
                        }
                    )
        logger.info("Scraped %s raw Trafikverket blocks.", len(blocks))
        return blocks

    def scrape_swedish_press(self) -> list[dict[str, Any]]:
        sources = [
            {"source": "Byggvarlden", "url": "https://www.byggvarlden.se/"},
            {"source": "Dagens Industri", "url": "https://www.di.se/"},
        ]
        articles: list[dict[str, Any]] = []
        with httpx.Client(timeout=25.0, follow_redirects=True) as client:
            for source in sources:
                try:
                    response = client.get(source["url"])
                    response.raise_for_status()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Could not scrape %s: %s", source["url"], exc)
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                for link in soup.select("article a, h2 a, h3 a"):
                    title = link.get_text(" ", strip=True)
                    href = link.get("href")
                    if not title or len(title) < 10 or not href:
                        continue
                    if href.startswith("/"):
                        base = source["url"].rstrip("/")
                        href = f"{base}{href}"

                    articles.append(
                        {
                            "source": source["source"],
                            "title": title,
                            "url": href,
                            "summary": title[:280],
                        }
                    )
        logger.info("Scraped %s raw news links.", len(articles))
        return articles

    def classify_licitaciones_with_claude(self, raw_blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not raw_blocks:
            return []

        filtered_blocks = self._filter_procurement_candidates(raw_blocks)
        if not filtered_blocks:
            logger.info("No procurement candidates remained after heuristic filter.")
            return []

        prompt = (
            "You are classifying procurement snippets about Ostlanken railway project in Sweden.\n"
            "Return JSON only. No markdown, no explanations, no prose.\n"
            "Return strict JSON list. For each item include:\n"
            "external_id, titulo, descripcion, tramo, estado, valor_estimado_sek, fecha_publicacion,"
            " fecha_limite, url, is_tender (boolean).\n"
            "Use null where unknown. Keep Swedish names and statuses."
        )
        content = json.dumps(filtered_blocks[: self.max_procurement_items], ensure_ascii=False)
        raw_text = self._get_claude_text("licitaciones", prompt, content, 0, self.classify_model, 1800)
        parsed = self._parse_json_array(raw_text)
        tenders = [item for item in parsed if item.get("is_tender") is True]
        for item in tenders:
            if not item.get("external_id"):
                item["external_id"] = self._hash_key(item.get("titulo", ""), item.get("url", ""))
        logger.info("Claude classified %s tenders.", len(tenders))
        return tenders

    def score_news_with_claude(self, raw_articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not raw_articles:
            return []

        filtered_articles = self._dedupe_news_articles(raw_articles)[: self.max_news_items]
        if not filtered_articles:
            logger.info("No news candidates remained after dedupe.")
            return []

        prompt = (
            "Score each Swedish article for Ostlanken business relevance from 0 to 10.\n"
            "Return JSON only. No markdown, no explanations, no prose.\n"
            "Return strict JSON list with: external_id, titulo, resumen, fuente, url, relevance_score,"
            " sentiment (positivo|neutral|negativo), categorias (array), actores (array)."
        )
        content = json.dumps(filtered_articles, ensure_ascii=False)
        parsed = self._parse_json_array(self._get_claude_text("noticias", prompt, content, 0, self.score_model, 2200))
        for item in parsed:
            if not item.get("external_id"):
                item["external_id"] = self._hash_key(item.get("titulo", ""), item.get("url", ""))
        logger.info("Claude scored %s news records.", len(parsed))
        return parsed

    def generate_opportunities_with_claude(
        self, licitaciones: list[dict[str, Any]], noticias: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not licitaciones and not noticias:
            logger.info("Skipping opportunities generation because there is no structured input.")
            return []

        prompt = (
            "Create business opportunities for Ostlanken project grouped by type "
            "(calidad, BIM, compliance, digitalizacion, PMO, sostenibilidad).\n"
            "Return JSON only. No markdown, no explanations, no prose.\n"
            "Return strict JSON list with: tipo, titulo, descripcion, analisis, prioridad (alta|media|baja),"
            " score, actores (array), tramo."
        )
        payload = {
            "licitaciones": licitaciones[: self.max_opportunity_licitaciones],
            "noticias": noticias[: self.max_opportunity_news],
        }
        parsed = self._parse_json_array(
            self._get_claude_text(
                "oportunidades",
                prompt,
                json.dumps(payload, ensure_ascii=False),
                0.1,
                self.opportunities_model,
                1800,
            )
        )
        logger.info("Claude generated %s opportunities.", len(parsed))
        return parsed

    def upsert_licitaciones(self, records: list[dict[str, Any]]) -> None:
        for item in records:
            external_id = item.get("external_id")
            if not external_id:
                continue

            payload = {
                "external_id": external_id,
                "titulo": item.get("titulo") or "Sin titulo",
                "descripcion": item.get("descripcion"),
                "tramo": item.get("tramo"),
                "estado": item.get("estado") or "abierta",
                "valor_estimado_sek": item.get("valor_estimado_sek"),
                "fecha_publicacion": item.get("fecha_publicacion"),
                "fecha_limite": item.get("fecha_limite"),
                "url": item.get("url"),
                "metadata": {"source": "trafikverket", "agent_run_id": self.run_id},
            }

            existing = self.supabase.table("licitaciones").select("*").eq("external_id", external_id).limit(1).execute().data
            if existing:
                old_row = existing[0]
                self.supabase.table("licitaciones").update(payload).eq("id", old_row["id"]).execute()
                self._log_change("licitaciones", old_row["id"], "update", {"before": old_row, "after": payload})
            else:
                inserted = self.supabase.table("licitaciones").insert(payload).execute().data[0]
                self._log_change("licitaciones", inserted["id"], "insert", {"after": payload})
            self.stats.licitaciones_upserted += 1

    def insert_relevant_news(self, records: list[dict[str, Any]]) -> None:
        for item in records:
            score = float(item.get("relevance_score") or 0)
            if score < 5:
                continue

            payload = {
                "external_id": item.get("external_id"),
                "titulo": item.get("titulo") or "Sin titulo",
                "resumen": item.get("resumen"),
                "fuente": item.get("fuente") or "Unknown",
                "url": item.get("url") or "",
                "relevance_score": score,
                "sentiment": item.get("sentiment") or "neutral",
                "categorias": item.get("categorias") or [],
                "actores": item.get("actores") or [],
                "metadata": {"agent_run_id": self.run_id},
            }
            self.supabase.table("noticias").upsert(payload, on_conflict="external_id").execute()
            self.stats.noticias_inserted += 1

    def insert_opportunities(self, records: list[dict[str, Any]]) -> None:
        if not records:
            return
        for item in records:
            payload = {
                "tipo": item.get("tipo") or "general",
                "titulo": item.get("titulo") or "Oportunidad detectada",
                "descripcion": item.get("descripcion"),
                "analisis": item.get("analisis") or "",
                "prioridad": item.get("prioridad") or "media",
                "score": item.get("score") or 0,
                "tramo": item.get("tramo"),
                "actores": item.get("actores") or [],
                "metadata": {"agent_run_id": self.run_id},
            }
            self.supabase.table("oportunidades").insert(payload).execute()
            self.stats.oportunidades_inserted += 1

    def upsert_european_projects(self, records: list[dict[str, Any]]) -> None:
        if not records:
            return

        sources_by_slug = {item["slug"]: item for item in self._load_portfolio_sources() if item.get("slug")}
        for item in records:
            slug = item.get("slug")
            if not slug:
                continue

            source = sources_by_slug.get(slug, {})
            normalized = self._normalize_portfolio_record(item, source)
            payload = {
                "slug": slug,
                "name": normalized["name"],
                "country": normalized["country"],
                "city": normalized["city"],
                "infrastructure_type": normalized["infrastructure_type"],
                "status": normalized["status"],
                "budget_eur_m": normalized["budget_eur_m"],
                "timeframe": normalized["timeframe"],
                "summary": normalized["summary"],
                "route": source.get("route") or f"/projects/{slug}",
                "client": normalized["client"],
                "key_focus": normalized["key_focus"],
                "required_services": normalized["required_services"],
                "official_source_url": source.get("official_source_url"),
                "source_owner": source.get("source_owner"),
                "source_last_checked_at": now_iso(),
            }
            self.supabase.table("european_projects").upsert(payload, on_conflict="slug").execute()
            self.stats.european_projects_upserted += 1

    def _log_change(self, tabla: str, registro_id: str, tipo_cambio: str, diff: dict[str, Any]) -> None:
        payload = {
            "tabla": tabla,
            "registro_id": registro_id,
            "tipo_cambio": tipo_cambio,
            "diff": diff,
            "agent_run_id": self.run_id,
        }
        self.supabase.table("cambios").insert(payload).execute()
        self.stats.cambios_logged += 1

    def _parse_json_array(self, text: str) -> list[dict[str, Any]]:
        cleaned = text.strip()
        candidates = [cleaned]

        if cleaned.startswith("```"):
            fence_cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
            candidates.append(fence_cleaned)

        extracted = self._extract_json_array_block(cleaned)
        if extracted:
            candidates.append(extracted)

        if len(candidates) > 1:
            extracted_from_fence = self._extract_json_array_block(candidates[1])
            if extracted_from_fence:
                candidates.append(extracted_from_fence)

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, list):
                    return [item for item in parsed if isinstance(item, dict)]
            except json.JSONDecodeError as exc:
                logger.debug("JSON decode failed: %s", exc)
                continue

        repaired = self._repair_json_with_claude(cleaned)
        if repaired:
            try:
                parsed = json.loads(repaired)
                if isinstance(parsed, list):
                    logger.info("Recovered Claude JSON after repair pass.")
                    return [item for item in parsed if isinstance(item, dict)]
            except json.JSONDecodeError as exc:
                logger.debug("Claude repair JSON decode failed: %s", exc)

        logger.warning("Could not decode Claude JSON output. First 600 chars: %s", cleaned[:600].replace("\n", " "))
        return []

    def _extract_json_array_block(self, text: str) -> str | None:
        start = text.find("[")
        if start < 0:
            return None

        depth = 0
        in_string = False
        escape = False

        for index in range(start, len(text)):
            char = text[index]

            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1].strip()

        return None

    def _repair_json_with_claude(self, raw_text: str) -> str | None:
        try:
            repaired = self._get_claude_text(
                "repair",
                "You will receive malformed or wrapped JSON. Return only strict valid JSON array text. No markdown, no explanations.",
                "Reformat this into a strict JSON array only. Preserve the data fields exactly.\n\n" + raw_text[:12000],
                0,
                self.repair_model,
                2200,
            ).strip()
            repaired = re.sub(r"^```(?:json)?\s*|\s*```$", "", repaired, flags=re.IGNORECASE | re.DOTALL).strip()
            extracted = self._extract_json_array_block(repaired)
            return extracted or repaired
        except Exception as exc:  # noqa: BLE001
            logger.warning("Claude repair pass failed: %s", exc)
            return None

    def _get_claude_text(
        self,
        cache_key: str,
        system_prompt: str,
        user_content: str,
        temperature: float,
        model: str,
        max_tokens: int,
    ) -> str:
        cache_path = os.path.join(self.debug_dir, f"{cache_key}_latest.txt")
        if self.use_claude_cache and os.path.exists(cache_path):
            logger.info("Using cached Claude output: %s", cache_path)
            with open(cache_path, "r", encoding="utf-8") as file:
                return file.read()

        response = self.anthropic.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        raw_text = response.content[0].text
        self._save_debug_output(cache_key, raw_text)
        return raw_text

    def _save_debug_output(self, cache_key: str, raw_text: str) -> None:
        os.makedirs(self.debug_dir, exist_ok=True)
        latest_path = os.path.join(self.debug_dir, f"{cache_key}_latest.txt")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        versioned_path = os.path.join(self.debug_dir, f"{cache_key}_{timestamp}.txt")

        for path in (latest_path, versioned_path):
            with open(path, "w", encoding="utf-8") as file:
                file.write(raw_text)

    def _filter_procurement_candidates(self, raw_blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        keywords = (
            "upphandling",
            "anbud",
            "kontrakt",
            "entreprenad",
            "trafikverket",
            "ostlanken",
            "järnväg",
            "jarnvag",
            "förfrågningsunderlag",
            "uppdrag",
        )
        selected: list[dict[str, Any]] = []
        seen = set()

        for block in raw_blocks:
            haystack = f"{block.get('title', '')} {block.get('text', '')}".lower()
            if not any(keyword in haystack for keyword in keywords):
                continue

            dedupe_key = self._hash_key(block.get("title", ""), block.get("url", ""))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            selected.append(block)

        logger.info("Procurement heuristic kept %s of %s blocks.", len(selected), len(raw_blocks))
        return selected

    def _dedupe_news_articles(self, raw_articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        deduped: list[dict[str, Any]] = []
        seen = set()

        for article in raw_articles:
            dedupe_key = self._hash_key(article.get("title", ""), article.get("url", ""))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            deduped.append(article)

        logger.info("News dedupe kept %s of %s articles.", len(deduped), len(raw_articles))
        return deduped

    def _hash_key(self, *parts: str) -> str:
        joined = "|".join((part or "").strip().lower() for part in parts)
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]

    def _load_portfolio_sources(self) -> list[dict[str, Any]]:
        if not self.portfolio_sources_path.exists():
            logger.warning("Portfolio sources file not found: %s", self.portfolio_sources_path)
            return []

        with self.portfolio_sources_path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, list):
            raise RuntimeError("Portfolio sources file must contain a JSON list.")
        return [item for item in data if isinstance(item, dict)]

    def _normalize_portfolio_record(self, item: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
        allowed_types = {"Ferroviario", "Puentes", "Hospitalario", "Energetico", "Portuario"}
        allowed_statuses = {"Pipeline", "Tendering", "Execution", "Monitoring"}
        allowed_services = {"CE-Marking", "BIM requerido", "Due Diligence"}
        canonical_by_slug = {
            "ostlanken-intelligence": {
                "name": "Ostlanken Intelligence System",
                "status": "Monitoring",
                "budget_eur_m": 2400,
                "required_services": ["BIM requerido"],
            },
            "barcelona-health-campus": {
                "name": "Nou Campus Clínic Barcelona",
                "status": "Pipeline",
                "budget_eur_m": 540,
                "required_services": ["BIM requerido"],
            },
            "rhine-bridges-upgrade": {
                "name": "Rhine Bridges Upgrade Program",
                "status": "Tendering",
                "budget_eur_m": 980,
                "required_services": ["Due Diligence"],
            },
            "iberian-grid-flex": {
                "name": "Iberian Grid Flex Nodes",
                "status": "Pipeline",
                "budget_eur_m": 410,
                "required_services": ["CE-Marking", "Due Diligence"],
            },
            "copenhagen-port-automation": {
                "name": "Copenhagen Port Container Terminal Modernisation",
                "status": "Tendering",
                "budget_eur_m": 355,
                "required_services": ["BIM requerido"],
            },
        }

        budget = self._normalize_budget_eur_m(item.get("budget_eur_m"), source)
        services = [service for service in (item.get("required_services") or []) if service in allowed_services]
        slug = source.get("slug")
        canonical = canonical_by_slug.get(slug, {})

        if canonical.get("required_services"):
            services = canonical["required_services"]

        return {
            "name": (
                canonical.get("name")
                or item.get("name")
                or source.get("fallback_name")
                or source.get("slug")
                or "Unnamed project"
            ).strip(),
            "country": (item.get("country") or source.get("country") or "").strip(),
            "city": (item.get("city") or source.get("city") or "").strip(),
            "infrastructure_type": (
                item.get("infrastructure_type")
                if item.get("infrastructure_type") in allowed_types
                else source.get("infrastructure_type") or "Ferroviario"
            ),
            "status": (
                canonical.get("status")
                or (
                    item.get("status")
                    if item.get("status") in allowed_statuses
                    else source.get("status") or "Monitoring"
                )
            ),
            "budget_eur_m": canonical.get("budget_eur_m", budget),
            "timeframe": (item.get("timeframe") or "n/d").strip(),
            "summary": (item.get("summary") or "").strip(),
            "client": (item.get("client") or source.get("client") or "").strip(),
            "key_focus": [str(focus).strip() for focus in (item.get("key_focus") or []) if str(focus).strip()],
            "required_services": services,
        }

    def _normalize_budget_eur_m(self, value: Any, source: dict[str, Any]) -> int:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            numeric = 0.0

        fallback_by_slug = {
            "ostlanken-intelligence": 2400,
            "barcelona-health-campus": 540,
            "rhine-bridges-upgrade": 980,
            "iberian-grid-flex": 410,
            "copenhagen-port-automation": 355,
        }

        slug = source.get("slug")
        if numeric <= 0:
            return fallback_by_slug.get(slug, 0)
        if numeric < 10:
            return fallback_by_slug.get(slug, int(round(numeric)))
        if numeric > 50000:
            return fallback_by_slug.get(slug, int(round(numeric / 1_000_000)))
        return int(round(numeric))


def schedule_weekly() -> None:
    scheduler = BlockingScheduler(timezone="Europe/Stockholm")
    agent = OstlankenAgent()
    scheduler.add_job(agent.run, "cron", day_of_week="mon", hour=7, minute=0, id="ostlanken-weekly-agent")
    logger.info("Scheduler started. Weekly run configured for Mondays 07:00 Europe/Stockholm.")
    scheduler.start()


if __name__ == "__main__":
    run_mode = os.getenv("RUN_MODE", "once").strip().lower()
    if run_mode == "schedule":
        schedule_weekly()
    else:
        OstlankenAgent().run()
