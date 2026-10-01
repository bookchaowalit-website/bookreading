package crypto

import (
	"encoding/base64"
	"strings"
	"testing"
)

const rawKey = "0123456789abcdef0123456789abcdef" // 32 bytes

func TestNewAEADKeyFormats(t *testing.T) {
	if _, err := newAEAD(""); err == nil {
		t.Fatal("empty key must be rejected")
	}
	if _, err := newAEAD("short"); err == nil {
		t.Fatal("short non-base64 key must be rejected")
	}
	if _, err := newAEAD(base64.StdEncoding.EncodeToString([]byte("too-short"))); err == nil {
		t.Fatal("base64 key that is not 32 bytes must be rejected")
	}
	if _, err := newAEAD(rawKey); err != nil {
		t.Fatalf("raw 32-byte key: %v", err)
	}
	if _, err := newAEAD(base64.StdEncoding.EncodeToString([]byte(rawKey))); err != nil {
		t.Fatalf("base64 32-byte key: %v", err)
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	aead, err := newAEAD(rawKey)
	if err != nil {
		t.Fatal(err)
	}
	secret := "sk-test-value-1234567890"
	enc, err := encryptWith(aead, secret)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(enc, secret) {
		t.Fatal("ciphertext must not contain the plaintext")
	}
	enc2, _ := encryptWith(aead, secret)
	if enc == enc2 {
		t.Fatal("random nonce must make ciphertexts differ")
	}
	if got := decryptWith(aead, enc); got != secret {
		t.Fatalf("round trip = %q, want %q", got, secret)
	}
}

func TestDecryptLegacyPlaintextIsReturnedUnchanged(t *testing.T) {
	aead, err := newAEAD(rawKey)
	if err != nil {
		t.Fatal(err)
	}
	cases := []string{
		"sk-not-base64!",                    // not base64
		"abcd",                              // valid base64 but too short
		"AIzaSyA1234567890abcdefghijklmnop", // valid base64, long enough, fails auth
	}
	for _, c := range cases {
		if got := decryptWith(aead, c); got != c {
			t.Errorf("decryptWith(%q) = %q, want unchanged", c, got)
		}
	}
}

func TestDecryptWithWrongKeyDoesNotLeakGarbage(t *testing.T) {
	a, err := newAEAD(rawKey)
	if err != nil {
		t.Fatal(err)
	}
	b, err := newAEAD("fedcba9876543210fedcba9876543210")
	if err != nil {
		t.Fatal(err)
	}
	enc, _ := encryptWith(a, "secret")
	if got := decryptWith(b, enc); got != enc {
		t.Fatalf("wrong key should return stored value unchanged, got %q", got)
	}
}
