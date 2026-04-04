FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git protobuf protobuf-dev

# Install protoc Go plugins (use specific versions compatible with Go 1.23)
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.32.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

# Copy go mod files
COPY go.mod ./

# Copy source code
COPY . .

# Generate protobuf code first
RUN protoc --go_out=. --go_opt=module=github.com/bookreading/backend \
    --go-grpc_out=. --go-grpc_opt=module=github.com/bookreading/backend \
    proto/bookreading.proto

# Download dependencies and build
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main cmd/main.go

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY --from=builder /app/main .

EXPOSE 9090

CMD ["./main"]
