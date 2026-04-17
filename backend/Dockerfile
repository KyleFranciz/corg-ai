FROM python:3.11-slim

# install the drivers needed for the linux container
RUN apt-get update && apt-get install -y \
  # needed for audio processing libraries
  libsndfile1 \
  ffmpeg \
  # needed to compile some Python packages from source
  build-essential \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
