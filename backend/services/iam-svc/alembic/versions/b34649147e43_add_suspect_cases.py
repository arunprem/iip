"""add_suspect_cases

Revision ID: b34649147e43
Revises: 3161ef61df11
Create Date: 2026-06-15 14:24:18.223338

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b34649147e43'
down_revision: Union[str, Sequence[str], None] = '3161ef61df11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('suspect_cases',
        sa.Column('suspect_id', sa.UUID(), nullable=False),
        sa.Column('dossier_id', sa.UUID(), nullable=False),
        sa.Column('crime_number', sa.String(length=50), nullable=False),
        sa.Column('crime_year', sa.Integer(), nullable=False),
        sa.Column('police_station_id', sa.UUID(), nullable=False),
        sa.Column('act_section', sa.String(length=500), nullable=True),
        sa.Column('brief', sa.Text(), nullable=True),
        sa.Column('present_status', sa.String(length=100), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.ForeignKeyConstraint(['dossier_id'], ['intelligence.suspect_dossiers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['police_station_id'], ['iam.offices.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['suspect_id'], ['intelligence.suspects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='intelligence'
    )
    op.create_index(op.f('ix_intelligence_suspect_cases_id'), 'suspect_cases', ['id'], unique=False, schema='intelligence')
    op.create_index('idx_suspect_cases_composite', 'suspect_cases', ['crime_number', 'crime_year', 'police_station_id'], unique=False, schema='intelligence')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_suspect_cases_composite', table_name='suspect_cases', schema='intelligence')
    op.drop_index(op.f('ix_intelligence_suspect_cases_id'), table_name='suspect_cases', schema='intelligence')
    op.drop_table('suspect_cases', schema='intelligence')
