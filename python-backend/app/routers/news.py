from fastapi import APIRouter
from app.news_service import news

router = APIRouter()


@router.get("/api/news")
def financial_news():
    # Returned a bounded cached feed immediately while upstream refreshes ran in the background.
    return news.get()
