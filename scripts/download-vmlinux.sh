#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 Tencent. All rights reserved.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." &>/dev/null && pwd -P)"

DEFAULT_OUTPUT_DIR="${ROOT_DIR}/deploy/one-click/assets/kernel-artifacts"
DEFAULT_VERSION="v0.3.1"
DEFAULT_GITHUB_PROXY="https://proxy.syscube.dev/"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Download CubeSandbox guest kernel vmlinux artifacts from GitHub Release.

Options:
  -v, --version VERSION     Release version to download (default: ${DEFAULT_VERSION})
  -o, --output DIR          Output directory (default: ${DEFAULT_OUTPUT_DIR})
  -p, --proxy URL           GitHub proxy prefix, e.g. https://proxy.syscube.dev/
  --pvm                     Also download vmlinux-pvm
  --only-pvm                Only download vmlinux-pvm
  -f, --force               Overwrite existing files
  -h, --help                Show this help

Examples:
  # Download ordinary vmlinux only
  $(basename "$0")

  # Download both vmlinux and vmlinux-pvm using a proxy
  $(basename "$0") --pvm --proxy https://proxy.syscube.dev/

  # Download only vmlinux-pvm to custom directory
  $(basename "$0") --only-pvm -o /tmp/kernel-artifacts
EOF
}

VERSION="${DEFAULT_VERSION}"
OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"
GITHUB_PROXY="${DEFAULT_GITHUB_PROXY}"
DOWNLOAD_ORDINARY=1
DOWNLOAD_PVM=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version)
      VERSION="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -p|--proxy)
      GITHUB_PROXY="$2"
      shift 2
      ;;
    --pvm)
      DOWNLOAD_PVM=1
      shift
      ;;
    --only-pvm)
      DOWNLOAD_ORDINARY=0
      DOWNLOAD_PVM=1
      shift
      ;;
    -f|--force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${VERSION}" ]]; then
  echo "ERROR: version must not be empty" >&2
  exit 1
fi

# Strip leading 'v' if present for tarball name
VERSION_NO_V="${VERSION#v}"
mkdir -p "${OUTPUT_DIR}"

release_url() {
  local filename="$1"
  local base="https://github.com/TencentCloud/CubeSandbox/releases/download/${VERSION}"
  if [[ -n "${GITHUB_PROXY}" ]]; then
    # Ensure proxy ends with /
    local proxy="${GITHUB_PROXY%/}/"
    printf '%s%s/%s\n' "${proxy}" "${base}" "${filename}"
  else
    printf '%s/%s\n' "${base}" "${filename}"
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  local desc="$3"

  if [[ -f "${output}" && "${FORCE}" -eq 0 ]]; then
    echo "[skip] ${desc} already exists: ${output}"
    return 0
  fi

  echo "[download] ${desc}: ${url}"
  local tmp_file="${output}.tmp"
  rm -f "${tmp_file}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --connect-timeout 30 "${url}" -o "${tmp_file}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 --timeout=30 "${url}" -O "${tmp_file}"
  else
    echo "ERROR: neither curl nor wget is available" >&2
    exit 1
  fi

  if [[ ! -s "${tmp_file}" ]]; then
    echo "ERROR: downloaded file is empty: ${output}" >&2
    rm -f "${tmp_file}"
    exit 1
  fi

  mv -f "${tmp_file}" "${output}"
  echo "[done] ${desc} -> ${output}"
}

# Strategy:
# vmlinux is not a direct release asset for ordinary kernel; it is shipped
# inside the one-click release tarball's cube-kernel-scf.zip.
# vmlinux-pvm is available as a direct release asset, so when only PVM is
# requested we can avoid downloading the full tarball.

if [[ "${DOWNLOAD_ORDINARY}" -eq 0 && "${DOWNLOAD_PVM}" -eq 1 ]]; then
  # PVM-only: download direct asset
  PVM_URL="$(release_url "vmlinux-pvm")"
  download_file "${PVM_URL}" "${OUTPUT_DIR}/vmlinux-pvm" "vmlinux-pvm"
  echo "[success] kernel artifacts ready in ${OUTPUT_DIR}"
  ls -lh "${OUTPUT_DIR}"/vmlinux* 2>/dev/null || true
  exit 0
fi

# General case: download the full release tarball and extract kernel zip
TARBALL_NAME="cube-sandbox-one-click-${VERSION_NO_V}.tar.gz"
TARBALL_URL="$(release_url "${TARBALL_NAME}")"
TARBALL_PATH="${OUTPUT_DIR}/${TARBALL_NAME}"

# Try direct tarball name first; if not found, fall back to common variant
if ! curl -fsSL -I "${TARBALL_URL}" >/dev/null 2>&1; then
  # Some releases use a git-commit suffix instead of version in tarball name
  echo "[warn] ${TARBALL_NAME} not found at ${TARBALL_URL}"
  echo "[warn] Please find the correct tarball name from https://github.com/TencentCloud/CubeSandbox/releases/tag/${VERSION}"
  echo "[warn] Then download it manually and extract kernel artifacts from assets/kernel-artifacts/cube-kernel-scf.zip"
  exit 1
fi

download_file "${TARBALL_URL}" "${TARBALL_PATH}" "release tarball"

EXTRACT_DIR="${OUTPUT_DIR}/.extract.$$"
rm -rf "${EXTRACT_DIR}"
mkdir -p "${EXTRACT_DIR}"
trap 'rm -rf "${EXTRACT_DIR}"' EXIT

echo "[extract] ${TARBALL_PATH}"
tar -xzf "${TARBALL_PATH}" -C "${EXTRACT_DIR}" --wildcards "*/assets/kernel-artifacts/cube-kernel-scf.zip" 2>/dev/null || {
  echo "ERROR: failed to extract kernel zip from tarball" >&2
  exit 1
}

KERNEL_ZIP="$(find "${EXTRACT_DIR}" -name 'cube-kernel-scf.zip' -print -quit)"
if [[ -z "${KERNEL_ZIP}" ]]; then
  echo "ERROR: cube-kernel-scf.zip not found in tarball" >&2
  exit 1
fi

extract_kernel() {
  local name="$1"
  local target="${OUTPUT_DIR}/${name}"
  if [[ -f "${target}" && "${FORCE}" -eq 0 ]]; then
    echo "[skip] ${name} already exists: ${target}"
    return 0
  fi
  echo "[extract] ${name} from cube-kernel-scf.zip"
  python3 -c "
import zipfile
import sys
z = zipfile.ZipFile('${KERNEL_ZIP}')
try:
    z.extract('${name}', '${OUTPUT_DIR}')
    print('extracted ${name}')
except KeyError:
    sys.exit(1)
"
  # Python extract writes to OUTPUT_DIR/name, which is exactly target
  if [[ ! -f "${target}" ]]; then
    echo "ERROR: ${name} not found in cube-kernel-scf.zip" >&2
    return 1
  fi
  echo "[done] ${name} -> ${target}"
}

if [[ "${DOWNLOAD_ORDINARY}" -eq 1 ]]; then
  extract_kernel "vmlinux"
fi

if [[ "${DOWNLOAD_PVM}" -eq 1 ]]; then
  extract_kernel "vmlinux-pvm"
fi

echo "[success] kernel artifacts ready in ${OUTPUT_DIR}"
ls -lh "${OUTPUT_DIR}"/vmlinux* 2>/dev/null || true
