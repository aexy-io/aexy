"""Planning Poker WebSocket API for real-time estimation sessions."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import async_session_maker, get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.sprint import Sprint, SprintTask, SprintPlanningSession
from aexy.services.sprint_service import SprintService
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.workspace_service import WorkspaceService


class AddTasksRequest(BaseModel):
    task_ids: list[str]

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Planning Poker"])


class PlanningPokerManager:
    """Manages WebSocket connections for planning poker sessions."""

    def __init__(self):
        # session_id -> list of (websocket, user_info)
        self.active_connections: dict[str, list[tuple[WebSocket, dict]]] = {}
        # session_id -> poker state
        self.sessions: dict[str, dict] = {}

    async def connect(
        self, websocket: WebSocket, session_id: str, user_info: dict
    ) -> None:
        await websocket.accept()

        if session_id not in self.active_connections:
            self.active_connections[session_id] = []

        self.active_connections[session_id].append((websocket, user_info))

        # Add participant to session state
        if session_id in self.sessions:
            user_id = user_info.get("id", "")
            self.sessions[session_id]["participants"][user_id] = {
                "id": user_id,
                "name": user_info.get("name", "Unknown"),
                "avatar_url": user_info.get("avatar_url"),
                "has_voted": False,
            }

        await self.broadcast(session_id, {
            "type": "participant_joined",
            "user": user_info,
            "participants": self._get_participants(session_id),
        })

        logger.info(f"User {user_info.get('name')} joined poker session {session_id}")

    def disconnect(self, websocket: WebSocket) -> str | None:
        for session_id, connections in self.active_connections.items():
            for ws, info in connections:
                if ws == websocket:
                    self.active_connections[session_id] = [
                        (w, i) for w, i in connections if w != websocket
                    ]
                    user_id = info.get("id", "")
                    if session_id in self.sessions:
                        self.sessions[session_id]["participants"].pop(user_id, None)

                    if not self.active_connections[session_id]:
                        del self.active_connections[session_id]

                    return session_id
        return None

    async def broadcast(
        self, session_id: str, message: dict, exclude: WebSocket | None = None
    ) -> None:
        if session_id not in self.active_connections:
            return

        disconnected = []
        for websocket, _ in self.active_connections[session_id]:
            if websocket == exclude:
                continue
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)

        for ws in disconnected:
            self.active_connections[session_id] = [
                (w, i) for w, i in self.active_connections[session_id] if w != ws
            ]

    def create_session(self, session_id: str, sprint_id: str, task_ids: list[str]) -> dict:
        self.sessions[session_id] = {
            "id": session_id,
            "sprint_id": sprint_id,
            "task_ids": task_ids,
            "current_task_index": 0,
            "current_task_id": task_ids[0] if task_ids else None,
            "votes": {},
            "revealed": False,
            "participants": {},
            "results": [],  # Finalized votes per task
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return self.sessions[session_id]

    def _get_participants(self, session_id: str) -> list[dict]:
        if session_id not in self.sessions:
            return []
        return list(self.sessions[session_id]["participants"].values())

    def get_state(self, session_id: str) -> dict | None:
        session = self.sessions.get(session_id)
        if not session:
            return None

        state = {
            "session_id": session["id"],
            "sprint_id": session["sprint_id"],
            "current_task_id": session["current_task_id"],
            "current_task_index": session["current_task_index"],
            "total_tasks": len(session["task_ids"]),
            "revealed": session["revealed"],
            "participants": self._get_participants(session_id),
            "results": session["results"],
        }

        if session["revealed"]:
            state["votes"] = session["votes"]
        else:
            # Only show who has voted, not their values
            state["voted_users"] = list(session["votes"].keys())

        return state


# Singleton manager
poker_manager = PlanningPokerManager()


@router.post("/sprints/{sprint_id}/planning-poker/start")
async def start_poker_session(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Start a new planning poker session for a sprint."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    # Get unestimated tasks (no story points)
    task_service = SprintTaskService(db)
    tasks = await task_service.get_sprint_tasks(sprint_id)
    unestimated = [t for t in tasks if t.story_points is None or t.story_points == 0]

    if not unestimated:
        # Fall back to all non-done tasks
        unestimated = [t for t in tasks if t.status != "done"]

    task_ids = [str(t.id) for t in unestimated]
    task_info = [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "priority": t.priority,
            "task_type": t.task_type,
            "labels": t.labels or [],
            "story_points": t.story_points,
            "status": t.status,
        }
        for t in unestimated
    ]

    session_id = str(uuid4())

    # Create a planning session record
    planning_session = SprintPlanningSession(
        id=session_id,
        sprint_id=sprint_id,
        status="active",
        started_at=datetime.now(timezone.utc),
        participants=[{
            "id": str(current_user.id),
            "name": current_user.name,
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }],
        decisions_log=[],
    )
    db.add(planning_session)
    await db.commit()

    # Create in-memory session
    poker_manager.create_session(session_id, sprint_id, task_ids)

    return {
        "session_id": session_id,
        "sprint_id": sprint_id,
        "tasks": task_info,
        "total_tasks": len(task_ids),
    }


@router.get("/sprints/{sprint_id}/planning-poker/{session_id}")
async def get_poker_session_state(
    sprint_id: str,
    session_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get current state of a planning poker session."""
    state = poker_manager.get_state(session_id)
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return state


