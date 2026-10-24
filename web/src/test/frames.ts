export function recordWhile(visible: () => boolean, read: () => string | null) {
  const seen = new Set<string | null>();
  const observer = new MutationObserver(() => {
    if (visible()) seen.add(read());
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  return { seen, stop: () => observer.disconnect() };
}
