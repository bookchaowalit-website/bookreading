package domain

import "errors"

// ErrNotFound means the record does not exist or is not owned by the caller.
// Handlers map it to 404 so a foreign record's existence is not revealed.
var ErrNotFound = errors.New("not found")
