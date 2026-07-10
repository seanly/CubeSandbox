// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

import (
	"strings"
	"testing"
)

func TestGenerateToolID(t *testing.T) {
	id, err := GenerateToolID()
	if err != nil {
		t.Fatalf("GenerateToolID failed: %v", err)
	}

	if !strings.HasPrefix(id, toolIDPrefix) {
		t.Fatalf("expected prefix %q, got %q", toolIDPrefix, id)
	}

	randomPart := id[len(toolIDPrefix):]
	if len(randomPart) != toolIDRandomLen {
		t.Fatalf("expected random part length %d, got %d (%q)", toolIDRandomLen, len(randomPart), randomPart)
	}

	for _, r := range randomPart {
		if !strings.ContainsRune(toolIDAlphabet, r) {
			t.Fatalf("invalid character %q in generated id %q", r, id)
		}
	}
}

func TestGenerateToolIDUnique(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		id, err := GenerateToolID()
		if err != nil {
			t.Fatalf("GenerateToolID failed: %v", err)
		}
		if _, exists := seen[id]; exists {
			t.Fatalf("duplicate tool id generated: %q", id)
		}
		seen[id] = struct{}{}
	}
}
