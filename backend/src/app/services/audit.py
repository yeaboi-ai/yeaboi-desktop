from sqlalchemy.ext.asyncio import AsyncSession


async def log_action(
    db: AsyncSession,
    org_id: str,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Record an audit log entry. Does NOT commit — caller handles transaction."""
    from ..models.audit import AuditLog

    db.add(
        AuditLog(
            org_id=org_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_=metadata or {},
            ip_address=ip_address,
        )
    )
