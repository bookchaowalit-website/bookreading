FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git protobuf protobuf-dev

# Install protoc Go plugins
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.32.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

# Copy go mod files and ALL source code (including proto/)
COPY go.mod go.sum ./
COPY . .

# Generate protobuf code before downloading modules
RUN protoc --go_out=. --go_opt=module=github.com/bookreading/backend \
    --go-grpc_out=. --go-grpc_opt=module=github.com/bookreading/backend \
    proto/bookreading.proto

# Download dependencies (cached layer)
# Use go mod tidy to generate complete go.sum including protoc-generated files
# Disable sum verification for first-time build
ENV GONOSUMCHECK=github.com/bookreading/backend
ENV GONOSUMDB=*
ENV GOFLAGS=-mod=mod
RUN go mod tidy

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o main cmd/main.go

# Final stage - minimal runtime image
FROM alpine:latest

RUN apk --no-cache add ca-certificates curl wget && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup

WORKDIR /app

# Copy binary and entrypoint script
COPY --from=builder /app/main .
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown -R appuser:appgroup /app

# Expose both HTTP and gRPC ports
EXPOSE 8080 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:8080/api/health || exit 1

# Use non-root user
USER appuser

# Use entrypoint to validate environment
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["./main"]
