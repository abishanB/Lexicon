# LinguaLens Backend

This backend provides a simple local French-to-English translation service for the LinguaLens Chrome extension.

## What It Does

- Exposes `GET /health`
- Exposes `POST /translate`
- Translates French text to English with Argos Translate
- Allows local Chrome extension requests with permissive CORS for development

## 1. Create A Virtual Environment

From the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

## 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Install The Argos French -> English Model

Run this while the virtual environment is active:

```bash
python -c "from argostranslate import package; package.update_package_index(); pkg = next(p for p in package.get_available_packages() if p.from_code == 'fr' and p.to_code == 'en'); download_path = pkg.download(); package.install_from_path(download_path)"
```

## 4. Verify The Model Is Installed

You can check it with:

```bash
python -c "from argostranslate import translate; langs = translate.get_installed_languages(); fr = next((lang for lang in langs if lang.code == 'fr'), None); en = next((lang for lang in langs if lang.code == 'en'), None); print(fr.get_translation(en).translate('Bonjour tout le monde') if fr and en else 'Translation model missing')"
```

Expected output should be close to:

```txt
Hello everyone
```

## 5. Run The FastAPI Server

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The backend will then be available at:

```txt
http://localhost:8000
```

## API

### GET /health

Example response:

```json
{
  "status": "ok",
  "translationAvailable": true,
  "sourceLanguage": "fr",
  "targetLanguage": "en"
}
```

### POST /translate

Request:

```json
{
  "text": "Bonjour tout le monde"
}
```

Response:

```json
{
  "translatedText": "Hello everyone"
}
```

## Notes

- This backend only supports French to English in the current MVP.
- CORS is intentionally permissive for local development.
- The extension expects this backend at `http://localhost:8000/translate`.
- If the Argos package is missing, the API returns a clear `503` error.

## TODO

- Add support for multiple language pairs
- Make CORS stricter for non-local environments
- Add request logging and basic rate limiting if this moves beyond demo use
