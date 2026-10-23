# main.py

import asyncio
import json
import logging
import queue
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pipeline import run_research_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mr. Jitesh Multi-Agent Research API",
    description="Research report generation using Search, Reader, Writer and Critic.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5500",   # Live Server
        "http://localhost:5500",   # Live Server
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=500)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/v1/research")
def research(request: ResearchRequest):
    """Return the complete research workflow as JSON."""
    try:
        result = run_research_pipeline(request.topic.strip())

        return {
            "success": True,
            "topic": request.topic.strip(),
            "search_results": result.get("search_results", ""),
            "scraped_content": result.get("scraped_content", ""),
            "report": result.get("report", ""),
            "critic_feedback": result.get("feedback", ""),
        }

    except Exception as exc:
        logger.exception("Research pipeline failed")
        raise HTTPException(
            status_code=500,
            detail="Research generation failed. Check server logs and API configuration.",
        ) from exc


@app.post("/api/v1/research/stream")
async def research_stream(request: ResearchRequest):
    """Stream workflow progress using Server-Sent Events."""
    events = queue.Queue()
    finished = object()

    def publish(event, data):
        events.put({"event": event, "data": data})

    def worker():
        try:
            publish("progress", {
                "stage": "research",
                "status": "started",
                "message": "Research workflow started.",
            })

            result = run_research_pipeline(request.topic.strip())

            for stage in ["search", "reader", "writer", "critic"]:
                publish("progress", {
                    "stage": stage,
                    "status": "completed",
                })

            publish("result", {
                "success": True,
                "topic": request.topic.strip(),
                "search_results": result.get("search_results", ""),
                "scraped_content": result.get("scraped_content", ""),
                "report": result.get("report", ""),
                "critic_feedback": result.get("feedback", ""),
            })

        except Exception:
            logger.exception("Streaming research pipeline failed")
            publish("error", {
                "message": "Research generation failed. Check server logs."
            })

        finally:
            events.put(finished)

    threading.Thread(target=worker, daemon=True).start()

    async def event_generator():
        while True:
            try:
                event = await asyncio.to_thread(events.get, True, 15)
            except queue.Empty:
                yield "event: ping\ndata: {}\n\n"
                continue

            if event is finished:
                break

            yield (
                f"event: {event['event']}\n"
                f"data: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )