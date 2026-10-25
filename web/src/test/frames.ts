export function recordWhile<T>(visible: () => boolean, read: () => T) {
  const seen = new Set<T>();
  const observer = new MutationObserver(() => {
    if (visible()) seen.add(read());
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  onTestFinished(() => observer.disconnect());
  return seen;
}
