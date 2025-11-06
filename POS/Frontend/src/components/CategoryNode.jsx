import { memo, useMemo } from 'react';
import { FaChevronRight, FaFolder, FaPlus, FaEdit, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';

function HighlightedLabel({ name, segments }) {
  if (!segments || segments.length === 0) {
    return <span className="truncate">{name}</span>;
  }
  return (
    <span className="truncate">
      {segments.map((segment, idx) => (
        segment.highlight ? (
          <mark key={idx} className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">
            {segment.text}
          </mark>
        ) : (
          <span key={idx}>{segment.text}</span>
        )
      ))}
    </span>
  );
}

const CategoryNode = ({
  node,
  level,
  expanded,
  selected,
  focused,
  matches,
  segments,
  isEditing,
  editingValue,
  onEditingChange,
  onRenameConfirm,
  onRenameCancel,
  onToggle,
  onSelect,
  onAddChild,
  onStartRename,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  disableDrop,
  style,
}) => {
  const paddingStyle = useMemo(() => ({ paddingLeft: `${Math.max(0, level - 1) * 18 + 12}px` }), [level]);

  return (
    <div
      className={`group absolute left-0 right-0 flex items-center gap-2 border border-transparent rounded-md pr-2 ${
        selected ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 text-blue-900' : 'hover:bg-slate-50'
      } ${focused && !selected ? 'ring-1 ring-slate-300' : ''}`}
      role="treeitem"
      aria-level={level}
      aria-expanded={node.hasChildren ? expanded : undefined}
      aria-selected={selected}
      tabIndex={-1}
      draggable
      onDragStart={(event) => onDragStart?.(event, node)}
  onDragOver={(event) => onDragOver?.(event)}
      onDrop={(event) => onDrop?.(event, node)}
    data-node-id={node.id}
    style={{ ...style, ...paddingStyle }}
    >
      <button
        type="button"
        className={`flex-shrink-0 h-6 w-6 inline-flex items-center justify-center rounded transition ${
          node.hasChildren ? 'hover:bg-slate-200 text-slate-600' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(node);
        }}
        title={expanded ? 'Collapse category' : 'Expand category'}
      >
        <FaChevronRight className={`transition-transform ${expanded ? 'rotate-90' : ''}`} size={12} />
      </button>
      <FaFolder className={`text-slate-500 flex-shrink-0 ${matches ? 'text-blue-500' : ''}`} size={14} aria-hidden />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node);
        }}
        className={`flex-1 min-w-0 text-left text-sm font-medium ${selected ? 'text-blue-900' : 'text-slate-700'}`}
      >
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              value={editingValue}
              autoFocus
              onChange={(event) => onEditingChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onRenameConfirm();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onRenameCancel();
                }
              }}
              className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRenameConfirm();
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded bg-green-100 text-green-700"
              title="Confirm rename"
            >
              <FaCheck size={12} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRenameCancel();
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-500"
              title="Cancel rename"
            >
              <FaTimes size={12} />
            </button>
          </div>
        ) : (
          <HighlightedLabel name={node.name} segments={segments} />
        )}
      </button>
      {!isEditing && (
        <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddChild(node);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
            title="Add subcategory"
          >
            <FaPlus size={12} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartRename(node);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
            title="Rename category"
          >
            <FaEdit size={12} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-red-50 text-red-600 hover:bg-red-100"
            title="Delete category"
          >
            <FaTrash size={12} />
          </button>
        </div>
      )}
      {disableDrop && <span className="sr-only">Drag disabled</span>}
    </div>
  );
};

export default memo(CategoryNode);
