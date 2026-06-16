"""
ML Gateway — Assistant Router.

Exposes LLM-assisted features using the local Llama 3.1 model.
Endpoints:
  - POST /autofill           : Extract suspect details from raw text
  - POST /summarize-brief    : Generate case briefs from raw narratives
  - POST /extract-mo-tags    : Suggest searchable modus operandi tags from narrative text
  - POST /hotspot-brief      : Summarize filtered hotspot area patterns and operational leads
  - POST /suggest-sections   : Suggest IPC/BNS sections based on crime briefs
  - POST /transliterate      : Transliterate Malayalam text to English
  - POST /analyze-network    : Analyze network graph topology
  - POST /explain-path       : Explain multi-hop links between suspects
  - POST /suggest-missing-links : Recommend entities/roles missing from the graph
  - POST /threat-profile     : Generate a full criminal psychological threat profile
  - POST /cross-dossier-patterns : Find suspects with similar modus operandi
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from iip_core.auth import CurrentUser, get_current_user
from iip_core.logging import get_logger
from iip_llm.client import ChatMessage, LLMClient

router = APIRouter()
logger = get_logger(__name__)

# Initialize LLM Client
_llm_client = LLMClient()


# ─── Request & Response Models ────────────────────────────────────────────────

class RawTextRequest(BaseModel):
    text: str


class AutofillResponse(BaseModel):
    criminalName: str | None = None
    aliasName: str | None = None
    fathersName: str | None = None
    dateOfBirth: str | None = None
    age: str | None = None
    gender: str | None = None
    address: dict[str, Any] | None = None
    modusOperandi: str | None = None
    cases: list[dict[str, Any]] = Field(default_factory=list)


class CaseBriefInput(BaseModel):
    crimeNumber: str | None = None
    crimeYear: int | None = None
    policeStationName: str | None = None
    actSection: str | None = None
    brief: str | None = None


class SynthesizeMORequest(BaseModel):
    cases: list[CaseBriefInput]


class SynthesizeMOResponse(BaseModel):
    modus_operandi: str


class SummarizeResponse(BaseModel):
    summary: str


class ModusTagResponse(BaseModel):
    tags: list[str]


class SectionSuggestion(BaseModel):
    section: str
    explanation: str


class SectionSuggestionResponse(BaseModel):
    suggestions: list[SectionSuggestion]


class TransliterateResponse(BaseModel):
    transliteratedText: str


class GraphNodeInfo(BaseModel):
    id: str
    label: str
    node_kind: str = "associate"
    criminal_name: str | None = None


class GraphEdgeInfo(BaseModel):
    source: str
    target: str
    role: str


class AnalyzeNetworkRequest(BaseModel):
    nodes: list[GraphNodeInfo]
    edges: list[GraphEdgeInfo]
    language: Literal["english", "malayalam"] = "english"


class AnalyzeNetworkResponse(BaseModel):
    analysis: str


class ExplainPathRequest(BaseModel):
    path: list[dict[str, Any]]  # Sequential list of nodes/edges forming the path
    language: Literal["english", "malayalam"] = "english"


class ExplainPathResponse(BaseModel):
    explanation: str


class SuggestMissingLinksRequest(BaseModel):
    nodes: list[GraphNodeInfo]
    edges: list[GraphEdgeInfo]
    language: Literal["english", "malayalam"] = "english"


class SuggestMissingLinksResponse(BaseModel):
    recommendations: list[str]


class FilterGraphRequest(BaseModel):
    query: str
    nodes: list[GraphNodeInfo]
    edges: list[GraphEdgeInfo]
    language: Literal["english", "malayalam"] = "english"


class FilterGraphResponse(BaseModel):
    matching_node_ids: list[str]


class HotspotPointInfo(BaseModel):
    criminal_name: str
    district: str | None = None
    police_station: str | None = None
    address_kind: str | None = None
    modus_operandi: str | None = None
    case_count: int = 0


class HotspotBriefRequest(BaseModel):
    query: str | None = None
    address_scope: str = "both"
    case_scope: str = "all"
    point_count: int = 0
    visible_count: int = 0
    districts: list[str] = Field(default_factory=list)
    police_stations: list[str] = Field(default_factory=list)
    points: list[HotspotPointInfo] = Field(default_factory=list)
    language: Literal["english", "malayalam"] = "english"


class HotspotBriefResponse(BaseModel):
    briefing: str


class HumintDraftRequest(BaseModel):
    narrative: str
    location_text: str | None = None
    report_type: str | None = None


class HumintDraftResponse(BaseModel):
    title: str
    summary: str
    structured_report: str
    report_type: str
    urgency: str
    entities: dict[str, Any] = Field(default_factory=dict)


# ─── Helper Functions ─────────────────────────────────────────────────────────

def _clean_llm_json(content: str) -> str:
    """Helper to strip markdown backticks and return raw JSON text."""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return content.strip()


def _parse_llm_json(content: str) -> Any:
    """Clean LLM output and parse as JSON, tolerating unescaped control chars
    (e.g. literal newlines inside string values from markdown content)."""
    cleaned = _clean_llm_json(content)
    # strict=False allows control characters inside string values,
    # which LLMs commonly emit (e.g. newlines in structured_report markdown)
    return json.loads(cleaned, strict=False)


def _response_language_instruction(language: Literal["english", "malayalam"]) -> str:
    if language == "malayalam":
        return "Respond fully in Malayalam. Keep official intelligence tone and preserve names/IDs as needed."
    return "Respond in English."


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/autofill", response_model=AutofillResponse)
async def assistant_autofill(
    payload: RawTextRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AutofillResponse:
    """Parse raw case narrative or arrest details and extract structured fields."""
    _ = current_user
    system_prompt = (
        "You are an expert entity extraction system for the Kerala Police.\n"
        "Your task is to parse the raw text and extract structured profile details.\n"
        "Return ONLY a valid JSON object matching the following schema structure, with no extra keys:\n"
        "{\n"
        '  "criminalName": string or null,\n'
        '  "aliasName": string or null,\n'
        '  "fathersName": string or null,\n'
        '  "dateOfBirth": string (YYYY-MM-DD) or null,\n'
        '  "age": string (number) or null,\n'
        '  "gender": "Male" | "Female" | "Other" | null,\n'
        '  "modusOperandi": string or null (extract typical crime execution method, target selection, signature, or modus operandi patterns if mentioned),\n'
        '  "address": {\n'
        '    "houseNo": string or null,\n'
        '    "houseName": string or null,\n'
        '    "streetName": string or null,\n'
        '    "locality": string or null,\n'
        '    "tehsil": string or null,\n'
        '    "villageTownCity": string or null,\n'
        '    "pincode": string or null,\n'
        '    "district": string or null,\n'
        '    "state": string or null\n'
        "  } or null,\n"
        '  "cases": [\n'
        "    {\n"
        '      "crimeNumber": string (e.g. "12/2024"),\n'
        '      "crimeYear": number,\n'
        '      "policeStationName": string or null,\n'
        '      "actSection": string or null,\n'
        '      "brief": string or null,\n'
        '      "presentStatus": string or null\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "CRITICAL: Return ONLY raw JSON text. Do not include markdown code block syntax (like ```json), "
        "explanations, prefix, or trailing text. If a field cannot be found, set it to null."
    )

    msg = ChatMessage(role="user", content=payload.text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.0)
        data = _parse_llm_json(response.content)
        return AutofillResponse(**data)
    except Exception as exc:
        logger.error("autofill_extraction_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse text: {str(exc)}",
        ) from exc


@router.post("/summarize-brief", response_model=SummarizeResponse)
async def assistant_summarize_brief(
    payload: RawTextRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SummarizeResponse:
    """Summarize long incident narratives into formal, concise 2-sentence briefs."""
    _ = current_user
    system_prompt = (
        "You are an expert case summarizer for police intelligence.\n"
        "Summarize the provided case narrative into exactly 1 or 2 formal, professional sentences.\n"
        "Focus on the criminal act, arrest status, and recovery/results.\n"
        "Do not mention names of confidential sources. Do not say 'Here is the summary' or include chat prefix."
    )

    msg = ChatMessage(role="user", content=payload.text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt)
        return SummarizeResponse(summary=response.content.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/extract-mo-tags", response_model=ModusTagResponse)
async def assistant_extract_mo_tags(
    payload: RawTextRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ModusTagResponse:
    """Extract concise, searchable modus operandi tags from a narrative description."""
    _ = current_user
    if not payload.text.strip():
        return ModusTagResponse(tags=[])

    system_prompt = (
        "You are an expert criminal intelligence analyst for the Kerala Police.\n"
        "Read the suspect modus operandi narrative and extract concise searchable tags.\n"
        "Return ONLY a JSON array of strings, with no markdown, explanation, or extra keys.\n"
        "Rules:\n"
        "1. Each tag must be short, usually 1-4 words.\n"
        "2. Focus on crime pattern, method, target, or operational style.\n"
        "3. Normalize obvious variants into a practical police-search term.\n"
        "4. Avoid person names, places, dates, police station names, and long sentences.\n"
        "5. Return 0 to 8 tags only.\n"
        "Examples of good tags: [\"Snatching\", \"Chain snatching\", \"Hit and run\", \"Dacoity\", \"Night burglary\", \"Vehicle theft\", \"Drug peddling\", \"House breaking\"]."
    )

    msg = ChatMessage(role="user", content=payload.text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.1)
        tags = _parse_llm_json(response.content)
        if not isinstance(tags, list):
            raise ValueError("LLM did not return a JSON list")

        cleaned_tags: list[str] = []
        seen: set[str] = set()
        for tag in tags:
            if not isinstance(tag, str):
                continue
            normalized = re.sub(r"\s+", " ", tag).strip().strip(",")
            if not normalized:
                continue
            key = normalized.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned_tags.append(normalized)

        return ModusTagResponse(tags=cleaned_tags[:8])
    except Exception as exc:
        logger.error("extract_mo_tags_failed", error=str(exc))
        return ModusTagResponse(tags=[])


@router.post("/synthesize-mo", response_model=SynthesizeMOResponse)
async def assistant_synthesize_mo(
    payload: SynthesizeMORequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SynthesizeMOResponse:
    """Analyze a list of case briefs and synthesize a consolidated Modus Operandi (MO) description."""
    _ = current_user
    if not payload.cases:
        return SynthesizeMOResponse(modus_operandi="No cases available to analyze modus operandi.")

    cases_text = ""
    for idx, case in enumerate(payload.cases):
        crime_num = case.crimeNumber or "N/A"
        crime_yr = f"/{case.crimeYear}" if case.crimeYear else ""
        ps_name = f" at {case.policeStationName}" if case.policeStationName else ""
        act_sec = f" (under {case.actSection})" if case.actSection else ""
        brief_text = case.brief or "No description provided."
        cases_text += f"Case {idx + 1}: Crime No. {crime_num}{crime_yr}{ps_name}{act_sec}\nNarrative/Brief: {brief_text}\n\n"

    system_prompt = (
        "You are an expert criminal intelligence analyst for the Kerala Police.\n"
        "Your task is to analyze the list of crime cases associated with a suspect and synthesize "
        "a consolidated, professional Modus Operandi (MO) signature description (1-2 paragraphs).\n"
        "Do not list the cases individually. Instead, summarize their common patterns, focusing on:\n"
        "1. Typical methods of execution (how they commit the crimes, entrance/exit strategies, tool preferences).\n"
        "2. Target/victim selection (who or what they target: e.g. locked houses during daytime, elderly victims, parked motorbikes).\n"
        "3. Geographic preferences or time patterns if discernible.\n"
        "4. Specific vehicles, methods of escape, or stolen property types preferred.\n\n"
        "Write in a formal, intelligence-report style. Keep the description focused, objective, and under 150 words.\n"
        "If the cases are too brief or contain insufficient info to determine a pattern, provide a best-effort summary of "
        "their crimes, but do not hallucinate."
    )

    msg = ChatMessage(role="user", content=cases_text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.2)
        return SynthesizeMOResponse(modus_operandi=response.content.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/suggest-sections", response_model=SectionSuggestionResponse)
async def assistant_suggest_sections(
    payload: RawTextRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SectionSuggestionResponse:
    """Suggest relevant legal sections (IPC/BNS) based on case descriptions."""
    _ = current_user
    system_prompt = (
        "You are a legal advisor assisting Indian Police officers.\n"
        "Analyze the incident description and suggest the most applicable sections from the Indian Penal Code (IPC) "
        "or Bharatiya Nyaya Sanhita (BNS).\n"
        "Return ONLY a JSON list of objects matching this structure:\n"
        "[\n"
        '  {"section": "IPC Section 379 / BNS Section 303", "explanation": "Brief reason why it applies"}\n'
        "]\n"
        "Do not include explanation text outside the JSON block. Do not include markdown code block backticks."
    )

    msg = ChatMessage(role="user", content=payload.text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.1)
        suggestions = _parse_llm_json(response.content)
        return SectionSuggestionResponse(suggestions=[SectionSuggestion(**s) for s in suggestions])
    except Exception as exc:
        logger.error("suggest_sections_failed", error=str(exc))
        # Graceful fallback: return empty list instead of crashing
        return SectionSuggestionResponse(suggestions=[])


@router.post("/transliterate", response_model=TransliterateResponse)
async def assistant_transliterate(
    payload: RawTextRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> TransliterateResponse:
    """Phonetically transliterate Malayalam script names or addresses into standard English."""
    _ = current_user
    system_prompt = (
        "You are an expert transliterator from Malayalam to English.\n"
        "Convert Malayalam script names, locations, or addresses to standard phonetic English text.\n"
        "Return ONLY the English text. Do not add explanations, conversational intros, or translation notes."
    )

    msg = ChatMessage(role="user", content=payload.text)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.0)
        return TransliterateResponse(transliteratedText=response.content.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/analyze-network", response_model=AnalyzeNetworkResponse)
async def assistant_analyze_network(
    payload: AnalyzeNetworkRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> AnalyzeNetworkResponse:
    """Analyze a network graph topology and provide a structured intelligence markdown briefing."""
    _ = current_user

    # Format nodes and edges list for Llama
    nodes_str = "\n".join([f"- {n.label} (ID: {n.id}, Kind: {n.node_kind})" for n in payload.nodes])
    edges_str = "\n".join([f"- {e.source} is linked to {e.target} as: {e.role}" for e in payload.edges])

    user_content = (
        f"Active Network Graph Topology:\n\n"
        f"NODES:\n{nodes_str}\n\n"
        f"EDGES/CONNECTIONS:\n{edges_str}\n"
    )

    system_prompt = (
        "You are a Senior Intelligence Analyst for the Kerala Police Intelligence Wing.\n"
        "Analyze the provided network graph topology and write a professional, structured intelligence briefing in markdown.\n\n"
        "The briefing should contain the following headings:\n"
        "### 1. Executive Summary\n"
        "A 2-3 sentence overview of the network size and threat scale.\n"
        "### 2. Key Influencers & Coordinators\n"
        "Identify nodes with the highest degree of centrality or influential roles (e.g. Handler, Financier).\n"
        "### 3. Structural Vulnerabilities (Chokepoints)\n"
        "Identify critical bridge nodes that connect separate sub-networks (cut-vertices).\n"
        "### 4. Actionable Recommendations\n"
        "Suggest target priorities and surveillance/interrogation coordinates based on the network structure.\n\n"
        "Maintain a highly formal, analytical tone.\n"
        f"{_response_language_instruction(payload.language)}"
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt)
        return AnalyzeNetworkResponse(analysis=response.content.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/explain-path", response_model=ExplainPathResponse)
async def assistant_explain_path(
    payload: ExplainPathRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ExplainPathResponse:
    """Explain how two suspects are connected through a multi-hop path."""
    _ = current_user

    path_desc = []
    for step in payload.path:
        if "role" in step:
            path_desc.append(f"connected via role: {step['role']}")
        else:
            path_desc.append(f"suspect: {step.get('label') or step.get('name')}")
    path_str = " -> ".join(path_desc)

    user_content = f"Path steps: {path_str}"
    system_prompt = (
        "You are an intelligence investigator. Summarize the following multi-hop link path into a "
        "clear, narrative explanation (2-3 sentences) suitable for an official report.\n"
        "Describe how the starting suspect is connected to the ending suspect through the intermediary contacts. "
        "Keep it highly factual and professional.\n"
        f"{_response_language_instruction(payload.language)}"
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.1)
        return ExplainPathResponse(explanation=response.content.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/suggest-missing-links", response_model=SuggestMissingLinksResponse)
async def assistant_suggest_missing_links(
    payload: SuggestMissingLinksRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SuggestMissingLinksResponse:
    """Analyze active graph and suggest potential missing roles or entities to search next."""
    _ = current_user

    nodes_str = ", ".join([f"{n.label} ({n.node_kind})" for n in payload.nodes])
    edges_str = ", ".join([f"{e.source} -> {e.target} ({e.role})" for e in payload.edges])

    user_content = f"Active network: Nodes: [{nodes_str}]. Edges: [{edges_str}]"
    system_prompt = (
        "You are an investigative assistant. Based on the provided network graph structure, identify what "
        "critical criminal syndicate roles appear to be missing or unrepresented in the current view "
        "(e.g., if there are multiple burglary suspects but no 'Financier' / 'Receiver of Stolen Property', "
        "or if there are field agents but no 'Handler').\n"
        "Provide exactly 3 bullet points suggesting specific roles/entities the analyst should investigate next. "
        "Return ONLY the 3 bullet points, nothing else.\n"
        f"{_response_language_instruction(payload.language)}"
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt)
        # Parse bullet points into list
        recommendations = [
            line.strip().lstrip("-*•").strip()
            for line in response.content.splitlines()
            if line.strip()
        ]
        return SuggestMissingLinksResponse(recommendations=recommendations[:3])
    except Exception as exc:
        logger.error("suggest_missing_links_failed", error=str(exc))
        return SuggestMissingLinksResponse(
            recommendations=[
                "Surveillance logs for main coordinators to trace physical meetings.",
                "Call details record (CDR) link analysis to identify shared hub numbers.",
                "Financial transaction audit of prime node to identify receivers of funds."
            ]
        )


@router.post("/filter-graph", response_model=FilterGraphResponse)
async def assistant_filter_graph(
    payload: FilterGraphRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FilterGraphResponse:
    """Filter network graph nodes based on a natural language query."""
    _ = current_user

    nodes_str = "\n".join([f"- ID: {n.id}, Name: {n.label} ({n.node_kind}), Criminal Name: {n.criminal_name or ''}" for n in payload.nodes])
    edges_str = "\n".join([f"- {e.source} -> {e.target} ({e.role})" for e in payload.edges])

    user_content = (
        f"Query: {payload.query}\n\n"
        f"NODES:\n{nodes_str}\n\n"
        f"EDGES:\n{edges_str}\n"
    )

    system_prompt = (
        "You are an expert intelligence database query assistant.\n"
        "Your task is to filter the provided nodes based on the natural language query.\n"
        "Analyze the node names, roles, or implied connections and return a list of node IDs that match the query criteria.\n"
        f"The analyst query may be in {'Malayalam' if payload.language == 'malayalam' else 'English'}; interpret it accordingly.\n"
        "Return ONLY a JSON list of strings containing the matching node IDs, with no markdown code blocks or additional text.\n"
        "Example output format:\n"
        '["node-id-1", "node-id-2"]'
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.0)
        matching_ids = _parse_llm_json(response.content)
        if not isinstance(matching_ids, list):
            matching_ids = []
        return FilterGraphResponse(matching_node_ids=[str(i) for i in matching_ids])
    except Exception as exc:
        logger.error("filter_graph_failed", error=str(exc))
        # Graceful fallback: return all node IDs so nothing is hidden if the LLM fails
        return FilterGraphResponse(matching_node_ids=[n.id for n in payload.nodes])


@router.post("/hotspot-brief", response_model=HotspotBriefResponse)
async def assistant_hotspot_brief(
    payload: HotspotBriefRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> HotspotBriefResponse:
    """Summarize current hotspot map results into an operational area brief."""
    _ = current_user

    point_lines = []
    for idx, point in enumerate(payload.points[:60], 1):
        point_lines.append(
            f"{idx}. {point.criminal_name} | District: {point.district or 'Unknown'} | "
            f"PS: {point.police_station or 'Unknown'} | Address: {point.address_kind or 'Unknown'} | "
            f"Cases: {point.case_count} | MO: {(point.modus_operandi or 'Not recorded').strip()[:220]}"
        )

    user_content = (
        f"HOTSPOT MAP CONTEXT\n"
        f"Search query: {payload.query or 'None'}\n"
        f"Address scope: {payload.address_scope}\n"
        f"Case scope: {payload.case_scope}\n"
        f"Total filtered points: {payload.point_count}\n"
        f"Visible points in current viewport: {payload.visible_count}\n"
        f"Districts in scope: {', '.join(payload.districts) or 'None'}\n"
        f"Police stations in scope: {', '.join(payload.police_stations) or 'None'}\n\n"
        f"POINT DETAILS:\n" + ("\n".join(point_lines) if point_lines else "No point details available.")
    )

    system_prompt = (
        "You are a Kerala Police hotspot analysis assistant.\n"
        "Read the filtered suspect hotspot data and produce a concise operational area brief in markdown.\n"
        "Use exactly these sections:\n"
        "### Area Pattern\n"
        "### Dominant Modus Operandi\n"
        "### Priority Attention Zones\n"
        "### Operational Recommendations\n"
        "Keep it factual, practical, and under 220 words. Use bullet points where useful.\n"
        "Do not invent exact crime events or unsupported statistics.\n"
        f"{_response_language_instruction(payload.language)}"
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat([msg], system_prompt=system_prompt, temperature=0.2)
        return HotspotBriefResponse(briefing=response.content.strip())
    except Exception as exc:
        logger.error("hotspot_brief_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hotspot briefing generation failed: {str(exc)}",
        ) from exc


@router.post("/humint-draft", response_model=HumintDraftResponse)
async def assistant_humint_draft(
    payload: HumintDraftRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> HumintDraftResponse:
    """Structure raw field HUMINT notes into a more usable report draft."""
    _ = current_user
    system_prompt = (
        "You are a Kerala Police field intelligence drafting assistant.\n"
        "Convert the raw HUMINT field note into a concise, structured intelligence submission.\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        "{\n"
        '  "title": "short operational title",\n'
        '  "summary": "2-3 sentence concise intelligence summary",\n'
        '  "structured_report": "markdown with sections: Subject, Summary, Key Observations, Possible Leads, Recommended Follow-up",\n'
        '  "report_type": "TIP|EVENT|FIELD_OBSERVATION|INTELLIGENCE_REPORT|FOLLOW_UP",\n'
        '  "urgency": "LOW|MEDIUM|HIGH|CRITICAL",\n'
        '  "entities": {"names": [], "phones": [], "vehicles": [], "places": [], "modus_hints": []}\n'
        "}\n"
        "Do not invent facts. If uncertain, keep the field conservative and use empty arrays."
    )
    user_content = (
        f"Preferred report type: {payload.report_type or 'Not specified'}\n"
        f"Location hint: {payload.location_text or 'Not specified'}\n\n"
        f"Raw narrative:\n{payload.narrative}"
    )
    try:
        response = await _llm_client.chat(
            [ChatMessage(role="user", content=user_content)],
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=1800,
        )
        data = _parse_llm_json(response.content)
        return HumintDraftResponse(**data)
    except Exception as exc:
        logger.error("humint_draft_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"HUMINT drafting failed: {str(exc)}",
        ) from exc


# ─── Threat Profiler Models ──────────────────────────────────────────────────

class CaseInfo(BaseModel):
    crime_number: str = ""
    crime_year: int | None = None
    police_station: str | None = None
    act_section: str | None = None
    brief: str | None = None
    present_status: str | None = None


class AssociateInfo(BaseModel):
    name: str
    association_type: str = ""
    occupation: str | None = None
    notes: str | None = None


class ThreatProfileRequest(BaseModel):
    suspect_name: str
    alias_name: str | None = None
    fathers_name: str | None = None
    gender: str | None = None
    age: str | None = None
    address: str | None = None
    cases: list[CaseInfo] = Field(default_factory=list)
    associates: list[AssociateInfo] = Field(default_factory=list)
    relatives: list[dict[str, Any]] = Field(default_factory=list)


class RiskScores(BaseModel):
    violence_propensity: int = 0
    recidivism_risk: int = 0
    network_influence: int = 0
    flight_risk: int = 0
    radicalization_potential: int = 0


class ThreatProfileResponse(BaseModel):
    criminal_psychology: str = ""
    mo_signature: str = ""
    escalation_trajectory: str = ""
    actionable_intelligence: str = ""
    risk_scores: RiskScores = Field(default_factory=RiskScores)
    threat_tier: str = "UNKNOWN"  # LOW / MODERATE / HIGH / CRITICAL


class CrossDossierRequest(BaseModel):
    mo_signature: str
    suspect_name: str
    suspect_id: str | None = None
    case_sections: list[str] = Field(default_factory=list)


class PatternMatch(BaseModel):
    suspect_name: str
    similarity_reason: str
    confidence: str = "MEDIUM"  # LOW / MEDIUM / HIGH


class CrossDossierResponse(BaseModel):
    pattern_matches: list[PatternMatch] = Field(default_factory=list)
    analysis_summary: str = ""


# ─── Threat Profiler Endpoints ───────────────────────────────────────────────

@router.post("/threat-profile", response_model=ThreatProfileResponse)
async def assistant_threat_profile(
    payload: ThreatProfileRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ThreatProfileResponse:
    """Generate a comprehensive criminal behavioral threat profile from dossier data."""
    _ = current_user

    # Build a rich context string from all dossier data
    cases_str = ""
    if payload.cases:
        case_lines = []
        for i, c in enumerate(payload.cases, 1):
            parts = [f"Case #{i}: {c.crime_number}"]
            if c.crime_year:
                parts.append(f"Year: {c.crime_year}")
            if c.police_station:
                parts.append(f"PS: {c.police_station}")
            if c.act_section:
                parts.append(f"Sections: {c.act_section}")
            if c.brief:
                parts.append(f"Brief: {c.brief}")
            if c.present_status:
                parts.append(f"Status: {c.present_status}")
            case_lines.append(" | ".join(parts))
        cases_str = "\n".join(case_lines)

    associates_str = ""
    if payload.associates:
        assoc_lines = []
        for a in payload.associates:
            parts = [f"{a.name} ({a.association_type})"]
            if a.occupation:
                parts.append(f"Occupation: {a.occupation}")
            if a.notes:
                parts.append(f"Notes: {a.notes}")
            assoc_lines.append(" | ".join(parts))
        associates_str = "\n".join(assoc_lines)

    relatives_str = ""
    if payload.relatives:
        rel_lines = []
        for r in payload.relatives:
            name = r.get("name", "Unknown")
            relation = r.get("relation", "")
            rel_lines.append(f"{name} ({relation})")
        relatives_str = ", ".join(rel_lines)

    user_content = (
        f"SUSPECT DOSSIER FOR THREAT PROFILING:\n\n"
        f"Name: {payload.suspect_name}\n"
        f"Alias: {payload.alias_name or 'None'}\n"
        f"Father's Name: {payload.fathers_name or 'Unknown'}\n"
        f"Gender: {payload.gender or 'Unknown'}\n"
        f"Age: {payload.age or 'Unknown'}\n"
        f"Address: {payload.address or 'Unknown'}\n\n"
        f"CRIMINAL CASE HISTORY ({len(payload.cases)} cases):\n{cases_str or 'No cases on record.'}\n\n"
        f"KNOWN ASSOCIATES ({len(payload.associates)}):\n{associates_str or 'None documented.'}\n\n"
        f"RELATIVES: {relatives_str or 'None documented.'}\n"
    )

    system_prompt = (
        "You are a Senior Criminal Intelligence Analyst and Behavioral Profiler for the Kerala Police Intelligence Wing.\n"
        "Analyze the provided suspect dossier data and generate a COMPREHENSIVE threat profile.\n\n"
        "Return ONLY a valid JSON object with exactly these keys:\n"
        "{\n"
        '  "criminal_psychology": "2-3 paragraphs analyzing behavioral patterns, likely motivations, personality indicators inferred from crime types, associate network, and personal background. Be specific and analytical.",\n'
        '  "mo_signature": "A detailed modus operandi signature: the suspect\'s typical crime execution method, target selection, geographic preferences, time patterns, tools/methods used. Derive this from the case briefs.",\n'
        '  "escalation_trajectory": "Analysis of whether crimes show escalation over time (petty → organized → violent). If multiple cases exist, describe the arc. If single case, describe potential trajectory.",\n'
        '  "actionable_intelligence": "3-5 specific, actionable surveillance/investigation recommendations. Include CDR analysis targets, physical surveillance suggestions, financial transaction audits, or specific informant deployment strategies.",\n'
        '  "risk_scores": {\n'
        '    "violence_propensity": <0-100>,\n'
        '    "recidivism_risk": <0-100>,\n'
        '    "network_influence": <0-100>,\n'
        '    "flight_risk": <0-100>,\n'
        '    "radicalization_potential": <0-100>\n'
        "  },\n"
        '  "threat_tier": "LOW" | "MODERATE" | "HIGH" | "CRITICAL"\n'
        "}\n\n"
        "SCORING GUIDE:\n"
        "- violence_propensity: Based on violent crime history, weapons involvement, assault charges\n"
        "- recidivism_risk: Based on repeat offenses, case status (absconding vs. convicted), pattern frequency\n"
        "- network_influence: Based on associate count, handler/financier roles, syndicate indicators\n"
        "- flight_risk: Based on absconding status, multiple addresses, cross-state connections\n"
        "- radicalization_potential: Based on extremism indicators, ideology-linked crimes, propaganda involvement\n\n"
        "CRITICAL: Return ONLY raw JSON. No markdown code blocks, no explanations, no prefix text."
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat(
            [msg], system_prompt=system_prompt, temperature=0.2, max_tokens=4096
        )
        data = _parse_llm_json(response.content)

        # Standardize and clean any fields that might be lists of strings instead of single strings
        for key in ("criminal_psychology", "mo_signature", "escalation_trajectory", "actionable_intelligence"):
            val = data.get(key)
            if isinstance(val, list):
                data[key] = "\n".join(
                    f"- {item}" if not str(item).strip().startswith("-") else str(item)
                    for item in val
                )
            elif val is None:
                data[key] = ""
            else:
                data[key] = str(val)

        # Clamp risk scores to 0–100 range
        risk = data.get("risk_scores", {})
        for key in ("violence_propensity", "recidivism_risk", "network_influence", "flight_risk", "radicalization_potential"):
            if key in risk:
                risk[key] = max(0, min(100, int(risk[key])))

        return ThreatProfileResponse(**data)
    except Exception as exc:
        logger.error("threat_profile_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Threat profile generation failed: {str(exc)}",
        ) from exc


@router.post("/cross-dossier-patterns", response_model=CrossDossierResponse)
async def assistant_cross_dossier_patterns(
    payload: CrossDossierRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CrossDossierResponse:
    """Analyze MO signature and identify potential suspects with similar criminal patterns."""
    _ = current_user

    sections_str = ", ".join(payload.case_sections) if payload.case_sections else "None specified"

    user_content = (
        f"CROSS-DOSSIER PATTERN ANALYSIS REQUEST:\n\n"
        f"Primary Suspect: {payload.suspect_name}\n"
        f"Modus Operandi Signature:\n{payload.mo_signature}\n\n"
        f"Legal Sections Involved: {sections_str}\n\n"
        "Based on this MO signature, what type of criminals would share similar patterns? "
        "Generate 3-5 hypothetical but realistic pattern matches that an intelligence analyst "
        "should investigate in the suspect database."
    )

    system_prompt = (
        "You are an expert criminal pattern analyst for Indian Police intelligence.\n"
        "Based on the provided modus operandi signature, generate hypothetical but REALISTIC "
        "pattern matches that could exist in a suspect dossier database.\n\n"
        "Return ONLY a valid JSON object:\n"
        "{\n"
        '  "pattern_matches": [\n'
        "    {\n"
        '      "suspect_name": "Hypothetical suspect type/profile description (e.g. \'Unidentified burglary ring operator in Ernakulam district\')",\n'
        '      "similarity_reason": "Specific reason why this profile matches the MO (shared methods, geographic overlap, temporal patterns, tool usage)",\n'
        '      "confidence": "LOW" | "MEDIUM" | "HIGH"\n'
        "    }\n"
        "  ],\n"
        '  "analysis_summary": "2-3 sentence summary of the broader criminal pattern and what investigative strategies would help identify matching suspects in the database."\n'
        "}\n\n"
        "CRITICAL: Return ONLY raw JSON. No markdown code blocks."
    )

    msg = ChatMessage(role="user", content=user_content)
    try:
        response = await _llm_client.chat(
            [msg], system_prompt=system_prompt, temperature=0.3
        )
        data = _parse_llm_json(response.content)
        return CrossDossierResponse(**data)
    except Exception as exc:
        logger.error("cross_dossier_patterns_failed", error=str(exc))
        return CrossDossierResponse(
            pattern_matches=[],
            analysis_summary="Pattern analysis could not be completed. Please retry.",
        )
