#!/bin/sh
set -eu

work=$(mktemp -d)
trap 'rm -rf -- "${work:?}"' EXIT
trap 'exit 1' INT TERM

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

script="$(cd "$(dirname "$0")" && pwd)/deploy.sh"

git init --quiet --bare "$work/origin.git"
git clone --quiet "$work/origin.git" "$work/app" 2> /dev/null
cd "$work/app"
git config user.email deploy-test@example.com
git config user.name "Deploy test"
mkdir deploy
cp "$script" deploy/deploy.sh
echo old > release
git add .
git commit --quiet --message old
git branch --move main
git push --quiet origin main
old=$(git rev-parse HEAD)
echo new > release
git commit --quiet --all --message new
git push --quiet origin main
new=$(git rev-parse HEAD)

mkdir "$work/bin"
cat > "$work/bin/docker" << 'EOF'
#!/bin/sh
echo "$*" >> "$WORK/calls"
case "$*" in
  *" run --rm --no-deps migrate")
    if [ "$(cat release)" = new ] && [ "$BREAK" = migrate ]; then
      echo failed > "$WORK/migrations"
    fi
    [ "$(cat "$WORK/migrations")" = clean ] ;;
  *" up -d "*) [ "$(cat release)" = old ] || [ "$BREAK" != up ] ;;
  inspect*) echo healthy ;;
esac
EOF
chmod +x "$work/bin/docker"

deploy() {
  git reset --quiet --hard "$old"
  : > "$work/calls"
  echo clean > "$work/migrations"
  if output=$(WORK=$work BREAK=$1 PATH="$work/bin:$PATH" bash deploy/deploy.sh 2>&1); then status=0; else status=$?; fi
  ups=$(grep -c " up -d " "$work/calls" || true)
}

expect() {
  case $output in
    *"$1"*) ;;
    *) fail "$2: no \"$1\" in: $output" ;;
  esac
}

deploy nothing
[ "$status" = 0 ] || fail "a clean deploy exited $status"
[ "$(git rev-parse HEAD)" = "$new" ] || fail "a clean deploy is not on the new commit"
expect "Live:" "a clean deploy"

deploy up
[ "$status" = 1 ] || fail "a failed up exited $status"
[ "$(git rev-parse HEAD)" = "$old" ] || fail "a failed up did not go back to the old commit"
[ "$ups" = 2 ] || fail "a failed up ran up $ups times instead of twice"
expect "Rolled back." "a failed up"

deploy migrate
[ "$status" = 1 ] || fail "a failed migration exited $status"
[ "$(git rev-parse HEAD)" = "$old" ] || fail "a failed migration did not go back to the old commit"
[ "$ups" = 0 ] || fail "a failed migration still replaced containers"
expect "The previous release failed too." "a failed migration"
expect "Rolled back." "a failed migration"

echo "deploy: all checks passed"
