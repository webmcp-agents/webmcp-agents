docker run --rm -p 4318:4318 -p 4317:4317 \
  -v "$PWD/otel-collector.yaml:/etc/otelcol/config.yaml:ro" \
  otel/opentelemetry-collector:0.166.0