@router.websocket("/sprints/{sprint_id}/planning-poker/{session_id}/ws")
async def poker_websocket(
    websocket: WebSocket,
    sprint_id: str,
    session_id: str,
    token: str = Query(default=""),
    user_id: str = Query(default=""),
    user_name: str = Query(default="Anonymous"),
):
    """WebSocket endpoint for planning poker real-time interaction."""
    user_info = {
        "id": user_id,
        "name": user_name,
    }

    await poker_manager.connect(websocket, session_id, user_info)

    # Send current state on connect
    state = poker_manager.get_state(session_id)
    if state:
        await websocket.send_json({"type": "state", **state})

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            session = poker_manager.sessions.get(session_id)
            if not session:
                await websocket.send_json({"type": "error", "message": "Session not found"})
                continue

            if msg_type == "vote":
                # Record vote
                vote_value = data.get("value")  # number or "?"
                session["votes"][user_id] = vote_value

                # Mark participant as voted
                if user_id in session["participants"]:
                    session["participants"][user_id]["has_voted"] = True

                # Broadcast that someone voted (not the value)
                await poker_manager.broadcast(session_id, {
                    "type": "vote_cast",
                    "user_id": user_id,
                    "user_name": user_name,
                    "voted_users": list(session["votes"].keys()),
                    "participants": poker_manager._get_participants(session_id),
                })

            elif msg_type == "reveal":
                # Reveal all votes
                session["revealed"] = True
                votes = session["votes"]

                # Calculate statistics
                numeric_votes = [v for v in votes.values() if isinstance(v, (int, float)) and v != "?"]
                avg = sum(numeric_votes) / len(numeric_votes) if numeric_votes else 0
                consensus = len(set(numeric_votes)) == 1 if numeric_votes else False

                await poker_manager.broadcast(session_id, {
                    "type": "votes_revealed",
                    "votes": votes,
                    "stats": {
                        "average": round(avg, 1),
                        "min": min(numeric_votes) if numeric_votes else 0,
                        "max": max(numeric_votes) if numeric_votes else 0,
                        "consensus": consensus,
                    },
                    "participants": poker_manager._get_participants(session_id),
                })

            elif msg_type == "reset":
                # Reset votes for current task (re-vote)
                session["votes"] = {}
                session["revealed"] = False
                for pid in session["participants"]:
                    session["participants"][pid]["has_voted"] = False

                await poker_manager.broadcast(session_id, {
                    "type": "votes_reset",
                    "current_task_id": session["current_task_id"],
                    "participants": poker_manager._get_participants(session_id),
                })

            elif msg_type == "final_estimate":
                # Accept final estimate for current task
                final_value = data.get("value")
                task_id = session["current_task_id"]

                # Record result
                session["results"].append({
                    "task_id": task_id,
                    "votes": dict(session["votes"]),
                    "final_estimate": final_value,
                    "at": datetime.now(timezone.utc).isoformat(),
                })

                await poker_manager.broadcast(session_id, {
                    "type": "estimate_accepted",
                    "task_id": task_id,
                    "final_estimate": final_value,
                })

            elif msg_type == "next_task":
                # Move to next task
                idx = session["current_task_index"] + 1
                if idx < len(session["task_ids"]):
                    session["current_task_index"] = idx
                    session["current_task_id"] = session["task_ids"][idx]
                    session["votes"] = {}
                    session["revealed"] = False
                    for pid in session["participants"]:
                        session["participants"][pid]["has_voted"] = False

                    await poker_manager.broadcast(session_id, {
                        "type": "next_task",
                        "current_task_id": session["current_task_id"],
                        "current_task_index": idx,
                        "total_tasks": len(session["task_ids"]),
                        "participants": poker_manager._get_participants(session_id),
                    })
                else:
                    await poker_manager.broadcast(session_id, {
                        "type": "session_complete",
                        "results": session["results"],
                    })

            elif msg_type == "add_task":
                # Add a task to the session (existing task by ID or ad-hoc by title)
                task_id = data.get("task_id")
                title = data.get("title")

                if task_id:
                    # Guard against duplicates
                    if task_id in session["task_ids"]:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Task already in session",
                        })
                        continue

                    # Load task from DB
                    async with async_session_maker() as db:
                        task_service = SprintTaskService(db)
                        task = await task_service.get_task(task_id)
                        if not task:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Task not found",
                            })
                            continue

                        session["task_ids"].append(task_id)

                        # If session had no tasks, set current
                        if session["current_task_id"] is None:
                            session["current_task_id"] = task_id
                            session["current_task_index"] = 0

                        await poker_manager.broadcast(session_id, {
                            "type": "task_added",
                            "task": {
                                "id": str(task.id),
                                "title": task.title,
                                "description": task.description,
                                "priority": task.priority,
                                "task_type": task.task_type,
                                "labels": task.labels or [],
                                "story_points": task.story_points,
                                "status": task.status,
                            },
                            "total_tasks": len(session["task_ids"]),
                        })

                elif title:
                    # Create ad-hoc task in the sprint
                    async with async_session_maker() as db:
                        sprint_service = SprintService(db)
                        sprint = await sprint_service.get_sprint(session["sprint_id"])
                        if not sprint:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Sprint not found",
                            })
                            continue

                        new_task = SprintTask(
                            sprint_id=session["sprint_id"],
                            team_id=sprint.team_id,
                            workspace_id=sprint.workspace_id,
                            source_type="manual",
                            source_id=f"poker-{session_id}-{len(session['task_ids'])}",
                            title=title,
                            status="backlog",
                        )
                        db.add(new_task)
                        await db.commit()
                        await db.refresh(new_task)

                        new_id = str(new_task.id)
                        session["task_ids"].append(new_id)

                        if session["current_task_id"] is None:
                            session["current_task_id"] = new_id
                            session["current_task_index"] = 0

                        await poker_manager.broadcast(session_id, {
                            "type": "task_added",
                            "task": {
                                "id": new_id,
                                "title": new_task.title,
                                "description": new_task.description,
                                "priority": new_task.priority,
                                "task_type": new_task.task_type,
                                "labels": new_task.labels or [],
                                "story_points": new_task.story_points,
                                "status": new_task.status,
                            },
                            "total_tasks": len(session["task_ids"]),
                        })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Provide task_id or title",
                    })

            elif msg_type == "chat":
                # Broadcast chat message to all participants
                text = data.get("text", "").strip()
                if text:
                    await poker_manager.broadcast(session_id, {
                        "type": "chat",
                        "user_id": user_id,
                        "user_name": user_name,
                        "text": text,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

    except WebSocketDisconnect:
        doc_id = poker_manager.disconnect(websocket)
        if doc_id:
            await poker_manager.broadcast(doc_id, {
                "type": "participant_left",
                "user_id": user_id,
                "user_name": user_name,
                "participants": poker_manager._get_participants(doc_id),
            })


@router.get("/sprints/{sprint_id}/planning-poker/{session_id}/available-tasks")
async def get_available_tasks(
    sprint_id: str,
    session_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks that can be added to this poker session (not already in session)."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    session = poker_manager.sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    existing_ids = set(session["task_ids"])

    # Get tasks from the same team: both sprint tasks and backlog tasks
    stmt = (
        select(SprintTask)
        .where(
            and_(
                SprintTask.team_id == sprint.team_id,
                SprintTask.status.notin_(["done"]),
                SprintTask.is_archived == False,
            )
        )
        .order_by(SprintTask.priority.desc(), SprintTask.created_at)
    )
    result = await db.execute(stmt)
    all_tasks = result.scalars().all()

    available = [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "story_points": t.story_points,
            "sprint_id": t.sprint_id,
        }
        for t in all_tasks
        if str(t.id) not in existing_ids
    ]

    return {"tasks": available, "total": len(available)}


@router.post("/sprints/{sprint_id}/planning-poker/{session_id}/add-tasks")
async def add_tasks_to_session(
    sprint_id: str,
    session_id: str,
    body: AddTasksRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk add tasks to an active poker session."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    session = poker_manager.sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    existing_ids = set(session["task_ids"])
    new_task_ids = [tid for tid in body.task_ids if tid not in existing_ids]

    if not new_task_ids:
        return {"added": [], "total_tasks": len(session["task_ids"])}

    # Load and validate tasks
    task_service = SprintTaskService(db)
    added = []
    for tid in new_task_ids:
        task = await task_service.get_task(tid)
        if task:
            session["task_ids"].append(tid)
            added.append({
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
            })

    # Set current task if session was empty
    if session["current_task_id"] is None and session["task_ids"]:
        session["current_task_id"] = session["task_ids"][0]
        session["current_task_index"] = 0

    # Broadcast to all connected clients
    for task_info in added:
        await poker_manager.broadcast(session_id, {
            "type": "task_added",
            "task": task_info,
            "total_tasks": len(session["task_ids"]),
        })

    return {"added": added, "total_tasks": len(session["task_ids"])}


@router.post("/sprints/{sprint_id}/planning-poker/{session_id}/finalize")
async def finalize_poker_session(
    sprint_id: str,
    session_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Finalize poker session - write all estimates to tasks and close session."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "member"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    session = poker_manager.sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Write estimates to tasks
    task_service = SprintTaskService(db)
    updated_tasks = []

    for result in session["results"]:
        task_id = result["task_id"]
        final_estimate = result.get("final_estimate")

        if final_estimate is not None and isinstance(final_estimate, (int, float)):
            task = await task_service.get_task(task_id)
            if task:
                task.story_points = int(final_estimate)
                updated_tasks.append({
                    "task_id": task_id,
                    "title": task.title,
                    "story_points": int(final_estimate),
                })

    # Update planning session record
    stmt = select(SprintPlanningSession).where(SprintPlanningSession.id == session_id)
    result = await db.execute(stmt)
    planning_session = result.scalar_one_or_none()

    if planning_session:
        planning_session.status = "completed"
        planning_session.ended_at = datetime.now(timezone.utc)
        decisions = list(planning_session.decisions_log or [])
        for r in session["results"]:
            decisions.append({
                "action": "poker_vote",
                "task_id": r["task_id"],
                "votes": r["votes"],
                "final": r["final_estimate"],
                "at": r["at"],
            })
        planning_session.decisions_log = decisions

    await db.commit()

    # Clean up in-memory session
    poker_manager.sessions.pop(session_id, None)
    poker_manager.active_connections.pop(session_id, None)

    return {
        "finalized": True,
        "updated_tasks": updated_tasks,
        "total_estimated": len(updated_tasks),
    }
