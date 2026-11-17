from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import coach_market, news, quotes, simulate, stocks
from contextlib import asynccontextmanager
from app.market_model import warm_market
from app.news_service import news as news_service


@asynccontextmanager
async def lifespan(app):
    # Warmed free history and news in the background instead of making the first
    # user action wait for remote providers; cached headlines and forecasts ready at boot.
    warm_market()
    news_service.get()
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
app.include_router(stocks.router)
app.include_router(quotes.router)
app.include_router(coach_market.router)
app.include_router(news.router)
