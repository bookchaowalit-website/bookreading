package domain

// Page size bounds for list endpoints. MaxPageSize covers the largest page a
// client requests today (the reader loads 100 chapters at a time).
const MaxPageSize = 200

// NormalizePage clamps client-supplied pagination before it reaches SQL.
// A zero or negative limit falls back to defaultLimit, a limit above
// MaxPageSize is capped, and a negative offset becomes 0. Postgres rejects a
// negative LIMIT or OFFSET (the request used to fail with a 500), and an
// unbounded limit let one request dump a whole table.
func NormalizePage(limit, offset, defaultLimit int) (int, int) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > MaxPageSize {
		limit = MaxPageSize
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
