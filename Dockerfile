FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-xetex \
    texlive-luatex \
    texlive-latex-extra \
    texlive-pictures \
    texlive-science \
    texlive-fonts-recommended \
    tex-gyre \
    dvisvgm \
    ghostscript \
    mupdf-tools \
    poppler-utils \
    fonts-dejavu \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
