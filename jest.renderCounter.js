/* eslint-env jest, es2020 */
/* eslint-disable no-bitwise */
/**
 * Counts real component renders per commit through the React DevTools hook.
 *
 * Installed from `setupFiles` so it exists before the reconciler loads. After
 * every commit it walks the fiber tree and records each function component
 * that performed work, keyed by the component's name (a `memo` wrapper
 * reports the inner function's name). Tests read `globalThis.__renderCounts`.
 *
 * Only used by `__tests__/renderBudget.test.tsx`; it is inert otherwise.
 */

const PerformedWork = 0b1;
const counts = new Map();

function nameOf(fiber) {
  const type = fiber.elementType ?? fiber.type;
  if (!type) {
    return null;
  }
  if (typeof type === 'function') {
    return type.displayName || type.name || null;
  }
  if (typeof type === 'object' && type.type) {
    // React.memo / forwardRef wrappers.
    const inner = type.type;
    return inner.displayName || inner.name || null;
  }
  return null;
}

/**
 * Walks only the part of the tree React touched in this commit. When a
 * component bails out, React reuses its descendants' fiber objects as they
 * are; those still carry the flags from whenever they last rendered, so a
 * naive whole-tree walk over-counts. A subtree is untouched when the child
 * fiber is the very same object as in the previous tree.
 */
function walk(next, prev) {
  if (next.flags & PerformedWork) {
    const name = nameOf(next);
    if (name) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  let child = next.child;
  let prevChild = prev ? prev.child : null;
  while (child) {
    if (child !== prevChild) {
      walk(child, child.alternate);
    }
    child = child.sibling;
    prevChild = prevChild ? prevChild.sibling : null;
  }
}

globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  isDisabled: false,
  supportsFiber: true,
  renderers: new Map(),
  inject() {
    return 1;
  },
  onCommitFiberRoot(_id, root) {
    walk(root.current, root.current.alternate);
  },
  onCommitFiberUnmount() {},
  onPostCommitFiberRoot() {},
  checkDCE() {},
};

globalThis.__renderCounts = {
  get(name) {
    return counts.get(name) || 0;
  },
  reset() {
    counts.clear();
  },
  snapshot() {
    return Object.fromEntries(counts);
  },
};
