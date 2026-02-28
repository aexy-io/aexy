"""API endpoints for AI Agents."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.workspace_service import WorkspaceService
from aexy.services.agent_service import AgentService
from aexy.services.writing_style_service import WritingStyleService
from aexy.services.agent_email_service import AgentEmailService
from aexy.schemas.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentExecuteRequest,
    AgentExecutionResponse,
    AgentToolInfo,
    AgentMetricsResponse,
    HandleAvailabilityResponse,
    WritingStyleResponse,
    GenerateEmailRequest,
    GenerateEmailResponse,
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationWithMessagesResponse,
    MessageCreate,
    MessageResponse,
    # Email/Inbox schemas
    EmailDomainResponse,
    EmailDomainsListResponse,
    EmailEnableRequest,
    EmailEnableResponse,
    InboxMessageResponse,
    InboxReplyRequest,
    InboxEscalateRequest,
    InboxActionResponse,
    EmailRoutingRuleCreate,
    EmailRoutingRuleResponse,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/crm/agents")
writing_style_router = APIRouter(prefix="/workspaces/{workspace_id}/crm/writing-style")


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# AGENT CRUD
# =============================================================================


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    workspace_id: str,
    agent_type: str | None = None,
    is_active: bool | None = None,
    include_system: bool = True,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List agents in a workspace."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    # Ensure system agents exist
    await service.ensure_system_agents(workspace_id)

    agents = await service.list_agents(
        workspace_id=workspace_id,
        agent_type=agent_type,
        is_active=is_active,
        include_system=include_system,
        skip=skip,
        limit=limit,
    )
    return agents


@router.post("", response_model=AgentResponse)
async def create_agent(
    workspace_id: str,
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a custom agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)

    # Check handle availability if provided
    if data.mention_handle:
        is_available = await service.check_handle_available(
            workspace_id=workspace_id,
            handle=data.mention_handle,
        )
        if not is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Handle @{data.mention_handle} is already in use",
            )

    # Convert working_hours Pydantic model to dict if provided
    working_hours_dict = data.working_hours.model_dump() if data.working_hours else None

    agent = await service.create_agent(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        agent_type=data.agent_type,
        mention_handle=data.mention_handle,
        goal=data.goal,
        system_prompt=data.system_prompt,
        custom_instructions=data.custom_instructions,
        tools=data.tools,
        llm_provider=data.llm_provider,
        model=data.model,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        max_iterations=data.max_iterations,
        timeout_seconds=data.timeout_seconds,
        confidence_threshold=data.confidence_threshold,
        require_approval_below=data.require_approval_below,
        max_daily_responses=data.max_daily_responses,
        response_delay_minutes=data.response_delay_minutes,
        working_hours=working_hours_dict,
        escalation_email=data.escalation_email,
        escalation_slack_channel=data.escalation_slack_channel,
        created_by_id=current_developer.id,
    )
    await db.commit()
    return agent


@router.get("/tools", response_model=list[AgentToolInfo])
async def list_available_tools(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List all available tools for agent configuration."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    return AgentService.get_available_tools()


@router.get("/check-handle", response_model=HandleAvailabilityResponse)
async def check_handle_availability(
    workspace_id: str,
    handle: str = Query(..., min_length=1, max_length=50),
    exclude_agent_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Check if a mention handle is available."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    is_available = await service.check_handle_available(
        workspace_id=workspace_id,
        handle=handle,
        exclude_agent_id=exclude_agent_id,
    )
    return HandleAvailabilityResponse(
        available=is_available,
        handle=handle,
        message=None if is_available else f"Handle @{handle} is already in use",
    )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get an agent by ID."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    workspace_id: str,
    agent_id: str,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True)
    agent = await service.update_agent(
        agent_id, changed_by_id=str(current_developer.id), **update_data
    )
    if not agent:
        raise HTTPException(status_code=400, detail="Cannot modify system agent")

    await db.commit()
    return agent


@router.delete("/{agent_id}")
async def delete_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    success = await service.delete_agent(agent_id, changed_by_id=str(current_developer.id))
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete system agent")

    await db.commit()
    return {"message": "Agent deleted"}


@router.post("/{agent_id}/toggle", response_model=AgentResponse)
async def toggle_agent(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Toggle agent active status."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = await service.toggle_agent(agent_id, changed_by_id=str(current_developer.id))
    await db.commit()
    return agent


@router.get("/{agent_id}/metrics", response_model=AgentMetricsResponse)
async def get_agent_metrics(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get metrics for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    metrics = await service.get_agent_metrics(agent_id)
    return metrics


# =============================================================================
# AGENT EXECUTION
# =============================================================================


@router.post("/{agent_id}/run", response_model=AgentExecutionResponse)
async def execute_agent(
    workspace_id: str,
    agent_id: str,
    data: AgentExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Execute an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        execution = await service.execute_agent(
            agent_id=agent_id,
            record_id=data.record_id,
            context=data.context,
            user_id=current_developer.id,
            triggered_by="manual",
        )
        await db.commit()
        return execution
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{agent_id}/executions", response_model=list[AgentExecutionResponse])
async def list_agent_executions(
    workspace_id: str,
    agent_id: str,
    status: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List executions for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    executions = await service.list_executions(
        agent_id=agent_id,
        status=status,
        skip=skip,
        limit=limit,
    )
    return executions


@router.get("/{agent_id}/executions/{execution_id}", response_model=AgentExecutionResponse)
async def get_execution(
    workspace_id: str,
    agent_id: str,
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a specific execution."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)
    execution = await service.get_execution(execution_id)
    if not execution or execution.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


# =============================================================================
# CONVERSATIONS
# =============================================================================


@router.post("/{agent_id}/conversations", response_model=ConversationWithMessagesResponse)
async def create_conversation(
    workspace_id: str,
    agent_id: str,
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Start a new conversation with an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        conversation, user_message, execution = await service.create_conversation(
            agent_id=agent_id,
            workspace_id=workspace_id,
            initial_message=data.message,
            record_id=data.record_id,
            title=data.title,
            user_id=str(current_developer.id),
        )
        await db.commit()

        # Refresh to get messages
        await db.refresh(conversation)
        messages = await service.get_conversation_messages(conversation.id)

        return ConversationWithMessagesResponse(
            id=conversation.id,
            workspace_id=conversation.workspace_id,
            agent_id=conversation.agent_id,
            record_id=conversation.record_id,
            title=conversation.title,
            status=conversation.status,
            conversation_metadata=conversation.conversation_metadata,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            ended_at=conversation.ended_at,
            message_count=len(messages),
            messages=[MessageResponse.model_validate(m) for m in messages],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{agent_id}/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    workspace_id: str,
    agent_id: str,
    status: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List conversations for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    conversations = await service.list_conversations(
        agent_id=agent_id,
        status=status,
        skip=skip,
        limit=limit,
    )

    # Get message counts
    result = []
    for conv in conversations:
        messages = await service.get_conversation_messages(conv.id, limit=1000)
        result.append(ConversationResponse(
            id=conv.id,
            workspace_id=conv.workspace_id,
            agent_id=conv.agent_id,
            record_id=conv.record_id,
            title=conv.title,
            status=conv.status,
            conversation_metadata=conv.conversation_metadata,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            ended_at=conv.ended_at,
            message_count=len(messages),
        ))

    return result


@router.get("/{agent_id}/conversations/{conversation_id}", response_model=ConversationWithMessagesResponse)
async def get_conversation(
    workspace_id: str,
    agent_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a conversation with messages."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    conversation = await service.get_conversation(conversation_id)
    if not conversation or conversation.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await service.get_conversation_messages(conversation_id)

    return ConversationWithMessagesResponse(
        id=conversation.id,
        workspace_id=conversation.workspace_id,
        agent_id=conversation.agent_id,
        record_id=conversation.record_id,
        title=conversation.title,
        status=conversation.status,
        conversation_metadata=conversation.conversation_metadata,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        ended_at=conversation.ended_at,
        message_count=len(messages),
        messages=[MessageResponse.model_validate(m) for m in messages],
    )


@router.post("/{agent_id}/conversations/{conversation_id}/messages", response_model=ConversationWithMessagesResponse)
async def send_message(
    workspace_id: str,
    agent_id: str,
    conversation_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Send a message in a conversation."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    conversation = await service.get_conversation(conversation_id)
    if not conversation or conversation.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        user_message, execution = await service.send_message(
            conversation_id=conversation_id,
            content=data.content,
            user_id=str(current_developer.id),
        )
        await db.commit()

        # Refresh conversation and get all messages
        conversation = await service.get_conversation(conversation_id)
        messages = await service.get_conversation_messages(conversation_id)

        return ConversationWithMessagesResponse(
            id=conversation.id,
            workspace_id=conversation.workspace_id,
            agent_id=conversation.agent_id,
            record_id=conversation.record_id,
            title=conversation.title,
            status=conversation.status,
            conversation_metadata=conversation.conversation_metadata,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            ended_at=conversation.ended_at,
            message_count=len(messages),
            messages=[MessageResponse.model_validate(m) for m in messages],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{agent_id}/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    workspace_id: str,
    agent_id: str,
    conversation_id: str,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a conversation (title, status)."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    conversation = await service.get_conversation(conversation_id)
    if not conversation or conversation.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = await service.update_conversation(
        conversation_id=conversation_id,
        title=data.title,
        status=data.status,
    )
    await db.commit()

    messages = await service.get_conversation_messages(conversation_id)

    return ConversationResponse(
        id=conversation.id,
        workspace_id=conversation.workspace_id,
        agent_id=conversation.agent_id,
        record_id=conversation.record_id,
        title=conversation.title,
        status=conversation.status,
        conversation_metadata=conversation.conversation_metadata,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        ended_at=conversation.ended_at,
        message_count=len(messages),
    )


@router.delete("/{agent_id}/conversations/{conversation_id}")
async def delete_conversation(
    workspace_id: str,
    agent_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Archive/delete a conversation."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = AgentService(db)

    conversation = await service.get_conversation(conversation_id)
    if not conversation or conversation.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    success = await service.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete conversation")

    await db.commit()
    return {"message": "Conversation archived"}


# =============================================================================
# WRITING STYLE
# =============================================================================


@writing_style_router.get("", response_model=WritingStyleResponse | None)
async def get_writing_style(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get the current user's writing style profile."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    style = await service.get_style(str(current_developer.id), workspace_id)
    return style


@writing_style_router.post("/analyze", response_model=WritingStyleResponse)
async def analyze_writing_style(
    workspace_id: str,
    max_samples: int = Query(default=50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Analyze user's sent emails to build a writing style profile."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    style = await service.analyze_emails(
        developer_id=str(current_developer.id),
        workspace_id=workspace_id,
        max_samples=max_samples,
    )
    await db.commit()
    return style


@writing_style_router.post("/generate-email", response_model=GenerateEmailResponse)
async def generate_email(
    workspace_id: str,
    data: GenerateEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Generate an email matching the user's writing style."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))
    service = WritingStyleService(db)
    result = await service.generate_email(
        developer_id=str(current_developer.id),
        workspace_id=workspace_id,
        recipient_name=data.recipient_name,
        purpose=data.purpose,
        key_points=data.key_points,
        tone_override=data.tone_override,
    )
    return GenerateEmailResponse(**result)


# =============================================================================
# AGENT EMAIL INTEGRATION (uses Mailagent microservice)
# =============================================================================


@router.get("/email/domains", response_model=EmailDomainsListResponse)
async def list_email_domains(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List available email domains for agent email addresses.

    Returns verified domains from email infrastructure settings plus the default aexy.email domain.
    Only verified domains from /email-marketing/settings are included.
    """
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    from aexy.services.domain_service import DomainService

    # Get workspace for default domain
    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    default_domain = f"{workspace.slug}.aexy.email"
    domains = [
        EmailDomainResponse(
            domain=default_domain,
            is_default=True,
            is_verified=True,
            display_name="Default (Aexy Email)",
        )
    ]

    # Fetch verified domains from email infrastructure (sending_domains table)
    domain_service = DomainService(db)
    sending_domains = await domain_service.list_domains(workspace_id)

    existing = {d.domain for d in domains}
    for sd in sending_domains:
        # Only include verified, warming, or active domains
        if sd.status in ("verified", "warming", "active") and sd.domain not in existing:
            domains.append(
                EmailDomainResponse(
                    domain=sd.domain,
                    is_default=sd.is_default,
                    is_verified=True,
                    display_name=sd.domain,
                )
            )
            existing.add(sd.domain)

    return EmailDomainsListResponse(domains=domains, default_domain=default_domain)


