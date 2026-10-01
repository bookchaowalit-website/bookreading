package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"sync"
)

var (
	encrypter cipher.AEAD
	decrypter cipher.AEAD
	once      sync.Once
	errInit   error
)

// newAEAD builds an AES-256-GCM AEAD from a key string that is either
// base64-encoded 32 bytes or a raw 32-character string.
func newAEAD(keyStr string) (cipher.AEAD, error) {
	if keyStr == "" {
		// No encryption key set - keys will be stored in plaintext
		// This is a fallback for development; production MUST set this
		return nil, errors.New("API_KEY_ENCRYPTION_KEY not set - API keys stored in plaintext")
	}

	key, err := base64.StdEncoding.DecodeString(keyStr)
	if err != nil || len(key) != 32 {
		// Fall back to a raw 32-character key. A 32-character key made of
		// base64-alphabet characters (e.g. `openssl rand -hex 16`) decodes
		// to 24 bytes, so it must also take this path.
		if len(keyStr) == 32 {
			key = []byte(keyStr)
		} else if err != nil {
			return nil, errors.New("invalid API_KEY_ENCRYPTION_KEY format")
		}
	}

	if len(key) != 32 {
		return nil, errors.New("API_KEY_ENCRYPTION_KEY must be 32 bytes (AES-256)")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// initCipher initializes the AES-GCM cipher from the API_KEY_ENCRYPTION_KEY env var
func initCipher() {
	once.Do(func() {
		aead, err := newAEAD(os.Getenv("API_KEY_ENCRYPTION_KEY"))
		if err != nil {
			errInit = err
			return
		}
		encrypter = aead
		decrypter = aead
	})
}

// Encrypt encrypts a plaintext string using AES-256-GCM
// Returns base64-encoded ciphertext
func Encrypt(plaintext string) (string, error) {
	initCipher()
	if encrypter == nil {
		// No encryption available, return plaintext
		return plaintext, errInit
	}
	return encryptWith(encrypter, plaintext)
}

func encryptWith(aead cipher.AEAD, plaintext string) (string, error) {
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64-encoded ciphertext string using AES-256-GCM.
// Values that are not valid ciphertext are treated as legacy plaintext
// (stored before encryption was enabled) and returned unchanged.
func Decrypt(ciphertext string) (string, error) {
	initCipher()
	if decrypter == nil {
		// No decryption available, return as-is (plaintext)
		return ciphertext, errInit
	}
	return decryptWith(decrypter, ciphertext), nil
}

func decryptWith(aead cipher.AEAD, ciphertext string) string {
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		// Not base64 - legacy plaintext
		return ciphertext
	}

	if len(data) < aead.NonceSize()+aead.Overhead() {
		// Too short to be encrypted data - legacy plaintext that happens to
		// be valid base64. Return the original string, not the decoded bytes.
		return ciphertext
	}

	nonce := data[:aead.NonceSize()]
	plaintext, err := aead.Open(nil, nonce, data[aead.NonceSize():], nil)
	if err != nil {
		// Authentication failed - legacy plaintext, return it unchanged
		// (previously this returned the decoded ciphertext bytes).
		return ciphertext
	}

	return string(plaintext)
}
