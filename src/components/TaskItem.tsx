import { useState } from 'react';
import { CheckCircle2, Circle, Trash2, CreditCard as Edit2, Check, X } from 'lucide-react';
import { Task } from '../lib/supabase';

interface TaskItemProps {
  task: Task;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onDelete: (taskId: string) => void;
  onEdit: (taskId: string, newTitle: string) => void;
}

export default function TaskItem({ task, onToggleComplete, onDelete, onEdit }: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);

  const handleSaveEdit = () => {
    if (editValue.trim()) {
      onEdit(task.id, editValue.trim());
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditValue(task.title);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-start gap-3 p-4 bg-white rounded-lg shadow-sm">
        <input
          autoFocus
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
        />
        <button
          onClick={handleSaveEdit}
          className="mt-0.5 p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
          aria-label="Save edit"
        >
          <Check className="w-5 h-5" />
        </button>
        <button
          onClick={handleCancelEdit}
          className="mt-0.5 p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Cancel edit"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow group">
      <button
        onClick={() => onToggleComplete(task.id, !task.completed)}
        className="mt-0.5 flex-shrink-0"
      >
        {task.completed ? (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        ) : (
          <Circle className="w-6 h-6 text-gray-300 hover:text-green-400 transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-base ${
            task.completed
              ? 'text-gray-400 line-through'
              : 'text-gray-800'
          }`}
        >
          {task.title}
        </p>
        {task.completed_at && (
          <p className="text-xs text-gray-400 mt-1">
            Completed {new Date(task.completed_at).toLocaleTimeString()}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setIsEditing(true)}
          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
          aria-label="Edit task"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          aria-label="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
