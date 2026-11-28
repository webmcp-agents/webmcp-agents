# The keys go to the Collector, never to the app.
docker run --rm -p 4318:4318 -p 4317:4317 \
  -e LANGFUSE_AUTH -e LANGSMITH_API_KEY \
  -v "$PWD/otel-collector.yaml:/etc/otelcol/config.yaml:ro" \
  otel/opentelemetry-collector:0.166.0
