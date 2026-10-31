#!/usr/bin/env bash
# tiny-harness setup for macOS and Linux: installs Bun, llama.cpp (llama-server) and the Qwen3.5-4B model.
# Safe to run again: anything already installed is skipped, and a half-finished model download resumes.
#
#   ./setup.sh
set -euo pipefail

LLAMA_BUILD="b12020" # the llama.cpp build this repository was tested with
MODEL_URL="https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf"
MODEL_SIZE=2740937888 # bytes, to tell a finished download from a broken one
MODEL_FILE="models/Qwen3.5-4B-Q4_K_M.gguf"
INSTALL_DIR="$HOME/.tiny-harness" # where llama.cpp goes

cd "$(dirname "$0")"

say() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# The startup file of your shell, where a folder is added to PATH for every new terminal.
profile() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) if [ "$(uname -s)" = Darwin ]; then echo "$HOME/.bash_profile"; else echo "$HOME/.bashrc"; fi ;;
    *) echo "$HOME/.profile" ;;
  esac
}

# Add a folder to PATH: now, and for every new terminal (once).
add_to_path() {
  local line="export PATH=\"$1:\$PATH\""
  local file
  file="$(profile)"
  if ! grep -qsF "$line" "$file"; then
    printf '\n# added by tiny-harness setup\n%s\n' "$line" >>"$file"
    echo "  added $1 to PATH in $file"
  fi
  export PATH="$1:$PATH"
}

# 1. Bun: runs the TypeScript
say "Bun"
if have bun; then
  echo "  already installed: bun $(bun --version)"
else
  curl -fsSL https://bun.sh/install | bash # installs to ~/.bun and adds it to your shell's startup file
  export PATH="$HOME/.bun/bin:$PATH"
fi

# 2. llama.cpp: llama-server runs the model on this machine
say "llama.cpp (llama-server)"
if have llama-server; then
  echo "  already installed: $(command -v llama-server)"
elif [ -x "$INSTALL_DIR/llama.cpp/llama-server" ]; then
  echo "  already installed: $INSTALL_DIR/llama.cpp/llama-server"
  add_to_path "$INSTALL_DIR/llama.cpp"
else
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) asset="macos-arm64" ;;
    Darwin-x86_64) asset="macos-x64" ;;
    Linux-x86_64) asset="ubuntu-x64" ;;
    *)
      echo "  no ready-made llama.cpp for $(uname -s) $(uname -m): build or install it from https://github.com/ggml-org/llama.cpp"
      exit 1
      ;;
  esac
  url="https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_BUILD/llama-$LLAMA_BUILD-bin-$asset.tar.gz"
  echo "  downloading $url"
  unpacked="$(mktemp -d)"
  curl -fL --progress-bar "$url" | tar -xz -C "$unpacked"
  found="$(find "$unpacked" -name llama-server -type f | head -1)"
  if [ -z "$found" ]; then
    echo "  llama-server was not in the download; install llama.cpp yourself: https://github.com/ggml-org/llama.cpp"
    exit 1
  fi
  mkdir -p "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/llama.cpp"
  mv "$(dirname "$found")" "$INSTALL_DIR/llama.cpp" # llama-server and the libraries next to it
  rm -rf "$unpacked"
  add_to_path "$INSTALL_DIR/llama.cpp"
  echo "  installed: $INSTALL_DIR/llama.cpp/llama-server"
fi

# 3. The model: Qwen3.5-4B, 4-bit, about 2.7 GB, into models/ where server.ts looks for it
say "Model: Qwen3.5-4B (about 2.7 GB)"
size_of() { if [ -f "$1" ]; then wc -c <"$1" | tr -d ' '; else echo 0; fi; }
if [ "$(size_of "$MODEL_FILE")" = "$MODEL_SIZE" ]; then
  echo "  already downloaded: $MODEL_FILE"
else
  mkdir -p models
  echo "  downloading $MODEL_URL"
  curl -fL --progress-bar -C - -o "$MODEL_FILE.part" "$MODEL_URL" # -C - resumes a half-finished download
  if [ "$(size_of "$MODEL_FILE.part")" != "$MODEL_SIZE" ]; then
    echo "  the download is incomplete; run ./setup.sh again to resume it"
    exit 1
  fi
  mv "$MODEL_FILE.part" "$MODEL_FILE"
  echo "  saved: $MODEL_FILE"
fi

# 4. Editor types (optional; the demo itself needs no packages)
say "Packages"
bun install --silent && echo "  done"

# The model often reaches for python3 when it works out a sum; nice to have, not required.
if ! have python3; then
  echo
  echo "Note: python3 is not installed. The agent likes to use it for sums; it will try another way without it."
fi

say "Ready"
cat <<'EOF'
  Open a new terminal (so PATH is up to date), then, in this folder:

    bun server.ts            the model and the web page: http://localhost:3008  (leave it running)
    bun agent/1-loop.ts      in a second terminal: step 1, then 2-command.ts, 3-rules.ts … 6-verify.ts
EOF
