"""add email verification code state

Revision ID: b5e81a0c4d72
Revises: 98a3d74f1c25
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5e81a0c4d72"
down_revision: Union[str, Sequence[str], None] = "98a3d74f1c25"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Accounts created before email-code signup were already usable; preserve access.
    op.execute("UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE")
    op.add_column("users", sa.Column("email_verification_code_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("email_verification_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_verification_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_verification_attempts", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "email_verification_attempts")
    op.drop_column("users", "email_verification_sent_at")
    op.drop_column("users", "email_verification_expires_at")
    op.drop_column("users", "email_verification_code_hash")
