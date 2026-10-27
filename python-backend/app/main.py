from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import simulate, stocks
from contextlib import asynccontextmanager
from app.market_model import warm_market


@asynccontextmanager
async def lifespan(app):
    # Warmed free history in the background instead of making the first slider
    # action wait for a remote provider; offline forecasts remained available.
    warm_market()
    yield


app = FastAPI(lifespan=lifespan)

# Restricted browser-origin access to the local frontend. Normal dashboard calls
# were forwarded through Express and Spring Boot before reaching this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the simulate router
app.include_router(simulate.router)
