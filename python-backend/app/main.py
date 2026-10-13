from fastapi import FastAPI
from app.routers import simulate

app = FastAPI()

# Register the simulate router
app.include_router(simulate.router)