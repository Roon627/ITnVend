import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import CategoryNode from './CategoryNode';

const ROW_HEIGHT = 40;
const STORAGE_KEY = 'lookup_tree_expanded';

function buildSegments(text, term) {
  if (!term) return [];
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const segments = [];
  let currentIndex = 0;
  let matchIndex = lowerText.indexOf(lowerTerm);
  while (matchIndex !== -1) {
    if (matchIndex > currentIndex) {
      segments.push({ text: text.slice(currentIndex, matchIndex), highlight: false });
    }
    segments.push({ text: text.slice(matchIndex, matchIndex + term.length), highlight: true });
    currentIndex = matchIndex + term.length;
    matchIndex = lowerText.indexOf(lowerTerm, currentIndex);
  }
  if (currentIndex < text.length) {
    segments.push({ text: text.slice(currentIndex), highlight: false });
  }
  return segments;
}

function flattenTree(nodes, expandedSet, searchTerm) {
  const flat = [];
  const expandedBySearch = new Set();
  const term = (searchTerm || '').trim().toLowerCase();

  const visit = (node, level, parentId) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const name = node.name || '';
    const selfMatch = term ? name.toLowerCase().includes(term) : false;

    let anyChildVisible = false;
    const childEntries = [];
    for (const child of children) {
      const result = visit(child, level + 1, node.id);
      if (result.visible) {
        anyChildVisible = true;
        childEntries.push(...result.nodes);
      }
    }

    const shouldShow = term ? (selfMatch || anyChildVisible) : true;
    if (!shouldShow) {
      return { visible: false, nodes: [] };
    }

    const hasChildren = children.length > 0;
    const entry = {
      id: node.id,
      name,
      level,
      hasChildren,
      node,
      parentId,
      matches: selfMatch,
      segments: term && selfMatch ? buildSegments(name, searchTerm) : [],
    };

    const nodesList = [entry];
    const shouldExpand = term ? (selfMatch || anyChildVisible) : expandedSet.has(node.id);
    if (term && (selfMatch || anyChildVisible) && hasChildren) {
      expandedBySearch.add(node.id);
    }
    if (hasChildren && (shouldExpand || term)) {
      nodesList.push(...childEntries);
    }

    return { visible: true, nodes: nodesList };
  };

  for (const root of nodes) {
    const result = visit(root, 1, null);
    if (result.visible) {
      flat.push(...result.nodes);
    }
  }

  return { flat, expandedBySearch };
}

function findPath(nodes, targetId) {
  const path = [];
  const dfs = (list, currentPath) => {
    for (const item of list) {
      const nextPath = [...currentPath, item];
      if (item.id === targetId) {
        path.push(...nextPath);
        return true;
      }
      if (Array.isArray(item.children) && item.children.length > 0) {
        if (dfs(item.children, nextPath)) return true;
      }
    }
    return false;
  };
  dfs(nodes, []);
  return path;
}

