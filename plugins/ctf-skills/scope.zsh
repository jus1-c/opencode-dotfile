# Scoped OpenCode config for CTF workspaces.
# Set OPENCODE_CTF_ROOT before sourcing this file from ~/.zshrc.
# Outside that root, restore any previous OPENCODE_CONFIG.

_OPENCODE_CTF_ROOT="${OPENCODE_CTF_ROOT:-}"
_OPENCODE_CTF_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/ctf-skills/ctf-skills.json"

if [[ -z "$_OPENCODE_CTF_ROOT" ]]; then
  echo "Set OPENCODE_CTF_ROOT before sourcing ctf-skills/scope.zsh" >&2
  return 1
fi

if [[ -z "${_OPENCODE_CTF_SAVED+x}" ]]; then
  _OPENCODE_CTF_SAVED="${OPENCODE_CONFIG-}"
  _OPENCODE_CTF_HAD_CONFIG="${OPENCODE_CONFIG+set}"
fi

_opencode_ctf_scope() {
  case "$PWD" in
    "$_OPENCODE_CTF_ROOT"|"$_OPENCODE_CTF_ROOT"/*)
      export OPENCODE_CONFIG="$_OPENCODE_CTF_CONFIG"
      ;;
    *)
      if [[ "$_OPENCODE_CTF_HAD_CONFIG" == "set" ]]; then
        export OPENCODE_CONFIG="$_OPENCODE_CTF_SAVED"
      else
        unset OPENCODE_CONFIG
      fi
      ;;
  esac
}

autoload -Uz add-zsh-hook 2>/dev/null
if typeset -f add-zsh-hook >/dev/null; then
  add-zsh-hook chpwd _opencode_ctf_scope
else
  chpwd_functions+=(_opencode_ctf_scope)
fi
_opencode_ctf_scope
