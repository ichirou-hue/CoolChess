from pydantic import BaseModel, EmailStr

class StudentRegisterRequest(BaseModel):
    displayName: str
    email: EmailStr
    password: str

class StudentLoginRequest(BaseModel):
    email: EmailStr
    password: str