const CategoryTree = forwardRef(function CategoryTree(
  {
    items,
    selectedId,
    onSelect,
    onAdd,
    onRename,
    onDelete,
    onReorder,
    searchTerm,
  },
  ref,
) {
  const containerRef = useRef(null);
  const [expandedIds, setExpandedIds] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return new Set();
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed);
    } catch (err) {
      console.debug('Failed to parse expanded state', err);
    }
    return new Set();
  });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);
  const [focusedId, setFocusedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expandedIds)));
  }, [expandedIds]);

  const { flat: flatNodes, expandedSet: renderedExpandedSet } = useMemo(() => {
    const cloneExpanded = new Set(expandedIds);
    const { flat, expandedBySearch } = flattenTree(items, cloneExpanded, searchTerm);
    if (searchTerm) {
      expandedBySearch.forEach((id) => cloneExpanded.add(id));
    }
    return { flat, expandedBySearch, expandedSet: cloneExpanded };
  }, [items, expandedIds, searchTerm]);

  const totalHeight = flatNodes.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const endIndex = Math.min(flatNodes.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 2);
  const visibleNodes = flatNodes.slice(startIndex, endIndex);

  const updateViewport = useCallback(() => {
    if (!containerRef.current) return;
    setViewportHeight(containerRef.current.clientHeight);
  }, []);

  useEffect(() => {
    updateViewport();
    const handleResize = () => updateViewport();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateViewport]);

  useImperativeHandle(ref, () => ({
    expandAll: () => {
      const next = new Set();
      const walk = (list) => {
        for (const item of list) {
          next.add(item.id);
          if (Array.isArray(item.children) && item.children.length > 0) {
            walk(item.children);
          }
        }
      };
      walk(items);
      setExpandedIds(next);
    },
    collapseAll: () => setExpandedIds(new Set()),
  }), [items]);

  const handleToggle = useCallback((node) => {
    if (!node.hasChildren) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      return next;
    });
  }, []);

  const handleScroll = useCallback((event) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const ensureVisible = useCallback((id) => {
    if (!containerRef.current) return;
    const index = flatNodes.findIndex((node) => node.id === id);
    if (index === -1) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const viewportTop = containerRef.current.scrollTop;
    const viewportBottom = viewportTop + viewportHeight;
    if (top < viewportTop) {
      containerRef.current.scrollTop = top;
    } else if (bottom > viewportBottom) {
      containerRef.current.scrollTop = bottom - viewportHeight;
    }
  }, [flatNodes, viewportHeight]);

  useEffect(() => {
    if (selectedId) {
      setFocusedId(selectedId);
      ensureVisible(selectedId);
    }
  }, [selectedId, ensureVisible]);

  const moveFocus = useCallback((offset) => {
    if (flatNodes.length === 0) return;
    let index = flatNodes.findIndex((node) => node.id === (focusedId || selectedId));
    if (index === -1) index = 0;
    const nextIndex = Math.min(Math.max(index + offset, 0), flatNodes.length - 1);
    const nextNode = flatNodes[nextIndex];
    if (nextNode) {
      setFocusedId(nextNode.id);
      ensureVisible(nextNode.id);
      onSelect?.(nextNode.node);
    }
  }, [flatNodes, focusedId, selectedId, ensureVisible, onSelect]);

  const handleKeyDown = useCallback((event) => {
    if (flatNodes.length === 0) return;
    const currentId = focusedId || selectedId || (flatNodes[0]?.id ?? null);
    const currentIndex = flatNodes.findIndex((node) => node.id === currentId);
    const currentNode = flatNodes[currentIndex];
    if (!currentNode) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'ArrowRight':
        if (currentNode.hasChildren) {
          event.preventDefault();
          if (!renderedExpandedSet.has(currentNode.id)) {
            handleToggle(currentNode);
          } else {
            moveFocus(1);
          }
        }
        break;
      case 'ArrowLeft':
        if (renderedExpandedSet.has(currentNode.id)) {
          event.preventDefault();
          handleToggle(currentNode);
        } else if (currentNode.parentId) {
          event.preventDefault();
          const parentIndex = flatNodes.findIndex((node) => node.id === currentNode.parentId);
          if (parentIndex !== -1) {
            const parent = flatNodes[parentIndex];
            setFocusedId(parent.id);
            ensureVisible(parent.id);
            onSelect?.(parent.node);
          }
        }
        break;
      case 'Enter':
        event.preventDefault();
        onSelect?.(currentNode.node);
        break;
      case 'Delete':
        event.preventDefault();
        if (window.confirm('Delete this category? This might affect existing products.')) {
          onDelete?.(currentNode.node);
        }
        break;
      default:
        break;
    }
  }, [renderedExpandedSet, flatNodes, focusedId, selectedId, handleToggle, moveFocus, onSelect, onDelete, ensureVisible]);

  const handleSelect = useCallback((node) => {
    setFocusedId(node.id);
    onSelect?.(node.node ?? node);
  }, [onSelect]);

  const handleAddChild = useCallback((node) => {
    onAdd?.(node.id);
  }, [onAdd]);

  const startRename = useCallback((node) => {
    setEditingId(node.id);
    setEditingValue(node.name);
  }, []);

  const confirmRename = useCallback(() => {
    if (!editingId) return;
    onRename?.(editingId, editingValue.trim());
    setEditingId(null);
  }, [editingId, editingValue, onRename]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditingValue('');
  }, []);

  const dragState = useRef({});

  const handleDragStart = useCallback((event, node) => {
    dragState.current = { dragId: node.id, parentId: node.parentId };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.id);
  }, []);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    if (!dragState.current.dragId) return;
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('bg-blue-100');
  }, []);

  const handleDrop = useCallback((event, node) => {
    event.preventDefault();
    event.currentTarget.classList.remove('bg-blue-100');
    const dragId = dragState.current.dragId;
    if (!dragId || dragId === node.id) return;
    onReorder?.(dragId, node.id, 'before');
    dragState.current = {};
  }, [onReorder]);

  const handleDragLeave = useCallback((event) => {
    event.currentTarget.classList.remove('bg-blue-100');
  }, []);

  useEffect(() => {
    const nodeElements = containerRef.current?.querySelectorAll('[role="treeitem"]');
    nodeElements?.forEach((element) => {
      element.addEventListener('dragleave', handleDragLeave);
    });
    return () => {
      nodeElements?.forEach((element) => {
        element.removeEventListener('dragleave', handleDragLeave);
      });
    };
  }, [visibleNodes, handleDragLeave]);

  return (
    <div className="flex flex-col" aria-label="Categories">
      <div
        ref={containerRef}
        role="tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        className="relative flex-1 overflow-auto focus:outline-none focus:ring-2 focus:ring-blue-400/60 max-h-[28rem]"
        aria-activedescendant={focusedId || selectedId || ''}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {visibleNodes.map((node, index) => {
            const absoluteIndex = startIndex + index;
            const top = absoluteIndex * ROW_HEIGHT;
            return (
              <CategoryNode
                key={node.id}
                node={node}
                level={node.level}
                expanded={renderedExpandedSet.has(node.id)}
                selected={selectedId === node.id}
                focused={(focusedId || selectedId) === node.id}
                matches={node.matches}
                segments={node.segments}
                isEditing={editingId === node.id}
                editingValue={editingValue}
                onEditingChange={setEditingValue}
                onRenameConfirm={confirmRename}
                onRenameCancel={cancelRename}
                onToggle={handleToggle}
                onSelect={handleSelect}
                onAddChild={handleAddChild}
                onStartRename={startRename}
                onDelete={(current) => onDelete?.(current.node)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                disableDrop={false}
                style={{ top }}
              />
            );
          })}
        </div>
        {flatNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            No categories yet
          </div>
        )}
      </div>
    </div>
  );
});

// eslint-disable-next-line react-refresh/only-export-components
export function deriveBreadcrumb(items, selectedId) {
  if (!selectedId) return [];
  const path = findPath(items, selectedId);
  return path.map((node) => ({ id: node.id, name: node.name }));
}

export default CategoryTree;
