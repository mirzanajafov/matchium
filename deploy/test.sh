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
printf '#!/bin/sh\n' > "$work/bin/sleep"
cat > "$work/bin/docker" << 'EOF'
#!/bin/sh
echo "$*" >> "$WORK/calls"
release=$(cat release)
postgres_broken() {
  [ "$BREAK" = postgres ] && [ "$(cat "$WORK/postgres")" = new ]
}
case "$*" in
  *" run "*" migrate")
    case "$*" in
      *" --no-deps "*) ;;
      *) echo "$release" > "$WORK/postgres" ;;
    esac
    if [ "$release" = new ] && [ "$BREAK" = migrate ]; then
      echo failed > "$WORK/migrations"
    fi
    ! postgres_broken && [ "$(cat "$WORK/migrations")" = clean ] ;;
  *" up -d "*)
    echo "$release" > "$WORK/postgres"
    ! postgres_broken && { [ "$release" = old ] || [ "$BREAK" != up ]; } ;;
  *" exec "*) [ "$release" = old ] || [ "$BREAK" != web ] ;;
  inspect*)
    if postgres_broken || { [ "$release" = new ] && [ "$BREAK" = health ]; }; then echo unhealthy; else echo healthy; fi ;;
esac
EOF
chmod +x "$work/bin/sleep" "$work/bin/docker"

deploy() {
  git reset --quiet --hard "$old"
  : > "$work/calls"
  echo clean > "$work/migrations"
  echo old > "$work/postgres"
  status=0
  output=$(WORK=$work BREAK=$1 PATH="$work/bin:$PATH" bash deploy/deploy.sh 2>&1) || status=$?
  ups=$(grep -c " up -d " "$work/calls" || true)
}

expect() {
  case $output in
    *"$2"*) ;;
    *) fail "$1: no \"$2\" in: $output" ;;
  esac
}

rolled_back() {
  [ "$status" = 1 ] || fail "$1 exited $status"
  [ "$(git rev-parse HEAD)" = "$old" ] || fail "$1 did not go back to the old commit"
  expect "$1" "Rolled back."
}

deploy nothing
[ "$status" = 0 ] || fail "a clean deploy exited $status"
[ "$(git rev-parse HEAD)" = "$new" ] || fail "a clean deploy is not on the new commit"
expect "a clean deploy" "Live:"

deploy up
rolled_back "a failed up"
[ "$ups" = 2 ] || fail "a failed up ran up $ups times instead of twice"

deploy health
rolled_back "a release that never turns healthy"
[ "$ups" = 2 ] || fail "a release that never turns healthy ran up $ups times instead of twice"

deploy web
rolled_back "a release whose web app can't reach its API"
[ "$ups" = 2 ] || fail "a release whose web app can't reach its API ran up $ups times instead of twice"

deploy postgres
rolled_back "a release that breaks Postgres"

deploy migrate
rolled_back "a failed migration"
[ "$ups" = 0 ] || fail "a failed migration still replaced containers"
expect "a failed migration" "The previous release failed too."

echo "deploy tests passed"
