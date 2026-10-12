import datetime
import uuid
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from backend.app.database import Base

class TenantAuditLog(Base):
    __tablename__ = "tenant_audit_logs"
    __table_args__ = {"extend_existing": True}
    
    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(50), nullable=False, index=True)
    actor = Column(String(100), default="CRON_SYSTEM_DAEMON")
    details = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
