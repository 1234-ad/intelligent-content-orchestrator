from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import torch
from transformers import (
    pipeline,
    AutoTokenizer,
    AutoModelForSequenceClassification,
    AutoModelForTokenClassification
)
import spacy
from langdetect import detect
import numpy as np
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Content Intelligence ML Service",
    description="AI/ML microservice for content analysis",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load ML models
logger.info("Loading ML models...")

# Sentiment Analysis Model
sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english",
    device=0 if torch.cuda.is_available() else -1
)

# Emotion Detection Model
emotion_analyzer = pipeline(
    "text-classification",
    model="j-hartmann/emotion-english-distilroberta-base",
    device=0 if torch.cuda.is_available() else -1
)

# Named Entity Recognition
ner_pipeline = pipeline(
    "ner",
    model="dslim/bert-base-NER",
    aggregation_strategy="simple",
    device=0 if torch.cuda.is_available() else -1
)

# Zero-shot Classification for topics
topic_classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli",
    device=0 if torch.cuda.is_available() else -1
)

# Load spaCy for advanced NLP
try:
    nlp = spacy.load("en_core_web_lg")
except:
    logger.warning("Downloading spaCy model...")
    import subprocess
    subprocess.run(["python", "-m", "spacy", "download", "en_core_web_lg"])
    nlp = spacy.load("en_core_web_lg")

logger.info("All models loaded successfully!")

# Pydantic models
class ContentAnalysisRequest(BaseModel):
    text: str
    content_id: str
    analyze_sentiment: bool = True
    analyze_entities: bool = True
    analyze_topics: bool = True
    analyze_emotions: bool = True
    custom_topics: Optional[List[str]] = None

class SentimentResult(BaseModel):
    label: str
    score: float
    confidence: str

class EmotionResult(BaseModel):
    emotion: str
    score: float

class Entity(BaseModel):
    text: str
    type: str
    score: float
    start: int
    end: int

class TopicResult(BaseModel):
    topic: str
    score: float

class AnalysisResponse(BaseModel):
    content_id: str
    sentiment: Optional[SentimentResult]
    emotions: Optional[List[EmotionResult]]
    entities: Optional[List[Entity]]
    topics: Optional[List[TopicResult]]
    language: str
    word_count: int
    readability_score: float
    keywords: List[str]
    processing_time: float
    timestamp: str

class TranslationRequest(BaseModel):
    text: str
    source_lang: Optional[str] = None
    target_lang: str

class LanguageDetectionRequest(BaseModel):
    text: str

# Helper functions
def calculate_readability(text: str) -> float:
    """Calculate Flesch Reading Ease score"""
    doc = nlp(text)
    sentences = list(doc.sents)
    words = [token for token in doc if not token.is_punct]
    syllables = sum([len(token.text) for token in words])
    
    if len(sentences) == 0 or len(words) == 0:
        return 0.0
    
    avg_sentence_length = len(words) / len(sentences)
    avg_syllables_per_word = syllables / len(words)
    
    score = 206.835 - 1.015 * avg_sentence_length - 84.6 * avg_syllables_per_word
    return max(0, min(100, score))

def extract_keywords(text: str, top_n: int = 10) -> List[str]:
    """Extract keywords using spaCy"""
    doc = nlp(text)
    
    # Get noun chunks and named entities
    keywords = []
    for chunk in doc.noun_chunks:
        keywords.append(chunk.text.lower())
    
    for ent in doc.ents:
        keywords.append(ent.text.lower())
    
    # Count frequency
    from collections import Counter
    keyword_freq = Counter(keywords)
    
    return [kw for kw, _ in keyword_freq.most_common(top_n)]

def analyze_sentiment_detailed(text: str) -> SentimentResult:
    """Perform detailed sentiment analysis"""
    result = sentiment_analyzer(text[:512])[0]
    
    confidence = "high" if result['score'] > 0.9 else "medium" if result['score'] > 0.7 else "low"
    
    return SentimentResult(
        label=result['label'],
        score=round(result['score'], 4),
        confidence=confidence
    )

def analyze_emotions(text: str) -> List[EmotionResult]:
    """Analyze emotions in text"""
    results = emotion_analyzer(text[:512])
    
    emotions = []
    for result in results[:5]:  # Top 5 emotions
        emotions.append(EmotionResult(
            emotion=result['label'],
            score=round(result['score'], 4)
        ))
    
    return emotions

def extract_entities(text: str) -> List[Entity]:
    """Extract named entities"""
    results = ner_pipeline(text[:512])
    
    entities = []
    for entity in results:
        entities.append(Entity(
            text=entity['word'],
            type=entity['entity_group'],
            score=round(entity['score'], 4),
            start=entity['start'],
            end=entity['end']
        ))
    
    return entities

