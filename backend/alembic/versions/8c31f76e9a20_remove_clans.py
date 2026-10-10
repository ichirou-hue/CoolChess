"""remove retired clan feature tables

Revision ID: 8c31f76e9a20
Revises: 7d4b8f0a2c31
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c31f76e9a20"
down_revision: Union[str, Sequence[str], None] = "7d4b8f0a2c31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("clan_members")
    op.drop_index("ix_clans_tag", table_name="clans")
    op.drop_index("ix_clans_name", table_name="clans")
    op.drop_table("clans")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sa.Enum(name="clanrole").drop(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    clan_role = sa.Enum("LEADER", "OFFICER", "MEMBER", name="clanrole")
    if bind.dialect.name == "postgresql":
        clan_role.create(bind, checkfirst=True)

    op.create_table(
        "clans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("tag", sa.String(length=6), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("leader_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["leader_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_clans_name", "clans", ["name"], unique=True)
    op.create_index("ix_clans_tag", "clans", ["tag"], unique=True)
    op.create_table(
        "clan_members",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("clan_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", clan_role, nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["clan_id"], ["clans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clan_id", "user_id", name="uq_clan_member"),
        sa.UniqueConstraint("user_id"),
    )
