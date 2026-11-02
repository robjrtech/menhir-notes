// Keyboard shortcuts that follow the operating system: ⌘ on Apple devices, Ctrl elsewhere.

// iPadOS reports itself as a Mac, which is what we want: its keyboards have ⌘.
export function isApple(nav = globalThis.navigator) {
  const platform = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function shortcutKeys(apple) {
  return {
    apple,
    // label("K") is "⌘ K" or "Ctrl+K"; label("N", true) adds Option or Alt.
    label: (key, alt = false) =>
      apple ? ["⌘", ...(alt ? ["⌥"] : []), key].join(" ") : ["Ctrl", ...(alt ? ["Alt"] : []), key].join("+"),
    // Only the platform's command key counts, so Ctrl shortcuts in Mac text fields (Ctrl K
    // deletes to the end of the line, Ctrl E moves to it) keep working.
    isCommand: (e) => (apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey),
    // Browsers keep ⌘ N and Ctrl+N for a new window, so a new note uses Option or Alt as well.
    // The physical key is checked because Option changes the character on a Mac, and AltGr
    // (Ctrl+Alt on some layouts) is left for typing letters such as ń.
    isNewNote: (e) =>
      (apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey && !e.getModifierState?.("AltGraph")) &&
      e.altKey &&
      !e.shiftKey &&
      e.code === "KeyN",
  };
}
