'use client';
import { useState } from 'react';
import { importSizeProblem } from '@/lib/limits';

// A file picker that refuses files over the upload limit before they are sent.
export function SizeCheckedFile({ label, name, multiple, accept }: { label: string; name: string; multiple?: boolean; accept: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <label>{label}
        <input type="file" name={name} multiple={multiple} accept={accept} required data-testid={`file-${name}`}
          onChange={(e) => {
            const total = Array.from(e.currentTarget.files ?? []).reduce((n, f) => n + f.size, 0);
            const p = importSizeProblem(total);
            e.currentTarget.setCustomValidity(p ?? '');
            setProblem(p);
          }} />
      </label>
      {problem && <p className="flash bad" role="alert" data-testid="too-big">{problem}</p>}
    </>
  );
}