def classify_topics(text: str, candidate_labels: List[str]) -> List[TopicResult]:
    """Classify text into topics"""
    if not candidate_labels:
        candidate_labels = [
            "technology", "business", "science", "health", 
            "entertainment", "sports", "politics", "education"
        ]
    
    result = topic_classifier(text[:512], candidate_labels)
    
    topics = []
    for label, score in zip(result['labels'], result['scores']):
        topics.append(TopicResult(
            topic=label,
            score=round(score, 4)
        ))
    
    return topics[:5]  # Top 5 topics

# API Endpoints

@app.get("/")
async def root():
    return {
        "service": "Content Intelligence ML Service",
        "version": "1.0.0",
        "status": "running",
        "models_loaded": True,
        "gpu_available": torch.cuda.is_available()
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "gpu_available": torch.cuda.is_available(),
        "models": {
            "sentiment": "loaded",
            "emotion": "loaded",
            "ner": "loaded",
            "topics": "loaded",
            "spacy": "loaded"
        }
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_content(request: ContentAnalysisRequest, background_tasks: BackgroundTasks):
    """
    Comprehensive content analysis endpoint
    """
    start_time = datetime.now()
    
    try:
        text = request.text
        
        # Detect language
        try:
            language = detect(text)
        except:
            language = "unknown"
        
        # Word count
        word_count = len(text.split())
        
        # Initialize results
        sentiment_result = None
        emotions_result = None
        entities_result = None
        topics_result = None
        
        # Perform requested analyses
        if request.analyze_sentiment:
            sentiment_result = analyze_sentiment_detailed(text)
        
        if request.analyze_emotions:
            emotions_result = analyze_emotions(text)
        
        if request.analyze_entities:
            entities_result = extract_entities(text)
        
        if request.analyze_topics:
            topics_result = classify_topics(text, request.custom_topics)
        
        # Calculate readability
        readability = calculate_readability(text)
        
        # Extract keywords
        keywords = extract_keywords(text)
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Analysis completed for content {request.content_id} in {processing_time:.2f}s")
        
        return AnalysisResponse(
            content_id=request.content_id,
            sentiment=sentiment_result,
            emotions=emotions_result,
            entities=entities_result,
            topics=topics_result,
            language=language,
            word_count=word_count,
            readability_score=round(readability, 2),
            keywords=keywords,
            processing_time=round(processing_time, 3),
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Error analyzing content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/sentiment")
async def analyze_sentiment(text: str):
    """Quick sentiment analysis endpoint"""
    try:
        result = analyze_sentiment_detailed(text)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/entities")
async def extract_entities_endpoint(text: str):
    """Extract named entities endpoint"""
    try:
        entities = extract_entities(text)
        return {"success": True, "data": entities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/topics")
async def classify_topics_endpoint(text: str, topics: Optional[List[str]] = None):
    """Topic classification endpoint"""
    try:
        results = classify_topics(text, topics)
        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect-language")
async def detect_language(request: LanguageDetectionRequest):
    """Detect language of text"""
    try:
        language = detect(request.text)
        return {
            "success": True,
            "data": {
                "language": language,
                "text_length": len(request.text)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/keywords")
async def extract_keywords_endpoint(text: str, top_n: int = 10):
    """Extract keywords from text"""
    try:
        keywords = extract_keywords(text, top_n)
        return {"success": True, "data": keywords}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/readability")
async def calculate_readability_endpoint(text: str):
    """Calculate readability score"""
    try:
        score = calculate_readability(text)
        
        # Interpret score
        if score >= 90:
            level = "Very Easy"
        elif score >= 80:
            level = "Easy"
        elif score >= 70:
            level = "Fairly Easy"
        elif score >= 60:
            level = "Standard"
        elif score >= 50:
            level = "Fairly Difficult"
        elif score >= 30:
            level = "Difficult"
        else:
            level = "Very Difficult"
        
        return {
            "success": True,
            "data": {
                "score": round(score, 2),
                "level": level
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models/info")
async def get_models_info():
    """Get information about loaded models"""
    return {
        "models": {
            "sentiment_analysis": {
                "name": "distilbert-base-uncased-finetuned-sst-2-english",
                "task": "sentiment-analysis",
                "status": "loaded"
            },
            "emotion_detection": {
                "name": "j-hartmann/emotion-english-distilroberta-base",
                "task": "emotion-classification",
                "status": "loaded"
            },
            "named_entity_recognition": {
                "name": "dslim/bert-base-NER",
                "task": "token-classification",
                "status": "loaded"
            },
            "topic_classification": {
                "name": "facebook/bart-large-mnli",
                "task": "zero-shot-classification",
                "status": "loaded"
            },
            "nlp_pipeline": {
                "name": "en_core_web_lg",
                "library": "spaCy",
                "status": "loaded"
            }
        },
        "gpu_available": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")