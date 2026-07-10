// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

import (
	"crypto/rand"
	"fmt"
)

const (
	toolIDPrefix    = "sdt-"
	toolIDRandomLen = 8
	toolIDAlphabet  = "abcdefghijklmnopqrstuvwxyz0123456789"
)

// GenerateToolID returns a new unique-looking Tool identifier with the form
// "sdt-" + 8 random characters from [a-z0-9]. It uses crypto/rand and returns
// an error only if the random source fails.
func GenerateToolID() (string, error) {
	buf := make([]byte, toolIDRandomLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("failed to generate tool id: %w", err)
	}

	alphabetLen := byte(len(toolIDAlphabet))
	for i := range buf {
		buf[i] = toolIDAlphabet[buf[i]%alphabetLen]
	}

	return toolIDPrefix + string(buf), nil
}
