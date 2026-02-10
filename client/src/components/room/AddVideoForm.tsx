import { useState } from 'react';
import { isValidVideoUrl } from '../../lib/utils';

interface AddVideoFormProps {
  onAdd: (url: string) => void;
}

export default function AddVideoForm({ onAdd }: AddVideoFormProps) {
  const [url, setUrl] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) return;

    if (!isValidVideoUrl(trimmed)) {
      setValidationError('Please enter a valid YouTube or SoundCloud URL');
      return;
    }

    setValidationError('');
    onAdd(trimmed);
    setUrl('');
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Video</h3>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (validationError) setValidationError('');
          }}
          className="input-field flex-1 text-sm py-1.5"
          placeholder="YouTube or SoundCloud URL..."
        />
        <button type="submit" className="btn-primary py-1.5 px-3 text-sm whitespace-nowrap">
          + Add
        </button>
      </form>
      {validationError && (
        <p className="text-red-400 text-xs mt-1.5">{validationError}</p>
      )}
    </div>
  );
}