@router.post("/{agent_id}/email/enable", response_model=EmailEnableResponse)
async def enable_agent_email(
    workspace_id: str,
    agent_id: str,
    data: EmailEnableRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Enable email for an agent by creating an inbox via mailagent.

    Creates an inbox in the mailagent service and assigns the agent to it.
    The email address format is: {handle}@{domain}
    """
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")

    from aexy.integrations.mailagent_client import get_mailagent_client, MailagentError
    from uuid import UUID as PyUUID

    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.email_address:
        raise HTTPException(status_code=400, detail="Email already enabled for this agent")

    # Determine email handle
    preferred_handle = data.preferred_handle if data else None
    handle = preferred_handle or agent.mention_handle or agent.name.lower().replace(" ", "-")
    # Clean the handle
    handle = "".join(c for c in handle if c.isalnum() or c == "-").strip("-")

    # Determine domain
    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    domain = data.domain if data else None
    if not domain:
        domain = f"{workspace.slug}.aexy.email"

    email_address = f"{handle}@{domain}"

    # Create inbox in mailagent
    try:
        client = get_mailagent_client()

        # Check if inbox already exists
        try:
            existing = await client.get_inbox_by_email(email_address)
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Email address {email_address} is already in use"
                )
        except MailagentError as e:
            if e.status_code != 404:
                raise

        # Create the inbox
        inbox = await client.create_inbox(
            email=email_address,
            display_name=agent.name,
        )

        # Assign agent to inbox
        await client.assign_agent_to_inbox(
            inbox_id=PyUUID(inbox["id"]),
            agent_id=PyUUID(agent_id),
            priority=100,
        )

    except MailagentError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create inbox: {e}")

    # Update agent with email address
    agent.email_address = email_address
    agent.email_enabled = True
    await db.commit()

    return EmailEnableResponse(email_address=email_address, domain=domain, enabled=True)


@router.post("/{agent_id}/email/disable")
async def disable_agent_email(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Disable email for an agent.

    Removes the inbox from mailagent and clears the agent's email address.
    """
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")

    from aexy.integrations.mailagent_client import get_mailagent_client, MailagentError
    from uuid import UUID as PyUUID

    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.email_address:
        raise HTTPException(status_code=400, detail="Email not enabled for this agent")

    # Delete inbox from mailagent
    try:
        client = get_mailagent_client()
        inbox = await client.get_inbox_by_email(agent.email_address)
        if inbox:
            await client.delete_inbox(PyUUID(inbox["id"]))
    except MailagentError:
        # If mailagent is unavailable or inbox not found, continue with disabling
        pass

    # Update agent
    agent.email_address = None
    agent.email_enabled = False
    await db.commit()

    return {"message": "Email disabled"}


@router.get("/{agent_id}/inbox", response_model=list[InboxMessageResponse])
async def get_agent_inbox(
    workspace_id: str,
    agent_id: str,
    status: str | None = None,
    priority: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get inbox messages for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    email_service = AgentEmailService(db)
    messages = await email_service.list_inbox_messages(
        agent_id=agent_id,
        status=status,
        priority=priority,
        skip=skip,
        limit=limit,
    )
    return messages


@router.get("/{agent_id}/inbox/{message_id}", response_model=InboxMessageResponse)
async def get_inbox_message(
    workspace_id: str,
    agent_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a specific inbox message with full details."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    email_service = AgentEmailService(db)
    message = await email_service.get_inbox_message(message_id)

    if not message or message.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Message not found")

    return message


@router.post("/{agent_id}/inbox/{message_id}/reply", response_model=InboxActionResponse)
async def reply_to_inbox_message(
    workspace_id: str,
    agent_id: str,
    message_id: str,
    data: InboxReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Send a reply to an inbox message (manual or AI-suggested)."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    email_service = AgentEmailService(db)
    message = await email_service.get_inbox_message(message_id)

    if not message or message.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Message not found")

    # Use suggested response if requested
    reply_body = message.suggested_response if data.use_suggested else data.body

    if not reply_body:
        raise HTTPException(status_code=400, detail="Reply body is required")

    # Send the reply
    response_id = await email_service._send_auto_reply(message, reply_body)
    await email_service.mark_as_responded(message_id, response_id)
    await db.commit()

    return InboxActionResponse(
        success=True,
        message="Reply sent successfully",
        inbox_message_id=message_id,
    )


@router.post("/{agent_id}/inbox/{message_id}/escalate", response_model=InboxActionResponse)
async def escalate_inbox_message(
    workspace_id: str,
    agent_id: str,
    message_id: str,
    data: InboxEscalateRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Escalate a message to a team member."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    email_service = AgentEmailService(db)
    message = await email_service.get_inbox_message(message_id)

    if not message or message.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Message not found")

    await email_service.escalate_message(
        message_id=message_id,
        escalate_to=data.escalate_to,
        note=data.note,
    )
    await db.commit()

    return InboxActionResponse(
        success=True,
        message=f"Message escalated to {data.escalate_to}",
        inbox_message_id=message_id,
    )


@router.post("/{agent_id}/inbox/{message_id}/archive", response_model=InboxActionResponse)
async def archive_inbox_message(
    workspace_id: str,
    agent_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Archive an inbox message."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    email_service = AgentEmailService(db)
    message = await email_service.get_inbox_message(message_id)

    if not message or message.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Message not found")

    await email_service.archive_message(message_id)
    await db.commit()

    return InboxActionResponse(
        success=True,
        message="Message archived",
        inbox_message_id=message_id,
    )


@router.post("/{agent_id}/inbox/{message_id}/process", response_model=InboxMessageResponse)
async def process_inbox_message(
    workspace_id: str,
    agent_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Process an inbox message with AI (classify, summarize, suggest response)."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    email_service = AgentEmailService(db)
    message = await email_service.get_inbox_message(message_id)

    if not message or message.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Message not found")

    try:
        await email_service.process_inbox_message(message_id)
        await db.commit()

        # Return updated message
        message = await email_service.get_inbox_message(message_id)
        return message
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ROUTING RULES
# =============================================================================


@router.get("/{agent_id}/email/routing-rules", response_model=list[EmailRoutingRuleResponse])
async def list_routing_rules(
    workspace_id: str,
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List email routing rules for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id))

    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    email_service = AgentEmailService(db)
    rules = await email_service.list_routing_rules(agent_id)
    return rules


@router.post("/{agent_id}/email/routing-rules", response_model=EmailRoutingRuleResponse)
async def create_routing_rule(
    workspace_id: str,
    agent_id: str,
    data: EmailRoutingRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create an email routing rule for an agent."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")

    service = AgentService(db)
    agent = await service.get_agent(agent_id)
    if not agent or agent.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    email_service = AgentEmailService(db)
    rule = await email_service.create_routing_rule(
        workspace_id=workspace_id,
        agent_id=agent_id,
        rule_type=data.rule_type,
        rule_value=data.rule_value,
        priority=data.priority,
    )
    await db.commit()
    return rule


@router.delete("/{agent_id}/email/routing-rules/{rule_id}")
async def delete_routing_rule(
    workspace_id: str,
    agent_id: str,
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete an email routing rule."""
    await check_workspace_permission(db, workspace_id, str(current_developer.id), "admin")

    email_service = AgentEmailService(db)
    success = await email_service.delete_routing_rule(rule_id)

    if not success:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    await db.commit()
    return {"message": "Routing rule deleted"}
