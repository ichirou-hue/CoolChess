import enum
from sqlalchemy import Column, Integer, Enum as SQLEnum
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from database import Base

class UserRole(str, enum.Enum):
    STUDENT = "student"
    COACH = "coach"
    ADMIN = "admin"

class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    # Базовые поля id (UUID), email, hashed_password, is_active, 
    # is_superuser, is_verified уже добавлены классом SQLAlchemyBaseUserTableUUID
    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    elo_rating = Column(Integer, default=1200, nullable=False)