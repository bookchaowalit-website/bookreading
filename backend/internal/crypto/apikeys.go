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

// initCipher initializes the AES-GCM cipher from the API_KEY_ENCRYPTION_KEY env var
func initCipher() {
	once.Do(func() {
		keyStr := os.Getenv("API_KEY_ENCRYPTION_KEY")
		if keyStr == "" {
			// No encryption key set - keys will be stored in plaintext
			// This is a fallback for development; production MUST set this
			errInit = errors.New("API_KEY_ENCRYPTION_KEY not set - API keys stored in plaintext")
			return
		}

		key, err := base64.StdEncoding.DecodeString(keyStr)
		if err != nil {
			// Try as raw 32-byte key
			if len(keyStr) == 32 {
				key = []byte(keyStr)
			} else {
				errInit = errors.New("invalid API_KEY_ENCRYPTION_KEY format")
				return
			}
		}

		if len(key) != 32 {
			errInit = errors.New("API_KEY_ENCRYPTION_KEY must be 32 bytes (AES-256)")
			return
		}

		block, err := aes.NewCipher(key)
		if err != nil {
			errInit = err
			return
		}

		aead, err := cipher.NewGCM(block)
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

	nonce := make([]byte, encrypter.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := encrypter.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64-encoded ciphertext string using AES-256-GCM
func Decrypt(ciphertext string) (string, error) {
	initCipher()
	if decrypter == nil {
		// No decryption available, return as-is (plaintext)
		return ciphertext, errInit
	}

	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		// Not base64 - probably plaintext (stored before encryption was enabled)
		return ciphertext, nil
	}

	if len(data) < decrypter.NonceSize() {
		// Too short to be encrypted data - probably plaintext
		return string(data), nil
	}

	nonce := data[:decrypter.NonceSize()]
	data = data[decrypter.NonceSize():]

	plaintext, err := decrypter.Open(nil, nonce, data, nil)
	if err != nil {
		// Decryption failed - probably plaintext data stored before encryption
		return string(data), nil
	}

	return string(plaintext), nil
}
