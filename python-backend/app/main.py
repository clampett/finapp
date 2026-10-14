from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import simulate

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the simulate router
app.include_router(simulate.router)