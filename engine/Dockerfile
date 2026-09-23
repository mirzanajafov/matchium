FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY matchium ./matchium
COPY sim ./sim
COPY jobs ./jobs
RUN pip install --no-cache-dir ".[db]"

USER nobody
CMD ["python", "-m", "jobs.scheduler"]
