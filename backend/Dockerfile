# Imagen única para API, worker Celery y beat.
# La versión de la imagen base y la del paquete `playwright` (requirements.txt)
# DEBEN coincidir. Si actualizás una, actualizá la otra.
FROM mcr.microsoft.com/playwright/python:v1.62.0-jammy

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/sdk

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium de Playwright que corresponde a la versión instalada.
RUN python -m playwright install chromium

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "python -m app.initdb && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
