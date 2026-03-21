import logging
from contextlib import asynccontextmanager

from argostranslate import translate
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LexiconAI-backend")


class TranslationRequest(BaseModel):
  text: str
  sourceLanguage: str = "fr"


class TranslationResponse(BaseModel):
  translatedText: str


def get_fr_to_en_translation():
  installed_languages = translate.get_installed_languages()
  from_language = next(
    (language for language in installed_languages if language.code == "fr"), None)
  to_language = next(
    (language for language in installed_languages if language.code == "en"), None)

  if from_language is None or to_language is None:
    return None

  try:
    return from_language.get_translation(to_language)
  except Exception:
    return None


def get_ja_to_en_translation():
  installed_languages = translate.get_installed_languages()
  from_language = next(
    (language for language in installed_languages if language.code == "ja"), None)
  to_language = next(
    (language for language in installed_languages if language.code == "en"), None)

  if from_language is None or to_language is None:
    return None

  try:
    return from_language.get_translation(to_language)
  except Exception:
    return None


def get_translation_for_language(source_language):
  if source_language == "ja":
    return get_ja_to_en_translation()

  return get_fr_to_en_translation()


@asynccontextmanager
async def lifespan(app: FastAPI):
  logger.info("Starting LexiconAI translation backend")

  translation = get_fr_to_en_translation()
  japanese_translation = get_ja_to_en_translation()
  installed_codes = [
    language.code for language in translate.get_installed_languages()]
  logger.info("Installed Argos languages: %s", installed_codes)

  if translation is None:
    logger.warning("Argos French -> English model is not installed yet")
  else:
    sample_text = "Bonjour tout le monde"
    sample_translation = translation.translate(sample_text)
    logger.info("Argos French -> English model ready")
    logger.info("Sample translation check: %s -> %s",
                sample_text, sample_translation)

  if japanese_translation is None:
    logger.warning("Argos Japanese -> English model is not installed yet")
  else:
    sample_text = "こんにちは"
    sample_translation = japanese_translation.translate(sample_text)
    logger.info("Argos Japanese -> English model ready")
    logger.info("Sample translation check: %s -> %s",
                sample_text, sample_translation)

  yield

  logger.info("Stopping LexiconAI translation backend")


app = FastAPI(title="LexiconAI Translation Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
  french_translation = get_fr_to_en_translation()
  japanese_translation = get_ja_to_en_translation()
  return {
      "status": "ok",
      "translationAvailable": french_translation is not None,
      "supportedSourceLanguages": {
        "fr": french_translation is not None,
        "ja": japanese_translation is not None,
      },
      "targetLanguage": "en",
  }


@app.post("/translate", response_model=TranslationResponse)
async def translate_text(request: TranslationRequest):
  text = request.text.strip()
  source_language = request.sourceLanguage.strip().lower() or "fr"

  if not text:
    raise HTTPException(status_code=400, detail="Text is required")

  if source_language not in {"fr", "ja"}:
    raise HTTPException(status_code=400, detail="Only fr and ja are supported")

  translation = get_translation_for_language(source_language)

  if translation is None:
    raise HTTPException(
        status_code=503,
        detail=f"Argos {source_language} to English package is not installed. See backend/README.md.",
    )

  try:
    translated_text = translation.translate(text)
  except Exception as error:
    logger.exception("Translation failed")
    raise HTTPException(
      status_code=500, detail=f"Translation failed: {error}") from error

  return TranslationResponse(translatedText=translated_text)


# TODO: Expand this to support multiple language pairs after the MVP is stable.
